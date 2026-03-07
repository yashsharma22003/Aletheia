import {
    cre,
    getNetwork,
    Runner,
    type Runtime,
    prepareReportRequest,
} from '@chainlink/cre-sdk'
import { encodeAbiParameters, parseAbiParameters, type Hex, bytesToHex, keccak256 } from 'viem'
import { z } from 'zod'

// 1. Configuration Schema (Matches staging.json)
const ConfigSchema = z.object({
    chains: z.array(z.object({
        chainId: z.string(),
        chainName: z.string(),
        rpcUrl: z.string().optional(),
        registryAddress: z.string(),
    }))
});

type Config = z.infer<typeof ConfigSchema>;

// Input payload schema sent by the Prover API
type ProofPayload = {
    targetChainId: number | string;
    chequeId: string;
    proof: string; // The zkSNARK proof as a hex string '0x...'
}

// 2. HTTP Trigger Handler
const onHttpTrigger = (runtime: Runtime<Config>, requestPayload: any): string => {
    console.log(`[ProofOracle] Received HTTP Trigger with payload:`, JSON.stringify(requestPayload));

    // The CRE Simulator CLI parses the JSON directly.
    // In production, the HTTP trigger may pass it differently depending on exact node version.
    let payload: any = {};

    try {
        // Deep clone to strip out SDK proxy getters
        const raw = JSON.parse(JSON.stringify(requestPayload));

        // Let's implement a recursive search to find our target fields anywhere in the object tree
        // as the Chainlink Simulator deeply wraps HTTP payloads in Buffer objects
        const findFields = (obj: any): boolean => {
            if (!obj || typeof obj !== 'object') return false;

            // Check if this level has our required fields
            if ((obj.targetChainId || obj.targetChainID) && obj.chequeId && obj.proof) {
                payload = obj;
                return true;
            }

            // Check if this level is the Buffer data array we saw in the logs
            if (obj.type === 'Buffer' && obj.data) {
                try {
                    const arr = Array.isArray(obj.data) ? obj.data : Object.values(obj.data).map(Number);
                    const parsed = JSON.parse(Buffer.from(arr).toString('utf-8'));
                    if (parsed.targetChainId && parsed.chequeId && parsed.proof) {
                        payload = parsed;
                        return true;
                    }
                } catch (e) { /* ignore parse errors and keep searching */ }
            }

            // Recursive search
            for (const key of Object.keys(obj)) {
                if (findFields(obj[key])) return true;

                // Also attempt parsing any string values
                if (typeof obj[key] === 'string') {
                    try {
                        const parsedStr = JSON.parse(obj[key]);
                        if (findFields(parsedStr)) return true;
                    } catch (e) { /* ignore parse errors */ }
                }
            }
            return false;
        };

        // Start search
        if (typeof requestPayload === 'string') {
            try {
                const initialParse = JSON.parse(requestPayload);
                if (!findFields(initialParse)) findFields(raw);
            } catch (e) {
                findFields(raw);
            }
        } else {
            findFields(raw);
        }

    } catch (e) {
        return "Error: Failed to process input payload";
    }

    const targetChainId = payload.targetChainId || payload.targetChainID;
    const chequeId = payload.chequeId || payload.chequeID;
    const proof = payload.proof;

    if (!targetChainId || !chequeId || !proof) {
        return `Error: Payload is missing required fields. Parsed fields: ${Object.keys(payload).join(', ')}`;
    }

    console.log(`[ProofOracle] Processing proof for Cheque: ${chequeId} on Chain ID: ${targetChainId}`);

    // If it does not start with 0x, format it properly
    let proofHex: Hex = proof.startsWith('0x') ? proof as Hex : `0x${proof}` as Hex;

    // Identify the target chain from our config
    const targetChain = runtime.config.chains.find(
        c => c.chainId === targetChainId.toString()
    );

    if (!targetChain) {
        return `Error: Unknown targetChainId ${targetChainId} in configuration.`;
    }

    if (!targetChain.registryAddress || targetChain.registryAddress === "0x0000000000000000000000000000000000000000") {
        return `Error: Registry address not configured for chain ${targetChain.chainName}`;
    }

    // 3. Write Report back to Target Chain ProofRegistry
    try {
        // Hash the proof off-chain — only 32 bytes stored on-chain instead of ~16KB
        const proofHash = keccak256(proofHex);
        console.log(`[ProofOracle] Proof keccak256 hash: ${proofHash}`);

        // (bytes32 chequeId, bytes32 proofHash) — matches ProofRegistry._processReport
        const reportPayload = encodeAbiParameters(
            parseAbiParameters('bytes32, bytes32'),
            [chequeId as Hex, proofHash]
        );

        const reportRequest = prepareReportRequest(reportPayload);
        const report = runtime.report(reportRequest).result();

        const network = getNetwork({
            chainFamily: 'evm',
            chainSelectorName: targetChain.chainName,
            isTestnet: true
        });

        if (!network) return `Error: Network not found for ${targetChain.chainName}`;

        const writeClient = new cre.capabilities.EVMClient(network.chainSelector.selector);

        console.log(`[ProofOracle] Writing report to ${targetChain.chainName} (${targetChain.registryAddress})...`);

        const writeResult = writeClient.writeReport(runtime, {
            receiver: targetChain.registryAddress,
            report: report,
            gasConfig: { gasLimit: '200000' }, // Small now — only storing a bytes32 hash
        }).result();

        const txHashHex = writeResult.txHash
            ? (typeof writeResult.txHash === 'string'
                ? writeResult.txHash
                : bytesToHex(writeResult.txHash as Uint8Array))
            : '(not available in simulation dry-run)';

        console.log(`[ProofOracle] ✅ Tx Hash: ${txHashHex}`);
        console.log(`[ProofOracle] ✅ Tx Status: ${writeResult.txStatus}`);

        return `Success: Proof hash registered. Hash: ${proofHash}. Tx Hash: ${txHashHex}. Tx Status: ${writeResult.txStatus}`;

    } catch (e: any) {
        console.error(`[ProofOracle] Failed to execute workflow: ${e.message}`);
        return `Error: ${e.message}`;
    }
}

// 5. Initialization Logic
const initWorkflow = (config: Config) => {
    // We instantiate the HTTP Trigger capability defined in the CRE SDK
    const httpTrigger = new cre.capabilities.HTTPCapability().trigger({});

    // We return an array of handlers as expected by runner.run()
    return [
        cre.handler(
            httpTrigger,
            onHttpTrigger
        )
    ];
}

export async function main() {
    const runner = await Runner.newRunner<Config>({
        configSchema: ConfigSchema,
    });

    await runner.run(initWorkflow);
}
