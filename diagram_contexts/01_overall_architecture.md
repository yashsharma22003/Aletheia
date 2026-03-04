# Context: Overall Protocol Architecture

Use this context to generate a high-level system architecture diagram for the Aletheia Privacy Payroll Protocol.

## 1. Core Purpose
Aletheia is a cross-chain payroll and treasury management protocol. It allows an employer on a Source Chain to deposit funds, and an employee to withdraw them on a Target Chain without revealing their identity, salary amount, or the link between the deposit and withdrawal.

## 2. Main Environments / Subgraphs
The diagram should clearly delineate four distinct environments where processing happens:
1. **Decentralized Apps (Client Side):** Employer Wallet, Employee Browser.
2. **Blockchain EVM Layer (On-Chain):** Source Chain (Base/Ethereum), Target Chain (Optimism/Arbitrum).
3. **Chainlink DON (Oracle Layer):** Decentralized Oracle Networks running Custom Runtime Extension (CRE) sandboxes.
4. **Confidential Compute (Hardware TEE):** Secure Enclave (AWS Nitro/Marlin Oyster) running the Prover backend.

## 3. Key Actors & Components
*   **Employer Wallet:** Deposits ERC20 funds and generates ZK witnesses + SNARK proofs locally.
*   **Employee Frontend:** Signs claim payloads and submits them to the Verification Service.
*   **ComplianceCashier (Smart Contract - Source Chain):** Holds employer funds and emits `ChequeCreated`. Starts with `isCompliant = false`.
*   **ProofRegistry (Smart Contract - Target Chain):** Stores the `keccak256` hashes of valid Zero-Knowledge proofs, mapping `chequeId => keccak256(proof)`. The full raw proof (~50MB) is never stored on-chain; only the 32-byte hash is written to save gas.
*   **Compliance Oracle (Chainlink CRE):** Listens for `ChequeCreated`, performs Confidential HTTP KYC checks, encrypts the result in-memory, and writes it back to the Source Chain.
*   **Proof Oracle (Chainlink CRE):** Receives the full SNARK proof from the Employer's Prover Service. Computes `keccak256(proof)` inside the CRE enclave, then executes a CCIP cross-chain transaction to write **only the 32-byte hash** to the Target Chain's `ProofRegistry`. The Prover Service retains the full raw proof in its own database.
*   **Verification Service (CC TEE):** Express API running in an enclave. Receives the employee's claim (signature + raw proof fetched from the Prover Service off-chain API). Fetches the 32-byte hash from the on-chain `ProofRegistry` and re-hashes the received proof to verify authenticity. Then verifies the employee's signature and runs the native SNARK verifier inside the enclave. Executes the final meta-transaction to release funds from the Cashier to the Employee.

## 4. Key Security Themes to Highlight
*   **Data Residency/Privacy:** Emphasize that raw employee data *only* exists during the Employer's local proof generation and within the Verification Service (CC TEE). The `chequeId` remains private because verification happens natively inside the enclave rather than on-chain.
*   **Zero-Knowledge Barrier:** Show how the on-chain payout is detached from the employer's deposit via the ZK Proof and Nullifier hash.
