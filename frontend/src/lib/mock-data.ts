export interface Cheque {
  id: string;
  denomination: number;
  targetChainId: number;
  compliance: boolean;
  proven: boolean;
  redeemed: boolean;
  timestamp: number;
  txHash?: string;
  proofHash?: string;
  settlementTxHash?: string;
  /** Wallet signature from the proving phase, persisted for auto-fill in redemption */
  walletSignature?: string;
}

export interface ChainInfo {
  id: number;
  name: string;
  icon: string;
  rpcUrl: string;
  cashierAddress: string;
}

export const CHAINS: ChainInfo[] = [
  { id: 11155111, name: "Ethereum Sepolia", icon: "⟠", rpcUrl: "https://sepolia.infura.io/v3/7bdf797390454aa4bddf06fe6b361d54", cashierAddress: "0xd32e613a93f8D683A45163692f9B5eFE03E77Ba9" },
  { id: 11155420, name: "Optimism Sepolia", icon: "🔴", rpcUrl: "https://optimism-sepolia.infura.io/v3/7bdf797390454aa4bddf06fe6b361d54", cashierAddress: "0xC0d7A1253E9Bc2e3a78A417F2c7B06EdeE525018" },
  { id: 421614, name: "Arbitrum Sepolia", icon: "🔵", rpcUrl: "https://arbitrum-sepolia.infura.io/v3/7bdf797390454aa4bddf06fe6b361d54", cashierAddress: "" },
  { id: 84532, name: "Base Sepolia", icon: "🟢", rpcUrl: "https://base-sepolia.infura.io/v3/7bdf797390454aa4bddf06fe6b361d54", cashierAddress: "" },
];

export const DENOMINATIONS = [1000, 500, 100];

export function generateChequeId(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return "0x" + Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}

export function autoBreakAmount(amount: number): number[] {
  const cheques: number[] = [];
  let remaining = amount;
  for (const denom of DENOMINATIONS) {
    while (remaining >= denom) {
      cheques.push(denom);
      remaining -= denom;
    }
  }
  return cheques;
}

export function generateMockTxHash(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return "0x" + Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}

export function getExplorerUrl(chainId: number, txHash: string): string {
  const explorers: Record<number, string> = {
    11155111: "https://sepolia.etherscan.io/tx/",
    11155420: "https://sepolia-optimism.etherscan.io/tx/",
    421614: "https://sepolia.arbiscan.io/tx/",
    84532: "https://sepolia.basescan.org/tx/",
  };
  return (explorers[chainId] || explorers[11155111]) + txHash;
}

export function getChainName(chainId: number): string {
  return CHAINS.find(c => c.id === chainId)?.name || "Unknown";
}

export function shortenHash(hash: string, chars = 6): string {
  return hash.slice(0, chars + 2) + "..." + hash.slice(-chars);
}

// Mock wallet state
export const MOCK_WALLET = {
  address: "0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18",
  balance: "12,450.00",
  connected: true,
};

// Mock overview stats
export const MOCK_STATS = {
  tvl: "$2,450,000",
  activeCheques: 42,
  recentSettlements: 18,
  totalMinted: 156,
};
