use dep::ecrecover;
use dep::keccak256;
use dep::mpt;
use dep::poseidon;

global MAX_DEPTH: u32 = 10;

fn main(
    root: pub [u8; 32],
    recipient: pub Field,
    nullifierHash: pub Field,
    vaultAddress: pub [u8; 20], // Public Input: Prover must prove against THIS vault
    // Private Inputs
    slot: [u8; 32], // Storage Key (Private for Privacy)
    noteIndex: Field, // Virtual Index (0, 1, 2...)
    // NEW: Variable trie depth parameters
    accountTrieKeyIndex: u32, // How many nibbles consumed in account proof
    storageTrieKeyIndex: u32, // How many nibbles consumed in storage proof
    // Witnesses
    vaultAccountProof: [mpt::mpt_body::Node; MAX_DEPTH],
    vaultAccountProofLen: u32,
    vaultAccount: mpt::mpt_leaf::Account,
    vaultAccountLeafHash: [u8; 32],
    storageProof: [mpt::mpt_body::Node; MAX_DEPTH],
    storageProofLen: u32,
    storageValue: mpt::mpt_leaf::StorageSlot,
    storageLeafHash: [u8; 32],
    pubKeyX: [u8; 32],
    pubKeyY: [u8; 32],
    signature: [u8; 64],
) {
    // 0. Use Recipient/Inputs
    assert(recipient != 0);

    // 1. Verify Vault Account
    let vaultPathKey = keccak256::keccak256(vaultAddress, 20);
    mpt::mpt_body::verify_nodes(
        vaultAccountProof,
        vaultAccountProofLen,
        0,
        root,
        vaultPathKey,
        accountTrieKeyIndex, // Variable: actual nibbles consumed
        vaultAccountLeafHash,
    );
    vaultAccount.verify_leaf_node(accountTrieKeyIndex as u8, vaultPathKey, vaultAccountLeafHash);

    // 2. Storage Slot Verification
    let storageRoot = vaultAccount.storage_hash;
    let storagePathKey = keccak256::keccak256(slot, 32);
    mpt::mpt_body::verify_nodes(
        storageProof,
        storageProofLen,
        0,
        storageRoot,
        storagePathKey,
        storageTrieKeyIndex, // Variable: actual nibbles consumed
        storageLeafHash,
    );
    storageValue.verify_leaf_node(storageTrieKeyIndex as u8, storagePathKey, storageLeafHash);

    // 3. Balance Check
    // RLP Decoding (Simplified for demo: assuming byte value)
    let balance = storageValue.value[0] as Field;
    // Constraint: noteIndex < balance
    // This ensures user only spends valid indices [0 .. Balance-1]
    assert(noteIndex as u32 < balance as u32);

    // 4. Address Recovery
    // Message = Hash(Denomination, Recipient, NoteIndex)
    // NoteIndex MUST be signed to prevent replay of same signature for different indices!
    let recipientBytes: [u8; 32] = recipient.to_be_bytes::<32>();
    let noteIndexBytes: [u8; 32] = noteIndex.to_be_bytes::<32>();

    let mut sigMsgPreimage: [u8; 96] = [0; 96];
    sigMsgPreimage[31] = 100; // Denom (100)
    for i in 0..32 {
        sigMsgPreimage[i + 32] = recipientBytes[i]; // Recipient
        sigMsgPreimage[i + 64] = noteIndexBytes[i]; // Note Index
    }
    let computedMsgHash = keccak256::keccak256(sigMsgPreimage, 96);

    let recoveredAddrField = ecrecover::ecrecover(pubKeyX, pubKeyY, signature, computedMsgHash);
    assert(recoveredAddrField != 0);

    // 5. Verify Storage Key Ownership
    // Reconstruct Storage Key from Recovered Address
    // Key = Keccak(100 . Keccak(Addr . 0))
    let recoveredAddrBytes = recoveredAddrField.to_be_bytes::<32>();
    let mappingSlot = [0; 32];

    let mut innerPreimage: [u8; 64] = [0; 64];
    for i in 0..32 {
        innerPreimage[i] = recoveredAddrBytes[i];
        innerPreimage[i + 32] = mappingSlot[i];
    }
    let innerSlot = keccak256::keccak256(innerPreimage, 64);

    let mut finalPreimage: [u8; 64] = [0; 64];
    finalPreimage[31] = 100;
    for i in 0..32 {
        finalPreimage[i + 32] = innerSlot[i];
    }
    let computedSlotKey = keccak256::keccak256(finalPreimage, 64);
    assert(computedSlotKey == slot);

    // 6. Compute Nullifier (Poseidon2)
    // The nullifier prevents double-spending by creating a unique hash of the deposit components.
    // Nullifier = Poseidon2(RecoveredAddress, Denomination, NoteIndex)
    // NOTE: This uses the BN254 Poseidon2 variant. Off-chain generation must use a compatible
    // library (e.g., @zkpassport/poseidon2) to match this output.
    let computedNullifier =
        poseidon::poseidon2::Poseidon2::hash([recoveredAddrField, 100, noteIndex], 3);
    assert(computedNullifier == nullifierHash);
}
