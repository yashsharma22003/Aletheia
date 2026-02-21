// @ts-ignore
import { poseidon2Hash } from '@zkpassport/poseidon2';
import {
    createPublicClient,
    http,
    keccak256,
    encodePacked,
    toHex,
    toBytes,
} from 'viem';
import { RLP } from '@ethereumjs/rlp';
import { Buffer } from 'buffer';
import * as fs from 'fs';
import * as path from 'path';
import {
    MAX_DEPTH,
    decodeRlp,
    toNumArray,
    hexToNumArray,
    processProof,
    calculateTrieKeyIndex,
    toTomlBytes,
    toTomlBool,
    nodeToToml,
    ParsedNode,
} from './helpers';

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export interface WitnessParams {
    rpcUrl: string;
    contractAddress: string;
    depositorAddress: string;
    recipient: string;
    nonce: number;
    targetChainId: number;
    denomination: number;
    /** 64-byte signature (r+s) as hex string — optional if privateKey is provided */
    signature?: string;
    /** 65-byte uncompressed public key (04 || X || Y) as hex — optional if privateKey is provided */
    pubKey?: string;
    /** Private key for server-side signing (test mode) — auto-derives signature + pubKey */
    privateKey?: string;
    /** Optional block number to use; defaults to latest */
    blockNumber?: number;
}

export interface WitnessResult {
    proverToml: string;
    publicInputs: {
        root: string;
        recipient: string;
        nullifierHash: string;
        vaultAddress: string;
        chequeId: string;
        denomination: string;
        targetChainId: string;
    };
}

// ──────────────────────────────────────────────
// Sign Params Helper
// ──────────────────────────────────────────────

export interface SignParamsInput {
    depositorAddress: string;
    nonce: number;
    recipient: string;
    targetChainId: number;
}

export interface SignParamsResult {
    chequeId: string;
    messageHash: string;
    message: string;
}

/**
 * Computes the chequeId and messageHash that the user needs to sign.
 * The frontend calls this first, then asks the user to sign the messageHash.
 */
export function computeSignParams(input: SignParamsInput): SignParamsResult {
    const { depositorAddress, nonce, recipient, targetChainId } = input;

    // chequeId = keccak256(abi.encodePacked(owner, nonce))
    const chequeId = keccak256(
        encodePacked(
            ['address', 'uint256'],
            [depositorAddress as `0x${string}`, BigInt(nonce)]
        )
    );

    // messageHash = keccak256(encodePacked(recipient, chequeId, chainId))
    const messageHash = keccak256(
        encodePacked(
            ['address', 'bytes32', 'uint64'],
            [
                recipient as `0x${string}`,
                chequeId as `0x${string}`,
                BigInt(targetChainId),
            ]
        )
    );

    return {
        chequeId,
        messageHash,
        message: `Sign this hash with your wallet to authorize the storage proof generation. ChequeId: ${chequeId}`,
    };
}

// ──────────────────────────────────────────────
// Witness Generation
// ──────────────────────────────────────────────

