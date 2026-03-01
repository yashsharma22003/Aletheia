import { execFile, spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

// Path to the circuits directory (relative to project root)
const CIRCUITS_DIR = path.resolve(__dirname, '../../circuits');

/**
 * Run a command using spawn, streaming stdout/stderr in real-time.
 * Returns a promise that resolves with exit code.
 */
export function runCommand(
    cmd: string,
    args: string[],
    opts: { cwd?: string; timeout?: number } = {}
): Promise<{ code: number; stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
        const proc = spawn(cmd, args, { cwd: opts.cwd });
        let stdout = '';
        let stderr = '';
        let killed = false;

        const timer = opts.timeout
            ? setTimeout(() => {
                killed = true;
                proc.kill('SIGTERM');
            }, opts.timeout)
            : null;

        proc.stdout.on('data', (data: Buffer) => {
            const str = data.toString();
            stdout += str;
            process.stdout.write(`[${cmd}] ${str}`);
        });

        proc.stderr.on('data', (data: Buffer) => {
            const str = data.toString();
            stderr += str;
            process.stderr.write(`[${cmd}] ${str}`);
        });

        proc.on('close', (code) => {
            if (timer) clearTimeout(timer);
            if (killed) {
                reject(new Error(`${cmd} was killed after timeout (${opts.timeout}ms)`));
            } else {
                resolve({ code: code ?? 1, stdout, stderr });
            }
        });

        proc.on('error', (err) => {
            if (timer) clearTimeout(timer);
            reject(err);
        });
    });
}

// ──────────────────────────────────────────────
// Proof Generation
// ──────────────────────────────────────────────

export interface ProofResult {
    proof: string;
    verified: boolean;
}

/**
 * Generates a ZK proof using nargo + bb.
 *
 * Steps:
 *  1. Copies Prover.toml from job working directory into circuits/
 *  2. Runs `nargo execute` to generate the witness
 *  3. Runs `bb prove` to generate the proof
 *  4. Runs `bb verify` to self-check
 *  5. Returns the proof as hex
 *
 * @param jobWorkDir - directory containing the generated Prover.toml
 */
