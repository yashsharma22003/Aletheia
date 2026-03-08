// @ts-ignore
import { poseidon2Hash } from '@zkpassport/poseidon2';
import { keccak256, encodePacked, toHex, toBytes } from 'viem';
import { RLP } from '@ethereumjs/rlp';
import { Buffer } from 'buffer';
import * as fs from 'fs';
import * as path from 'path';
import { WitnessParams, WitnessResult, SignParamsInput, SignParamsResult, AuthMaterial } from './types';
import { fetchProofData } from './fetcher';
import { computeSignParamsLocal, decodeAccountProof } from './decoder';
import {
    decodeRlp,
    toNumArray,
    processProof,
    calculateTrieKeyIndex,
    toTomlBytes,
    nodeToToml
} from '../helpers';
import * as ethers from 'ethers';

export function computeSignParams(input: SignParamsInput): SignParamsResult {
    return computeSignParamsLocal(input);
}

export async function generateWitness(
    params: WitnessParams,
    outputDir: string
): Promise<WitnessResult> {
    const {
        sourceRpcUrl,
        sourceContractAddress,
        depositorAddress,
        recipient,
        nonce,
        targetChainId,
        denomination,
        signature,
        pubKey,
    } = params;

    // 1. Fetch data from source chain
    const { block, proof, chequeId, slot0, slot1 } = await fetchProofData(params);

    // 3. Process Account Proof
    const accountProof = proof.accountProof;
    const { vaultAccountProofNodes, vaultAccount, vaultAccountLeafHash, accountParamsRlp } = decodeAccountProof(accountProof);

    // 4. Process Storage Proof 0 (Slot 0: owner + denomination)
    const storageProof0 = proof.storageProof[0].proof;
    const storageNodes0 = processProof(storageProof0);
    const storageValue0Bytes = toNumArray(toBytes(proof.storageProof[0].value));

    // val0: minimal RLP bytes, left-aligned
    const val0 = Array(32).fill(0);
    for (let i = 0; i < storageValue0Bytes.length; i++) val0[i] = storageValue0Bytes[i];

    const offset0 = 32 - storageValue0Bytes.length;
    const denomByteLen = storageValue0Bytes.length - 20;
    const denomFromChain = denomByteLen > 0
        ? BigInt('0x' + storageValue0Bytes.slice(0, denomByteLen).map((b: number) => b.toString(16).padStart(2, '0')).join(''))
        : 0n;

    console.log(`[witness] Slot0 raw (${storageValue0Bytes.length}b): ${storageValue0Bytes.map((b: number) => b.toString(16).padStart(2, '0')).join('')}`);
    console.log(`[witness] Slot0 offset=${offset0}, denomFromChain=${denomFromChain}, denomParam=${denomination}`);

    const slot0IsEmpty = storageValue0Bytes.every((b: number) => b === 0);
    if (slot0IsEmpty) {
        throw new Error(
            `Cheque not found on-chain for chequeId=${chequeId}. ` +
            `Slot 0 is all-zero — the cheque has not been deposited yet, ` +
            `or the chequeId / contract address is wrong. ` +
            `Verify: sourceContractAddress=${sourceContractAddress}, depositorAddress=${depositorAddress}, nonce=${nonce}.`
        );
    }

    const actualDenomination = Number(denomFromChain);
    if (actualDenomination !== denomination) {
        console.log(`[witness] ⚠️  Denomination mismatch: param=${denomination}, chain=${actualDenomination}. Using on-chain value.`);
    }

    const storageLeafHash0 = keccak256(
        toHex(Buffer.from(storageProof0[storageProof0.length - 1].slice(2), 'hex'))
    );


    // 5. Process Storage Proof 1 (Slot 1: targetChainId + isCompliant)
    const storageProof1 = proof.storageProof[1].proof;
    const storageNodes1 = processProof(storageProof1);
    const storageValue1Bytes = toNumArray(toBytes(proof.storageProof[1].value));

    // val1: minimal RLP bytes, left-aligned
    const val1 = Array(32).fill(0);
    for (let i = 0; i < storageValue1Bytes.length; i++) val1[i] = storageValue1Bytes[i];

    const offset1 = 32 - storageValue1Bytes.length;
    console.log(`[witness] Slot1 raw (${storageValue1Bytes.length}b): ${storageValue1Bytes.map((b: number) => b.toString(16).padStart(2, '0')).join('')}`);
    console.log(`[witness] Slot1 offset=${offset1}, expected targetChainId=${targetChainId}`);

    const storageLeafHash1 = keccak256(
        toHex(Buffer.from(storageProof1[storageProof1.length - 1].slice(2), 'hex'))
    );

    const chainIdStartInTrimmed = Math.max(0, 24 - offset1);
    const chainIdEndInTrimmed = Math.max(0, 32 - offset1);
    const chainIdRawBytes = storageValue1Bytes.slice(chainIdStartInTrimmed, chainIdEndInTrimmed);

    const chainIdFromChain = chainIdRawBytes.length > 0
        ? BigInt('0x' + chainIdRawBytes.map((b: number) => b.toString(16).padStart(2, '0')).join(''))
        : 0n;

    console.log(`[witness] Slot1 decoded chainIdFromChain=${chainIdFromChain}, param=${targetChainId}`);
    const actualTargetChainId = targetChainId;
    if (Number(chainIdFromChain) !== targetChainId) {
        throw new Error(
            `TargetChainId mismatch: You signed for chainId=${targetChainId}, ` +
            `but the on-chain cheque at chequeId=${chequeId} records chainId=${chainIdFromChain}. ` +
            `Either use targetChainId=${chainIdFromChain} in your request, or re-deposit with the correct chain ID.`
        );
    }

    // 6. Derive signature and public key
    let sigBytes: number[];
    let pubKeyX: number[];
    let pubKeyY: number[];

    let messageHash: string;
    if (params.chequeId) {
        messageHash = keccak256(
            encodePacked(
                ['address', 'bytes32', 'uint64'],
                [
                    params.recipient as `0x${string}`,
                    params.chequeId as `0x${string}`,
                    BigInt(targetChainId),
                ]
            )
        );
        console.log(`[witness] MessageHash computed from provided chequeId + param chainId(${targetChainId}): ${messageHash}`);
    } else {
        ({ messageHash } = computeSignParamsLocal({
            depositorAddress: params.depositorAddress,
            nonce: params.nonce,
            recipient: params.recipient,
            targetChainId: params.targetChainId,
        }));
        console.log(`[witness] MessageHash computed from depositor+nonce: ${messageHash}`);
    }

    if (params.privateKey) {
        console.log('[witness] Deriving signature + pubKey from private key...');
        const pk = params.privateKey.startsWith('0x') ? params.privateKey : `0x${params.privateKey}`;
        const signingKey = new ethers.SigningKey(pk);

        const pubKeyFull = signingKey.publicKey;
        const pubKeyXHex = '0x' + pubKeyFull.slice(4, 68);
        const pubKeyYHex = '0x' + pubKeyFull.slice(68, 132);
        pubKeyX = toNumArray(toBytes(pubKeyXHex));
        pubKeyY = toNumArray(toBytes(pubKeyYHex));

        const rawMsgHashBytes = ethers.getBytes(messageHash);
        const ethMsgHash = ethers.hashMessage(rawMsgHashBytes);
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
        const sigHex = params.signature.startsWith('0x') ? params.signature : `0x${params.signature}`;
        const sigBuf = Buffer.from(sigHex.replace('0x', ''), 'hex');

        if (params.pubKey) {
            console.log('[witness] Using provided signature + pubKey...');
            sigBytes = toNumArray(sigBuf.slice(0, 64)); // r + s only
            const pubKeyBuf = Buffer.from(params.pubKey.replace('0x', ''), 'hex');
            pubKeyX = toNumArray(pubKeyBuf.slice(1, 33));
            pubKeyY = toNumArray(pubKeyBuf.slice(33, 65));
        } else {
            console.log('[witness] Recovering pubKey from signature via ecrecover...');
            if (sigBuf.length < 65) {
                throw new Error('Signature must be 65 bytes (r+s+v) to recover public key. Provide pubKey explicitly for 64-byte signatures.');
            }

            const r = '0x' + sigBuf.slice(0, 32).toString('hex');
            const s = '0x' + sigBuf.slice(32, 64).toString('hex');
            const v = sigBuf[64];

            const ethSig = ethers.Signature.from({ r, s, v });
            const rawMsgHashBytes = ethers.getBytes(messageHash);
            const ethMsgHash = ethers.hashMessage(rawMsgHashBytes);
            const recoveredPubKey = ethers.SigningKey.recoverPublicKey(ethMsgHash, ethSig);

            console.log(`[witness] Recovered pubKey: ${recoveredPubKey.slice(0, 20)}...`);

            const pubKeyXHex = '0x' + recoveredPubKey.slice(4, 68);
            const pubKeyYHex = '0x' + recoveredPubKey.slice(68, 132);
            pubKeyX = toNumArray(toBytes(pubKeyXHex));
            pubKeyY = toNumArray(toBytes(pubKeyYHex));
            sigBytes = toNumArray(sigBuf.slice(0, 64));
        }
    } else {
        throw new Error('Either privateKey or signature must be provided');
    }

    // 7. Split chequeId into high/low for circuit
    const chequeIdBuf = Buffer.from(chequeId.slice(2), 'hex');
    const chequeIdHigh = BigInt('0x' + chequeIdBuf.slice(0, 16).toString('hex'));
    const chequeIdLow = BigInt('0x' + chequeIdBuf.slice(16, 32).toString('hex'));

    const nullifierHashBigInt = poseidon2Hash([
        BigInt(depositorAddress),
        BigInt(actualDenomination),
        BigInt(actualTargetChainId),
        chequeIdHigh,
        chequeIdLow,
    ]);

    // 9. Generate Prover.toml
    const toml = `
root = ${toTomlBytes(toNumArray(Buffer.from(block.stateRoot.slice(2), 'hex')))}
recipient = "${BigInt(recipient).toString()}"
nullifierHash = "${nullifierHashBigInt.toString()}"
vaultAddress = ${toTomlBytes(toNumArray(Buffer.from(sourceContractAddress.slice(2), 'hex')))}
chequeIdHigh = "${chequeIdHigh.toString()}"
chequeIdLow = "${chequeIdLow.toString()}"
denomination = "${actualDenomination}"
targetChainId = "${actualTargetChainId}"

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
address = ${toTomlBytes(toNumArray(Buffer.from(sourceContractAddress.slice(2), 'hex')))}
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

    const tomlPath = path.join(outputDir, 'Prover.toml');
    fs.writeFileSync(tomlPath, toml);
    console.log(`[witness] Prover.toml written to ${tomlPath}`);

    const chequeIdPath = path.join(outputDir, 'chequeId.txt');
    const chainIdPath = path.join(outputDir, 'chainId.txt');
    fs.writeFileSync(chequeIdPath, chequeId);
    fs.writeFileSync(chainIdPath, targetChainId.toString());

    const publicInputs = {
        root: block.stateRoot,
        recipient: BigInt(recipient).toString(),
        nullifierHash: nullifierHashBigInt.toString(),
        vaultAddress: sourceContractAddress,
        chequeId,
        denomination: actualDenomination.toString(),
        targetChainId: actualTargetChainId.toString(),
    };

    return { proverToml: toml, publicInputs };
}

export * from './types';
