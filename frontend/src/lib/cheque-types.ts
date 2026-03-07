/**
 * cheque-types.ts
 * Canonical type definitions and utility functions for cheques.
 * Previously part of mock-data.ts — all mock constants have been removed.
 */

import { TARGET_CHAINS } from "@/config/contracts";

export interface Cheque {
    id: string;
    denomination: number;
    sourceChainId: number;
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
    return TARGET_CHAINS.find(c => c.id === chainId)?.name || "Unknown";
}

export function shortenHash(hash: string, chars = 6): string {
    return hash.slice(0, chars + 2) + "..." + hash.slice(-chars);
}
