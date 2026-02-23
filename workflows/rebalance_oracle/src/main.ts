import {
    cre,
    getNetwork,
    Runner,
    type Runtime,
    bytesToHex,
    hexToBase64,
    CronCapability,
    type CronPayload,
    handler
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
        destinationChainSelector: z.string(),
        destinationVault: z.string()
    })),
});

type Config = z.infer<typeof ConfigSchema>;

// 2. Events & ABIs Definitions
const VAULT_BALANCE_ABI = parseAbiItem(
    'function token() external view returns (address)'
);
const REBALANCE_CROSS_CHAIN_ABI = parseAbiItem(
    'function rebalanceCrossChain(uint64 _destinationChainSelector, address _receiver, uint256 _amount) external returns (bytes32 messageId)'
);

// 3. Workflow Logic: Executes on the Cron Schedule
const onCronTrigger = (runtime: Runtime<Config>, payload: CronPayload): string => {
    if (payload.scheduledExecutionTime) {
        const scheduledTime = new Date(
            Number(payload.scheduledExecutionTime.seconds) * 1000 + payload.scheduledExecutionTime.nanos / 1000000
        )
        console.log(`[RebalanceOracle] Cron triggered at ${scheduledTime.toISOString()}. Checking Vault health...`)
    }

    let successes = 0;
    let ignored = 0;
    let errors = 0;

    // Iterate through all configured chains and check their vault balances
    for (const sourceChain of runtime.config.chains) {
        if (!sourceChain.vaultAddress || sourceChain.vaultAddress === NULL_ADDRESS) {
            continue;
        }

        console.log(`[RebalanceOracle] Checking Vault on ${sourceChain.chainName}...`);

        const network = getNetwork({
            chainFamily: 'evm',
            chainSelectorName: sourceChain.chainName,
            isTestnet: true
        });

        if (!network) {
            console.error(`Error: Network not found for ${sourceChain.chainName}`);
            errors++;
            continue;
        }

        const client = new cre.capabilities.EVMClient(network.chainSelector.selector);

        try {
            // Find token address from Vault
            const tokenCallData = encodeFunctionData({
                abi: [VAULT_BALANCE_ABI],
                functionName: 'token',
                args: []
            });

            // Make EVM Read Call
            // @ts-ignore - bypassing strict ClientCapability typing for SDK internal mock logic
            const tokenResult = client.call(runtime, {
                to: sourceChain.vaultAddress,
                data: hexToBase64(tokenCallData as Hex)
            }).result();

            // Simulation assumption: Balance exceeds threshold
            const threshold = BigInt(sourceChain.rebalanceThreshold);

            // Mocking the physical balance check for this boilerplate
            // const currentBalance = fetchFromERC20(tokenAddress);
            const currentBalance = threshold + 1n;

            const shouldRebalance = currentBalance > threshold;

            if (!shouldRebalance) {
                console.log(`[RebalanceOracle] ${sourceChain.chainName} vault balance safe. Skipping.`);
                ignored++;
                continue;
            }

            console.log(`[RebalanceOracle] Triggering CCIP Rebalance of Vault: ${sourceChain.vaultAddress} -> ${sourceChain.destinationChainSelector}`);

            // 3. Trigger CCIP Rebalancing via EVM Write execution
            const rebalancePayload = encodeFunctionData({
                abi: [REBALANCE_CROSS_CHAIN_ABI],
                functionName: 'rebalanceCrossChain',
                args: [
                    BigInt(sourceChain.destinationChainSelector),
                    sourceChain.destinationVault as Hex,
                    currentBalance // Transfer the excess or entire balance depending on protocol rules
                ],
            });

            // @ts-ignore - bypassing strict ClientCapability typing for SDK internals
            const writeResult = client.write(runtime, {
                to: sourceChain.vaultAddress,
                data: hexToBase64(rebalancePayload as Hex),
                gasConfig: { gasLimit: '1500000' }, // Generous gas for CCIP interaction
            }).result();

            console.log(`[RebalanceOracle] Success: Rebalance sequence initiated. Tx Status: ${writeResult.txStatus}`);
            successes++;

        } catch (e: any) {
            console.error(`[RebalanceOracle] Failed to execute workflow on ${sourceChain.chainName}: ${e.message}`);
            errors++;
        }
    }

    return `Batch complete. Rebalanced: ${successes}, Ignored: ${ignored}, Errors: ${errors}`;
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

    console.log(`Initializing cron rebalance workflow monitoring ${validVaults.length} vaults.`);

    // Create the trigger - fires every 1 hour (configurable based on needs)
    // The cron expression means: At minute 0 past every hour
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
