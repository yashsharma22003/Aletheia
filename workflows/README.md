# Aletheia Workflows

Chainlink CRE workflows for the Aletheia Privacy Payroll Protocol. Each workflow is an autonomous DON program that listens for triggers and writes verified reports back on-chain.

## Workflow Overview

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `truth_oracle` | Cron (every 30 min) | Fetches block headers from source chains and writes state roots to `TruthRegistry` |
| `compliance_oracle` | EVM Log (`ChequeCreated`) | Hits KYC/AML API confidentially and marks cheques compliant on `ComplianceCashier` |
| `proof_oracle` | HTTP Trigger | Receives ZK proof from Prover Service, **hashes it with keccak256**, writes `bytes32` hash to `ProofRegistry` |
| `verify_oracle` | HTTP Trigger | Receives proof + recipient from Prover Service at redemption, **re-hashes inside DON enclave**, writes release report to `ComplianceCashier` |

## Architecture

```
[Employer deposits]
        ↓
ComplianceCashier → ChequeCreated event
        ↓
compliance_oracle (KYC/AML check)
        ↓
ComplianceCashier.isCompliant = true

[Prover Service generates ZK proof]
        ↓
proof_oracle (keccak256(proof) → ProofRegistry on target chain)

[Employee redeems via Magic Link]
        ↓
verify_oracle (re-hash inside DON, verify == ProofRegistry hash → release funds)
```

### Why proof_oracle stores a hash, not the full proof

A raw ~16KB ZK proof costs **10M+ gas** to store in contract storage. `proof_oracle` instead:
1. Computes `keccak256(proof)` inside the Chainlink node
2. Writes only the 32-byte hash to `ProofRegistry` (~20K gas)

At redemption, `verify_oracle` re-hashes the proof supplied in calldata within the DON enclave and verifies it matches the registered hash — trustless and tamper-proof.

## Project Structure

```
workflows/
├── project.yaml                    # CRE project config (RPCs, targets)
├── .env                            # CRE_ETH_PRIVATE_KEY (not committed)
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
│   ├── config.staging.json         # registryAddress for each chain
│   └── src/main.ts                 # keccak256(proof) before encoding report
└── verify_oracle/
    ├── workflow.yaml
    ├── config.staging.json         # registryAddress + cashierAddress per chain
    └── src/main.ts                 # re-hash proof, write release report
```

## Quick Start

### Prerequisites

- [CRE CLI](https://docs.chain.link/cre) installed globally
- [Bun](https://bun.sh) or Node.js runtime
- A funded Sepolia/OP Sepolia wallet

### Setup

```bash
# Install deps for each workflow
cd proof_oracle && bun install
cd ../verify_oracle && npm install
```

Set your private key in `workflows/.env`:
```
CRE_ETH_PRIVATE_KEY=<your_funded_key>
```

### Simulate

```bash
# Simulate proof_oracle (stores keccak256(proof) on-chain)
cd proof_oracle
cre workflow simulate proof_oracle --target staging-settings -e ../contracts/.env --broadcast
# Input: /tmp/oracle_payload.json  { chequeId, proof, targetChainId }

# Simulate verify_oracle (re-hash + release funds via ComplianceCashier)
cd ../verify_oracle
cre workflow simulate verify_oracle --target staging-settings -e ../contracts/.env --broadcast
# Input: { chequeId, proof, recipient, sourceChainId, targetChainId }
```

## Configuration

| File | Purpose |
|------|---------|
| `project.yaml` | Global RPCs and target definitions |
| `workflow.yaml` | Per-target workflow name, paths, and RPC overrides |
| `config.staging.json` | Chain IDs, names, contract addresses for staging |
| `.env` | `CRE_ETH_PRIVATE_KEY` for broadcasting |

## Deployed Contracts

| Network | Contract | Address |
|---------|----------|---------|
| OP Sepolia | ProofRegistry | `0x5725706D4eBa77F5fad3f64f1Bc9EA9E073B60c4` |
| OP Sepolia | MockKeystoneForwarder | `0xA2888380dFF3704a8AB6D1CD1A8f69c15FEa5EE3` |
| Ethereum Sepolia | TruthRegistry | `0x9FcdD7C57C515B5aec910e7E7B6B0d62A09000bd` |
| Ethereum Sepolia | MockKeystoneForwarder | `0x15fC6ae953E024d975e77382eEeC56A9101f9F88` |
