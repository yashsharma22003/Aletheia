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
*   **Employer Wallet:** Deposits ERC20 funds.
*   **Employee Frontend:** Generates ZK witnesses and encrypts data via AES-GCM.
*   **ComplianceCashier (Smart Contract - Source Chain):** Holds employer funds and emits `ChequeCreated`. Starts with `isCompliant = false`.
*   **ProofRegistry (Smart Contract - Target Chain):** Stores valid Zero-Knowledge proof hashes.
*   **Compliance Oracle (Chainlink CRE):** Listens for `ChequeCreated`, performs Confidential HTTP KYC checks, encrypts the result in-memory, and writes it back to the Source Chain.
*   **Prover Service (CC TEE):** Express API running in an enclave. Decrypts employee ZK witness, runs Barretenberg C++ (`bb prove`) to generate the SNARK, and immediately purges plaintext data.
*   **Proof Oracle (Chainlink CRE):** Receives the SNARK proof from the Prover Service and executes a CCIP cross-chain transaction to write the proof to the Target Chain's `ProofRegistry`.
*   **Sync Relayer:** Asynchronous bot that polls the User's claim request, checks `isCompliant == true`, verifies the Proof on the Target chain, and executes the final meta-transaction to release funds from the Cashier to the Employee.

## 4. Key Security Themes to Highlight
*   **Data Residency/Privacy:** Emphasize that raw employee data *only* exists in the Employee Frontend and the CC TEE. It never touches the Oracles or the Blockchain.
*   **Zero-Knowledge Barrier:** Show how the on-chain payout is detached from the employer's deposit via the ZK Proof and Nullifier hash.
