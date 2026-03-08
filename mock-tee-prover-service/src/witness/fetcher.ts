import { createPublicClient, http, keccak256, encodePacked, toHex } from 'viem';
import { WitnessParams, Web3FetchResult } from './types';

export async function fetchProofData(params: WitnessParams): Promise<Web3FetchResult> {
    console.log(`[witness] Connecting to Source RPC: ${params.sourceRpcUrl}`);

    const client = createPublicClient({
        transport: http(params.sourceRpcUrl),
    });

    // 1. Compute chequeId and storage slots
    const chequeId = params.chequeId ||
        keccak256(
            encodePacked(
                ['address', 'uint256'],
                [params.depositorAddress as `0x${string}`, BigInt(params.nonce)]
            )
        );
    console.log(`[witness] ChequeId: ${chequeId} (${params.chequeId ? 'from params' : 'computed'})`);

    const mappingSlot = 2n; // slot 0=s_forwarderAddress, slot 1=s_owner (ReceiverTemplate), slot 2=cheques
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

    console.log(`[witness] Source Block Number: ${block.number}`);

    const proof = await client.getProof({
        address: params.sourceContractAddress as `0x${string}`,
        storageKeys: [slot0, slot1],
        blockNumber: block.number!,
    });

    console.log(`[witness] Account Proof Depth: ${proof.accountProof.length}`);
    console.log(`[witness] Storage 0 Depth: ${proof.storageProof[0].proof.length}`);
    console.log(`[witness] Storage 1 Depth: ${proof.storageProof[1].proof.length}`);

    return {
        block,
        proof,
        chequeId,
        slot0,
        slot1
    };
}
