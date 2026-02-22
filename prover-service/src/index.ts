import express from 'express';
import cors from 'cors';
import path from 'path';
import { computeSignParams, generateWitness, WitnessParams } from './witness';
import { generateProof, checkToolchainAvailability } from './prover';
import { createJob, getJob, updateJob } from './jobs';
import { decryptPayload } from './crypto/decryptor';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, '../public')));

// ──────────────────────────────────────────────
// GET /api/health
// ──────────────────────────────────────────────

app.get('/api/health', async (_req, res) => {
    try {
        const toolchain = await checkToolchainAvailability();
        res.json({
            status: 'ok',
            timestamp: new Date().toISOString(),
            ...toolchain,
        });
    } catch (err: any) {
        res.status(500).json({ status: 'error', error: err.message });
    }
});

// ──────────────────────────────────────────────
// POST /api/sign-params
// ──────────────────────────────────────────────
// Returns the chequeId and messageHash the user needs to sign.

app.post('/api/sign-params', (req, res) => {
    try {
        const { depositorAddress, nonce, recipient, targetChainId } = req.body;

        if (!depositorAddress || nonce === undefined || !recipient || !targetChainId) {
            res.status(400).json({
                error: 'Missing required fields: depositorAddress, nonce, recipient, targetChainId',
            });
            return;
        }

        const result = computeSignParams({
            depositorAddress,
            nonce: Number(nonce),
            recipient,
            targetChainId: Number(targetChainId),
        });

        res.json(result);
    } catch (err: any) {
        console.error('[sign-params] Error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ──────────────────────────────────────────────
// POST /api/witness
// ──────────────────────────────────────────────
// Generates witness (Prover.toml) synchronously and returns it.

app.post('/api/witness', async (req, res) => {
    try {
        const params = validateProveParams(req.body);
        const job = createJob();

        console.log(`[witness] Generating witness for job ${job.id}...`);
        const result = await generateWitness(params, job.workDir);

        res.json({
            jobId: job.id,
            proverToml: result.proverToml,
            publicInputs: result.publicInputs,
        });
    } catch (err: any) {
        console.error('[witness] Error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ──────────────────────────────────────────────
// POST /api/prove
// ──────────────────────────────────────────────
// Kicks off async proof generation inside the CC Enclave.
// Expects AES-GCM encrypted payload from the frontend to protect sensitive data.

app.post('/api/prove', async (req, res) => {
    try {
        const { encryptedPayload } = req.body;

        if (!encryptedPayload) {
            res.status(400).json({ error: 'Missing encryptedPayload in request body' });
            return;
        }

        // 1. Decrypt sensitive payload securely in TEE memory
        console.log('[prove] Decrypting incoming AES-GCM payload...');
        const decryptedString = decryptPayload(encryptedPayload);
        const rawBody = JSON.parse(decryptedString);

        // 2. Validate params
        const params = validateProveParams(rawBody);
        const job = createJob();

        console.log(`[prove] Job ${job.id} created, starting CC-Enclave async pipeline...`);
        res.json({ jobId: job.id, status: job.status });

        // 3. Run the pipeline in the background (don't await)
        runProvePipeline(job.id, params).catch((err) => {
            console.error(`[prove] Job ${job.id} pipeline error:`, err);
        });
    } catch (err: any) {
        console.error('[prove] Error:', err);
        res.status(400).json({ error: err.message });
    }
});

// ──────────────────────────────────────────────
// GET /api/prove/:jobId
// ──────────────────────────────────────────────
// Poll for job status and result.

app.get('/api/prove/:jobId', (req, res) => {
    const job = getJob(req.params.jobId);
    if (!job) {
        res.status(404).json({ error: 'Job not found' });
        return;
    }

    const response: any = {
        jobId: job.id,
        status: job.status,
        createdAt: new Date(job.createdAt).toISOString(),
        updatedAt: new Date(job.updatedAt).toISOString(),
    };

    if (job.status === 'completed') {
        response.proof = job.proof;
        response.publicInputs = job.publicInputs;
    }

    if (job.status === 'failed') {
        response.error = job.error;
    }

    res.json(response);
});

// ──────────────────────────────────────────────
// Background Pipeline
// ──────────────────────────────────────────────

async function runProvePipeline(jobId: string, params: WitnessParams): Promise<void> {
    try {
        // 1. Generate Witness
        updateJob(jobId, { status: 'witness_generating' });
        const job = getJob(jobId)!;

        console.log(`[pipeline] Job ${jobId}: generating witness...`);
        const witnessResult = await generateWitness(params, job.workDir);

        // 2. Generate Proof
        updateJob(jobId, { status: 'proving' });
        console.log(`[pipeline] Job ${jobId}: generating proof...`);
        const proofResult = await generateProof(job.workDir);

        // 3. Done
        updateJob(jobId, {
            status: 'completed',
            proof: proofResult.proof,
            publicInputs: witnessResult.publicInputs,
        });
        console.log(`[pipeline] Job ${jobId}: ✅ completed (verified: ${proofResult.verified})`);
    } catch (err: any) {
        console.error(`[pipeline] Job ${jobId}: ❌ failed:`, err.message);
        updateJob(jobId, {
            status: 'failed',
            error: err.message,
        });
    }
}

// ──────────────────────────────────────────────
// Validation
// ──────────────────────────────────────────────

function validateProveParams(body: any): WitnessParams {
    const required = [
        'rpcUrl',
        'contractAddress',
        'depositorAddress',
        'recipient',
        'nonce',
        'targetChainId',
        'denomination',
    ];

    const missing = required.filter((f) => body[f] === undefined || body[f] === null);
    if (missing.length > 0) {
        throw new Error(`Missing required fields: ${missing.join(', ')}`);
    }

    // Either privateKey or signature must be provided (pubKey is auto-recovered if missing)
    if (!body.privateKey && !body.signature) {
        throw new Error('Either privateKey or signature must be provided');
    }

    return {
        rpcUrl: body.rpcUrl,
        contractAddress: body.contractAddress,
        depositorAddress: body.depositorAddress,
        recipient: body.recipient,
        nonce: Number(body.nonce),
        targetChainId: Number(body.targetChainId),
        denomination: Number(body.denomination),
        signature: body.signature,
        pubKey: body.pubKey,
        privateKey: body.privateKey,
        blockNumber: body.blockNumber ? Number(body.blockNumber) : undefined,
    };
}

// ──────────────────────────────────────────────
// Start Server
// ──────────────────────────────────────────────

app.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════════════════╗
║  Aletheia Prover Service                         ║
║  Running on http://localhost:${PORT}                 ║
╠══════════════════════════════════════════════════╣
║  Endpoints:                                      ║
║  GET  /api/health        → Service status        ║
║  POST /api/sign-params   → Get chequeId + hash   ║
║  POST /api/witness       → Generate witness      ║
║  POST /api/prove         → Start proof job       ║
║  GET  /api/prove/:jobId  → Poll job status       ║
╚══════════════════════════════════════════════════╝
  `);
});

export default app;
