// @ts-ignore
import { poseidon2Hash } from '@zkpassport/poseidon2';
import { createPublicClient, createTestClient, http, keccak256, encodeAbiParameters, parseAbiParameters, toHex, toBytes, ToBytesParameters, encodePacked, walletActions, publicActions } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { foundry } from 'viem/chains';
import * as fs from 'fs';
import * as path from 'path';
import { RLP } from '@ethereumjs/rlp';
import { Buffer } from 'buffer';
import { secp256k1 } from '@noble/curves/secp256k1.js';

// Configuration
const RPC_URL = 'http://127.0.0.1:8545';
const PROVER_TOML_PATH = path.join(__dirname, '../circuits/Prover.toml');

// Deployment Data (From User Output)
const CASHIER_ADDRESS = '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512';
// CHEQUE_ID is calculated dynamically below.
const DEPOSITOR_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'; // Anvil Account 0
const RECIPIENT = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'; // Anvil Account 1
const TARGET_CHAIN_ID = 11155111n;
const DENOMINATION = 1000n;

// Calculate CHEQUE_ID dynamically (Nonce 0)
const depositorAccount = privateKeyToAccount(DEPOSITOR_KEY as `0x${string}`);
const depositorAddress = depositorAccount.address;
// chequeId = keccak256(abi.encodePacked(owner, nonce))
// nonce is uint256.
const nonce0 = 0n;
const encodedChequeId = keccak256(encodePacked(['address', 'uint256'], [depositorAddress, nonce0]));
const CHEQUE_ID = encodedChequeId;
console.log('Using Calculated CHEQUE_ID:', CHEQUE_ID);

// CONSTANTS
const MAX_DEPTH = 10;

// === RLP & MPT HELPERS ===

function decodeRlp(hex: string): any {
    const buffer = Buffer.from(hex.slice(2), 'hex');
    return RLP.decode(buffer);
}

// Convert Buffer/Uint8Array to number[] for TOML
function toNumArray(buf: Uint8Array | Buffer | any): number[] {
    if (!buf) return Array(32).fill(0);
    return Array.from(Buffer.from(buf));
}

