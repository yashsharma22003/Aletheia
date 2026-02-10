# Aletheia Workflows

Chainlink CRE workflows for the Aletheia Truth Oracle — a decentralized state root relay that fetches block headers from source chains and writes them to on-chain `TruthRegistry` contracts.

## Architecture

```
Cron Trigger → Fetch Block Headers (EVM Read) → Consensus → Write Report (EVM Write)
                     ↓                                            ↓
              Source Chains                              TruthRegistry Contract
         (via CRE EVM Client)                        (via MockForwarder / KeystoneForwarder)
```

## Project Structure

```
workflows/
├── project.yaml                    # CRE project config (RPCs, targets)
├── .env                            # CRE_ETH_PRIVATE_KEY (not committed)
└── truth_oracle/
    ├── workflow.yaml               # Workflow settings per target
    ├── config.staging.json         # Staging chain configs
    ├── config.production.json      # Production chain configs (placeholder)
    ├── package.json                # Dependencies (@chainlink/cre-sdk, viem, zod)
    └── src/
        └── main.ts                 # Workflow logic
```

## Quick Start

### Prerequisites

- [CRE CLI](https://docs.chain.link/cre) installed globally
- [Bun](https://bun.sh) runtime
- A funded Sepolia wallet

### Setup

```bash
cd truth_oracle && bun install
```

Set your private key in `workflows/.env`:
```
CRE_ETH_PRIVATE_KEY=<your_funded_sepolia_key>
```

### Simulate

```bash
# Dry-run (no on-chain writes)
CRE_TARGET=staging-settings cre workflow simulate truth_oracle --trigger-index 0 --non-interactive

# With broadcast (real on-chain writes)
CRE_TARGET=staging-settings cre workflow simulate truth_oracle --trigger-index 0 --non-interactive --broadcast
```

### Deploy to DON

```bash
CRE_TARGET=staging-settings cre workflow deploy truth_oracle
```

## Configuration

| File | Purpose |
|------|---------|
| `project.yaml` | Global RPCs and target definitions |
| `workflow.yaml` | Per-target workflow name, paths, and RPC overrides |
| `config.staging.json` | Chain IDs, names, and registry addresses for staging |
| `.env` | `CRE_ETH_PRIVATE_KEY` for broadcasting |

## Deployed Contracts

| Network | Contract | Address |
|---------|----------|---------|
| Sepolia | TruthRegistry | `0x9FcdD7C57C515B5aec910e7E7B6B0d62A09000bd` |
| Sepolia | MockForwarder | `0x15fC6ae953E024d975e77382eEeC56A9101f9F88` |
