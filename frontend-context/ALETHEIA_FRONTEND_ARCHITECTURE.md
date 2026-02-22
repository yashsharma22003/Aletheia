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
