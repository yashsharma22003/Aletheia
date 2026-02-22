# Context: Phase 2 - ZK Proving & Proof Oracle Flow

Use this context to generate a detailed flowchart or sequence diagram specifically for Phase 2 of the Aletheia Protocol: The Zero-Knowledge Proving Pipeline.

## 1. Core Purpose
Phase 2 is responsible for taking private employee salary data, generating a massive 50MB cryptographic ZK SNARK Proof, and teleporting that proof to the destination blockchain without ever exposing the underlying plaintext data to the public internet or server host.

## 2. Main Environments
1. **Employee Browser (Client):** The frontend UI where the employee constructs their ZK parameters.
2. **Standalone CC Enclave (TEE):** The heavy-compute server (e.g., AWS Nitro Enclave, Marlin Oyster) running the `prover-service` Express API natively.
3. **Chainlink DON (Oracle Network):** The lightweight decentralized network running the `proof_oracle` WASM script inside a Custom Runtime Extension (CRE) sandbox.
4. **Target Blockchain (e.g. OP Sepolia):** Where the `ProofRegistry` smart contract lives.

## 3. Step-by-Step Data Flow
1. **Witness Construction:** The Employee Desktop Browser compiles their private data (secret key, salary denomination, specific `chequeId`, and nullifier seed) into a JSON witness payload.
2. **Frontend Encryption:** The Browser encrypts the JSON payload into an AES-GCM ciphertext using the protocol's public symmetric key.
3. **Secure Transport:** The Browser POSTs the ciphertext blob to the `prover-service` API.
4. **Enclave Decryption:** The `prover-service` (running inside AWS Nitro TEE) intercepts the POST request. It pulls its decryption key via Remote Attestation, unwraps the ciphertext in protected memory, and dumps the JSON to disk *strictly within the hardware boundary*.
5. **C++ SNARK Compilation:** The `prover-service` triggers the native native `nargo` and Barretenberg (`bb prove`) C++ child processes. *This process takes significant CPU time and generates a 50MB proof.*
6. **Plaintext Purge:** Immediately upon generating the final `proofHex`, the `prover-service` permanently deletes the decrypted JSON witness from its enclave memory.
7. **Oracle HTTP Trigger:** The `prover-service` makes a simple HTTP POST request to the Chainlink `proof_oracle` local trigger, passing *only* the `proofHex`, `targetChainId`, and `chequeId`.
8. **CCIP Transportation:** The Chainlink `proof_oracle` workflow wakes up. It packages the metadata and initiates a Chainlink CCIP `writeReport` cross-chain meta-transaction to the Target Blockchain.
9. **Registry Update:** The Target Chain's `ProofRegistry` smart contract receives the CCIP message and saves the mapping `chequeId => proofHex` into state.

## 4. Key Bottlenecks / Security Constraints to Highlight
*   **The Hardware Separation Challenge:** Highlight *why* the Prover Service is decoupled from the Chainlink DON. The C++ `bb prove` binary is too massive (~50MB output, huge memory requirements, native execution) to run inside the Chainlink WASM (WebAssembly) sandbox constraint. It requires a dedicated AWS Nitro/Phala TEE.
*   **Cross-Chain Latency:** Visually emphasize the gap between Step 8 (Oracle Trigger) and Step 9 (Registry Update). CCIP messaging across disparate L2 networks takes several minutes to achieve finality, meaning the frontend must transition into an async polling mode.
