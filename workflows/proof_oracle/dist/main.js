"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = main;
const cre_sdk_1 = require("@chainlink/cre-sdk");
const viem_1 = require("viem");
const zod_1 = require("zod");
// 1. Configuration Schema (Matches staging.json)
const ConfigSchema = zod_1.z.object({
    chains: zod_1.z.array(zod_1.z.object({
        chainId: zod_1.z.string(),
        chainName: zod_1.z.string(),
        rpcUrl: zod_1.z.string().optional(),
        registryAddress: zod_1.z.string(),
    }))
});
// 2. HTTP Trigger Handler
const onHttpTrigger = (runtime, requestPayload) => {
    console.log(`[ProofOracle] Received HTTP Trigger with payload:`, JSON.stringify(requestPayload));
    // The CRE Simulator CLI parses the JSON directly.
    // In production, the HTTP trigger may pass it differently depending on exact node version.
    let payload = {};
    try {
        // Deep clone to strip out SDK proxy getters
        const raw = JSON.parse(JSON.stringify(requestPayload));
        // Let's implement a recursive search to find our target fields anywhere in the object tree
        // as the Chainlink Simulator deeply wraps HTTP payloads in Buffer objects
        const findFields = (obj) => {
            if (!obj || typeof obj !== 'object')
                return false;
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
                }
                catch (e) { /* ignore parse errors and keep searching */ }
            }
            // Recursive search
            for (const key of Object.keys(obj)) {
                if (findFields(obj[key]))
                    return true;
                // Also attempt parsing any string values
                if (typeof obj[key] === 'string') {
                    try {
                        const parsedStr = JSON.parse(obj[key]);
                        if (findFields(parsedStr))
                            return true;
                    }
                    catch (e) { /* ignore parse errors */ }
                }
            }
            return false;
        };
        // Start search
        if (typeof requestPayload === 'string') {
            try {
                const initialParse = JSON.parse(requestPayload);
                if (!findFields(initialParse))
                    findFields(raw);
            }
            catch (e) {
                findFields(raw);
            }
        }
        else {
            findFields(raw);
        }
    }
    catch (e) {
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
    let proofHex = proof.startsWith('0x') ? proof : `0x${proof}`;
    // Identify the target chain from our config
    const targetChain = runtime.config.chains.find(c => c.chainId === targetChainId.toString());
    if (!targetChain) {
        return `Error: Unknown targetChainId ${targetChainId} in configuration.`;
    }
    if (!targetChain.registryAddress || targetChain.registryAddress === "0x0000000000000000000000000000000000000000") {
        return `Error: Registry address not configured for chain ${targetChain.chainName}`;
    }
    // 3. Write Report back to Target Chain ProofRegistry
    try {
        // (bytes32 chequeId, bytes proof)
        const reportPayload = (0, viem_1.encodeAbiParameters)((0, viem_1.parseAbiParameters)('bytes32, bytes'), [chequeId, proofHex]);
        const reportRequest = (0, cre_sdk_1.prepareReportRequest)(reportPayload);
        const report = runtime.report(reportRequest).result();
        const network = (0, cre_sdk_1.getNetwork)({
            chainFamily: 'evm',
            chainSelectorName: targetChain.chainName,
            isTestnet: true
        });
        if (!network)
            return `Error: Network not found for ${targetChain.chainName}`;
        const writeClient = new cre_sdk_1.cre.capabilities.EVMClient(network.chainSelector.selector);
        console.log(`[ProofOracle] Writing report to ${targetChain.chainName} (${targetChain.registryAddress})...`);
        const writeResult = writeClient.writeReport(runtime, {
            receiver: targetChain.registryAddress,
            report: report,
            gasConfig: { gasLimit: '1000000' }, // Proofs are large, need more gas
        }).result();
        return `Success: Proof registry report written. Tx Status: ${writeResult.txStatus}`;
    }
    catch (e) {
        console.error(`[ProofOracle] Failed to execute workflow: ${e.message}`);
        return `Error: ${e.message}`;
    }
};
// 5. Initialization Logic
const initWorkflow = (config) => {
    // We instantiate the HTTP Trigger capability defined in the CRE SDK
    const httpTrigger = new cre_sdk_1.cre.capabilities.HTTPCapability().trigger({});
    // We return an array of handlers as expected by runner.run()
    return [
        cre_sdk_1.cre.handler(httpTrigger, onHttpTrigger)
    ];
};
async function main() {
    const runner = await cre_sdk_1.Runner.newRunner({
        configSchema: ConfigSchema,
    });
    await runner.run(initWorkflow);
}
