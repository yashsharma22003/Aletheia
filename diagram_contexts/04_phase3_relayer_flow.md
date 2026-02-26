# Context: Phase 3 - Relayer & Settlement Flow

Use this context to generate a detailed flowchart or sequence diagram specifically for Phase 3 of the Aletheia Protocol: The Async Redemption Service.

## 1. Core Purpose
Phase 3 executes the actual transfer of the ERC20 salary to the employee's destination wallet. It relies on a TEE Verification Service that takes the employee's claim (signature), verifies the ZK Proof natively inside the enclave, and then pays the gas fees to settle the transaction on the employee's behalf if the proof is valid.

## 2. Main Environments
1. **Target Blockchain (e.g. OP Sepolia):** Where the `ProofRegistry` holds the `chequeId => proofHex` mapping.
2. **Source Blockchain (e.g. Base/Optimism):** Where the `ComplianceCashier` actually holds the ERC20 funds.
3. **TEE Verification Service (CC Enclave):** The secure backend (e.g., AWS Nitro) that verifies the employee's signature, validates the proof natively against the `ProofRegistry`, and acts as the meta-transaction relayer.
4. **Employee Frontend:** The client device that initiates the final claim request.

## 3. Step-by-Step Data Flow
1. **Redemption Request:** The Employee Frontend fires an HTTP POST to the TEE Verification Service's `/redeem` endpoint. It passes the `chequeId`, the `recipientAddress`, and an ECDSA signature of `(chequeId, recipientAddress)`.
2. **Proof Retrieval:** The TEE Verification Service queries the `ProofRegistry` on the Target Chain for the `proofHex` associated with the provided `chequeId`.
3. **Native Verification (Inside TEE):** 
    * The TEE recovers the employee's address from the signature and compares it to the intended recipient to prevent hijacking.
    * The TEE runs the native Noir C++ verifier (`bb verify`) inside the secure boundary against the retrieved `proofHex`.
    * It computes the `nullifierHash` securely.
4. **Compliance Verification:** The TEE Verification Service immediately pings the `ComplianceCashier` on the Source Chain to ensure `isCompliant == true` and that the `nullifierHash` is not already used.
5. **Meta-Transaction Assembly:** The TEE Verification Service packages the `nullifierHash` and `recipientAddress` into a single EVM payload.
6. **Relayer Sponsorship:** The TEE Verification Service signs the payload using its own funded hot-wallet (meaning the Employee does not need to pay Ethereum gas fees).
7. **Execution:** The Relayer broadcasts the transaction to the `ComplianceCashier` on the Source Chain.
8. **Settlement Engine:** The Smart Contract parses the transaction:
    * It checks if the `nullifierHash` exists in the local `usedNullifiers` mapping.
    * It saves the `nullifierHash` to `usedNullifiers = true` (preventing double-spend).
    * It unlocks the ERC20 funds and transfers them to the `recipientAddress`.

## 4. Key Bottlenecks / Security Constraints to Highlight
*   **Enclave Privacy:** Highlight that the TEE Verification Service verifies the proof *off-chain* in a hardware enclave. The `chequeId` (which links back to the employer deposit) is used inside the TEE to fetch the proof, but the TEE only posts the `nullifierHash` to the public blockchain, preserving complete privacy.
*   **Double-Spend Sybil Protection:** Visually emphasize step 8. The `nullifierHash` is incredibly vital; it acts as the consumed receipt to prevent the employee from draining the Cashier multiple times.
