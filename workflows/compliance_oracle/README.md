# Truth Oracle Workflow

Fetches the latest block headers from configured chains and writes state roots to on-chain `TruthRegistry` contracts via Chainlink CRE.

## How It Works

1. **Cron Trigger** fires every 30 minutes
2. **EVM Read** fetches the latest block header (number + hash) from each configured chain
3. **Consensus** signs the aggregated report across DON nodes
4. **EVM Write** submits the signed report to `TruthRegistry.onReport()` via the Chainlink Forwarder

## Files

| File | Purpose |
|------|---------|
| `src/main.ts` | Workflow logic — fetch, encode, write |
| `workflow.yaml` | CRE target settings (workflow name, paths, RPCs) |
| `config.staging.json` | Sepolia chain config with deployed registry address |
| `config.production.json` | Multi-chain production config (placeholder) |
