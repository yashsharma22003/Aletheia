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
# Aletheia Treasury: Frontend & Cross-Chain Integration Context

This document outlines the architecture, user flows, and technical requirements for the Aletheia Treasury frontend application. It acts as the primary orchestrator for the true "off-chain" privacy model, bridging standard wallet interactions with heavy cryptographic proof execution.

## 1. Core Responsibilities of the Client Application
The frontend application replaces the traditional blockchain relayer. Its main responsibilities are:
1.  **Fund Management (Sender):** Depositing and breaking down funds into generalized compliance cheques.
2.  **State Synchronization (Cross-Chain):** Reaching across multiple endpoints to fetch historical blockchain roots and proofs.
3.  **Local Cryptographic Execution (Receiver):** Constructing the Noir witness execution trace on the user's device (browser/mobile).
4.  **Transaction Settlements (Receiver):** Submitting proof verifications and asynchronous redemption requests directly to the smart contracts.

---

## 2. Sender Flow: Cross-Chain Deposits (The Vault)

When a User (Owner) wants to deposit funds and create payroll cheques.

### 2.1 The Deposit Action
*   **Standard Deposit:** The frontend requests ERC-20 token approval and calls `deposit(amount, targetChainId)` on the source chain's `CompliantCashier` contract, auto-breaking amounts into 1000, 500, and 100 denominations.
*   **Custom Deposit:** The frontend allows the user to specify their exact cheque breakdowns (e.g., three 200-unit cheques, one 400-unit cheque). UI calculates total amount and calls `customDeposit(totalAmount, targetChainId, [200, 200, 200, 400])`.
*   **Cheque Tracking:** The frontend must locally store the emitted `ChequeCreated` events, tracking the exact `chequeIds`. The Client can confidently pre-determine exactly what these IDs will be using the read-only contract methods `getPredictedCheques` or `getPredictedCustomCheques`.
*   **Off-Chain Notification:** The application provides a secure way to copy or send the `chequeIds` to the intended Recipient off-chain (e.g., via a secure chat link or QR code).

### 2.2 Cross-Chain Architecture (Sender)
*   **Target Chain Selection:** The sender must declare the `targetChainId` when minting the cheque. This ensures the Noir circuit and the target smart contract mathematically align later.
*   *Note on Cross-Chain Sync:* The `TruthRegistry` (updated by the CRE Truth Oracle) ensures that the target chain mathematically "knows" what happened on the source chain by synchronizing state roots.

---

## 3. Receiver Flow: Client-Side Witness Generation (The Claim)

When the Recipient receives their `chequeIds`, the frontend orchestrates the most complex part of the protocol.

### 3.1 Fetching Cross-Chain State
Since cheques can be minted on **Chain A** but claimed on **Chain B**, the frontend must stitch together state proofs:
1.  **Query Target Chain Registry:** The frontend queries the `TruthRegistry` on the target chain to fetch the confirmed `stateRoot` of the source chain.
2.  **Query Source Chain RPC:** Using `eth_getProof`, the frontend requests the Merkle Patricia Trie (MPT) storage proofs for the specific `CompliantCashier` contract and the respective cheque mapping slots against the fetched `stateRoot`.

### 3.2 Constructing the Noir Witness (Local Execution)
This is where the privacy and scalability advantages shine.
*   **EIP-191 Signatures:** The frontend prompts the Recipient's wallet to `personal_sign` a payload containing: `(recipientAddress, chequeId, targetChainId)`.
*   **Wasm/Noir Integration:** Using the `@noir-lang/noir_js` (or similar WebAssembly bindings), the frontend executes the Aletheia `main.nr` circuit locally.
*   **Inputs:** It supplies the public parameters (target chain, denominations) and the highly sensitive private parameters (raw MPT proofs, the raw ECDSA signature).
*   **Output:** The compilation results in a serialized Noir Witness trace. The sensitive EVM signature and storage paths never leave the browser.

---

## 4. Receiver Flow: Validation & Redemption

