import {
    cre,
    getNetwork,
    Runner,
    type Runtime,
    bytesToHex,
    hexToBase64,
    CronCapability,
    type CronPayload,
    handler,
    encodeCallMsg,
    LATEST_BLOCK_NUMBER,
    prepareReportRequest
} from '@chainlink/cre-sdk'
import { parseAbiItem, encodeFunctionData, type Hex } from 'viem'
import { z } from 'zod'

// Valid Null Address Constant
const NULL_ADDRESS = "0x0000000000000000000000000000000000000000";

// 1. Configuration Schema tailored for Rebalancing
const ConfigSchema = z.object({
    chains: z.array(z.object({
        chainId: z.string(),
        chainName: z.string(),
        vaultAddress: z.string(),
        cashierAddress: z.string().optional(),
        rebalanceThreshold: z.string(),
        destinationChainSelector: z.string().optional(), // No longer strictly needed for dynamic routing
        destinationVault: z.string().optional() // No longer strictly needed for dynamic routing
    })),
});

type Config = z.infer<typeof ConfigSchema>;

// 2. Events & ABIs Definitions
const VAULT_TOKEN_ABI = parseAbiItem(
    'function token() external view returns (address)'
);
const ERC20_BALANCE_ABI = parseAbiItem(
    'function balanceOf(address account) external view returns (uint256)'
);
const REBALANCE_CROSS_CHAIN_ABI = parseAbiItem(
    'function rebalanceCrossChain(uint64 _destinationChainSelector, address _receiver, uint256 _amount) external returns (bytes32 messageId)'
);

interface VaultState {
    chainInfo: Config['chains'][0];
    tokenAddress: string;
    balance: bigint;
    threshold: bigint;
    client: any;
    chainSelector: bigint;
}

