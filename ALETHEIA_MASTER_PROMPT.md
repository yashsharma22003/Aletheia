# Aletheia Treasury: Privacy Payroll Architecture Master Context

This document serves as the master context and architectural reference for the Aletheia Treasury Privacy Payroll system. It outlines the data flow, contract states, revised proof generation process, API integration specs, and the CRE Compliance Service design.

## 1. Privacy Payroll Architecture (Employer-Side Proving)

By shifting to a decoupled proving model, the **Employer** generates the zk-SNARK proof locally upon deposit and pushes it to the generic Oracle network. The **Employee** simply signs a claim payload and a **TEE Verification Service** handles the mathematical validation asynchronously.

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

### 1.4 Proof Generation (Employer Side)
This phase relies on the Employer's infrastructure to handle the heavy cryptography without blocking the Employee.
*   **Proof Synthesis:** The Employer's backend (acting as the Prover) collects the required inputs for the Noir circuit:
    *   *Inputs:* storage proof, employer signature, denomination, and target chain id.
    *   *Public Inputs:* Recipient, cheque id, target chain id, and a nullifier hash.
*   **Solving & Proving:** The Employer executes the Noir compiled circuit (`nargo execute`) and uses Barretenberg (`bb prove`) to generate the massive 50MB zk-SNARK proof.
*   **Off-Chain Storage:** The Employer submits the full proof to the **Prover Service** (their own backend), which persists the raw ~50MB proof in a database keyed by `chequeId` via `POST /api/v1/proofs`.
*   **Oracle Submission:** The Prover Service then forwards the proof to the Chainlink Proof Oracle workflow.
*   **Proof Registry:** The Oracle computes `keccak256(proof)` inside the CRE enclave and initiates a CCIP cross-chain transaction, storing only the `chequeId => keccak256(proof)` mapping (32 bytes) in the `ProofRegistry` on the destination network. The full raw proof is **never** written on-chain.

### 1.5 Verification & Settlement (TEE Service)
*   **Client Submission:** When the Recipient is ready to claim, their client application prompts them for an ECDSA signature over `(chequeId, recipientAddress)`.
*   **Asynchronous Redemption:** The Recipient submits this signature to the **TEE Verification Service** (e.g., AWS Nitro Enclave).
*   **Native Validation:** The TEE securely:
    1. Fetches the full raw ZK Proof from the **Prover Service API** (`GET /api/v1/proofs/{chequeId}`).
    2. Re-hashes the received proof (`keccak256(proof)`) and validates it against the 32-byte hash stored in the on-chain `ProofRegistry`.
    3. Verifies the Recipient's signature matches the public `recipient` input of the proof.
    4. Runs the native SNARK verifier (`bb verify`).
    5. Computes the `nullifierHash`.
*   **Settlement Engine:** The TEE Verification Service posts a meta-transaction with the `nullifierHash` to the Source Cashier. The smart contract consumes the nullifier (preventing double-spend) and releases the 1600 units of funds to the recipient. No plaintext data is exposed outside the TEE.

---

## 2. Proving & Verification API Context

To successfully integrate the decentralized network and the client application, the following REST APIs must be assumed.

### 2.1 The Proof Oracle Webhook
*   **Role:** Acts as the bridge from Employer to Blockchain.
*   **Endpoint:** `POST /api/v1/oracle/submit_proof`
*   **Caller:** Employer Backend.
*   **What the Oracle Does:** The Oracle **must not** write the full proof on-chain. It computes `keccak256(proof)` and writes only the 32-byte hash to the `ProofRegistry` via CCIP.
*   **Request Payload Schema:**
    ```json
    {
      "chequeId": "0x1",
      "zkSnarkProofHex": "...",
      "targetChainId": 1
    }
    ```

### 2.2 The Redemption & Settlement API (TEE Verification Service)
*   **Role:** Acts as the async redeemer and privacy boundary. Receives the redemption claim with a signature, verifies the proof statically inside the hardware enclave, and processes the final fund settlement to the `CompliantCashier` smart contract.
*   **Endpoint:** `POST /api/v1/settlement/redeem`
*   **Caller:** Client Application (at time of desired withdrawal).
*   **Request Payload Schema:**
    ```json
    {
      "chequeId": "0x1",
      "recipientAddress": "...",
      "signature": "..."
    }
    ```
