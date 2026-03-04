# Aletheia Protocol: Technical Architecture & Execution Flow

Aletheia is a cross-chain Privacy Payroll and Treasury Management protocol. It leverages Noir zero-knowledge SNARK proofs, Chainlink Cross-Chain Interoperability Protocol (CCIP), Chainlink Custom Runtime Extension (CRE) Oracles, and Confidential Compute (TEE) enclaves to enable completely private, cross-chain salary disbursements where employee metadata and payment amounts are cryptographically hidden.

---

## 🏗 Core Entities and Nuances

Aletheia integrates multiple complex technologies to guarantee maximum theoretical confidentiality from the browser to the blockchain.

### 1. Smart Contracts (Storage & Payouts)
*   **ComplianceCashier**: The entry point on the *Source Chain* (e.g., Base). Employers deposit funds and emit a `ChequeCreated(chequeId, owner)` event. This contract locks the funds until a relayer presents a valid ZK proof and nullifier.
*   **ProofRegistry**: The validation layer on the *Target Chain* (e.g., OP Sepolia). It acts as a mapping of `chequeId => keccak256(proof)` updated exclusively by the Chainlink Proof Oracle. Only the 32-byte hash of the ZK proof is stored on-chain to save gas; the full raw proof (~50MB) is retained off-chain in the Prover Service database.
*   **Settlement Engine (within Cashier)**: Validates that `isCompliant == true` and the Proof is valid before releasing ERC20 tokens to the destination wallet.

### 2. The Chainlink CRE Network (Oracle Layer)
We use the Chainlink Custom Runtime Extension (CRE) to run WASM scripts inside the Decentralized Oracle Network (DON).
*   **Compliance Oracle**: Listens for `ChequeCreated` events. It uses **Confidential HTTP** to ping a KYC API, encrypts the compliance status inside the hardware enclave using AES-GCM, and writes the ciphertext back on-chain.
*   **Proof Oracle**: An HTTP-triggered workflow that acts as a secure bridge. Once the Prover Service generates the massive 50MB Noir SNARK proof (and stores it off-chain in its own database), it forwards the proof to this Oracle, which computes `keccak256(proof)` and executes a Cross-Chain CCIP transaction to write *only the 32-byte hash* into the `ProofRegistry` on the destination network. The full raw proof is never sent on-chain.

### 3. Proof Generation & TEE Verification Service
Because Barretenberg (`bb prove`) and Noir (`nargo`) are native C++ binaries that require significant compute, the proving pipeline is handled locally by the **Employer** at deposit time.
*   The **Employer** generates the 50MB proof natively on their infrastructure. The full raw proof is stored in the **Prover Service database** (keyed by `chequeId`), while only the `keccak256(proof)` hash is forwarded to the Chainlink Proof Oracle for on-chain registration.
*   When the **Employee** wants to claim their funds, they first fetch the full raw proof from the **Prover Service** (`GET /proofs/{chequeId}`), then submit the proof alongside a signature to the **TEE Verification Service** (e.g., AWS Nitro CLI, Marlin Oyster, or Phala Network).
*   The Verification Service re-hashes the received proof, validates it against the `keccak256` hash stored in the `ProofRegistry`, verifies the proof inside the secure TEE memory boundary, and if valid, posts the `nullifierHash` to release the funds. No plaintext `chequeId` is leaked to the host OS.

### 4. Noir Zero-Knowledge Circuits
The Noir circuit enforces the structural integrity of the payroll system:
*   **State Roots**: Validates MPT proofs against the historic Ethereum state root.
*   **Signatures**: Verifies an ECDSA (secp256k1) signature of the `ChequeId` mapping to prevent front-running.
*   **Nullifiers**: Emits a unique Poseidon2 hash (`nullifierHash`) using the cheque details to prevent double-spending without revealing the cheque ID itself.

---

## 🌊 Protocol Data Flow