// Parse a single MPT Node from RLP
function parseProofNode(rlpNode: any) {
    const rows = Array(16).fill(null).map(() => Array(32).fill(0));
    const row_exist = Array(16).fill(false);
    let node_type = 0;

    if (Array.isArray(rlpNode) && rlpNode.length === 17) {
        // Branch
        node_type = 0;
        for (let i = 0; i < 16; i++) {
            const child = rlpNode[i];
            if (child.length > 0) {
                row_exist[i] = true;
                const childBytes = toNumArray(child);
                // If embedded (<32 bytes), it's the node itself; if 32 bytes, it's hash.
                // For Noir MPT, we just put the 32 bytes.
                // If embedded, we need to hash it? Or Noir handles it?
                // Noir mpt expects 32 bytes.
                if (childBytes.length < 32) {
                    console.warn(`WARNING: Found embedded child node at index ${i} with length ${childBytes.length}. This might break Noir MPT!`);
                    // In standard MPT, small nodes are embedded. 
                    // However, the Noir MPT library usually expects hashes. 
                    // Let's pad or use as is? 
                    // IMPORTANT: The Reference Implementation just copies bytes.
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

        if (firstNibble === 0 || firstNibble === 1) { // Extension
            node_type = 1;
            rows[0] = Array(32).fill(0);
            rows[0][0] = firstNibble;
            rows[0][1] = key[0] & 0x0f; // second nibble
            rows[0][2] = key.length - 1; // rest length

            // Key remaining
            for (let i = 1; i < key.length && i <= 32; i++) {
                rows[1][i - 1] = key[i];
            }

            // Value (child hash)
            for (let i = 0; i < value.length && i < 32; i++) {
                rows[2][i] = value[i];
            }

            row_exist[0] = true;
            row_exist[1] = true;
            row_exist[2] = true;

        } else { // Leaf (2 or 3)
            // Noir MPT loop skips leaves usually, they are verified separately?
            // Reference `parseProofNode` returns isLeaf=true.
            return { isLeaf: true };
        }
    }

    return { rows, row_exist, node_type, isLeaf: false };
}

function processProof(proofHexArray: string[]): any[] {
    const nodes = [];
    // Process all except last (leaf)
    for (let i = 0; i < proofHexArray.length; i++) {
        const rlp = decodeRlp(proofHexArray[i]);
        if (i === proofHexArray.length - 1) {
            // Leaf - handled separately as 'value'
            continue;
        }
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
            isLeaf: false
        });
    }
    return nodes;
}

// TOML Helpers
function toTomlBytes(arr: number[] | Uint8Array) {
    const nums = Array.from(arr);
    return `[${nums.join(', ')}]`;
}

function toTomlBool(arr: boolean[]) {
    return `[${arr.map(b => b ? 'true' : 'false').join(', ')}]`;
}

function nodeToToml(node: any) {
    const rowsStr = node.rows.map((row: any) => `[${row.join(', ')}]`).join(', ');
    return `node_type = ${node.node_type}
    row_exist = ${toTomlBool(node.row_exist)}
    rows = [${rowsStr}]`;
}

function calculateTrieKeyIndex(nodes: any[]): number {
    let index = 0;
    for (const node of nodes) {
        if (node.node_type === 0) {
            // Branch node: consumes 1 nibble
            index += 1;
        } else if (node.node_type === 1) {
            // Extension node
            // rows[0][0] is first nibble (prefix 0 or 1 or 2 or 3)
            // rows[0][2] is length of remaining bytes (key.length - 1)
            const prefix = node.rows[0][0];
            const byteLenMinusOne = node.rows[0][2];

            if (prefix === 0 || prefix === 2) {
                // Even: prefix byte is just flags. All other bytes are 2 nibbles.
                index += byteLenMinusOne * 2;
            } else {
                // Odd: prefix byte contains first nibble.
                index += 1 + (byteLenMinusOne * 2);
            }
        }
    }
    return index;
}


async function main() {
    console.log(`Setting up Client for ${RPC_URL}...`);
    const client = createPublicClient({
        chain: foundry,
        transport: http(RPC_URL),
    });

    // Create Test Client for overriding storage
    const testClient = createTestClient({
        chain: foundry,
        mode: 'anvil',
        transport: http(RPC_URL),
    })
        .extend(publicActions)
        .extend(walletActions);

    console.log(`Getting Proofs for Cheque: ${CHEQUE_ID}`);

    // 1. Calculate Storage Slots
    // Base Slot = keccak(chequeId . 1)
    const mappingSlot = 2n; // 'cheques' is at slot 2 (after ReceiverTemplate 0,1)
    // Solidity mapping: keccak256(key . slot) where . is concatenation (packed)
    // key is bytes32, slot is uint256.
    const slotKeyEncoded = encodePacked(['bytes32', 'uint256'], [CHEQUE_ID as `0x${string}`, mappingSlot]);
    const baseSlot = keccak256(slotKeyEncoded);

    const slot0 = baseSlot;
    const slot1 = toHex(BigInt(baseSlot) + 1n);

    // --- DEBUG: Override Storage to ensure isCompliant is TRUE ---
    console.log('--- DEBUG: Overriding Storage for Compliance ---');
    // Struct:
    // Slot 1: [pad | isCompliant (1) | targetChainId (8)]
    // We want targetChainId (8 bytes) at end, and isCompliant (1 byte) before it.
    // targetChainId = 11155111 (0xAA36A7)
    // isCompliant = true (1)

    // We need to construct the 32 byte value. 
    // Is it Big Endian or Little Endian? EVM storage is 32 bytes.
    // Solidity packs from Right to Left (LSB first)? 
    // "Variables are packed starting ... at the lowest-order bits".
    // So targetChainId (uint64) is at byte 0 (LSB, rightmost in number, but depends on view).
    // Let's assume standard packing:
    // Slot value (uint256): [ ... | isCompliant (8) | targetChainId (64) ]
    // targetChainId is lowest 64 bits.
    // isCompliant is next lowest 8 bits.

    // Value = (1 << 64) | targetChainId
    const targetChainIdVal = TARGET_CHAIN_ID;
    const isCompliantVal = 1n;
    const slot1ValBigInt = (isCompliantVal << 64n) | targetChainIdVal;
    const slot1ValHex = toHex(slot1ValBigInt, { size: 32 });

    console.log(`Setting Slot 1 ${slot1} to ${slot1ValHex}`);

    await testClient.setStorageAt({
        address: CASHIER_ADDRESS as `0x${string}`,
        index: slot1,
        value: slot1ValHex
    });

    // Mine a block to persist the storage change into the state root
    console.log('Mining a block to update state root...');
    await testClient.mine({ blocks: 1 });

    // Verify it stuck
    const valCheck = await client.getStorageAt({
        address: CASHIER_ADDRESS as `0x${string}`,
        slot: slot1
    });
    console.log('Verified Slot 1 Value:', valCheck);
    // ------------------------------------------------------------


    // Requesting struct slots
    const storageKeys = [slot0, slot1];
    console.log('Fetching Proofs for Cheque Slots:', storageKeys);
    // Get latest block to ensure sync
    const block = await client.getBlock();
    console.log('Using Block Number:', block.number);

    const proof = await client.getProof({
        address: CASHIER_ADDRESS as `0x${string}`,
        storageKeys: storageKeys,
        blockNumber: block.number
    });

    // Log values
    console.log('Struct Slot 0 Value:', proof.storageProof[0].value);
    console.log('Struct Slot 1 Value:', proof.storageProof[1].value);

    // Mappings for Toml Generation
    const accountProof = proof.accountProof;
    const storageProof0 = proof.storageProof[0].proof;
    const storageProof1 = proof.storageProof[1].proof;

    console.log("Proofs Fetched.");
    console.log(`Account Proof Depth: ${accountProof.length}`);
    console.log(`Storage 0 Depth: ${storageProof0.length}`);
    console.log(`Storage 1 Depth: ${storageProof1.length}`);

    // 3. Process Account Proof
    const vaultAccountProofNodes = processProof(accountProof);

    // Account Leaf (Last node of proof) RLP Decoded
    const accountLeafRlp = decodeRlp(accountProof[accountProof.length - 1]);
    // Leaf value is 2nd item [key, value]
    const accountParamsRlp = RLP.decode(accountLeafRlp[1]); // Decoded [nonce, balance, storageRoot, codeHash]

    const nonceRaw = toNumArray(accountParamsRlp[0]);
    const balanceRaw = toNumArray(accountParamsRlp[1]);

    // Pad nonce to 8 bytes (Left-aligned for correct RLP reconstruction in circuit)
    const noncePadded = Array(8).fill(0);
    for (let i = 0; i < nonceRaw.length; i++) {
        noncePadded[i] = nonceRaw[i];
    }

    // Pad balance to 32 bytes (Left-aligned)
    const balancePadded = Array(32).fill(0);
    for (let i = 0; i < balanceRaw.length; i++) {
        balancePadded[i] = balanceRaw[i];
    }

    const vaultAccount = {
        nonce: noncePadded,
        balance: balancePadded,
        storage_hash: toNumArray(accountParamsRlp[2]),
        code_hash: toNumArray(accountParamsRlp[3])
    };

    // Hash of the leaf node
    const vaultAccountLeafHash = keccak256(toHex(Buffer.from(accountProof[accountProof.length - 1].slice(2), 'hex')));


    // 4. Process Storage Proof 0 (Struct Slot 0)
    const storageNodes0 = processProof(storageProof0);
    // Use Viem Value directly
    const storageValue0Bytes = toNumArray(toBytes(proof.storageProof[0].value));
    console.log('Storage Slot 0 (Bytes):', storageValue0Bytes);

    // Pad value to 32 bytes (Left-aligned or Big Endian? EVM words are Big Endian. Noir expects 32 bytes)
    // toBytes(BigInt) returns minimal bytes. We need to pad 'start' (left) to 32 bytes for Big Endian.
    // Wait, earlier I padded 'end' (right)?
    // "Pad value to 32 bytes (Left-aligned)" comment said.
    // But `val0[i] = storageValue0Bytes[i]` fills from 0. That is Left-Aligned in buffer -> Right-Padded?
    // 0x01 -> [1, 0, 0...] ?
    // NO! 0x01 should be [0, 0... 1] for Big Endian.
    // Viem `toBytes` returns big-endian bytes.
    // If I put them at start of array [1, 0...], it becomes 0x1000...
    // I SHOULD PAD LEFT (start) with Zeros.
    // Let's verify what `toNumArray` does. It copies buffer.
    // If value is 1. `toBytes` -> `[1]`.
    // I need `[0,0...1]`.

    const val0 = Array(32).fill(0);
    // Left-Align for mpt_leaf.nr compatibility (it reads first value_length bytes)
    for (let i = 0; i < storageValue0Bytes.length; i++) {
        val0[i] = storageValue0Bytes[i];
    }
    const storageLeafHash0 = keccak256(toHex(Buffer.from(storageProof0[storageProof0.length - 1].slice(2), 'hex')));

    // 5. Process Storage Proof 1 (Struct Slot 1)
    const storageNodes1 = processProof(storageProof1);
    const storageValue1Bytes = toNumArray(toBytes(proof.storageProof[1].value));
    console.log('Storage Slot 1 (Bytes):', storageValue1Bytes);

    const val1 = Array(32).fill(0);
    // Left-Align
    for (let i = 0; i < storageValue1Bytes.length; i++) {
        val1[i] = storageValue1Bytes[i];
    }
    const storageLeafHash1 = keccak256(toHex(Buffer.from(storageProof1[storageProof1.length - 1].slice(2), 'hex')));

    // 6. Signatures (Real ECDSA)
    console.log('Generating signature...');

    // Private Key (remove 0x prefix if needed for noble, but usually it takes hex)
    // Private Key (noble curves expects Uint8Array)
    const privKeyBytes = toBytes(DEPOSITOR_KEY);
    const pubKey = secp256k1.getPublicKey(privKeyBytes, false); // Uncompressed
    // pubKey is 65 bytes: [04, X(32), Y(32)]
    const pubKeyX = pubKey.slice(1, 33);
    const pubKeyY = pubKey.slice(33, 65);

    // Construct Message
    // Matches Noir verification: hash(recipient, chequeId, targetChainId)
    // Circuit: [recipient(20) | chequeId(32) | chainId(8)]
    // We use viem encodePacked with correct types.
    const recipientBigInt = BigInt(RECIPIENT);
    const chainIdBigInt = BigInt(TARGET_CHAIN_ID);
    const depositorAccount = privateKeyToAccount(DEPOSITOR_KEY as `0x${string}`);

    // Encoding: Recipient (address), ChequeId (bytes32), ChainId (uint64)
    const encodedMessage = encodePacked(
        ['address', 'bytes32', 'uint64'],
        [RECIPIENT as `0x${string}`, CHEQUE_ID as `0x${string}`, chainIdBigInt]
    );

    const messageHash = keccak256(encodedMessage);
    const messageHashBytes = toBytes(messageHash);

    // Sign raw hash (returns Uint8Array in compact format)
    const signatureBytesRaw = secp256k1.sign(messageHashBytes, privKeyBytes);
    // Take first 64 bytes (r + s)
    const signatureBytes = signatureBytesRaw.slice(0, 64);

    const signature = Array.from(signatureBytes);
    // override constants
    const pubKeyXArray: number[] = Array.from(pubKeyX);
    const pubKeyYArray: number[] = Array.from(pubKeyY);

    // Calculate Nullifier Hash
    // Circuit: poseidon2([recoveredAddrField, denomination, targetChainId], 3)
    const nullifierHashBigInt = poseidon2Hash([
        BigInt(depositorAccount.address),
        BigInt(DENOMINATION),
        BigInt(TARGET_CHAIN_ID)
    ]);
    const nullifierHashHex = `0x${nullifierHashBigInt.toString(16)}`;

    // 7. Generate TOML
    const toml = `
root = ${toTomlBytes(toNumArray(Buffer.from(block.stateRoot.slice(2), 'hex')))}
recipient = "${BigInt(RECIPIENT).toString()}"
nullifierHash = "${nullifierHashBigInt.toString()}"
vaultAddress = ${toTomlBytes(toNumArray(Buffer.from(CASHIER_ADDRESS.slice(2), 'hex')))}
chequeId = ${toTomlBytes(toNumArray(Buffer.from(CHEQUE_ID.slice(2), 'hex')))}
denomination = "${DENOMINATION}"
targetChainId = "${TARGET_CHAIN_ID}"

# Account Proof
vaultAccountProofLen = ${accountProof.length - 1} # Exclude leaf
vaultAccountTrieKeyIndex = ${calculateTrieKeyIndex(vaultAccountProofNodes.slice(0, accountProof.length - 1))}
vaultAccountLeafHash = ${toTomlBytes(toNumArray(Buffer.from(vaultAccountLeafHash.slice(2), 'hex')))}

# Storage 0
storageProofSlot0Len = ${storageProof0.length - 1}
storageTrieKeyIndexSlot0 = ${calculateTrieKeyIndex(storageNodes0.slice(0, storageProof0.length - 1))}
storageLeafHashSlot0 = ${toTomlBytes(toNumArray(Buffer.from(storageLeafHash0.slice(2), 'hex')))}

# Storage 1
storageProofSlot1Len = ${storageProof1.length - 1}
storageTrieKeyIndexSlot1 = ${calculateTrieKeyIndex(storageNodes1.slice(0, storageProof1.length - 1))}
storageLeafHashSlot1 = ${toTomlBytes(toNumArray(Buffer.from(storageLeafHash1.slice(2), 'hex')))}

# Keys (Dummy)
# Keys (Real)
pubKeyX = ${toTomlBytes(pubKeyXArray)}
pubKeyY = ${toTomlBytes(pubKeyYArray)}
signature = ${toTomlBytes(signature)}

# Account Struct
[vaultAccount]
address = ${toTomlBytes(toNumArray(Buffer.from(CASHIER_ADDRESS.slice(2), 'hex')))}
nonce = ${toTomlBytes(vaultAccount.nonce)}
nonce_length = "${(accountParamsRlp[0] as Uint8Array).length}"
balance = ${toTomlBytes(vaultAccount.balance)}
balance_length = "${(accountParamsRlp[1] as Uint8Array).length}"
storage_hash = ${toTomlBytes(vaultAccount.storage_hash)}
code_hash = ${toTomlBytes(vaultAccount.code_hash)}

# Storage Slots
[storageValueSlot0]
slot_numebr = ${toTomlBytes(toNumArray(Buffer.from(slot0.slice(2), 'hex')))}
value = ${toTomlBytes(val0)}
value_length = "${storageValue0Bytes.length}"

[storageValueSlot1]
slot_numebr = ${toTomlBytes(toNumArray(Buffer.from(slot1.slice(2), 'hex')))}
value = ${toTomlBytes(val1)}
value_length = "${storageValue1Bytes.length}"

# Arrays
${vaultAccountProofNodes.map(n => `[[vaultAccountProof]]\n${nodeToToml(n)}`).join('\n')}
${storageNodes0.map(n => `[[storageProofSlot0]]\n${nodeToToml(n)}`).join('\n')}
${storageNodes1.map(n => `[[storageProofSlot1]]\n${nodeToToml(n)}`).join('\n')}
`;

    fs.writeFileSync(PROVER_TOML_PATH, toml);
    console.log(`Prover.toml written to ${PROVER_TOML_PATH}`);
}

main().catch(console.error);
