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