```mermaid
flowchart TB
    %% Entities
    Employer([🏢 Employer Wallet/Backend])
    Employee([👨‍💻 Employee Frontend])
    
    subgraph Blockchains ["⛓️ Smart Contracts (EVM)"]
        Source[(Source: ComplianceCashier)]
        Target[(Target: ProofRegistry)]
    end
    
    subgraph Oracles ["🔮 Chainlink CRE Oracles"]
        Oracle1{Compliance Oracle}
        Oracle2{Proof Oracle}
    end
    
    subgraph TEE ["🔒 CC Hardware Enclave"]
        Verifier[TEE Verification Service]
    end

    ProverDB[(Prover Service DB)]

    %% Phase 1
    Employer -- "1. Deposit Salary" --> Source
    Source -- "2. Event: ChequeCreated" --> Oracle1
    Oracle1 -. "3. Confidential HTTP KYC" .-> Oracle1
    Oracle1 -- "4. Save Encrypted Status" --> Source

    %% Phase 2
    Employer -. "5. Generate 50MB SNARK Proof" .-> Employer
    Employer -- "6a. Store Full Raw Proof" --> ProverDB
    Employer -- "6b. Submit Proof to Oracle" --> Oracle2
    Oracle2 -. "6c. Compute keccak256(proof)" .-> Oracle2
    Oracle2 -- "7. CCIP: Write hash on-chain" --> Target

    %% Phase 3
    Employee -- "8. Fetch Full Proof" --> ProverDB
    Employee -- "9. Claim (Signature + Proof)" --> Verifier
    Verifier -. "10. Re-hash & validate vs ProofRegistry" .-> Target
    Verifier -- "11. Execute Payout (Nullifier)" --> Source
    Source -- "12. Release ERC20" --> Employee

    %% Clean Styles
    classDef default fill:#1E1E1E,stroke:#4CAF50,stroke-width:2px,color:#FFF;
    classDef actor fill:#2196F3,stroke:#1565C0,stroke-width:2px,color:#FFF;
    classDef db fill:#FF9800,stroke:#E65100,stroke-width:2px,color:#FFF;
    classDef oracle fill:#9C27B0,stroke:#6A1B9A,stroke-width:2px,color:#FFF;
    
    class Employer,Employee actor;
    class Source,Target,ProverDB db;
    class Oracle1,Oracle2 oracle;
```

---

## 🔒 Confidentiality Guarantees

The Aletheia protocol is engineered to provide "Global Confidentiality" across all domains:

1.  **On-Chain Privacy (ZK Proofs):** The Noir SNARK circuit ensures that when the employee claims their funds on the destination chain, the smart contract does not learn *which* cheque they are cashing, preventing observers from linking the deposit to the withdrawal.
2.  **Oracle Privacy (Confidential HTTP):** Chainlink's CRE Enclave guarantees that the query to the off-chain KYC provider cannot be intercepted. The oracle *encrypts* the result inside the hardware boundary before posting it to the blockchain.
3.  **Compute Privacy (Standalone TEE):** The **Employer** handles proof generation locally. The Verification Service runs inside an AWS Nitro/Marlin Oyster enclave. The frontend submits the claim to the Verification Service, which only runs the Noir verifier in protected memory and dumps the plaintext, meaning host OS administrators cannot scrape employee claim data or link it to the `chequeId`.

---

## 🛡 Regulatory & Compliance Safeguards

To operate legally within global financial systems (e.g., FATF Travel Rule, FinCEN regulations), Aletheia implements several mandatory, non-negotiable architectural checks:

### 1. Mandatory KYC & Sanctions Tunneling (AML)
Before any ZK Proof can be generated or redeemed, the system **forces** the `chequeId` through the Chainlink Compliance Oracle.
*   **The Nuance:** The smart contract `ComplianceCashier` starts with `isCompliant = false`. Even if an employer deposits funds, the employee *cannot* claim them until the Compliance Oracle successfully pings an external KYC/OFAC API (like Chainalysis or Elliptic) and writes `isCompliant = true` on-chain.

### 2. Velocity & Volume Throttling
To prevent the privacy protocol from being used as a high-speed crypto tumbler:
*   **The Nuance:** The Smart Contracts can implement daily/weekly withdrawal limits per `nullifierHash`. Even though the employee is anonymous, the deterministic `nullifierHash` acts as a hidden identity tag that allows the contract to throttle velocity without doxxing the user.

### 3. Sybil Resistance via Nullifier Hashes
To prevent double-spend attacks where a user claims the identical salary multiple times on destination chains:
*   **The Nuance:** The Noir ZK Circuit mathematically binds the `chequeId` to the `nullifierHash` using the Poseidon2 hashing algorithm. You cannot generate a valid proof without exposing the nullifier. The Target Chain strictly tracks used nullifiers into an immutable mapping to reject overlapping redemptions.

### 4. Enterprise Data Residency (GDPR/CCPA)
Because European enterprises cannot broadcast raw employee data globally:
*   **The Nuance:** By pushing the heavy ZK Proving natively to the *Employer's Infrastructure* and only executing Verification inside the Transient TEE on behalf of the Employee, Aletheia legally bypasses "Data Exfiltration" regulations. No persistent databases store the plaintext salary amounts or PII mapping to employees—meaning the protocol has zero regulatory footprint regarding Data Residency laws.
