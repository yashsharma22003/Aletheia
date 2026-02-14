import {
    cre,
    getNetwork,
    Runner,
    type Runtime,
    type EVMLog,
    bytesToHex,
    prepareReportRequest,
    protoBigIntToBigint,
    blockNumber as toProtoBlockNumber,
    hexToBase64,
} from '@chainlink/cre-sdk'
import { parseAbiParameters, parseAbiItem, encodeAbiParameters, decodeEventLog, type Hex } from 'viem'
import { z } from 'zod'

// Valid Null Address Constant
const NULL_ADDRESS = "0x0000000000000000000000000000000000000000";

// 1. Updated Configuration Schema to match your JSON (Single Array of Chains)
const ConfigSchema = z.object({
    chains: z.array(z.object({
        chainId: z.string(),
        chainName: z.string(),
        rpcUrl: z.string().optional(),
        registryAddress: z.string(),
        chequeContractAddress: z.string(),
    })),
});

type Config = z.infer<typeof ConfigSchema>;

// 2. Event Definition
const CHEQUE_CREATED_EVENT_ABI = parseAbiItem(
    'event ChequeCreated(bytes32 indexed chequeId, address indexed owner, uint256 denomination, uint256 targetChainId, uint256 blockNumber)'
);

// Helper to decode log manually since we are using raw logTrigger
const decodeLog = (log: EVMLog) => {
    // Convert topics: SDK gives bytes (Uint8Array), viem expects Hex strings
    const topics = log.topics.map(t => bytesToHex(t));
    const data = bytesToHex(log.data);

    return decodeEventLog({
        abi: [CHEQUE_CREATED_EVENT_ABI],
        data: data,
        topics: topics as [Hex, ...Hex[]]
    });
}

// 3. Workflow Logic Refactored to Match Reference Implementation
const onLogTrigger = (runtime: Runtime<Config>, log: EVMLog): string => {
    // 1. Parse Event Data manually
    let decodedEvent;
    try {
        decodedEvent = decodeLog(log);
    } catch (e) {
        console.error("Failed to decode log:", e);
        return "Error: Failed to decode log";
    }

    const { targetChainId, blockNumber } = decodedEvent.args;

    console.log(`[TruthOracle] Event Detected! Target Chain: ${targetChainId}, Block: ${blockNumber}`);

    // 2. Identify Source Chain (The one with the valid chequeContractAddress matching log address)
    const logAddressHex = bytesToHex(log.address).toLowerCase();

    const sourceChain = runtime.config.chains.find(c =>
        c.chequeContractAddress &&
        c.chequeContractAddress.toLowerCase() === logAddressHex
    );

    if (!sourceChain) {
        return `Error: Could not identify source chain for contract ${logAddressHex}`;
    }

    // 3. Fetch Header (Read) from Source Chain
    const network = getNetwork({
        chainFamily: 'evm',
        chainSelectorName: sourceChain.chainName,
        isTestnet: true
    });

    if (!network) return `Error: Network not found for ${sourceChain.chainName}`;

    const client = new cre.capabilities.EVMClient(network.chainSelector.selector);

    // Use BigInt conversion for Input (toProtoBlockNumber)
    const headerResult = client.headerByNumber(runtime, {
        blockNumber: toProtoBlockNumber(blockNumber)
    }).result();

    if (!headerResult.header) {
        return `Error: Could not fetch header for block ${blockNumber}`;
    }

    const header = headerResult.header;
    const actualBlockNum = header.blockNumber ? protoBigIntToBigint(header.blockNumber) : 0n;
    const blockHash = bytesToHex(header.hash);

    console.log(`[TruthOracle] Fetched Header from ${sourceChain.chainName}: Block #${actualBlockNum}, Hash: ${blockHash}`);

    // 4. Encode & Write (Write) to Target Chain Registry
    const targetChain = runtime.config.chains.find(c => c.chainId === targetChainId.toString());

    if (!targetChain) {
        return `Error: Target chain ID ${targetChainId} not found in config`;
    }

    // Prepare payload for Registry.update(uint256[], uint256[], bytes32[])
    const chainIds = [BigInt(sourceChain.chainId)]; // The ID of the chain we fetched FROM
    const blockNumbers = [actualBlockNum];
    const blockHashes = [blockHash as Hex];

    const reportPayload = encodeAbiParameters(
        parseAbiParameters('uint256[], uint256[], bytes32[]'),
        [chainIds, blockNumbers, blockHashes],
    );

    const reportRequest = prepareReportRequest(reportPayload);
    const report = runtime.report(reportRequest).result();

    const targetNetwork = getNetwork({
        chainFamily: 'evm',
        chainSelectorName: targetChain.chainName,
        isTestnet: true
    });

    if (!targetNetwork) return `Error: Target network not found for ${targetChain.chainName}`;

    const targetClient = new cre.capabilities.EVMClient(targetNetwork.chainSelector.selector);

    console.log(`[TruthOracle] Writing report to ${targetChain.chainName} (${targetChain.registryAddress})...`);

    const writeResult = targetClient.writeReport(runtime, {
        receiver: targetChain.registryAddress,
        report: report,
        gasConfig: { gasLimit: '500000' },
    }).result();

    return `Success: Report written. Tx Status: ${writeResult.txStatus}`;
}

// 4. Initialization Logic - Multi-Chain Support
const initWorkflow = (config: Config) => {
    // 1. Filter valid chains (those with a contract address)
    const validChains = config.chains.filter(
        c => c.chequeContractAddress &&
            c.chequeContractAddress !== NULL_ADDRESS &&
            c.chequeContractAddress !== "0x0"
    );

    if (validChains.length === 0) {
        throw new Error("No chains found with a valid 'chequeContractAddress' to listen on.");
    }

    console.log(`Initializing workflow for ${validChains.length} chains: ${validChains.map(c => c.chainName).join(', ')}`);

    // 2. Map each valid chain to a handler
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

        // Return the handler for this specific chain
        return cre.handler(
            evmClient.logTrigger({
                addresses: [hexToBase64(chain.chequeContractAddress as Hex)],
            }),
            onLogTrigger
        );
    });
}

export async function main() {
    const runner = await Runner.newRunner<Config>({
        configSchema: ConfigSchema,
    });

    await runner.run(initWorkflow);
}