export async function generateProof(jobWorkDir: string): Promise<ProofResult> {
    const proverTomlSrc = path.join(jobWorkDir, 'Prover.toml');
    const proverTomlDst = path.join(CIRCUITS_DIR, 'Prover.toml');

    if (!fs.existsSync(proverTomlSrc)) {
        throw new Error(`Prover.toml not found at ${proverTomlSrc}`);
    }

    // 1. Copy Prover.toml into circuits dir
    fs.copyFileSync(proverTomlSrc, proverTomlDst);
    console.log(`[prover] Copied Prover.toml to ${proverTomlDst}`);

    // 2. Run nargo execute (witness generation)
    console.log('[prover] Running nargo execute...');
    try {
        const { stdout, stderr } = await execFileAsync('nargo', ['execute'], {
            cwd: CIRCUITS_DIR,
            timeout: 5 * 60 * 1000,
            maxBuffer: 50 * 1024 * 1024, // 50MB buffer
        });
        if (stdout) console.log('[prover][nargo] stdout:', stdout);
        if (stderr) console.log('[prover][nargo] stderr:', stderr);
    } catch (err: any) {
        const errMsg = err.stderr || err.message || String(err);
        throw new Error(`nargo execute failed: ${errMsg}`);
    }

    // 3. Run bb prove (using spawn to stream output — bb outputs verbose progress to stderr)
    console.log('[prover] Running bb prove...');
    const circuitJsonPath = path.join(CIRCUITS_DIR, 'target', 'circuits.json');
    const witnessPath = path.join(CIRCUITS_DIR, 'target', 'circuits.gz');
    const targetDir = path.join(CIRCUITS_DIR, 'target');

    const proveResult = await runCommand(
        'bb',
        ['prove', '-b', circuitJsonPath, '-w', witnessPath, '--write_vk', '-o', targetDir],
        { cwd: CIRCUITS_DIR, timeout: 30 * 60 * 1000 } // 30 minute timeout
    );

    if (proveResult.code !== 0) {
        throw new Error(`bb prove exited with code ${proveResult.code}`);
    }

    // 4. Read proof
    const proofPath = path.join(targetDir, 'proof');
    if (!fs.existsSync(proofPath)) {
        throw new Error(`Proof file not found at ${proofPath}`);
    }

    const proofBytes = fs.readFileSync(proofPath);
    const proofHex = '0x' + proofBytes.toString('hex');
    console.log(`[prover] Proof generated (${proofBytes.length} bytes)`);

    // Also copy proof artifacts to the job dir for safe keeping
    fs.copyFileSync(proofPath, path.join(jobWorkDir, 'proof'));
    const vkPath = path.join(targetDir, 'vk');
    if (fs.existsSync(vkPath)) {
        fs.copyFileSync(vkPath, path.join(jobWorkDir, 'vk'));
    }

    // 5. Verify proof (self-check)
    let verified = false;
    try {
        console.log('[prover] Running bb verify...');
        const verifyResult = await runCommand(
            'bb',
            ['verify', '-p', proofPath, '-k', vkPath],
            { cwd: CIRCUITS_DIR, timeout: 5 * 60 * 1000 }
        );
        verified = verifyResult.code === 0;
        if (verified) {
            console.log('[prover] ✅ Proof verified successfully');

            // 6. Submit Proof to Chainlink CRE Proof Oracle
            try {
                // The Prover job holds tracking metadata. We extract chequeId to pass to the Oracle
                const chequeIdRaw = fs.readFileSync(path.join(jobWorkDir, 'chequeId.txt'), 'utf8');
                const chainIdRaw = fs.readFileSync(path.join(jobWorkDir, 'chainId.txt'), 'utf8');

                if (chequeIdRaw && chainIdRaw) {
                    console.log(`[prover] Dispatching valid proof to Chainlink CRE Oracle for cheque: ${chequeIdRaw}`);
                    await submitProofToOracle(chequeIdRaw.trim(), chainIdRaw.trim(), proofHex);
                }
            } catch (e: any) {
                console.log(`[prover] ⚠️ Failed to submit proof to CRE Oracle: ${e.message}`);
            }

        } else {
            console.log('[prover] ⚠️ Proof verification returned code', verifyResult.code);
        }
    } catch (err: any) {
        console.log('[prover] ⚠️ Proof verification failed:', err.message);
        verified = false;
    }

    return { proof: proofHex, verified };
}

/**
 * Submits the generated proof to the Chainlink CRE `proof_oracle` endpoint via HTTP API.
 * The Chainlink CRE simulator runs a local trigger proxy on port 8080 by default.
 */
async function submitProofToOracle(chequeId: string, targetChainId: string, proofHex: string): Promise<void> {
    const ORACLE_HTTP_URL = process.env.PROOF_ORACLE_HTTP_URL || "http://localhost:8080/trigger";

    const payload = {
        targetChainId: Number(targetChainId),
        chequeId: chequeId,
        proof: proofHex
    };

    console.log(`[prover] POST ${ORACLE_HTTP_URL} -> ${JSON.stringify(payload)}`);

    const response = await fetch(ORACLE_HTTP_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        throw new Error(`Oracle rejected payload. Status: ${response.status} - ${await response.text()}`);
    }

    console.log(`[prover] ✅ Oracle accepted payload: ${await response.text()}`);
}

/**
 * Check if nargo and bb are available on the system.
 */
export async function checkToolchainAvailability(): Promise<{
    nargo: boolean;
    bb: boolean;
    nargoVersion?: string;
    bbVersion?: string;
}> {
    let nargo = false;
    let bb = false;
    let nargoVersion: string | undefined;
    let bbVersion: string | undefined;

    try {
        const { stdout } = await execFileAsync('nargo', ['--version'], { timeout: 5000 });
        nargo = true;
        nargoVersion = stdout.trim();
    } catch {
        nargo = false;
    }

    try {
        const { stdout } = await execFileAsync('bb', ['--version'], { timeout: 5000 });
        bb = true;
        bbVersion = stdout.trim();
    } catch {
        bb = false;
    }

    return { nargo, bb, nargoVersion, bbVersion };
}