*   **Response Payload Schema:**
    ```json
    {
      "status": "SETTLED", 
      "nullifierHash": "...",
      "transactionHash": "...",
      "explorerUrl": "..."
    }
    ```

### 2.3 Integration Context Summary
These endpoints decouple the heavy cryptographic lifting from the user's local device. 
1. The Employer computes the massive SNARK proof locally and stores the full raw proof in the **Prover Service database** (keyed by `chequeId`).
2. The CRE securely acts as an encrypted tunnel to compliance APIs via Confidential HTTP.
3. The Oracle receives the proof, computes `keccak256(proof)`, and pushes **only the 32-byte hash** to the `ProofRegistry` on-chain (via CCIP). Gas costs are minimized this way.
4. The Employee's Verification Service fetches the full raw proof from the Prover Service API (`GET /api/v1/proofs/{chequeId}`), re-hashes it to validate against the on-chain `ProofRegistry`, then handles signature validation inside a TEE, deferring the posting of the nullifier and the final redemption of funds.

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
The frontend application acts as the lightweight portal for users. Its main responsibilities are:
1.  **Fund Management (Sender):** Depositing and breaking down funds into generalized compliance cheques.
2.  **State Synchronization (Cross-Chain):** Reaching across multiple endpoints to fetch historical blockchain roots and proofs.
3.  **Claim Signing (Receiver):** Constructing secure ECDSA payloads to authorize the TEE Verification Service to release funds.

---

## 2. Sender Flow: Cross-Chain Deposits & Internal Proving

When a User (Employer) wants to deposit funds and create payroll cheques.

### 2.1 The Deposit Action
*   **Standard Deposit:** The frontend requests ERC-20 token approval and calls `deposit(amount, targetChainId)` on the source chain's `CompliantCashier` contract, auto-breaking amounts into 1000, 500, and 100 denominations.
*   **Custom Deposit:** The frontend allows the user to specify their exact cheque breakdowns (e.g., three 200-unit cheques, one 400-unit cheque). UI calculates total amount and calls `customDeposit(totalAmount, targetChainId, [200, 200, 200, 400])`.
*   **Cheque Tracking:** The frontend must locally store the emitted `ChequeCreated` events, tracking the exact `chequeIds`. The Client can confidently pre-determine exactly what these IDs will be using the read-only contract methods `getPredictedCheques` or `getPredictedCustomCheques`.
*   **Off-Chain Notification:** The application provides a secure way to copy or send the `chequeIds` to the intended Recipient off-chain (e.g., via a secure chat link or QR code).

### 2.2 Proof Execution (Employer Backend)
*   After the deposit, the Employer's backend seamlessly executes the Noir Circuit logic (`bb prove`) and submits the 50MB proof to the Chainlink Oracle. The Sender UI shows a "Proof Synchronizing" status until it reaches the `ProofRegistry`.

---

## 3. Receiver Flow: Signing and Settlement (The Claim)

When the Recipient receives their `chequeIds`, the frontend orchestrates the secure claim.

### 3.1 Claim Authorization (Signature)
*   **EIP-191 Signatures:** The frontend prompts the Recipient's wallet to `personal_sign` a payload containing: `(chequeId, recipientAddress)`.
*   **Submission:** The frontend sends a `POST` request to the off-chain **TEE Verification Service** containing the signature and cheque details.

### 3.2 Verification & Execution (TEE)
*   **Enclave Blackbox:** The frontend awaits a response while the TEE Verification Service does the heavy lifting: verifying the signature, querying the `ProofRegistry`, checking compliance, executing the native Noir verifier, and broadcasting the release transaction.
*   **Settlement:** Once exactly one transaction is confirmed, the TEE returns the successful status and the frontend displays the final ERC-20 transfer.

---

## 4. Required Frontend Libraries & Packages
To execute this architecture, the frontend will need the following dependencies:
*   **Wallet Connection:** `wagmi` / `viem` (for bridging networks, fetching transaction statuses, and handling `personal_sign`).
*   **Cryptography:** Standard hashing utilities (e.g., `@noble/hashes`) to calculate identifiers and predict slot IDs prior to action requests.
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
