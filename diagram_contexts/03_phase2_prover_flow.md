# Context: Phase 2 - ZK Proving & Proof Oracle Flow

Use this context to generate a detailed flowchart or sequence diagram specifically for Phase 2 of the Aletheia Protocol: The Zero-Knowledge Proving Pipeline.

## 1. Core Purpose
Phase 2 is responsible for taking private employer deposit data, generating a massive 50MB cryptographic ZK SNARK Proof locally on the employer's infrastructure, and teleporting that proof to the destination blockchain.

## 2. Main Environments
1. **Employer Environment:** The desktop application or backend where the employer generates the ZK parameters and the proof.
2. **Chainlink DON (Oracle Network):** The lightweight decentralized network running the `proof_oracle` WASM script inside a Custom Runtime Extension (CRE) sandbox.
3. **Target Blockchain (e.g. OP Sepolia):** Where the `ProofRegistry` smart contract lives.

## 3. Step-by-Step Data Flow
1. **Witness Construction:** The Employer compiles the private data (their ECDSA signature, denomination, specific `chequeId`, and target chain id) into a Noir witness payload.
2. **Local C++ SNARK Compilation:** The Employer triggers the native `nargo` and Barretenberg (`bb prove`) C++ processes locally. *This process takes significant CPU time and generates a 50MB proof.*
3. **Oracle HTTP Trigger:** The Employer makes a simple HTTP POST request to the Chainlink `proof_oracle` local trigger, passing *only* the `proofHex`, `targetChainId`, and `chequeId` (and other public inputs).
4. **CCIP Transportation:** The Chainlink `proof_oracle` workflow wakes up. It packages the metadata and initiates a Chainlink CCIP `writeReport` cross-chain meta-transaction to the Target Blockchain.
5. **Registry Update:** The Target Chain's `ProofRegistry` smart contract receives the CCIP message and saves the mapping from the cheque to the `proofHex` into state.

## 4. Key Bottlenecks / Security Constraints to Highlight
*   **Decoupled Heavy Compute:** Highlight *why* the Prover is decoupled from the Chainlink DON and the Employee. The C++ `bb prove` binary is too massive (~50MB output, huge memory requirements, native execution) to run inside the Chainlink WASM sandbox or a standard employee browser. So, the Employer handles the heavy lifting locally.
*   **Cross-Chain Latency:** Visually emphasize the gap between Step 3 (Oracle Trigger) and Step 5 (Registry Update). CCIP messaging across disparate L2 networks takes several minutes to achieve finality, meaning the claiming process must transition into an async polling mode.