The frontend executes the split "Verify -> Redeem" phase.

### 4.1 Invoking the Proving Service (REST API)
*   **Tunneling Compliance:** The frontend may first need to periodically check the CRE (or Prover Service) to see if the cheque's compliance attestation has securely arrived from the Confidential HTTP workflow.
*   **Proving Request:** The frontend sends a `POST` request to the off-chain Proving Service containing:
    *   The locally generated Noir Witness.
    *   The encrypted compliance payload (if routed via client).
    *   The public inputs.
*   **Response:** The Proving Service returns a lightweight (e.g., UltraHonk) zk-SNARK proof.

### 4.2 Step 1: Proof Validity Registration (On-Chain)
*   **Submission:** The frontend formats the zk-SNARK proof and the public inputs for EVM consumption.
*   **Transaction:** The frontend prompts the user to submit an on-chain transaction to the `CompliantCashier` on the **Target Chain**. This calls the native verifier, updating the cheque state to `Compliance - true`, but *releases no funds*.

### 4.3 Step 2: Asynchronous Redemption (Off-Chain -> On-Chain)
*   **Redemption Call:** When the Recipient actually wants their funds, the frontend interacts with the **Verification Service API** (`POST /api/v1/settlement/redeem`).
*   **Payload:** It supplies the `chequeId`, the recipient's address, and the `nullifierHash`.
*   **Settlement:** The Verification Service confirms the validity state and posts the nullifier directly to the blockchain, triggering the final ERC-20 transfer.

---

## 5. Required Frontend Libraries & Packages
To execute this architecture, the frontend will need the following dependencies:
*   **Wallet Connection:** `wagmi` / `viem` (for bridging networks, fetching MPT proofs via standard RPCs, and handling `personal_sign`).
*   **ZK Execution:** `@noir-lang/noir_js` and `@noir-lang/backend_barretenberg` via WebAssembly to compile the witness locally in the DOM.
*   **Cryptography:** Standard hashing utilities (e.g., `@noble/hashes`) to calculate nullifiers and predict slot IDs for MPT pathing prior to proof requests.
# Aletheia Treasury: UI/UX & Frontend Architecture

This document defines the visual design system, component architecture, and user experience (UX) flows for the Aletheia Treasury frontend. The design aesthetic is "Institutional & Unique"—aiming for a highly professional, trustworthy, yet modern cryptographic interface reminiscent of high-end fintech and prime brokerage platforms.

## 1. Design System & Aesthetics

### 1.1 The "Institutional Cryptography" Theme 
The platform must convey trust, precision, and enterprise-grade security. 
*   **Color Palette:**
    *   **Primary:** Deep Obsidian Black (`#0B0D17`) - represents the secure vault.
    *   **Secondary:** Titanium Silver (`#EAECEF`) - for primary text and high-contrast elements.
    *   **Accents:** 
        *   Secure Green (`#00D084`) - for successful proofs, compliance checks, and settled funds.
        *   Cryptographic Amethyst (`#7B61FF`) - used sparingly for ZK-proof generation states, indicating heavy cryptographic lifting.
*   **Typography:**
    *   **Headers/Display:** *Space Grotesk* or *Inter* (Sleek, geometric, highly legible for numbers and hashes).
    *   **Body/Data:** *JetBrains Mono* or *SF Mono* (For displaying Cheque IDs, Addresses, and Hash data precisely).
*   **Visual Motifs:**
    *   **Glassmorphism (Subtle):** Blurred, frosted glass panels over deep backgrounds to represent the "transparency yet privacy" of zero-knowledge proofs.
    *   **Micro-animations:** Smooth, deliberate transitions. When a ZK-proof is generating, use an elegant mathematical or geometric loader (e.g., unfolding polygons) rather than a generic spinner. 

## 2. Core View Architecture

The application is structured around two distinct operational personas: **The Sender (Treasury)** and **The Receiver (Employee/Contractor)**.

