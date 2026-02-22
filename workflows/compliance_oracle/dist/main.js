import { cre, getNetwork, Runner, bytesToHex, hexToBase64, ConfidentialHTTPClient, consensusIdenticalAggregation, ok, prepareReportRequest, } from '@chainlink/cre-sdk';
import { parseAbiItem, decodeEventLog, parseAbiParameters, encodeAbiParameters } from 'viem';
import { z } from 'zod';
// Valid Null Address Constant
const NULL_ADDRESS = "0x0000000000000000000000000000000000000000";
// 1. Configuration Schema
const ConfigSchema = z.object({
    chains: z.array(z.object({
        chainId: z.string(),
        chainName: z.string(),
        rpcUrl: z.string().optional(),
        registryAddress: z.string().optional(),
        chequeContractAddress: z.string(),
    })),
    // The mock API URL to call for compliance verification
    kycApiUrl: z.string()
});
// 2. Event Definition
const CHEQUE_CREATED_EVENT_ABI = parseAbiItem('event ChequeCreated(bytes32 indexed chequeId, address indexed owner, uint256 denomination, uint256 targetChainId, uint256 blockNumber)');
// Helper to decode log manually
const decodeLog = (log) => {
    const topics = log.topics.map(t => bytesToHex(t));
    const data = bytesToHex(log.data);
    return decodeEventLog({
        abi: [CHEQUE_CREATED_EVENT_ABI],
        data: data,
        topics: topics
    });
};
const verifyCompliance = (sendRequester, config, chequeId, owner) => {
    const response = sendRequester.sendRequest({
        request: {
            url: config.kycApiUrl,
            method: "POST",
            bodyString: '{"chequeId": "{{.chequeId}}", "owner": "{{.owner}}"}',
            multiHeaders: {
                "Authorization": { values: ["Bearer {{.myKycApiKey}}"] },
                "Content-Type": { values: ["application/json"] }
            },
            templatePublicValues: {
                chequeId: chequeId,
                owner: owner
            }
        },
        vaultDonSecrets: [
            { key: "myKycApiKey" },
            { key: "san_marino_aes_gcm_encryption_key" } // Load encryption key for output
        ],
        encryptOutput: true // Encrypt the response using AES-GCM
    }).result();
    if (!ok(response)) {
        throw new Error(`Kyc API request failed with status: ${response.statusCode}`);
    }
    // Since we are returning the encrypted string directly in reality we just pass it along
    // But for the types required here, we treat the encrypted output as a payload to return
    const responseBody = new TextDecoder().decode(response.body);
    // We return a stringifed representation since the response is encrypted ciphertext
    return {
        isCompliant: true, // Mock logic - in reality, we're returning ciphertext
        chequeId: chequeId,
        owner: owner,
        // The actual encrypted output is in `response.body`
        // @ts-ignore - bypassing strict type for mock structure
        encryptedPayload: Buffer.from(response.body).toString('base64')
    };
};
// 4. Workflow Logic
const onLogTrigger = (runtime, log) => {
    // 1. Parse Event Data
    let decodedEvent;
    try {
        decodedEvent = decodeLog(log);
    }
    catch (e) {
        console.error("Failed to decode log:", e);
        return "Error: Failed to decode log";
    }
    const { chequeId, owner, targetChainId } = decodedEvent.args;
    console.log(`[ComplianceOracle] Event Detected! Owner: ${owner}, Cheque: ${chequeId}, Target: ${targetChainId}`);
    const logAddressHex = bytesToHex(log.address).toLowerCase();
    const sourceChain = runtime.config.chains.find(c => c.chequeContractAddress &&
        c.chequeContractAddress.toLowerCase() === logAddressHex);
    if (!sourceChain) {
        return `Error: Could not identify source chain for contract ${logAddressHex}`;
    }
    // 2. Execute Confidential HTTP Request
    const confHTTPClient = new ConfidentialHTTPClient();
    try {
        // Execute the fetch function inside the enclave and get consensus
        const result = confHTTPClient.sendRequest(runtime, verifyCompliance, consensusIdenticalAggregation())(runtime.config, chequeId, owner).result();
        // The result contains the mock logic
        console.log(`[ComplianceOracle] Successfully generated compliance status for ${chequeId}.`);
        // 3. Write Report back to Source Chain Cashier
        const reportPayload = encodeAbiParameters(parseAbiParameters('bytes32, bool'), [chequeId, true]);
        const reportRequest = prepareReportRequest(reportPayload);
        const report = runtime.report(reportRequest).result();
        const sourceNetwork = getNetwork({
            chainFamily: 'evm',
            chainSelectorName: sourceChain.chainName,
            isTestnet: true
        });
        if (!sourceNetwork)
            return `Error: Network not found for ${sourceChain.chainName}`;
        const writeClient = new cre.capabilities.EVMClient(sourceNetwork.chainSelector.selector);
        console.log(`[ComplianceOracle] Writing report to ${sourceChain.chainName} (${sourceChain.chequeContractAddress})...`);
        const writeResult = writeClient.writeReport(runtime, {
            receiver: sourceChain.chequeContractAddress,
            report: report,
            gasConfig: { gasLimit: '500000' },
        }).result();
        return `Success: Compliance report written. Tx Status: ${writeResult.txStatus}`;
    }
    catch (e) {
        console.error(`[ComplianceOracle] Failed to execute workflow: ${e.message}`);
        return `Error: ${e.message}`;
    }
};
// 5. Initialization Logic - Multi-Chain Support
const initWorkflow = (config) => {
    const validChains = config.chains.filter(c => c.chequeContractAddress &&
        c.chequeContractAddress !== NULL_ADDRESS &&
        c.chequeContractAddress !== "0x0");
    if (validChains.length === 0) {
        throw new Error("No chains found with a valid 'chequeContractAddress' to listen on.");
    }
    console.log(`Initializing compliance workflow for ${validChains.length} chains: ${validChains.map(c => c.chainName).join(', ')}`);
    return validChains.map(chain => {
        const network = getNetwork({
            chainFamily: 'evm',
            chainSelectorName: chain.chainName,
            isTestnet: true,
        });
        if (!network) {
            throw new Error(`Network ${chain.chainName} not valid`);
        }
        const evmClient = new cre.capabilities.EVMClient(network.chainSelector.selector);
        return cre.handler(evmClient.logTrigger({
            addresses: [hexToBase64(chain.chequeContractAddress)],
        }), onLogTrigger);
    });
};
export async function main() {
    const runner = await Runner.newRunner({
        configSchema: ConfigSchema,
    });
    await runner.run(initWorkflow);
}
