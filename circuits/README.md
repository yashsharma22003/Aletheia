# Aletheia ZK Circuits

This directory contains the Zero-Knowledge circuits for the Aletheia Privacy Payroll Protocol, written in [Noir](https://noir-lang.org/).

## Overview

The core purpose of this circuit is to act as a privacy-preserving bridge between the source chain (where the employer deposited the funds) and the target chain (where the employee wants to withdraw).

Instead of the employee revealing their identity on the target chain to prove they own the cheque on the source chain, they generate a ZK-SNARK proof. The circuit verifies the state of the source chain and the employee's signature, outputting a public nullifier to prevent double-spending without revealing the employee's wallet address.

## How it Works (Under the Hood)

The Noir circuit (`src/main.nr`) handles the following operations:

1. **State Verification (MPT Storage Proofs)**:
    - Verifies a Merkle-Patricia Trie (MPT) inclusion proof for the `Vault` account on the source chain to ensure the provided `stateRoot` is correct.
    - Verifies the MPT storage proofs for the specific `Cheque` struct inside the `ComplianceCashier` mapping, proving that the cheque exists on the source chain, has the correct denomination, and target chain ID.
2. **Compliance Assertion**:
    - Asserts that the `isCompliant` flag in the cheque storage slot is `true` (byte 23 in Slot 1).
3. **Signature Verification (ecrecover)**:
    - Verifies the employee's ECDSA signature (via EIP-191 `personal_sign`) to prove ownership of the specific `chequeId` without revealing the address publicly.
4. **Nullifier Generation**:
    - Computes a secure `Poseidon2` hash of the recovered address, denomination, target chain, and cheque ID to act as a unique public nullifier. This prevents replay attacks or double-spending on the target chain.

## Prerequisites

You need to have **Nargo** (the Noir package manager and compiler) installed.

Follow the official [Noir installation guide](https://noir-lang.org/docs/getting_started/installation/):

```bash
curl -L https://raw.githubusercontent.com/noir-lang/noirup/main/install | bash
noirup
```

## Build and Compile

To compile the circuit and generate the `.json` artifacts that the `mock-tee-prover-service` uses:

```bash
cd circuits
nargo compile
```

This will output the compiled circuit artifacts inside the `target/` directory.

## Testing

*(If tests are defined in the `src` directory or test files, you can run them via Nargo).*

```bash
nargo test
```

## Dependencies

The circuit relies on several Noir cryptographic libraries, as defined in `Nargo.toml`:
- `ecrecover`: For recovering the Ethereum address from the signature.
- `keccak256`: For hashing storage slots and creating the Ethereum signed message hash.
- `poseidon`: For efficient, ZK-friendly nullifier generation.
- `mpt`: For verifying Ethereum Merkle-Patricia Trie state and storage proofs.