export async function generateWitness(
    params: WitnessParams,
    outputDir: string
): Promise<WitnessResult> {
    const {
        rpcUrl,
        contractAddress,
        depositorAddress,
        recipient,
        nonce,
        targetChainId,
        denomination,
        signature,
        pubKey,
    } = params;

    console.log(`[witness] Connecting to RPC: ${rpcUrl}`);

    // Create a generic chain config since we may be talking to any EVM chain
    const client = createPublicClient({
        transport: http(rpcUrl),
    });

    // 1. Compute chequeId and storage slots
    const chequeId = keccak256(
        encodePacked(
            ['address', 'uint256'],
            [depositorAddress as `0x${string}`, BigInt(nonce)]
        )
    );
    console.log(`[witness] ChequeId: ${chequeId}`);

    const mappingSlot = 2n; // 'cheques' mapping is at slot 2
    const slotKeyEncoded = encodePacked(
        ['bytes32', 'uint256'],
        [chequeId as `0x${string}`, mappingSlot]
    );
    const baseSlot = keccak256(slotKeyEncoded);
    const slot0 = baseSlot;
    const slot1 = toHex(BigInt(baseSlot) + 1n);

    // 2. Fetch proofs from RPC
    const block = params.blockNumber
        ? await client.getBlock({ blockNumber: BigInt(params.blockNumber) })
        : await client.getBlock();

    console.log(`[witness] Block Number: ${block.number}`);

    const proof = await client.getProof({
        address: contractAddress as `0x${string}`,
        storageKeys: [slot0, slot1],
        blockNumber: block.number!,
    });

    console.log(`[witness] Account Proof Depth: ${proof.accountProof.length}`);
    console.log(`[witness] Storage 0 Depth: ${proof.storageProof[0].proof.length}`);
    console.log(`[witness] Storage 1 Depth: ${proof.storageProof[1].proof.length}`);

    // 3. Process Account Proof
    const accountProof = proof.accountProof;
    const vaultAccountProofNodes = processProof(accountProof);

    const accountLeafRlp = decodeRlp(accountProof[accountProof.length - 1]);
    const accountParamsRlp = RLP.decode(accountLeafRlp[1]) as Uint8Array[];

    const nonceRaw = toNumArray(accountParamsRlp[0]);
    const balanceRaw = toNumArray(accountParamsRlp[1]);

    const noncePadded = Array(8).fill(0);
    for (let i = 0; i < nonceRaw.length; i++) noncePadded[i] = nonceRaw[i];

    const balancePadded = Array(32).fill(0);
    for (let i = 0; i < balanceRaw.length; i++) balancePadded[i] = balanceRaw[i];

    const vaultAccount = {
        nonce: noncePadded,
        balance: balancePadded,
        storage_hash: toNumArray(accountParamsRlp[2]),
        code_hash: toNumArray(accountParamsRlp[3]),
    };

    const vaultAccountLeafHash = keccak256(
        toHex(Buffer.from(accountProof[accountProof.length - 1].slice(2), 'hex'))
    );

    // 4. Process Storage Proof 0 (Slot 0: owner + denomination)
    const storageProof0 = proof.storageProof[0].proof;
    const storageNodes0 = processProof(storageProof0);
    const storageValue0Bytes = toNumArray(toBytes(proof.storageProof[0].value));

    const val0 = Array(32).fill(0);
    for (let i = 0; i < storageValue0Bytes.length; i++) val0[i] = storageValue0Bytes[i];

    const storageLeafHash0 = keccak256(
        toHex(Buffer.from(storageProof0[storageProof0.length - 1].slice(2), 'hex'))
    );

    // 5. Process Storage Proof 1 (Slot 1: targetChainId + isCompliant)
    const storageProof1 = proof.storageProof[1].proof;
    const storageNodes1 = processProof(storageProof1);
    const storageValue1Bytes = toNumArray(toBytes(proof.storageProof[1].value));

    const val1 = Array(32).fill(0);
    for (let i = 0; i < storageValue1Bytes.length; i++) val1[i] = storageValue1Bytes[i];

    const storageLeafHash1 = keccak256(
        toHex(Buffer.from(storageProof1[storageProof1.length - 1].slice(2), 'hex'))
    );

    // 6. Derive signature and public key
    let sigBytes: number[];
    let pubKeyX: number[];
    let pubKeyY: number[];

    // Compute message hash (needed for recovery and for signing)
    const { messageHash } = computeSignParams({
        depositorAddress: params.depositorAddress,
        nonce: params.nonce,
        recipient: params.recipient,
        targetChainId: params.targetChainId,
    });

    const ethers = require('ethers');

    if (params.privateKey) {
        // Mode 1: Auto-derive from private key (test mode / server-side signing)
        console.log('[witness] Deriving signature + pubKey from private key...');
        const pk = params.privateKey.startsWith('0x') ? params.privateKey : `0x${params.privateKey}`;
        const signingKey = new ethers.SigningKey(pk);

        // Get uncompressed public key
        const pubKeyFull = signingKey.publicKey; // 0x04...
        const pubKeyXHex = '0x' + pubKeyFull.slice(4, 68);
        const pubKeyYHex = '0x' + pubKeyFull.slice(68, 132);
        pubKeyX = toNumArray(toBytes(pubKeyXHex));
        pubKeyY = toNumArray(toBytes(pubKeyYHex));

        // Sign using EIP-191 prefix (same as MetaMask personal_sign)
        // The circuit now expects: ecrecover(sig, keccak256(prefix + rawMsgHash))
        const rawMsgHashBytes = ethers.getBytes(messageHash);
        const ethMsgHash = ethers.hashMessage(rawMsgHashBytes); // adds \x19Ethereum Signed Message:\n32
        const sig = signingKey.sign(ethMsgHash);
        const rBytes = toBytes(sig.r);
        const sBytes = toBytes(sig.s);
        const rPadded = new Uint8Array(32);
        rPadded.set(rBytes, 32 - rBytes.length);
        const sPadded = new Uint8Array(32);
        sPadded.set(sBytes, 32 - sBytes.length);
        const sigCombined = new Uint8Array(64);
        sigCombined.set(rPadded, 0);
        sigCombined.set(sPadded, 32);
        sigBytes = Array.from(sigCombined);
    } else if (params.signature) {
        // Mode 2/3: Signature provided — recover pubKey from it if not explicitly given
        const sigHex = params.signature.startsWith('0x') ? params.signature : `0x${params.signature}`;
        const sigBuf = Buffer.from(sigHex.replace('0x', ''), 'hex');

        if (params.pubKey) {
            // Mode 3: Explicit signature + pubKey
            console.log('[witness] Using provided signature + pubKey...');
            sigBytes = toNumArray(sigBuf.slice(0, 64)); // r + s only (64 bytes)
            const pubKeyBuf = Buffer.from(params.pubKey.replace('0x', ''), 'hex');
            pubKeyX = toNumArray(pubKeyBuf.slice(1, 33));
            pubKeyY = toNumArray(pubKeyBuf.slice(33, 65));
        } else {
            // Mode 2: Signature only — recover pubKey via ecrecover
            console.log('[witness] Recovering pubKey from signature via ecrecover...');

            // Signature must be 65 bytes (r + s + v) for recovery
            if (sigBuf.length < 65) {
                throw new Error('Signature must be 65 bytes (r+s+v) to recover public key. Provide pubKey explicitly for 64-byte signatures.');
            }

            // Extract r, s, v for ethers recovery
            const r = '0x' + sigBuf.slice(0, 32).toString('hex');
            const s = '0x' + sigBuf.slice(32, 64).toString('hex');
            const v = sigBuf[64];

            // Reconstruct ethers-compatible signature
            const ethSig = ethers.Signature.from({ r, s, v });

            // Recover pubKey from the EIP-191 prefixed hash (personal_sign format)
            const rawMsgHashBytes = ethers.getBytes(messageHash);
            const ethMsgHash = ethers.hashMessage(rawMsgHashBytes);
            const recoveredPubKey = ethers.SigningKey.recoverPublicKey(ethMsgHash, ethSig);
            console.log(`[witness] Recovered pubKey: ${recoveredPubKey.slice(0, 20)}...`);

            const pubKeyXHex = '0x' + recoveredPubKey.slice(4, 68);
            const pubKeyYHex = '0x' + recoveredPubKey.slice(68, 132);
            pubKeyX = toNumArray(toBytes(pubKeyXHex));
            pubKeyY = toNumArray(toBytes(pubKeyYHex));

            // Use r+s (64 bytes) for the circuit
            sigBytes = toNumArray(sigBuf.slice(0, 64));
        }
    } else {
        throw new Error('Either privateKey or signature must be provided');
    }

    // 7. Split chequeId into high/low for circuit (it expects two Field values)
    const chequeIdBuf = Buffer.from(chequeId.slice(2), 'hex');
    const chequeIdHigh = BigInt('0x' + chequeIdBuf.slice(0, 16).toString('hex'));
    const chequeIdLow = BigInt('0x' + chequeIdBuf.slice(16, 32).toString('hex'));

    // 8. Compute Nullifier Hash
    // Circuit: poseidon2([recoveredAddrField, denomination, targetChainId, chequeIdHigh, chequeIdLow], 5)
    const nullifierHashBigInt = poseidon2Hash([
        BigInt(depositorAddress),
        BigInt(denomination),
        BigInt(targetChainId),
        chequeIdHigh,
        chequeIdLow,
    ]);

    // 9. Generate Prover.toml
    const toml = `
root = ${toTomlBytes(toNumArray(Buffer.from(block.stateRoot.slice(2), 'hex')))}
recipient = "${BigInt(recipient).toString()}"
nullifierHash = "${nullifierHashBigInt.toString()}"
vaultAddress = ${toTomlBytes(toNumArray(Buffer.from(contractAddress.slice(2), 'hex')))}
chequeIdHigh = "${chequeIdHigh.toString()}"
chequeIdLow = "${chequeIdLow.toString()}"
denomination = "${denomination}"
targetChainId = "${targetChainId}"

# Account Proof
vaultAccountProofLen = ${accountProof.length - 1}
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

# Keys
pubKeyX = ${toTomlBytes(pubKeyX)}
pubKeyY = ${toTomlBytes(pubKeyY)}
signature = ${toTomlBytes(sigBytes)}

# Account Struct
[vaultAccount]
address = ${toTomlBytes(toNumArray(Buffer.from(contractAddress.slice(2), 'hex')))}
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

    // Write Prover.toml to the job working directory
    const tomlPath = path.join(outputDir, 'Prover.toml');
    fs.writeFileSync(tomlPath, toml);
    console.log(`[witness] Prover.toml written to ${tomlPath}`);

    const publicInputs = {
        root: block.stateRoot,
        recipient: BigInt(recipient).toString(),
        nullifierHash: nullifierHashBigInt.toString(),
        vaultAddress: contractAddress,
        chequeId,
        denomination: denomination.toString(),
        targetChainId: targetChainId.toString(),
    };

    return { proverToml: toml, publicInputs };
}
