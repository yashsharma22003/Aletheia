# Context: Phase 3 - Relayer & Settlement Flow

Use this context to generate a detailed flowchart or sequence diagram specifically for Phase 3 of the Aletheia Protocol: The Async Redemption Service.

## 1. Core Purpose
Phase 3 executes the actual transfer of the ERC20 salary to the employee's destination wallet. Because the ZK Proof cross-chain teleportation (Phase 2) takes several minutes to finalize, Phase 3 relies on an asynchronous relayer that blindly polls the destination smart contract until the Proof is confirmed, and then pays the gas fees to settle the transaction on the employee's behalf.

## 2. Main Environments
1. **Target Blockchain (e.g. OP Sepolia):** Where the `ProofRegistry` holds the `chequeId => proofHex` mapping.
2. **Source Blockchain (e.g. Base/Optimism):** Where the `ComplianceCashier` actually holds the ERC20 funds.
3. **Sync Relayer API (Node.js):** The backend automation script that orchestrates the final meta-transaction using a funded hot wallet.
4. **Employee Frontend:** The client device that initiates the final claim request.

## 3. Step-by-Step Data Flow
1. **Redemption Request:** The Employee Frontend fires an HTTP POST to the Sync Relayer's `/redeem` endpoint. It passes the `chequeId`, the mathematically bound `nullifierHash`, and the destination `recipientAddress`.
2. **Compliance Verification:** The Sync Relayer immediately pings the `ComplianceCashier` on the Source Chain to ensure `isCompliant == true`. If false, the transaction aborts (meaning the deposit violated Phase 1 KYC policies).
3. **Async Proof Polling:** The Sync Relayer pings the `ProofRegistry` on the Target Chain. It searches the mappings for the `chequeId`. 
    * *Nuance:* Because of CCIP finality latency, the Proof might not be there yet. The Relayer loops this check every 15 seconds until a valid `proofHex` is returned.
4. **Meta-Transaction Assembly:** Once the `proofHex` is retrieved from the Target Chain, the Sync Relayer packages the `nullifierHash`, `recipientAddress`, and the `proofHex` into a single EVM payload.
5. **Relayer Sponsorship:** The Sync Relayer signs the payload using its own funded hot-wallet (meaning the Employee does not need to pay Ethereum gas fees to receive their salary).
6. **Execution:** The Relayer broadcasts the transaction to the `ComplianceCashier` on the Source Chain.
7. **Settlement Engine:** The Smart Contract parses the transaction:
    * It verifies the ZK SNARK Proof mathematically against the Target Chain's state root.
    * It checks if the `nullifierHash` exists in the local `usedNullifiers` mapping.
    * It saves the `nullifierHash` to `usedNullifiers = true` (preventing double-spend).
    * It unlocks the ERC20 funds and transfers them to the `recipientAddress`.

## 4. Key Bottlenecks / Security Constraints to Highlight
*   **Zero-Knowledge Barrier:** Highlight that the Sync Relayer and Smart Contract NEVER see the `chequeId` included in the execution payload. They legally only see the `nullifierHash` and the `recipientAddress`. Because the ZK Proof validates the internal logic, the identity and specific deposit transaction are perpetually anonymized.
*   **Double-Spend Sybil Protection:** Visually emphasize step 7. The `nullifierHash` is incredibly vital; without it, an attacker could replay the exact same `proofHex` infinitely to drain the Cashier. It acts as the consumed receipt.
