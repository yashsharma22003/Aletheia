# Aletheia Demo Video Script (Chainlink Hackathon)

**Target Video Length:** 2.5 - 3 Minutes  
**Goal:** Show the problem, present Aletheia's solution visually, and map out the 3 phases of privacy-preserving cross-chain salary payments using Chainlink CRE and ZK Proofs.

---

### [0:00 - 0:30] Introduction: The Problem & The Solution
**Visuals:**
- Start on a slide highlighting the problem: "Web3 Payroll is broken: Public ledgers expose employee salaries."
- Transition to the Aletheia Landing Page (`/` route). Scroll briefly to show the clean, dynamic interface.
- Point to the Architecture diagram (Slide or Graphic if possible) showing Employer -> Chainlink CCIP/CRE -> Employee.
- Emphasize the tech stack icons: Chainlink, Noir (ZK), and TEE.

**Voiceover:**
> "Hi, welcome to Aletheia! We solve a major problem in Web3 adoption: How do companies pay their employees on a public blockchain without exposing everyone's salary and metadata to the world? Aletheia enables Cross-Chain Privacy Payroll. By combining Zero-Knowledge Proofs, Chainlink CCIP, and Secure Execution Environments, we let employers deposit funds on one chain, and allow employees to withdraw them on another, totally privately."

---

### [0:30 - 1:15] Phase 1: The Deposit & Compliance Gate
**Visuals:**
- Click **"Open Treasury"** and connect a wallet as the **Employer**.
- Switch MetaMask/Wallet to **Base Sepolia** (Source Chain).
- In the Treasury dashboard, fill in details to mint a new "Confidential Cheque".
  - Enter Denomination (e.g., 1000 USDC).
  - Select Target Chain (e.g., Optimism Sepolia).
  - Generate the "Magic Link" (Cheque ID).
- Click **Mint**. Confirm the transaction in the wallet.
- *Crucial Highlight:* Show a visual graphic or mention that this triggers the **Chainlink `compliance_oracle`**.

**Voiceover:**
> "Let's see it in action. I'm the Employer, connected to Base Sepolia. I want to pay an employee 1000 USDC on Optimism, privately. I enter the amount and generate a secure cheque. When I hit 'Mint', the smart contract doesn't just hold the funds; it triggers a Chainlink Custom Runtime Extension (CRE) workflow called the `compliance_oracle`. This oracle securely performs off-chain KYC checks inside a secure enclave without ever leaking the employee's data on-chain."

---

### [1:15 - 1:55] Phase 2: Generating the ZK Proof (The Prover)
**Visuals:**
- Copy the generated Magic Link or Cheque ID.
- Open a new tab or incognito window to represent the background Prover/Employer service. Paste the Magic Link.
- This opens the **Prover Portal** (`/claim/prove`). 
- Show the UI indicating the Compliance Gate has passed.
- Click **Generate ZK Proof**. Show the loader indicating Barretenberg synthesis.
- After generation, the UI says "Proof Registered On-Chain". 
- *Crucial Highlight:* Explain that this hits the **Chainlink `proof_oracle`**.

**Voiceover:**
> "Once compliance is passed, the employer's backend generates a massive 50MB Zero-Knowledge proof establishing the right to these funds. But putting 50MB on Ethereum would cost thousands of dollars! Instead, we send this proof to our second CRE workflow, the `proof_oracle`. It compresses the massive proof into a tiny 32-byte fingerprint and registers ONLY that fingerprint onto the destination chain, reducing gas costs practically to zero."

---

### [1:55 - 2:40] Phase 3: The Private Withdrawal (The Employee)
**Visuals:**
- Switch to the **Claimant Portal** (`/claim/redeem`).
- Connect a DIFFERENT wallet as the **Employee**.
- Ensure the wallet is on the Target Chain (**Optimism Sepolia**).
- Paste the exact same Cheque ID / Magic Link. 
- Click **Redeem Cheque**.
- Wait for the transaction to confirm. Show the successful "Funds Settled" screen and the updated USDC balance in the employee's wallet.
- *Crucial Highlight:* Explain the **Chainlink `verify_oracle`** handles the settlement asynchronously.

**Voiceover:**
> "Finally, I'm the Employee. I want to claim my salary on Optimism. If I claim standardly, people will track my wallet. But with Aletheia, I don't submit my proof publicly. I give my secret slip to the Chainlink `verify_oracle`. This secure oracle double-checks the math against the fingerprint we saved earlier, and talks to the blockchain *on my behalf*. The blockchain releases the USDC, but the public record never links my withdrawal to my employer's deposit."

---

### [2:40 - 3:00] Conclusion & Future Outlook
**Visuals:**
- Switch back to the Aletheia Landing Page or a concluding slide.
- Highlight the "Chainlink CC Migration Plan" text from the README or Whitepaper.

**Voiceover:**
> "We've created a zero-burden settlement system for employees and a fully compliant privacy protocol for employers. Aletheia is built strictly around the paradigms of the Chainlink Confidential Compute whitepaper, meaning we are completely ready to migrate to live CC enclaves on mainnet. Thank you for watching!"
