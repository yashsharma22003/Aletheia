# Aletheia Contracts

Solidity smart contracts for the Aletheia Truth Oracle, built with [Foundry](https://book.getfoundry.sh/).

## Contracts

| Contract | Description |
|----------|-------------|
| `TruthRegistry.sol` | CRE-compliant contract that stores state roots per chain/block. Inherits `ReceiverTemplate`. |
| `ReceiverTemplate.sol` | Abstract base for CRE consumer contracts. Handles forwarder validation and ERC165. |
| `IReceiver.sol` | Interface for receiving Chainlink CRE reports. |
| `IERC165.sol` | Standard ERC165 interface for contract introspection. |

## Deployment

### Sepolia (Staging)

```bash
source .env
forge script script/DeployTruthRegistry.s.sol \
  --rpc-url https://ethereum-sepolia-rpc.publicnode.com \
  --broadcast --verify \
  --etherscan-api-key $ETHERSCAN_API_KEY
```

**Current deployment:** `0x9FcdD7C57C515B5aec910e7E7B6B0d62A09000bd`

### Forwarder Addresses

| Environment | Contract | Address |
|-------------|----------|---------|
| Simulation | MockKeystoneForwarder | `0x15fC6ae953E024d975e77382eEeC56A9101f9F88` |
| Production | KeystoneForwarder | `0xF8344CFd5c43616a4366C34E3EEE75af79a74482` |

## Build & Test

```bash
forge build
forge test
```
