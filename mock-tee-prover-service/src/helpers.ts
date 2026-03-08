import { RLP } from '@ethereumjs/rlp';
import { Buffer } from 'buffer';

// ──────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────

export const MAX_DEPTH = 10;

// ──────────────────────────────────────────────
// RLP & MPT Parsing
// ──────────────────────────────────────────────

export function decodeRlp(hex: string): any {
    const buffer = Buffer.from(hex.slice(2), 'hex');
    return RLP.decode(buffer);
}

/** Convert a Buffer/Uint8Array to a number[] for TOML generation */
export function toNumArray(buf: Uint8Array | Buffer | any): number[] {
    if (!buf) return Array(32).fill(0);
    return Array.from(Buffer.from(buf));
}

/** Hex string (0x-prefixed) → number[] */
export function hexToNumArray(hex: string, size?: number): number[] {
    const arr = toNumArray(Buffer.from(hex.slice(2), 'hex'));
    if (size && arr.length < size) {
        const padded = Array(size).fill(0);
        for (let i = 0; i < arr.length; i++) padded[i] = arr[i];
        return padded;
    }
    return arr;
}

// ──────────────────────────────────────────────
// MPT Node Parsing
// ──────────────────────────────────────────────

export interface ParsedNode {
    rows: number[][];
    row_exist: boolean[];
    node_type: number;
    isLeaf: boolean;
}

export function parseProofNode(rlpNode: any): ParsedNode {
    const rows = Array(16).fill(null).map(() => Array(32).fill(0));
    const row_exist = Array(16).fill(false);
    let node_type = 0;

    if (Array.isArray(rlpNode) && rlpNode.length === 17) {
        // Branch node
        node_type = 0;
        for (let i = 0; i < 16; i++) {
            const child = rlpNode[i];
            if (child.length > 0) {
                row_exist[i] = true;
                const childBytes = toNumArray(child);
                if (childBytes.length < 32) {
                    for (let j = 0; j < childBytes.length; j++) rows[i][j] = childBytes[j];
                } else {
                    for (let j = 0; j < 32; j++) rows[i][j] = childBytes[j];
                }
            }
        }
    } else if (Array.isArray(rlpNode) && rlpNode.length === 2) {
        const key = toNumArray(rlpNode[0]);
        const value = toNumArray(rlpNode[1]);
        const firstNibble = (key[0] >> 4) & 0x0f;

        if (firstNibble === 0 || firstNibble === 1) {
            // Extension node
            node_type = 1;
            rows[0] = Array(32).fill(0);
            rows[0][0] = firstNibble;
            rows[0][1] = key[0] & 0x0f;
            rows[0][2] = key.length - 1;

            for (let i = 1; i < key.length && i <= 32; i++) {
                rows[1][i - 1] = key[i];
            }
            for (let i = 0; i < value.length && i < 32; i++) {
                rows[2][i] = value[i];
            }

            row_exist[0] = true;
            row_exist[1] = true;
            row_exist[2] = true;
        } else {
            // Leaf node
            return { rows, row_exist, node_type, isLeaf: true };
        }
    }

    return { rows, row_exist, node_type, isLeaf: false };
}

export function processProof(proofHexArray: string[]): ParsedNode[] {
    const nodes: ParsedNode[] = [];

    for (let i = 0; i < proofHexArray.length; i++) {
        const rlp = decodeRlp(proofHexArray[i]);
        if (i === proofHexArray.length - 1) continue; // skip leaf
        const parsed = parseProofNode(rlp);
        if (!parsed.isLeaf) {
            nodes.push(parsed);
        }
    }

    // Pad to MAX_DEPTH
    while (nodes.length < MAX_DEPTH) {
        nodes.push({
            rows: Array(16).fill(null).map(() => Array(32).fill(0)),
            row_exist: Array(16).fill(false),
            node_type: 0,
            isLeaf: false,
        });
    }
    return nodes;
}

// ──────────────────────────────────────────────
// Trie Key Index
// ──────────────────────────────────────────────

export function calculateTrieKeyIndex(nodes: ParsedNode[]): number {
    let index = 0;
    for (const node of nodes) {
        if (node.node_type === 0) {
            index += 1;
        } else if (node.node_type === 1) {
            const prefix = node.rows[0][0];
            const byteLenMinusOne = node.rows[0][2];
            if (prefix === 0 || prefix === 2) {
                index += byteLenMinusOne * 2;
            } else {
                index += 1 + byteLenMinusOne * 2;
            }
        }
    }
    return index;
}

// ──────────────────────────────────────────────
// TOML Formatting
// ──────────────────────────────────────────────

export function toTomlBytes(arr: number[] | Uint8Array): string {
    const nums = Array.from(arr);
    return `[${nums.join(', ')}]`;
}

export function toTomlBool(arr: boolean[]): string {
    return `[${arr.map(b => (b ? 'true' : 'false')).join(', ')}]`;
}

export function nodeToToml(node: ParsedNode): string {
    const rowsStr = node.rows.map((row: number[]) => `[${row.join(', ')}]`).join(', ');
    return `node_type = ${node.node_type}
    row_exist = ${toTomlBool(node.row_exist)}
    rows = [${rowsStr}]`;
}
