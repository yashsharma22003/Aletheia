# Context: Phase 1 - Deposit & Compliance Oracle Flow

Use this context to generate a detailed flowchart or sequence diagram specifically for Phase 1 of the Aletheia Protocol: The Deposit and KYC/Sanctions checks.

## 1. Core Purpose
Phase 1 intercepts the initial ERC20 deposit from the employer and forces it through a regulatory KYC/Sanctions check before the funds can ever be accessed by the ZK Proving system.

## 2. Main Environments
1. **Source Blockchain (e.g. Base/Optimism):** Where the employer deposits funds into the `ComplianceCashier` smart contract.
2. **Chainlink DON (Oracle Network):** The decentralized network running the `compliance_oracle` WASM script inside a Custom Runtime Extension (CRE) sandbox.
3. **External KYC/AML API:** A traditional Web2 endpoint (e.g. Chainalysis, Elliptic, or a custom Mock endpoint) used to verify identity flags.

## 3. Step-by-Step Data Flow
1. **Employer deposits funds:** The Employer Wallet calls `deposit()` on the `ComplianceCashier` contract on the Source Chain.
2. **Event Emission:** The contract accepts the ERC20 tokens and emits a public `ChequeCreated(chequeId, owner)` event. Internally, the cheque is marked as `isCompliant = false`.
3. **Oracle Trigger:** The Chainlink DON node, listening via an EVM Log Filter, detects the `ChequeCreated` event and wakes up the `compliance_oracle` workflow.
4. **Confidential HTTP:** The Oracle workflow explicitly requests a **Confidential HTTP** tunnel. The node spins up a secure hardware enclave (TEE) to handle the request.
5. **KYC Verification:** Inside the enclave, the Oracle pings the external KYC API with the `chequeId` and `owner` address.
6. **In-Memory Encryption:** The Oracle receives a `true` (compliant) response. Instead of leaking this plaintext result, the Oracle securely pulls the `san_marino_aes_gcm_encryption_key` from its local secrets vault. It AES-GCM encrypts the compliance status boolean natively inside the enclave memory limit.
7. **Write to Chain:** The Oracle takes the AES-GCM encrypted base64 string and executes a `writeReport` transaction back to the `ComplianceCashier` contract on the Source Chain.
8. **Compliance Activated:** The Smart Contract parses the Oracle report and updates the state: `isCompliant = true`. The funds are now eligible for ZK extraction.

## 4. Key Bottlenecks / Security Constraints to Highlight
*   **The TEE Vault:** Highlight that the `san_marino_aes_gcm_encryption_key` is completely inaccessible to the node operator. It only exists inside the ephemeral TEE memory during step 6.
*   **Regulatory Firewall:** Emphasize that the ZK Prover (Phase 2) physically cannot proceed unless Phase 1 completes successfully. The target chain will reject any proof if the Source Chain `isCompliant` flag remains false.
