# Aletheia Protocol - Presentation Context

*Upload this document directly to ChatGPT/Claude to generate a flowing presentation script and slide deck outline for your hackathon pitch.*

## What is Aletheia?
**Tagline:** Enabling completely private salary payments across blockchains.
**Elevator Pitch:** Aletheia is a cross-chain privacy protocol that allows Web3 companies to pay their teams securely while keeping employee identities, metadata, and payment amounts completely invisible to the public. It relies on a combination of Zero-Knowledge Proofs (Noir), Chainlink Cross-Chain Interoperability Protocol (CCIP), and Chainlink Custom Runtime Extensions (CRE) running inside Trusted Execution Environments (TEEs).

## The Core Problem
1. **Public Ledgers Expose Salaries:** Blockchains are fundamentally transparent. Paying an employee on-chain reveals the company's treasury, the employee's wallet address, and exactly how much they make to the entire world.
2. **Current Privacy Solutions are Flawed:**
   - They fail basic compliance checks (no KYC/AML functionality without doxxing).
   - Sending heavy cryptographic proofs (Zero-Knowledge) on-chain is prohibitively expensive (putting a 50MB proof file on Ethereum costs >$1,000 in gas fees).
   - "Tornado Cash"-style mixers are heavily scrutinized by regulators and don't fit enterprise payroll needs.

## The Aletheia Solution (How It Works)
Aletheia splits the privacy operation into three distinct phases, entirely abstracted away from the end user through a clean frontend interface and Chainlink CRE Oracles in the background.

### Phase 1: Deposit & The Privacy Gate
- **Action:** Employer deposits USDC into the source chain (e.g., Base).
- **The Tech:** To remain legally compliant without doxxing the employee, Aletheia intercepts the deposit and triggers the **Chainlink `compliance_oracle`**. 
- **The Magic:** This oracle performs a background check (KYC/AML) using "Confidential HTTP" inside a secure hardware enclave. It encrypts the "Thumbs Up" result and puts *only* that on the blockchain. The user is approved, but their identity is never publicly revealed.

### Phase 2: Generating the "Secret Proof"
- **Action:** Employer's backend generates a Zero-Knowledge proof confirming the employee is owed the funds.
- **The Tech:** Because the proof is a massive 50MB file, we use a **Chainlink `proof_oracle`** running in a TEE.
- **The Magic:** Instead of posting the 50MB file to the blockchain, the `proof_oracle` compresses it down into a tiny 32-byte fingerprint (a hash). It registers only this tiny fingerprint on the target blockchain. This reduces on-chain gas costs from thousands of dollars to pennies.

### Phase 3: The Private Withdrawal
- **Action:** Employee goes to the "Claimant Portal" to withdraw funds on the destination chain (e.g., Optimism).
- **The Tech:** To prevent on-chain linking between the employer and employee, we use a **Chainlink `verify_oracle`** acting as an asynchronous relayer.
- **The Magic:** The employee signs a secret off-chain permission slip and hands it to the `verify_oracle`. The oracle verifies the math against the 32-byte fingerprint from Phase 2, and then asks the blockchain to release the money *on behalf of* the employee. The public ledger never sees a transaction linking the employee directly to the employer's deposit.

## Key Technical Achievements & Chainlink Integrations
- **Chainlink Custom Runtime Extension (CRE):** We built distinct oracle workflows (`compliance_oracle`, `proof_oracle`, `verify_oracle`, `truth_oracle`, `rebalance_oracle`) that securely move data, proofs, and compliance checks off-chain.
- **Chainlink CCIP Integration:** To facilitate trustless movement of value across the supported EVM chains.
- **Ready for Chainlink Confidential Compute (CC):** Aletheia's architecture is explicitly mapped to the *Chainlink Confidential Compute Whitepaper*. The mock TEE infrastructure currently built is designed to seamlessly port into Chainlink CC Enclaves the moment it goes live on mainnet, natively getting threshold encryption and Zero-Knowledge attestation.
- **Zero-Knowledge Circuitry (Noir):** MPT Storage proofs to guarantee cross-chain state flawlessly.

## Competitive Edge / "Why We Win"
1. **Zero-Burden for Employees:** Employees don't generate massive ZK proofs on their laptops. The architecture shifts the heavy computational burden to the employers and the Secure Enclaves.
2. **Built-In Compliance:** Enterprise-grade payroll needs KYC. We successfully embed KYC into a privacy mixer without breaking the privacy guarantees, via Chainlink Oracles.
3. **Cross-Chain Native:** Deposit on Base, pay on Optimism. Aletheia automatically unifies liquidity across Ethereum Layer 2s.

## Prompt Instructions for LLM:
*When feeding this to an LLM, use the following prompt:*
> "I am participating in a Chainlink hackathon and building a cross-chain privacy payroll application called Aletheia. Based on the context provided, please generate a 10-slide pitch deck presentation script. Give me the Titles, Visual concepts, and a concise speaker script for each slide that highlights our technical depth, Chainlink integration, and the massive market opportunity for private enterprise payroll in Web3."
