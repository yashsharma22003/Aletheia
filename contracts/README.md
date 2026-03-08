# Aletheia Contracts

Solidity smart contracts for the Aletheia Privacy Payroll Protocol, managed and built with [Foundry](https://book.getfoundry.sh/).

## Architecture & Contracts

| Contract | Description |
|----------|-------------|
| `ComplianceCashier.sol` | Source chain entry point. Accepts employer deposits, issues cheques, and safely releases funds during the `verify_oracle` callback. |
| `Vault.sol` | Custodies ERC20 tokens and executes Chainlink CCIP cross-chain message generation and rebalancing. |
| `ProofRegistry.sol` | Target chain registry. It stores the **keccak256 hash** of ZK proofs keyed by `chequeId`, to verify proof existence later. |
| `TruthRegistry.sol` | Stores state roots per chain/block for cross-chain state verification (Storage Proofs). |
| `ReceiverTemplate.sol` | Abstract base for Chainlink CRE consumer contracts. Handles Keystone forwarder validation and ERC165 setup. |

### ProofRegistry Hash Storage Design (Optimization)

A raw ~16KB ZK proof in Ethereum contract storage would cost **10M+ gas** per write. Aletheia optimizes this:
- The `proof_oracle` CRE workflow calculates `keccak256(proof)` inside the DON enclave.
- It writes **only the 32-byte hash** to `ProofRegistry.proofHashes[chequeId]` (costing ~20K gas).
- During redemption, the `verify_oracle` re-hashes the raw proof and asserts that it matches the stored 32-byte hash.

## Getting Started

### Prerequisites

You must have [Foundry / Forge](https://book.getfoundry.sh/) installed.

```bash
curl -L https://foundry.paradigm.xyz | bash
foundryup
```

### Installation & Build

Install the necessary git submodules and compile the smart contracts:

```bash
cd contracts
forge install
forge build
```

### Running Tests

Run the Foundry test suite to execute unit tests and protocol invariants.

```bash
forge test
# or with verbosity for debugging
forge test -vvv
```

## Deployment

### Environment Setup

Create an `.env` file referencing `.env.example`:

```bash
cp .env.example .env
```
Fill in the following variables:
- `PRIVATE_KEY`: Delpoyer's private key
- `OP_SEPOLIA_RPC_URL`: RPC endpoint for Optimism Sepolia
- `ETH_SEPOLIA_RPC_URL`: RPC endpoint for Ethereum Sepolia

### Deploying to Testnet (OP Sepolia)

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

### Known Staging Deployed Addresses

| Network | Contract | Address |
|---------|----------|---------|
| OP Sepolia | ProofRegistry | `0x5725706D4eBa77F5fad3f64f1Bc9EA9E073B60c4` |
| OP Sepolia | MockKeystoneForwarder | `0xA2888380dFF3704a8AB6D1CD1A8f69c15FEa5EE3` |
| Ethereum Sepolia | TruthRegistry | `0x9FcdD7C57C515B5aec910e7E7B6B0d62A09000bd` |
| Ethereum Sepolia | MockKeystoneForwarder | `0x15fC6ae953E024d975e77382eEeC56A9101f9F88` |
