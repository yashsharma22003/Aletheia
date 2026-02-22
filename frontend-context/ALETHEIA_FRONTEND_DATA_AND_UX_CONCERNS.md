# Aletheia Frontend: Data Persistence & Cross-Cutting UX Concerns

To ensure the Aletheia Frontend functions reliably as a decentralized privacy application, the following data persistence, error handling, and sharing mechanisms MUST be implemented.

## 1. Local State Persistence (The Sender's Ledger)
Since Aletheia is a privacy-first protocol, there is no centralized database storing the relationships between an "Owner" and their generated "Cheques." 

### 1.1 Persisting the Mint
*   **Mechanism:** You must use `IndexedDB` or `localStorage` to persist the Sender's state locally.
*   **Data to Store:** When a Sender successfully deposits funds via `deposit` or `customDeposit`, the frontend must immediately cache the predicted `chequeIds` associated with that transaction, alongside the timestamp, denomination, and target chain.
*   **Why:** If the user closes their browser before copying the "Magic Links" to send to their employees, those funds are effectively lost in the privacy pool because the sender won't know the IDs to give out. The local dashboard Ledger *must* load from this local cache.

## 2. Magic Link Architecture (Cheque Distribution)
The protocol relies on off-chain distribution of the Cheque IDs.

### 2.1 Generating the Link
*   The UI must generate a "Magic Link" for every individual cheque in the Ledger.
*   **URL Structure:** The link should encode the necessary parameters in the URL fragment or query string to avoid exposing them immediately to server logs (though query strings are acceptable for MVP).
    *   *Example:* `https://app.aletheia.finance/claim?id=0xabc123...&chain=10&denom=1000`
*   **UX Action:** Provide a "Copy Handoff Link" button next to every minted cheque in the sender's dashboard.

### 2.2 Consuming the Link (The Claim Terminal)
*   When the Recipient navigates to the Magic Link, the `Claim Terminal` page must automatically extract the `id`, `chain`, and `denom` parameters from the URL.
*   It should immediately pre-fill the "Compliance Gate" UI and begin fetching the MPT proofs, completely abstracting the complexity from the Recipient.

## 3. Error Handling & Recovery States
ZK-Proof generation and cross-chain RPC calls are inherently brittle in browser environments. You must implement robust error boundaries.

### 3.1 RPC & MPT Proof Failures
*   *Scenario:* `eth_getProof` fails because the target RPC node does not support EIP-1186 or the node is out of sync.
*   *Resolution UI:* Display a specific warning: "Unable to fetch cryptographic state from the network. The RPC node may be syncing. Retrying..." Provide the user an option to manually switch the RPC URL in a settings gear if the default public RPC is failing.

### 3.2 ZK-Proof Compilation Failures
*   *Scenario:* `@noir-lang/noir_js` fails to compile the witness due to Wasm memory limits or incorrect signature inputs.
*   *Resolution UI:* Never show a generic "Transaction Failed" error. Explicitly state: "Local Proof Generation Failed. Ensure your wallet signature is correct and your device has sufficient memory." Allow a hard reset of the Proving Engine state.

### 3.3 Asynchronous Settlement Delays
*   *Scenario:* The user completes Step 1 (Validation) but the Redemption Service (Step 2) fails or times out.
*   *Resolution UI:* The Claim Terminal must recognize that a Cheque is already marked `Compliance - true` on-chain. If a user returns with the same Magic Link, it should skip Step 1 and ONLY prompt them to execute Step 2 (Redeem Funds).
