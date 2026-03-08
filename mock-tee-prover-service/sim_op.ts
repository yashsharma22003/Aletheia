import { createPublicClient, http, encodeAbiParameters, parseAbiParameters, Hex } from 'viem';

const rpc = 'https://sepolia.infura.io/v3/7bdf797390454aa4bddf06fe6b361d54';
const cashierAddr = '0xd32e613a93f8D683A45163692f9B5eFE03E77Ba9' as const;
const simWallet = '0x15fC6ae905c1d68aDFbb0535306B6539101f9F88' as const;

const chequeId = '0x1eb8bad16917cfb18d2ee22b936c7e52ad3fee2388a872a7418aee3992de0086';
const recipient = '0x7F248511D4e51a9f3ded64AaC7771Cd6ffb6360E';
const amount = 1000000000n; // 1000 USDC

const cashierAbi = [
    {
        "inputs": [
            { "internalType": "bytes", "name": "metadata", "type": "bytes" },
            { "internalType": "bytes", "name": "report", "type": "bytes" }
        ],
        "name": "onReport",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "vault",
        "outputs": [{ "internalType": "contract Vault", "name": "", "type": "address" }],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "getForwarderAddress",
        "outputs": [{ "internalType": "address", "name": "", "type": "address" }],
        "stateMutability": "view",
        "type": "function"
    }
] as const;

async function main() {
    const client = createPublicClient({ transport: http(rpc) });

    console.log("Checking OP Sepolia Cashier...");

    const forwarder = await client.readContract({
        address: cashierAddr,
        abi: cashierAbi,
        functionName: 'getForwarderAddress'
    });
    console.log("Forwarder:", forwarder);

    // Simulate onReport call
    const reportPayload = encodeAbiParameters(
        parseAbiParameters('uint8, bytes32, address, uint256, bool'),
        [1, chequeId as Hex, recipient as Hex, amount, true]
    );

    console.log("Simulating onReport...");
    try {
        await client.simulateContract({
            address: cashierAddr,
            abi: cashierAbi,
            functionName: 'onReport',
            args: ["0x", reportPayload],
            account: simWallet,
        });
        console.log("Simulation SUCCESS. It should not revert!");
    } catch (e: any) {
        console.log("Simulation REVERTED:");
        console.log(e.shortMessage || e.message);
    }
}

main().catch(console.error);
