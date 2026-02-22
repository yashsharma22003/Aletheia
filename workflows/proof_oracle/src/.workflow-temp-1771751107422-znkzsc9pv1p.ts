import {
    cre,
    getNetwork,
    Runner,
    type Runtime,
    prepareReportRequest, sendErrorResponse,
} from '@chainlink/cre-sdk'
import { encodeAbiParameters, parseAbiParameters, type Hex, bytesToHex } from 'viem'
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
    let payload: any = requestPayload;

    try {
        if (typeof requestPayload === 'string') {
            payload = JSON.parse(requestPayload);
        } else if (requestPayload && requestPayload.payload) {
            payload = typeof requestPayload.payload === 'string'
                ? JSON.parse(requestPayload.payload)
                : requestPayload.payload;
        }

        // If the simulator wrapped it in a buffer but we haven't extracted it yet
        // This handles cases where input.data might be deeply nested or directly available.
        let inputData = requestPayload?.input?.data;
        if (!inputData && requestPayload?.data) { // Sometimes it's directly under 'data'
            inputData = requestPayload.data;
        }
        if (!inputData && payload?.input?.data) {
            inputData = payload.input.data;
        }
        if (!inputData && payload?.data) {
            inputData = payload.data;
        }

        if (!payload.targetChainId && inputData && Array.isArray(inputData)) {
            const bufferArray = inputData;
            const bufferString = Buffer.from(bufferArray).toString('utf-8');
            payload = JSON.parse(bufferString);
        }

    } catch (e) {
        return "Error: Failed to parse input payload";
    }

    const targetChainId = payload.targetChainId || payload.targetChainID;
    const chequeId = payload.chequeId || payload.chequeID;
    const proof = payload.proof;

    if (!targetChainId || !chequeId || !proof) {
        return `Error: Payload is missing required fields. Parsed: ${JSON.stringify(payload)}`;
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
        // (bytes32 chequeId, bytes proof)
        const reportPayload = encodeAbiParameters(
            parseAbiParameters('bytes32, bytes'),
            [chequeId as Hex, proofHex]
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
            gasConfig: { gasLimit: '1000000' }, // Proofs are large, need more gas
        }).result();

        return `Success: Proof registry report written. Tx Status: ${writeResult.txStatus}`;

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

main().catch(sendErrorResponse)
