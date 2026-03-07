export const chainsConfig: Record<number, { rpcUrl: string, complianceCashierAddress?: string, proofRegistryAddress?: string }> = {
    // Ethereum Sepolia
    11155111: {
        rpcUrl: "https://sepolia.infura.io/v3/7bdf797390454aa4bddf06fe6b361d54",
        complianceCashierAddress: "0xd32e613a93f8D683A45163692f9B5eFE03E77Ba9",
        proofRegistryAddress: "0xE825d11F112EcCaF3215c08f8bec12EC4d8Ed3F7"
    },
    // Optimism Sepolia
    11155420: {
        rpcUrl: "https://optimism-sepolia.infura.io/v3/7bdf797390454aa4bddf06fe6b361d54",
        complianceCashierAddress: "0xC0d7A1253E9Bc2e3a78A417F2c7B06EdeE525018",
        proofRegistryAddress: "0x95925576bf79242015DaF228343122f59C90B8F3"
    },
    // Base Sepolia
    84532: {
        rpcUrl: "https://base-sepolia.infura.io/v3/7bdf797390454aa4bddf06fe6b361d54",
        complianceCashierAddress: "0xf44d925116aD93Ddf3A634eCcFF01a59f4b2679b",
        proofRegistryAddress: "0x9FcdD7C57C515B5aec910e7E7B6B0d62A09000bd"
    },
    // Arbitrum Sepolia
    421614: {
        rpcUrl: "https://arbitrum-sepolia.infura.io/v3/7bdf797390454aa4bddf06fe6b361d54",
        complianceCashierAddress: "0xf44d925116aD93Ddf3A634eCcFF01a59f4b2679b",
        proofRegistryAddress: "0x9FcdD7C57C515B5aec910e7E7B6B0d62A09000bd"
    }
};
