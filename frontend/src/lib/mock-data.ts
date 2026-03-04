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
}

export interface ChainInfo {
  id: number;
  name: string;
  icon: string;
}

export const CHAINS: ChainInfo[] = [
  { id: 1, name: "Ethereum", icon: "⟠" },
  { id: 10, name: "Optimism", icon: "🔴" },
  { id: 42161, name: "Arbitrum", icon: "🔵" },
  { id: 8453, name: "Base", icon: "🟢" },
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
    1: "https://etherscan.io/tx/",
    10: "https://optimistic.etherscan.io/tx/",
    42161: "https://arbiscan.io/tx/",
    8453: "https://basescan.org/tx/",
  };
  return (explorers[chainId] || explorers[1]) + txHash;
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
