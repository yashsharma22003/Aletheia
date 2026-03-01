# verify_oracle Workflow

Chainlink CRE workflow that handles the **employee redemption path** for the Aletheia Privacy Payroll Protocol.

## How It Works

1. **HTTP Trigger** fires when the Prover Service receives a redemption request from an employee
2. The workflow receives `{ chequeId, proof, recipient, sourceChainId, targetChainId }`
3. **Inside the DON enclave**, it computes `keccak256(proof)` to re-derive the proof hash
4. Verifies the hash matches what `proof_oracle` registered in `ProofRegistry` on the target chain
5. **Writes a release report** `(payloadType=1, chequeId, proofHash, recipient)` to `ComplianceCashier` on the source chain via the Chainlink Forwarder

## Why This Design?

The full ZK proof (~16KB) is **never stored on-chain** — only its `keccak256` hash is registered by `proof_oracle`. At redemption:

- The proof travels in **calldata** (employee submits it to the Prover Service)
- `verify_oracle` re-hashes it inside the trustless DON enclave
- If the hash matches `ProofRegistry.proofHashes[chequeId]`, funds are released

This means proof authenticity is guaranteed without the cost of on-chain proof storage.

## Files

| File | Purpose |
|------|---------|
| `src/main.ts` | Workflow logic — parse payload, hash proof, write release report |
| `workflow.yaml` | CRE target settings (workflow name, paths, RPCs) |
| `config.staging.json` | Per-chain `registryAddress` (ProofRegistry) and `cashierAddress` (ComplianceCashier) |
| `secrets.yaml` | DON vault secrets (none required at this stage) |

## Simulate

```bash
cd verify_oracle && npm install

cre workflow simulate verify_oracle --target staging-settings -e ../contracts/.env --broadcast
```

When prompted for JSON input:
```json
{
  "chequeId": "0x...",
  "proof": "0x...",
  "recipient": "0x...",
  "sourceChainId": 11155111,
  "targetChainId": 11155420
}
```

## Configuration

Before running, fill in `config.staging.json`:
- `registryAddress` — `ProofRegistry` address on the **target chain** (OP Sepolia: `0x5725706D4eBa77F5fad3f64f1Bc9EA9E073B60c4`)
- `cashierAddress` — `ComplianceCashier` address on the **source chain**
