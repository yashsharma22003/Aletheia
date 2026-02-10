import {
    cre,
    getNetwork,
    Runner,
    type Runtime,
    type NodeRuntime,
    TxStatus,
    bytesToHex,
    hexToBase64,
    encodeCallMsg,
    prepareReportRequest,
    protoBigIntToBigint,
    LATEST_BLOCK_NUMBER,
} from '@chainlink/cre-sdk'
import { encodeAbiParameters, parseAbiParameters, type Hex } from 'viem'
import { z } from 'zod'

// Configuration Schema
const ConfigSchema = z.object({
    chains: z.array(z.object({
        chainId: z.string(),
        chainName: z.string(), // e.g. "ethereum-testnet-sepolia"
        rpcUrl: z.string(),
        registryAddress: z.string(),
    })),
});

type Config = z.infer<typeof ConfigSchema>;

// Data Bundle returned from node consensus
interface StateRootData {
    chainId: string;
    blockNumber: string;
    blockHash: string;   // bytes32 hex — using block hash as the "state root"
}

// Fetch block headers using CRE SDK's EVMClient (works inside WASM sandbox)
function fetchBlockHeaders(
    runtime: Runtime<Config>,
    config: Config,
): StateRootData[] {
    const results: StateRootData[] = [];

    for (const chainConfig of config.chains) {
        try {
            const network = getNetwork({
                chainFamily: 'evm',
                chainSelectorName: chainConfig.chainName,
                isTestnet: true,
            });

            if (!network) {
                console.log(`[TruthOracle] Network not found for ${chainConfig.chainName}, skipping`);
                continue;
            }

            const evmClient = new cre.capabilities.EVMClient(network.chainSelector.selector);

            // Get latest block header via CRE capability (goes through simulator's RPC)
            const headerReply = evmClient.headerByNumber(runtime, {
                blockNumber: LATEST_BLOCK_NUMBER,
            }).result();

            if (!headerReply.header) {
                console.log(`[TruthOracle] No header returned for ${chainConfig.chainName}`);
                continue;
            }

            const header = headerReply.header;
            const blockNum = header.blockNumber ? protoBigIntToBigint(header.blockNumber) : 0n;
            const blockHash = bytesToHex(header.hash);

            console.log(`[TruthOracle] Fetched ${chainConfig.chainName}: Block #${blockNum}, Hash ${blockHash}`);

            results.push({
                chainId: chainConfig.chainId,
                blockNumber: blockNum.toString(),
                blockHash: blockHash,
            });

        } catch (error) {
            console.log(`[TruthOracle] Failed to fetch ${chainConfig.chainName}: ${error}`);
        }
    }

    return results;
}

// Write state roots to a specific chain's registry via CRE writeReport
function writeToRegistry(
    runtime: Runtime<Config>,
    chainConfig: Config['chains'][0],
    data: StateRootData[],
): void {
    if (data.length === 0) {
        console.log("[TruthOracle] No data to write.");
        return;
    }

    try {
        const network = getNetwork({
            chainFamily: 'evm',
            chainSelectorName: chainConfig.chainName,
            isTestnet: true,
        });

        if (!network) {
            console.log(`[TruthOracle] Network not found for write: ${chainConfig.chainName}`);
            return;
        }

        const evmClient = new cre.capabilities.EVMClient(network.chainSelector.selector);

        // ABI-encode raw (uint256[], uint256[], bytes32[]) for onReport to decode
        const chainIds = data.map(d => BigInt(d.chainId));
        const blockNumbers = data.map(d => BigInt(d.blockNumber));
        const blockHashes = data.map(d => d.blockHash as Hex);

        const reportPayload = encodeAbiParameters(
            parseAbiParameters('uint256[], uint256[], bytes32[]'),
            [chainIds, blockNumbers, blockHashes],
        );

        console.log(`[TruthOracle] Encoding report for ${chainConfig.chainName}...`);

        // Create a signed report
        const reportRequest = prepareReportRequest(reportPayload);
        const report = runtime.report(reportRequest).result();

        console.log(`[TruthOracle] Writing report to ${chainConfig.chainName} registry at ${chainConfig.registryAddress}...`);

        // Write the report to the chain
        const writeResult = evmClient.writeReport(runtime, {
            receiver: chainConfig.registryAddress,
            report: report,
            gasConfig: { gasLimit: '500000' },
        }).result();

        console.log(`[TruthOracle] Write result for ${chainConfig.chainName}: status=${writeResult.txStatus}`);

        if (writeResult.txHash) {
            console.log(`[TruthOracle] Tx hash: ${bytesToHex(writeResult.txHash)}`);
        }

        if (writeResult.errorMessage) {
            console.log(`[TruthOracle] Error: ${writeResult.errorMessage}`);
        }

    } catch (error) {
        console.log(`[TruthOracle] Write failed for ${chainConfig.chainName}: ${error}`);
    }
}

const onCronTrigger = (runtime: Runtime<Config>, _payload: any): string => {
    console.log(`[TruthOracle] Triggered by Cron`);
    const config = runtime.config;

    // 1. Fetch block headers from all source chains via CRE capabilities
    const blockData = fetchBlockHeaders(runtime, config);
    console.log(`[TruthOracle] Fetched ${blockData.length} block headers`);

    if (blockData.length === 0) {
        console.log("[TruthOracle] No block data fetched, nothing to update.");
        return "No data";
    }

    // 2. Write updates to each registry
    for (const chainConfig of config.chains) {
        writeToRegistry(runtime, chainConfig, blockData);
    }

    return "Success";
}

const initWorkflow = (config: Config) => {
    const cron = new cre.capabilities.CronCapability();
    return [
        cre.handler(
            cron.trigger({ schedule: "0 */30 * * * *" }),
            onCronTrigger
        )
    ];
}

export async function main() {
    const runner = await Runner.newRunner<Config>({
        configSchema: ConfigSchema,
    });

    await runner.run(initWorkflow);
}
