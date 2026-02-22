# Aletheia Treasury: Privacy Payroll Architecture Master Context

This document serves as the master context and architectural reference for the Aletheia Treasury Privacy Payroll system. It outlines the data flow, contract states, revised proof generation process, API integration specs, and the CRE Compliance Service design.

## 1. Privacy Payroll Architecture (Witness-Based Off-Chain Proving)

By shifting to a lighter client-side execution model, the client generates the witness by solving the circuit locally and delegates the heavy zk-SNARK proof generation to an off-chain Proving Service.

### 1.1 Treasury Deposit & Minting
*   **The Vault:** The protocol begins with a Vault Contract holding deposited funds (e.g., 1600 units of USDC).
*   **Cheque Creation:** The Owner initiates a transaction to create cheques totaling the deposited amount, interacting with the Compliant Cashier Contract.
*   **Initial Solidity Storage:** The contract records the generalized schema: `Cheque (owner, amount, cheque Id, compliance, destination chain, Proof, Block No)`.
*   **Encumbrance State:** Cheques are minted into storage with an initial `Compliance - false` state.
    *   *Example:* Cheque 1 (1000 units), Cheque 2 (500 units), Cheque 3 (100 units).

### 1.2 Off-Chain Claim Distribution
*   **Notification:** The Owner sends an off-chain message directly to the Recipient.
*   **Payload:** The message delivers the generated Cheque IDs alongside notification text.
*   **Total Claim:** The notification confirms the payout equates to the allocated valid units.

### 1.3 The Compliance Gate (Confidential HTTP Tunnel)
*   **Event Emission:** For each minted cheque, the contract triggers an event: `Emit (owner, cheque id)`.
*   **Validation:** The Chainlink CRE (Compliance Service) listens for these events. Using a Confidential HTTP workflow, it securely queries external sources (like a Sanctions API or KYC provider) without exposing data to the consensus network.
*   **Attestation:** Upon successful verification, it outputs a batch boolean state indicating compliance status (e.g., `Batch ( 0x1 - true, 0x2 - true, 0x3 - true )`).

### 1.4 Witness Generation & Off-Chain Proving
This phase separates the execution of the circuit from the cryptographic proving.
*   **Client-Side Witness Generation:** The Recipient (Client application) collects the required inputs for the Noir circuit:
    *   *Private Inputs:* storage proof, signature (amount, receiver, cheque id), and Owner (eth address).
    *   *Public Inputs:* Source blockchain root, Recipient, cheque id, Denomination, target chain id, source cashier address, and a nullifier hash `(owner, cheque id, target chain id)`.
*   **Solving the Circuit:** The client application executes the Noir compiled circuit (`nargo execute`) to compute the Witness (the mathematical execution trace proving the inputs satisfy the circuit constraints).
*   **Off-Chain Routing:** The client submits a Confidential HTTP Request containing the generated Witness and Public Inputs to the dedicated Off-Chain Proving Service.
*   **Proof Synthesis:** The high-performance Proving Service consumes the Noir witness. Using a backend like UltraHonk/Barretenberg, it generates the final succinct zk-SNARK proof.

### 1.5 Verification & Validity Logging
*   **Client Submission:** The Proving Service routes the generated zk-SNARK proof back to the Client Application. The Recipient formats the public inputs locally and submits a transaction to the smart contract purely to verify the validity of the proof. 
*   **On-Chain Validation:** The Compliant Cashier Contract runs the native SNARK verifier against the Source Cashier Address Root.
*   **Validity State Storage:** If verified, the contract updates its Solidity Storage, marking the cheques as mathematically valid (`Compliance - true`) and recording the proofs. *No funds are released at this stage.*

### 1.6 Asynchronous Redemption
*   **Claiming Funds:** At a later time, the Recipient uses the Verification Service (or Client Application) to trigger the actual redemption.
*   **Finality & Nullifier Posting:** The Verification Service posts the nullifier hash to the network to prevent double-spending and officially releases the previously validated 1600 units of funds to the recipient.

---

## 2. Proving & Verification API Context

To successfully integrate the Chainlink CRE and the client application with the off-chain infrastructure, the following REST APIs must be exposed.

