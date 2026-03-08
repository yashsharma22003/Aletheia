# Aletheia Workflow Commands

This document contains instructions to run all Chainlink CRE workflows involved in the Aletheia Privacy Payroll Protocol.

Make sure you have your `.env` configured inside `/home/yash/Convergence/aletheiaOld/contracts/.env` with `CRE_ETH_PRIVATE_KEY` for broadcasting transactions on-chain. Add the `--broadcast` flag to actually send transactions, otherwise it runs as a dry-run.

## 1. Compliance Oracle (EVM Log Trigger)
This oracle listens for the `ChequeCreated` event and executes the KYC/AML check.

**Interactive Mode:**
```bash
cd /home/yash/Convergence/aletheiaOld/workflows/compliance_oracle
cre workflow simulate compliance_oracle --target staging-settings -e ../../contracts/.env --broadcast
```
You will be prompted to enter the transaction hash of the `ChequeCreated` event.

**Non-Interactive Mode:**
```bash
cd /home/yash/Convergence/aletheiaOld/workflows/compliance_oracle
cre workflow simulate compliance_oracle \
  --non-interactive \
  --trigger-index 0 \
  --evm-tx-hash <YOUR_TX_HASH> \
  --evm-event-index 0 \
  --target staging-settings \
  -e ../../contracts/.env \
  --broadcast
```

## 2. Proof Oracle (HTTP Trigger)
This oracle receives a JSON payload (the generated ZK proof), computes `keccak256(proof)` inside the DON, and hashes it onto target chains.

**Interactive Mode:**
```bash
cd /home/yash/Convergence/aletheiaOld/workflows/proof_oracle
cre workflow simulate proof_oracle --target staging-settings -e ../../contracts/.env --broadcast
```
*You will be prompted to provide the path to your JSON payload (e.g. `/tmp/oracle_payload.json`)*

**Non-Interactive Mode:**
```bash
cd /home/yash/Convergence/aletheiaOld/workflows/proof_oracle
cre workflow simulate proof_oracle \
  --non-interactive \
  --trigger-index 0 \
  --http-payload @/path/to/your/proof_payload.json \
  --target staging-settings \
  -e ../../contracts/.env \
  --broadcast
```

## 3. Verify Oracle (HTTP Trigger)
Executes at redemption time. Re-hashes the proof provided and verifies it against the `ProofRegistry` on-chain. If it matches, writes the release report to `ComplianceCashier`.

**Interactive Mode:**
```bash
cd /home/yash/Convergence/aletheiaOld/workflows/verify_oracle
cre workflow simulate verify_oracle --target staging-settings -e ../../contracts/.env --broadcast
```

**Non-Interactive Mode:**
```bash
cd /home/yash/Convergence/aletheiaOld/workflows/verify_oracle
cre workflow simulate verify_oracle \
  --non-interactive \
  --trigger-index 0 \
  --http-payload @/path/to/your/verification_payload.json \
  --target staging-settings \
  -e ../../contracts/.env \
  --broadcast
```

## 4. Truth Oracle (Cron Trigger)
Fetches block headers from source chains every 30 minutes and writes state roots to the `TruthRegistry`.

**Run / Simulate:**
```bash
cd /home/yash/Convergence/aletheiaOld/workflows/truth_oracle
cre workflow simulate truth_oracle --target staging-settings -e ../../contracts/.env --broadcast
```
*(If prompted, select the cron trigger. If it's the only trigger, it will just execute immediately).*

## 5. Rebalance Oracle (Cron Trigger)
Monitors liquidity levels across all vaults on different chains and automatically rebalances funds when thresholds are exceeded. Runs every hour to check for surplus and deficit vaults.

**Run / Simulate:**
```bash
cd /home/yash/Convergence/aletheiaOld/workflows/rebalance_oracle
cre workflow simulate rebalance_oracle --target staging-settings -e ../../contracts/.env --broadcast
```
*(If prompted, select the cron trigger. If it's the only trigger, it will just execute immediately).*

**Alternative Local Development:**
```bash
cd /home/yash/Convergence/aletheiaOld/workflows/rebalance_oracle
bun install
bun run start
```
*(This runs the oracle locally in development mode without broadcasting to chain).*
