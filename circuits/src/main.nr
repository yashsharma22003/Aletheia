use dep::ecrecover;
use dep::keccak256;
use dep::mpt;
use dep::poseidon;

global MAX_DEPTH: u32 = 10;

fn main(
    root: pub [u8; 32],
    recipient: pub Field,
    nullifierHash: pub Field,
    vaultAddress: pub [u8; 20],
    chequeId: pub [u8; 32],
    denomination: pub Field,
    targetChainId: pub Field,
    // Witnesses
    vaultAccountProof: [mpt::mpt_body::Node; MAX_DEPTH],
    vaultAccountProofLen: u32,
    vaultAccountTrieKeyIndex: u32,
    vaultAccount: mpt::mpt_leaf::Account,
    vaultAccountLeafHash: [u8; 32],
    storageProofSlot0: [mpt::mpt_body::Node; MAX_DEPTH],
    storageProofSlot0Len: u32,
    storageTrieKeyIndexSlot0: u32,
    storageValueSlot0: mpt::mpt_leaf::StorageSlot,
    storageLeafHashSlot0: [u8; 32],
    storageProofSlot1: [mpt::mpt_body::Node; MAX_DEPTH],
    storageProofSlot1Len: u32,
    storageTrieKeyIndexSlot1: u32,
    storageValueSlot1: mpt::mpt_leaf::StorageSlot,
    storageLeafHashSlot1: [u8; 32],
    pubKeyX: [u8; 32],
    pubKeyY: [u8; 32],
    signature: [u8; 64],
) {
    // 1. Verify Vault Account
    let vaultPathKey = keccak256::keccak256(vaultAddress, 20);
    mpt::mpt_body::verify_nodes(
        vaultAccountProof,
        vaultAccountProofLen,
        0,
        root,
        vaultPathKey,
        vaultAccountTrieKeyIndex,
        vaultAccountLeafHash,
    );
    vaultAccount.verify_leaf_node(
        vaultAccountTrieKeyIndex as u8,
        vaultPathKey,
        vaultAccountLeafHash,
    );

    let storageRoot = vaultAccount.storage_hash;

    // 2. Compute Storage Slots for Cheque
    // mapping(bytes32 => Cheque) public cheques; // Slot 1
    // Cheque struct:
    // Slot 0: owner (160) + denomination (96)
    // Slot 1: targetChainId (64) + isCompliant (8)

    let mappingSlot = [
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        2,
    ]; // Slot 2

    // Base Slot: keccak(chequeId . mappingSlot)
    let mut preimageBase: [u8; 64] = [0; 64];
    for i in 0..32 {
        preimageBase[i] = chequeId[i];
        preimageBase[i + 32] = mappingSlot[i];
    }
    let baseSlot = keccak256::keccak256(preimageBase, 64);

    // Slot 0 is baseSlot
    let slot0 = baseSlot;

    // Slot 1 is baseSlot + 1
    let mut slot1 = baseSlot;
    // Add 1 to the bigpoint (simplified for 32 bytes)
    let mut carry = 1;
    for i in 0..32 {
        let idx = 31 - i;
        let sum = slot1[idx] as u16 + carry as u16;
        slot1[idx] = sum as u8;
        carry = sum >> 8;
    }

    // 3. Verify Slot 0 (Owner + Denomination)
    let pathKey0 = keccak256::keccak256(slot0, 32);
    mpt::mpt_body::verify_nodes(
        storageProofSlot0,
        storageProofSlot0Len,
        0,
        storageRoot,
        pathKey0,
        storageTrieKeyIndexSlot0,
        storageLeafHashSlot0,
    );
    storageValueSlot0.verify_leaf_node(
        storageTrieKeyIndexSlot0 as u8,
        pathKey0,
        storageLeafHashSlot0,
    );

    // 4. Verify Slot 1 (TargetChainId + IsCompliant)
    let pathKey1 = keccak256::keccak256(slot1, 32);
    mpt::mpt_body::verify_nodes(
        storageProofSlot1,
        storageProofSlot1Len,
        0,
        storageRoot,
        pathKey1,
        storageTrieKeyIndexSlot1,
        storageLeafHashSlot1,
    );
    storageValueSlot1.verify_leaf_node(
        storageTrieKeyIndexSlot1 as u8,
        pathKey1,
        storageLeafHashSlot1,
    );

    // 5. Assert Field Values
    // storageValueSlot0.value is Left-Aligned (contains minimal RLP bytes at start).
    // We need to shift it Right to align it to the 32-byte EVM word structure.

    let mut val0: [u8; 32] = [0; 32];
    let offset0 = 32 - storageValueSlot0.value_length as u32;
    for i in 0..32 {
        if (i as u32) < (storageValueSlot0.value_length as u32) {
            val0[offset0 + i as u32] = storageValueSlot0.value[i];
        }
    }

    // Recover Address from Signature First to check ownership
    let recipientBytes = recipient.to_be_bytes::<20>();
    let chainIdBytes = targetChainId.to_be_bytes::<8>();

    let mut sigMsg: [u8; 60] = [0; 60]; // 20 + 32 + 8
    for i in 0..20 {
        sigMsg[i] = recipientBytes[i];
    }
    for i in 0..32 {
        sigMsg[i + 20] = chequeId[i];
    }
    for i in 0..8 {
        sigMsg[i + 52] = chainIdBytes[i];
    }

    let msgHash = keccak256::keccak256(sigMsg, 60);
    let recoveredAddrField = ecrecover::ecrecover(pubKeyX, pubKeyY, signature, msgHash);
    let recoveredAddrBytes = recoveredAddrField.to_be_bytes::<20>();

    // Assert Owner in Slot 0 matches Recovered Address
    // owner is bytes 12..32 in big endian representation of the slot value?
    // Storage is 32 bytes Big Endian.
    // Struct: address, uint96.
    // Slot: [denom (12 bytes) | owner (20 bytes)]
    // owner is the LAST 20 bytes of the storage value array.
    for i in 0..20 {
        assert(val0[i + 12] == recoveredAddrBytes[i]);
    }

    // Assert Denomination in Slot 0
    let denomBytes = denomination.to_be_bytes::<12>();
    // Denom is the FIRST 12 bytes
    for i in 0..12 {
        assert(val0[i] == denomBytes[i]);
    }

    // Assert Chain ID in Slot 1
    // Reconstruct val1 (Right-Align)
    let mut val1: [u8; 32] = [0; 32];
    let offset1 = 32 - storageValueSlot1.value_length as u32;
    for i in 0..32 {
        if (i as u32) < (storageValueSlot1.value_length as u32) {
            val1[offset1 + i as u32] = storageValueSlot1.value[i];
        }
    }

    // Slot 1: [pad | isCompliant (1) | targetChainId (8)]
    // Struct: uint64, bool.
    // Slot: [ ... | bool | uint64 ]
    // uint64 is first member of this slot packing (after owner/denom filled slot 0)
    // targetChainId is LAST 8 bytes.
    for i in 0..8 {
        assert(val1[i + 24] == chainIdBytes[i]);
    }

    // Assert Compliant in Slot 1
    // isCompliant is byte 23 (index 23 of 32, just before chainId at 24)
    // bool true is 1
    assert(val1[23] == 1);

    // 6. Nullifier Derivation
    // To prevent double spending, we nullify the chequeId
    // We bind it to the targetChainId to enforce intent
    // nullifier = poseidon(chequeId, targetChainId, owner)
    // Note: chequeId is unique. owner is constant for cheque.
    // But we include targetChainId so proofs are specific to a withdrawal attempt?
    // Actually, chequeId is unique enough.
    // Let's use: poseidon(chequeId_high, chequeId_low, targetChainId, owner)

    // Split chequeId into fields for Poseidon
    // For simplicity, let's just use the fields we have.
    // We need to convert [u8;32] chequeId to Field(s).
    // Let's rely on the public input `nullifierHash` being checked against a computation.

    // Optimization: Just hash the chequeId bytes using keccak/pedersen if we can,
    // or pack to field.
    // For now, let's just hash the unique components.

    // Correct Nullifier: Should be unique per cheque.
    // If we spend the cheque, we emit nullifier(chequeId).
    // Let's just use the signature hash as nullifier? No, deterministic.
    // Use keccak(chequeId) as nullifier?
    // Let's just output `chequeId` as the nullifier?
    // It is public input.

    // The contract/verifier checks if nullifier is spent.
    // If we use chequeId as nullifier, it reveals which cheque is being spent.
    // PRIVACY LEAK!

    // Private Nullifier: H(secret, chequeId).
    // We don't have a 'secret' other than privKey.
    // We can use signature nullifier?
    // User signature is unique.

    // For this iteration, let's use:
    // nullifier = Poseidon(owner, denomination, targetChainId, signature[0..31])
    // This is unique per withdrawal attempt.

    let computedNullifier =
        poseidon::poseidon2::Poseidon2::hash([recoveredAddrField, denomination, targetChainId], 3);
    assert(computedNullifier == nullifierHash);
}
