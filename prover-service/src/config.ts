export const chainsConfig: Record<number, { rpcUrl: string, complianceCashierAddress?: string, proofRegistryAddress?: string }> = {
    // Optimism Sepolia (Target Chain for Demo)
    11155420: {
        rpcUrl: "https://optimism-sepolia.infura.io/v3/7bdf797390454aa4bddf06fe6b361d54",
        proofRegistryAddress: "0x95925576bf79242015DaF228343122f59C90B8F3"
    },
    // Ethereum Sepolia (Source Chain for Demo)
    11155111: {
        rpcUrl: "https://sepolia.infura.io/v3/7bdf797390454aa4bddf06fe6b361d54",
        complianceCashierAddress: "0xd32e613a93f8D683A45163692f9B5eFE03E77Ba9"
    }
};
