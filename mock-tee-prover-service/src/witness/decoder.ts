// @ts-ignore
import { poseidon2Hash } from '@zkpassport/poseidon2';
import { keccak256, encodePacked, toHex, toBytes } from 'viem';
import { RLP } from '@ethereumjs/rlp';
import { Buffer } from 'buffer';
import { WitnessParams, AuthMaterial } from './types';
import { decodeRlp, toNumArray, processProof } from '../helpers';
import * as ethers from 'ethers';

export function decodeAccountProof(accountProof: string[]) {
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

    return { vaultAccountProofNodes, vaultAccount, vaultAccountLeafHash, accountParamsRlp };
}

export function decodeSlot0(storageProof0: string[], denominationParam: number, chequeId: string, sourceContractAddress: string, depositorAddress: string, nonce: number) {
    const storageNodes0 = processProof(storageProof0);
    const storageValue0Bytes = toNumArray(toBytes(storageProof0[storageProof0.length - 1])); // value is in proof array for viem? No, wait, viem proof object has value field.
    // We actually need the raw value passed in here, let's fix the params.
    return {}; // stub, will fix
}

export function computeSignParamsLocal(input: {
    depositorAddress: string;
    nonce: number;
    recipient: string;
    targetChainId: number;
    chequeId?: string;
}) {
    const { depositorAddress, nonce, recipient, targetChainId } = input;

    const chequeId = input.chequeId || keccak256(
        encodePacked(
            ['address', 'uint256'],
            [depositorAddress as `0x${string}`, BigInt(nonce)]
        )
    );

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
        message: `Sign this hash to authorize the storage proof. ChequeId: ${chequeId}`,
    };
}
