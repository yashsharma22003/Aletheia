import { RLP } from '@ethereumjs/rlp';
export interface WitnessParams {
    sourceRpcUrl: string;       // Renamed from rpcUrl
    sourceContractAddress: string; // Renamed from contractAddress
    sourceChainId: number;
    depositorAddress: string;
    recipient: string;
    nonce: number;
    targetChainId: number;
    denomination: number;
    chequeId?: string;
    signature?: string;
    pubKey?: string;
    privateKey?: string;
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

export interface SignParamsInput {
    depositorAddress: string;
    nonce: number;
    recipient: string;
    targetChainId: number;
    chequeId?: string;
}

export interface SignParamsResult {
    chequeId: string;
    messageHash: string;
    message: string;
}

export interface Web3FetchResult {
    block: any;
    proof: any;
    chequeId: string;
    slot0: string;
    slot1: string;
}

export interface AuthMaterial {
    sigBytes: number[];
    pubKeyX: number[];
    pubKeyY: number[];
    messageHash: string;
}
