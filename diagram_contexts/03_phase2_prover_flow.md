# Context: Phase 2 - ZK Proving & Proof Oracle Flow

Use this context to generate a detailed flowchart or sequence diagram specifically for Phase 2 of the Aletheia Protocol: The Zero-Knowledge Proving Pipeline.

## 1. Core Purpose
Phase 2 is responsible for taking private employer deposit data, generating a massive 50MB cryptographic ZK SNARK Proof locally on the employer's infrastructure, persisting the full raw proof in the **Prover Service database** off-chain, and teleporting only the `keccak256` hash of that proof to the destination blockchain — saving gas while preserving verifiability.

## 2. Main Environments
1. **Employer Environment:** The desktop application or backend where the employer generates the ZK parameters and the proof.
2. **Prover Service (Employer Backend):** An off-chain REST API service that stores the full raw ~50MB proof in a database keyed by `chequeId` and proxies it to the Oracle.
3. **Chainlink DON (Oracle Network):** The lightweight decentralized network running the `proof_oracle` WASM script inside a Custom Runtime Extension (CRE) sandbox.
4. **Target Blockchain (e.g. OP Sepolia):** Where the `ProofRegistry` smart contract lives.

## 3. Step-by-Step Data Flow
1. **Witness Construction:** The Employer compiles the private data (their ECDSA signature, denomination, specific `chequeId`, and target chain id) into a Noir witness payload.
2. **Local C++ SNARK Compilation:** The Employer triggers the native `nargo` and Barretenberg (`bb prove`) C++ processes locally. *This process takes significant CPU time and generates a 50MB proof.*
3. **Off-Chain Storage:** The Prover Service persists the full raw `proofHex` in its database via `POST /api/v1/proofs`, keyed by `chequeId`. This off-chain database is the Employee's later retrieval point.
4. **Oracle HTTP Trigger:** The Prover Service makes an HTTP POST request to the Chainlink `proof_oracle` local trigger, passing the `proofHex`, `targetChainId`, and `chequeId`.
5. **Hash Computation (CRE Enclave):** The Chainlink `proof_oracle` workflow wakes up. It computes `keccak256(proofHex)` inside the CRE enclave, reducing the ~50MB payload to a 32-byte hash.
6. **CCIP Transportation:** The oracle packages the `chequeId` and `keccak256(proof)` hash and initiates a Chainlink CCIP `writeReport` cross-chain meta-transaction to the Target Blockchain.
7. **Registry Update:** The Target Chain's `ProofRegistry` smart contract receives the CCIP message and saves the mapping `chequeId => keccak256(proof)` (32 bytes) into state. **No raw proof data is ever written on-chain.**
8. **Employee Fetch:** When ready to redeem, the Employee queries the Prover Service (`GET /api/v1/proofs/{chequeId}`) to retrieve the full raw proof. The TEE Verification Service then re-hashes it to validate against the on-chain registry before running the SNARK verifier.

## 4. Key Bottlenecks / Security Constraints to Highlight
*   **Decoupled Heavy Compute:** Highlight *why* the Prover is decoupled from the Chainlink DON and the Employee. The C++ `bb prove` binary is too massive (~50MB output, huge memory requirements, native execution) to run inside the Chainlink WASM sandbox or a standard employee browser. So, the Employer handles the heavy lifting locally and stores the result in the off-chain Prover Service database.
*   **Hash-Only On-Chain Storage:** The `ProofRegistry` never stores the raw 50MB proof. Only the 32-byte `keccak256(proof)` hash is written on-chain. This is the critical design decision for gas efficiency. Emphasize this split: raw proof → Prover Service DB; hash → `ProofRegistry`.
*   **Cross-Chain Latency:** Visually emphasize the gap between Step 4 (Oracle Trigger) and Step 7 (Registry Update). CCIP messaging across disparate L2 networks takes several minutes to achieve finality, meaning the claiming process must transition into an async polling mode.
*   **Employee Retrieval:** The diagram should show that the Employee must query the off-chain Prover Service API to get the raw proof *before* they can submit to the TEE Verification Service for redemption.
