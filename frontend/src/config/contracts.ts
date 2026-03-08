/** Full chain metadata including RPC + cashier: used by ChainSelector and ProvingEngine */
export interface ChainConfig {
    id: number;
    name: string;
    icon: string;
    rpcUrl: string;
    cashierAddress: string;
}

export const CHAINS: ChainConfig[] = [
    { id: 11155111, name: "Ethereum Sepolia", icon: "ETH", rpcUrl: "https://rpc.sepolia.org", cashierAddress: "0xd32e613a93f8D683A45163692f9B5eFE03E77Ba9" },
    { id: 11155420, name: "Optimism Sepolia", icon: "OP", rpcUrl: "https://sepolia.optimism.io", cashierAddress: "0xC0d7A1253E9Bc2e3a78A417F2c7B06EdeE525018" },
    { id: 421614, name: "Arbitrum Sepolia", icon: "ARB", rpcUrl: "https://sepolia-rollup.arbitrum.io/rpc", cashierAddress: "0xf44d925116aD93Ddf3A634eCcFF01a59f4b2679b" },
    { id: 84532, name: "Base Sepolia", icon: "BASE", rpcUrl: "https://sepolia.base.org", cashierAddress: "0xf44d925116aD93Ddf3A634eCcFF01a59f4b2679b" },
];

export const TARGET_CHAINS = [
    { id: 11155111, name: "Ethereum Sepolia" },
    { id: 11155420, name: "Optimism Sepolia" },
    { id: 421614, name: "Arbitrum Sepolia" },
    { id: 84532, name: "Base Sepolia" },
];

export const CONTRACT_ADDRESSES: Record<number, { vault: `0x${string}`; cashier: `0x${string}`; proofRegistry: `0x${string}`; truthRegistry: `0x${string}`; usdc: `0x${string}` }> = {
    11155111: { // Eth Sepolia
        vault: "0xE41e394394c44554B373bdcb9d52a3B7DEb59C6C",
        cashier: "0xd32e613a93f8D683A45163692f9B5eFE03E77Ba9",
        proofRegistry: "0xE825d11F112EcCaF3215c08f8bec12EC4d8Ed3F7",
        truthRegistry: "0xE88f55B3CADaC2f332E7b1d38599B4729A1c782d",
        usdc: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
    },
    11155420: { // OP Sepolia
        vault: "0x056a3452ab5F1A6a0e4A5A6c7fb7f2fD48ae6Cef",
        cashier: "0xC0d7A1253E9Bc2e3a78A417F2c7B06EdeE525018",
        proofRegistry: "0x95925576bf79242015DaF228343122f59C90B8F3",
        truthRegistry: "0x92c4Fe214c00A5B87EB8539F33aCbE68f7f93a3C",
        usdc: "0x5fd84259d66Cd46123540766Be93DFE6D43130D7",
    },
    421614: { // Arb Sepolia
        vault: "0xf1008566a204C5E435B16986fa049F7Dd57c9CaE",
        cashier: "0xf44d925116aD93Ddf3A634eCcFF01a59f4b2679b",
        proofRegistry: "0x9FcdD7C57C515B5aec910e7E7B6B0d62A09000bd",
        truthRegistry: "0xF47F1A8CC7291CA46Bb8228C7942BC96854B8003",
        usdc: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d",
    },
    84532: { // Base Sepolia
        vault: "0xf1008566a204C5E435B16986fa049F7Dd57c9CaE",
        cashier: "0xf44d925116aD93Ddf3A634eCcFF01a59f4b2679b",
        proofRegistry: "0x9FcdD7C57C515B5aec910e7E7B6B0d62A09000bd",
        truthRegistry: "0xF47F1A8CC7291CA46Bb8228C7942BC96854B8003",
        usdc: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    }
};
