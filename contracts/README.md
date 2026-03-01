# Aletheia Contracts

Solidity smart contracts for the Aletheia Privacy Payroll Protocol, built with [Foundry](https://book.getfoundry.sh/).

## Contracts

| Contract | Description |
|----------|-------------|
| `ComplianceCashier.sol` | Source chain entry point. Accepts employer deposits, issues cheques, and releases funds upon verified redemption. |
| `Vault.sol` | Custodies ERC20 tokens and executes CCIP cross-chain rebalancing. |
| `ProofRegistry.sol` | Target chain registry that stores **keccak256 hashes** of ZK proofs keyed by `chequeId`. Stores a `bytes32` hash only — not the full proof — to keep gas costs minimal (~20K gas vs ~10M for raw bytes). |
| `TruthRegistry.sol` | Stores state roots per chain/block for cross-chain state verification. |
| `ReceiverTemplate.sol` | Abstract base for CRE consumer contracts. Handles forwarder validation and ERC165. |

### ProofRegistry — Hash Storage Design

Storing a raw ~16KB ZK proof in contract storage costs **10M+ gas** per write. `ProofRegistry` instead stores `keccak256(proof)` — a single 32-byte slot.

```
proof_oracle workflow: keccak256(proof) → ProofRegistry.proofHashes[chequeId]
verify_oracle workflow: keccak256(proof supplied in calldata) == proofHashes[chequeId] → release funds
```

Public interface:
- `proofHashes(bytes32 chequeId) → bytes32` — the stored hash
- `verifyProof(bytes32 chequeId, bytes proof) → bool` — re-hashes and checks on-chain

## Deployment

### OP Sepolia (Staging)

```bash
source .env

# Deploy ProofRegistry
forge script script/DeployProofRegistryOP.s.sol \
  --rpc-url $OP_SEPOLIA_RPC_URL \
  --private-key $PRIVATE_KEY \
  --broadcast -vvv

# Deploy Vault
forge script script/DeployVaultOP.s.sol \
  --rpc-url $OP_SEPOLIA_RPC_URL \
  --private-key $PRIVATE_KEY \
  --broadcast -vvv
```

### Deployed Addresses

| Network | Contract | Address |
|---------|----------|---------|
| OP Sepolia | ProofRegistry | `0x5725706D4eBa77F5fad3f64f1Bc9EA9E073B60c4` |
| OP Sepolia | MockKeystoneForwarder | `0xA2888380dFF3704a8AB6D1CD1A8f69c15FEa5EE3` |
| Ethereum Sepolia | TruthRegistry | `0x9FcdD7C57C515B5aec910e7E7B6B0d62A09000bd` |
| Ethereum Sepolia | MockKeystoneForwarder | `0x15fC6ae953E024d975e77382eEeC56A9101f9F88` |

## Build & Test

```bash
forge build
forge test
```