// 3. Workflow Logic: Executes on the Cron Schedule
const onCronTrigger = (runtime: Runtime<Config>, payload: CronPayload): string => {
    if (payload.scheduledExecutionTime) {
        const scheduledTime = new Date(
            Number(payload.scheduledExecutionTime.seconds) * 1000 + payload.scheduledExecutionTime.nanos / 1000000
        )
        console.log(`[RebalanceOracle] Cron triggered at ${scheduledTime.toISOString()}. Beginning distributed health check...`)
    }

    let errors = 0;
    const allVaults: VaultState[] = [];

    // --- PASS 1: GATHER ALL BALANCES ---
    console.log(`[RebalanceOracle] PASS 1: Fetching liquidity states from all networks...`);
    for (const chain of runtime.config.chains) {
        if (!chain.vaultAddress || chain.vaultAddress === NULL_ADDRESS) continue;

        const network = getNetwork({
            chainFamily: 'evm',
            chainSelectorName: chain.chainName,
            isTestnet: true
        });

        if (!network) {
            console.error(`[RebalanceOracle] Error: Network not found for ${chain.chainName}`);
            errors++;
            continue;
        }

        const client = new cre.capabilities.EVMClient(network.chainSelector.selector);

        try {
            // 1a. Find token address from Vault
            const tokenCallData = encodeFunctionData({
                abi: [VAULT_TOKEN_ABI],
                functionName: 'token',
                args: []
            });

            const tokenResultBytes = client.callContract(runtime, {
                call: encodeCallMsg({
                    from: NULL_ADDRESS as Hex,
                    to: chain.vaultAddress as Hex,
                    data: tokenCallData as Hex
                }),
                blockNumber: LATEST_BLOCK_NUMBER
            }).result();
            const tokenAddressStr = bytesToHex(tokenResultBytes.data).slice(-40);
            const tokenAddress = `0x${tokenAddressStr}` as Hex;

            // 1b. Get actual ERC20 Balance of the Vault
            const balCallData = encodeFunctionData({
                abi: [ERC20_BALANCE_ABI],
                functionName: 'balanceOf',
                args: [chain.vaultAddress as Hex]
            });

            const balResultBytes = client.callContract(runtime, {
                call: encodeCallMsg({
                    from: NULL_ADDRESS as Hex,
                    to: tokenAddress,
                    data: balCallData as Hex
                }),
                blockNumber: LATEST_BLOCK_NUMBER
            }).result();
            const balanceHex = bytesToHex(balResultBytes.data);
            const currentBalance = BigInt(balanceHex);
            const threshold = BigInt(chain.rebalanceThreshold);

            console.log(`[RebalanceOracle] - ${chain.chainName}: Balance = ${currentBalance}, Threshold = ${threshold}`);

            allVaults.push({
                chainInfo: chain,
                tokenAddress: tokenAddress,
                balance: currentBalance,
                threshold: threshold,
                client: client,
                chainSelector: BigInt(network.chainSelector.selector)
            });

        } catch (e: any) {
            console.error(`[RebalanceOracle] Execution failed on ${chain.chainName}: ${e.message || e}`);
            errors++;
        }
    }

    if (allVaults.length < 2) {
        return `[RebalanceOracle] Insufficient active vaults to rebalance. Found: ${allVaults.length}. Errors: ${errors}`;
    }

    // --- PASS 2: CALCULATE SURPLUS AND DEFICIT ---
    console.log(`[RebalanceOracle] PASS 2: Calculating optimal routing...`);

    let maxSurplusVault: VaultState | null = null;
    let maxSurplusAmount = 0n;

    let maxDeficitVault: VaultState | null = null;
    let maxDeficitAmount = 0n; // This is an absolute value (how much it is UNDER threshold)

    for (const v of allVaults) {
        const diff = v.balance - v.threshold;

        if (diff > 0n && diff > maxSurplusAmount) {
            maxSurplusAmount = diff;
            maxSurplusVault = v;
        } else if (diff < 0n) {
            const deficit = -diff;
            if (deficit > maxDeficitAmount) {
                maxDeficitAmount = deficit;
                maxDeficitVault = v;
            }
        }
    }

    // --- PASS 3: ROUTE THE TRANSACTON ---
    if (!maxSurplusVault) {
        return `[RebalanceOracle] Result: All vaults are operating at or below threshold limits. No surplus to distribute.`;
    }

    if (!maxDeficitVault) {
        // Technically this means everyone is healthy and above threshold, but we might just 
        // fall back to the config "destinationChainSelector" if there is a surplus and config mandates a drain.
        console.log(`[RebalanceOracle] Notice: No vaults are below threshold. All healthy.`);
        return `[RebalanceOracle] Result: No deficit detected across network. No rebalance needed.`;
    }

    // We have a sender (surplus) and a receiver (deficit)
    // Transfer amount is the minimum between what the sender can spare, and what the receiver needs.
    const transferAmount = maxSurplusAmount < maxDeficitAmount ? maxSurplusAmount : maxDeficitAmount;

    console.log(`[RebalanceOracle] ROUTING DECISION | Source: ${maxSurplusVault.chainInfo.chainName} (${maxSurplusAmount} Surplus) -> Dest: ${maxDeficitVault.chainInfo.chainName} (${maxDeficitAmount} Deficit) | Amount: ${transferAmount}`);

    try {
        const rebalancePayload = encodeFunctionData({
            abi: [REBALANCE_CROSS_CHAIN_ABI],
            functionName: 'rebalanceCrossChain',
            args: [
                maxDeficitVault.chainSelector,
                maxDeficitVault.chainInfo.vaultAddress as Hex,
                transferAmount
            ],
        });

        // Prepare the report
        const reportRequest = prepareReportRequest(rebalancePayload as Hex);
        const report = runtime.report(reportRequest).result();

        // Write EVM Data
        // @ts-ignore
        const writeResult = maxSurplusVault.client.writeReport(runtime, {
            receiver: maxSurplusVault.chainInfo.vaultAddress,
            report: report,
            gasConfig: { gasLimit: '1500000' },
        }).result();

        const txHash = writeResult.txHash ? bytesToHex(writeResult.txHash) : 'N/A';
        return `[RebalanceOracle] Success! Initiated CCIP transfer of ${transferAmount} units to ${maxDeficitVault.chainInfo.chainName}. Tx Status: ${writeResult.txStatus}, Hash: ${txHash}`;

    } catch (e: any) {
        return `[RebalanceOracle] CRITICAL ERROR executing CCIP transmission: ${e.message || e}`;
    }
}

// 4. Initialization Logic - Multi-Chain Support
const initWorkflow = (config: Config) => {
    // Check if there are any valid vaults configured
    const validVaults = config.chains.filter(
        c => c.vaultAddress &&
            c.vaultAddress !== NULL_ADDRESS &&
            c.vaultAddress !== "0x0"
    );

    if (validVaults.length === 0) {
        throw new Error("No chains found with a valid 'vaultAddress' to monitor.");
    }

    console.log(`[RebalanceOracle] Initializing cron workflow monitoring ${validVaults.length} vaults.`);

    // Create the trigger - fires every 1 hour (configurable based on needs)
    const cronTrigger = new CronCapability().trigger({
        schedule: "0 0 * * * *",
    });

    // Register 1 handler that will run iterating over all vaults in config
    return [handler(cronTrigger, onCronTrigger)];
}

export async function main() {
    const runner = await Runner.newRunner<Config>({
        configSchema: ConfigSchema,
    });

    await runner.run(initWorkflow);
}
