# Aletheia Frontend: Critical Enforcement Directives

When implementing the frontend based on the Aletheia Master Architecture, the LLM heavily hallucinated or simplified the workflows. **You MUST adhere strictly to the following architectural requirements:**

## 1. Multi-Cheque & Denomination Enforcement (The Mint)
**DO NOT** create a UI that only generates a single cheque. The entire purpose of the `ComplianceCashier` contract is to break a large deposit into multiple discreet cheques for privacy.

*   **Target Chain Selection is Mandatory:** The deposit UI **MUST** include a dropdown for the user to select the `Target Chain` (e.g., Optimism, Arbitrum, Base) where they intend the cheques to be cashed. This `targetChainId` is a required parameter in the smart contract `deposit` and `customDeposit` functions.
*   **Standard Deposit UI:** If the user deposits 1600 USDC, the UI must reflect that the smart contract will automatically break this down into three distinct visual cheques: 1x 1000, 1x 500, and 1x 100.
*   **Custom Deposit UI:** You must also implement the `customDeposit` flow where the user dynamically adds inputs to an array (e.g., `[1000, 500, 100]`) that sums to 1600.
*   **Ledger Rendering:** After minting, the Treasury Ledger must display *every individual cheque generated*, not a single aggregate deposit. It must show the array of predicted determinisitic `chequeIds` returned by the contract predict methods.

## 2. Strict Separation of Proving and Redemption (The Claim Terminal)
**DO NOT** merge "Proving" and "Redemption" into a single button or transaction flow. They are mathematically and temporally distinct actions.

*   **Feature 1: The Validation Phase (The Prove Flow):**
    1.  User enters the `chequeId`.
    2.  Browser fetches MPT proofs from the RPC.
    3.  Browser compiles the Noir Witness using `@noir-lang/noir_js`.
    4.  Browser receives the SNARK.
    5.  User submits an on-chain transaction to `CompliantCashier` purely to register `Compliance - true`. **THIS RELEASES ZERO FUNDS.**
*   **Feature 2: The Settlement Phase (The Redeem Flow):**
    1.  This is a completely separate UI button/action (often done hours or days later).
    2.  The user clicks "Redeem Funds".
    3.  The UI hits the backend Integration API (`POST /api/v1/settlement/redeem`) with the `nullifierHash`.
    4.  The backend (Verification Service) posts the nullifier and triggers the actual ERC20 transfer.

Your React components must treat Feature 1 (Verify) and Feature 2 (Redeem) as entirely separate visual routes, components, or distinct slider stages. Building them as a single click violates the protocol's privacy and asynchronous scaling models.
