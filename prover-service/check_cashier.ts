import { createPublicClient, http } from 'viem';

const rpc = 'https://sepolia.infura.io/v3/7bdf797390454aa4bddf06fe6b361d54';
const cashierAddr = '0xd32e613a93f8D683A45163692f9B5eFE03E77Ba9' as const;
const chequeId = '0x1eb8bad16917cfb18d2ee22b936c7e52ad3fee2388a872a7418aee3992de0086' as const;

const cashierAbi = [
    {
        "inputs": [{ "internalType": "bytes32", "name": "", "type": "bytes32" }],
        "name": "usedNullifiers",
        "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "vault",
        "outputs": [{ "internalType": "contract Vault", "name": "", "type": "address" }],
        "stateMutability": "view",
        "type": "function"
    }
] as const;

const erc20Abi = [
    {
        "inputs": [{ "internalType": "address", "name": "account", "type": "address" }],
        "name": "balanceOf",
        "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
        "stateMutability": "view",
        "type": "function"
    }
] as const;

async function main() {
    const client = createPublicClient({ transport: http(rpc) });

    console.log("Checking Cashier on ETH Sepolia...");
    const isUsed = await client.readContract({
        address: cashierAddr,
        abi: cashierAbi,
        functionName: 'usedNullifiers',
        args: [chequeId],
    });
    console.log("usedNullifiers:", isUsed);

    const vaultAddr = await client.readContract({
        address: cashierAddr,
        abi: cashierAbi,
        functionName: 'vault',
    });
    console.log("Vault Address:", vaultAddr);

    // Get USDC token address? Let's say we don't know it, but we can query Vault balance of ETH.
    // But we need the token balance. Wait, does Vault have `token()`?
    const vaultAbi = [
        {
            "inputs": [],
            "name": "token",
            "outputs": [{ "internalType": "contract IERC20", "name": "", "type": "address" }],
            "stateMutability": "view",
            "type": "function"
        }
    ] as const;

    const tokenAddr = await client.readContract({
        address: vaultAddr as `0x${string}`,
        abi: vaultAbi,
        functionName: 'token',
    });
    console.log("Token Address:", tokenAddr);

    const tokenBalance = await client.readContract({
        address: tokenAddr as `0x${string}`,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [vaultAddr as `0x${string}`]
    });
    console.log("Vault Token Balance:", tokenBalance);
}

main().catch(console.error);
