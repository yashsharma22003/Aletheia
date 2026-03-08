# Aletheia Workflows

Chainlink CRE (Custom Runtime Extension) workflows for the Aletheia Privacy Payroll Protocol. Each workflow is an autonomous DON program that listens for triggers and writes verified cryptographic reports back on-chain.

## Workflow Overview

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `truth_oracle` | Cron (every 30 min) | Fetches block headers from source chains and writes MPT state roots to `TruthRegistry` to synchronize state across chains. |
| `compliance_oracle` | EVM Log (`ChequeCreated`) | Hits KYC/AML API confidentially inside the DON enclave and marks cheques compliant on the source chain `ComplianceCashier`. |
| `proof_oracle` | HTTP Trigger | Receives massive 50MB ZK proofs from the Prover Service, **hashes them with keccak256**, and writes ONLY the `bytes32` hash fingerprint to `ProofRegistry` on the target chain. |
| `verify_oracle` | HTTP Trigger | Receives proof + receiver address from the Prover Service at redemption. It **re-hashes the proof inside the DON enclave**, checks it against `ProofRegistry`, and writes the release report to `ComplianceCashier`. |
| `rebalance_oracle` | Cron (every 1 hour) | Monitors vault balances across all networks against thresholds, and automatically initiates CCIP transfers to route liquidity from surplus to deficit vaults. |

## Key Architecture & Cost Optimization

A raw ~16KB ZK SNARK proof costs **over 10,000,000 gas** to store in Ethereum contract storage directly.

The `proof_oracle` acts as an ingenious optimization:
1. It computes `keccak256(proof)` *inside* the Chainlink DON securing the enclave.
2. It writes only the 32-byte hash fingerprint to `ProofRegistry` (~20,000 gas, saving thousands of dollars per transaction).
3. At redemption, the `verify_oracle` re-hashes the proof supplied in calldata within the DON enclave and verifies it matches the registered hash, ensuring it's trustless and tamper-proof.

## Project Structure

```text
workflows/
├── project.yaml                    # CRE project config (RPCs, targets)
├── .env                            # CRE_ETH_PRIVATE_KEY (required for simulating)
├── truth_oracle/
│   ├── workflow.yaml
│   ├── config.staging.json
│   └── src/main.ts
├── compliance_oracle/
│   ├── workflow.yaml
│   ├── config.staging.json
│   └── src/main.ts
├── proof_oracle/
│   ├── workflow.yaml
│   ├── config.staging.json         
│   └── src/main.ts                 # keccak256(proof) before encoding report
├── rebalance_oracle/
│   ├── workflow.yaml
│   ├── config.staging.json         
│   └── src/main.ts                 # cross-chain liquidity routing via CCIP
└── verify_oracle/
    ├── workflow.yaml
    ├── config.staging.json         
    └── src/main.ts                 # re-hash proof, write release report
```

## Getting Started

### Prerequisites

- [Chainlink CRE CLI](https://docs.chain.link/cre) installed globally.
- [Bun](https://bun.sh) or Node.js runtime.
- A funded wallet for deploying to EVM Sepolia/OP Sepolia.

### 1. Installation

Install the Node.js packages inside each workflow directory:

```bash
cd workflows
cd proof_oracle && bun install
cd ../verify_oracle && npm install
cd ../compliance_oracle && npm install
cd ../truth_oracle && npm install
cd ../rebalance_oracle && bun install
```

### 2. Environment Variables

Set your deployment private key in the base `workflows` folder by creating a `.env`:

```bash
cp .env.example .env
```
Ensure you set:
```env
CRE_ETH_PRIVATE_KEY=0xYourFundedPrivateKeyHere
```

### 3. Simulating Oracles (Local Execution)

You can run individual workflows locally to test the CRE logic against actual deployed contracts.

**Simulate proof_oracle (generates fingerprint):**
```bash
cd proof_oracle
# Needs a JSON payload: { chequeId, proof, targetChainId }
cre workflow simulate proof_oracle --target staging-settings -e ../contracts/.env --broadcast
```

**Simulate verify_oracle (releases funds):**
```bash
cd ../verify_oracle
# Needs an input payload: { chequeId, proof, recipient, sourceChainId, targetChainId }
cre workflow simulate verify_oracle --target staging-settings -e ../contracts/.env --broadcast
```

**Simulate rebalance_oracle (cron execution):**
```bash
cd ../rebalance_oracle
cre workflow simulate rebalance_oracle --target staging-settings -e ../contracts/.env --broadcast
```

## Configuration

- `project.yaml`: Global RPC endpoints and workflow definitions.
- `workflow.yaml`: Execution setup and targets for each specific workflow.
- `config.staging.json`: Contract definitions for that specific piece of the topology.