### 2.1 The Treasury Dashboard (Sender View)
*   **Overview Panel:** High-level metrics showing Total Value Locked (TVL), active cheques, and recent settlement history across chains.
*   **Deposit Widget (The Mint):**
    *   *Input:* Select Source Token (USDC), Target Chain dropdown, and Total Amount.
    *   *Denomination Toggle:* Switch between "Auto-Standard" (breaks into 1000/500/100) and "Custom Build".
    *   *Custom Build UI:* A dynamic list builder where the user specifies exact cheque amounts (`[200, 200, 400]`), validating against the total.
*   **Cheque Ledger:** A tabular view of minted, unredeemed cheques. 
    *   *Action:* "Copy Magic Link" or "Generate QR" to securely hand off the deterministic `chequeId` to the recipient off-chain.

### 2.2 The Claim Terminal (Receiver View)
This view must feel like a secure enclave, reassuring the user during the browser-based proof generation.
*   **Initialization State:** A clean page prompting the user to paste their "Magic Link" or `chequeId`.
*   **The "Compliance Gate" UI:**
    *   A visual step showing the system verifying the CRE (Chainlink) compliance status.
    *   *Status Indicator:* "Verifying encrypted compliance attestation..." -> (Turns Secure Green).
*   **The Proving Engine (The Core UX):**
    *   This is where local witness generation occurs.
    *   *Action:* User clicks "Generate Claim Proof". Wallet prompts for `personal_sign`.
    *   *Animation:* A complex, high-tech progress indicator showing "Fetching MPT Proofs" -> "Compiling Noir Witness" -> "Synthesizing SNARK".
*   **Redemption Step:**
    *   Once the proof is generated, the UI presents a 2-step slider or sequential buttons:
        1.  *Verify On-Chain (Submit Proof)*
        2.  *Redeem Funds (Post Nullifier)* -> Displays confetti/success animation upon final settlement.

## 3. Component Library (React/Next.js)

To maintain coherence with the technical architecture, we need specialized React components.

### 3.1 Network & Cross-Chain Components
*   **`<ChainSelector />`:** A styled dropdown allowing selection between Source and Target chains, fetching data from the `TruthRegistry`.
*   **`<StateRootSyncBadge />`:** A small indicator showing if the target chain's view of the source chain is currently up-to-date (Green/Red sync light).

### 3.2 Cryptographic Components (Noir/ZK)
*   **`<ProofGeneratorConsole />`:** A terminal-like or sleek modular component that visualizes the WebAssembly (`@noir-lang/noir_js`) execution trace to the user, providing transparency that their device is doing the work.
*   **`<NullifierLock />`:** A UI element that visually "unlocks" when the verification service confirms the nullifier hasn't been spent.

### 3.3 Transaction Components
*   **`<ChequeBuilder />`:** The UI component handling the array inputs for the `customDeposit` and `getPredictedCustomCheques` smart contract integration.
*   **`<EncryptedPayloadViewer />`:** (Optional) A developer-mode toggle that shows the AES-GCM encrypted ciphertext received from the Chainlink CRE, proving that the data is obfuscated.

## 4. State Management Coherence

*   **Jotai or Zustand:** Lightweight global state to manage the cross-chain synchronization status (Source Chain RPC vs. Target Chain RPC).
*   **Local Storage/IndexedDB:** Used specifically to cache the deterministically predicted `chequeIds` for the Sender so they don't lose links before sending them to the Recipient.

## 5. Implementation Roadmap
1.  **Initialize Next.js Repo:** Install TailwindCSS, configure the dark/"Obsidian" theme, and set up custom fonts (Space Grotesk + Mono).
2.  **Build Wagmi/Viem Providers:** Ensure multi-chain support for fetching MPT proofs via standard RPC endpoints.
3.  **Integrate NoirJS:** Set up the WebAssembly bundler config to allow client-side circuit execution.
4.  **Assemble The Mint (Sender):** Wire the `customDeposit` logic to the UI.
5.  **Assemble The Claim (Receiver):** Build the Proving Engine animation and wire the 2-step Verification -> Redemption API calls.