### 2.1 The Proving Service API
*   **Role:** Acts as the off-chain cryptographic engine. Decrypts the compliance payload forwarded from the CRE workflow, ingests the Noir witness from the client, and generates the final succinct zk-SNARK proof.
*   **Endpoint:** `POST /api/v1/prove/generate`
*   **Caller:** Client Application (Frontend/Mobile/Web).
*   **Request Payload Schema:**
    ```json
    {
      "chequeId": "0x1",
      "creEncryptedAttestation": {
        "nonce": "...",
        "ciphertextBase64": "...",
        "tag": "..."
      },
      "noirWitnessBase64": "...",
      "publicInputs": {
        "sourceCashierRoot": "...",
        "recipientAddress": "...",
        "denomination": 1000,
        "targetChainId": 1,
        "nullifierHash": "..."
      }
    }
    ```
*   **Response Payload Schema:**
    ```json
    {
      "status": "SUCCESS", 
      "zkSnarkProofBase64": "...",
      "verificationKeyHash": "..."
    }
    ```

### 2.2 The Redemption & Settlement API (Verification Service)
*   **Role:** Acts as the async redeemer. Receives the redemption request, ensures the proof was previously validated on-chain as `Compliance - true`, posts the nullifier, and processes the final fund settlement to the `CompliantCashier` smart contract.
*   **Endpoint:** `POST /api/v1/settlement/redeem`
*   **Caller:** Client Application (at time of desired withdrawal).
*   **Request Payload Schema:**
    ```json
    {
      "chequeId": "0x1",
      "nullifierHash": "...",
      "recipientAddress": "..."
    }
    ```
*   **Response Payload Schema:**
    ```json
    {
      "status": "SETTLED", 
      "transactionHash": "...",
      "explorerUrl": "..."
    }
    ```

### 2.3 Optional: Direct CRE Webhook API
If the Chainlink CRE workflow pushes the compliance attestation directly to the servers.
*   **Role:** Webhook for the CRE DON to interact with.
*   **Endpoint:** `POST /api/v1/cre/webhook/attest`
*   **Caller:** Chainlink CRE Workflow (ConfidentialHTTPClient).
*   **Request Payload Schema:**
    ```json
    {
      "chequeId": "0x1",
      "encryptedOutput": "..."
    }
    ```

### 2.3 Integration Context Summary
These endpoints decouple the heavy cryptographic lifting from both the Chainlink consensus network and the user's local device. 
1. The client handles lightweight Noir witness generation.
2. The CRE securely acts as an encrypted tunnel to compliance APIs via Confidential HTTP.
3. The Proving API synthesizes the final zk-SNARK proof.
4. The client locally constructs the public inputs and submits the on-chain transaction to register the validity of the SNARK proof.
5. The Verification Service handles the deferred posting of the nullifier and the final redemption of funds.

---

## 3. CRE Compliance Service Context

The Chainlink CRE workflow acts as the privacy-preserving gatekeeper using the Confidential HTTP capability as a secure tunnel.

### 3.1 Service Role and Triggers
*   **Role:** Operates as the central CRE (Compliance Service).
*   **Trigger:** Monitors the Compliant Cashier Contract for `Emit (owner, cheque id)` events on-chain.

### 3.2 Secure Data Fetching (Confidential HTTP)
*   **Execution:** Triggered by cheque minting events, it verifies the recipient's eligibility privately.
*   **External Queries:** Utilizes Confidential HTTP to securely query external providers (e.g., KYC/AML systems, Sanctions Lists, World ID).
*   **Credential Management:** API credentials (e.g., `{{.kycApiKey}}`) are stored in the Vault DON and injected directly into the secure enclave using template syntax, ensuring credential isolation.

### 3.3 Encryption and Output Generation
*   **Output State:** The external APIs return compliance statuses for specific cheques, resulting in a batch boolean state (e.g., `Batch ( 0x1-true, 0x2-true, 0x3-true)`).
*   **Encryption:** The workflow encrypts this batch result using the `encryptOutput: true` flag and the `san_marino_aes_gcm_encryption_key`.
*   **Consensus:** The workflow reaches consensus on the AES-GCM encrypted ciphertext, ensuring raw compliance data is never exposed in node memory or on-chain.

### 3.4 Required Workflow Configuration
*   **Secrets Requirements (`secrets.yaml`):**
    *   `kycProviderApiKey`: Credential for KYC/AML or Sanctions List APIs.
    *   `san_marino_aes_gcm_encryption_key`: 256-bit AES key used to encrypt the payload for the off-chain proving server.
*   **Workflow Execution Logic:** The TypeScript handler extracts the owner and cheque ID from the emitted event, passes them as `templatePublicValues` into the Confidential HTTP request, and returns the base64-encoded encrypted response.
