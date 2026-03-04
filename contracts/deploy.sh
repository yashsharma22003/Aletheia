#!/usr/bin/env bash
# =============================================================================
#  Aletheia Protocol -- Unified Multi-Chain Deployment Script
#  Usage: ./deploy.sh --chain <name> [options]
# =============================================================================
set -euo pipefail

# ─── Colours ─────────────────────────────────────────────────────────────────
RED='\033[0;31m'; YELLOW='\033[1;33m'; GREEN='\033[0;32m'
CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

# ─── Resolve script root so it works from any CWD ────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NETWORKS_FILE="$SCRIPT_DIR/config/networks.json"
DEPLOYMENTS_FILE="$SCRIPT_DIR/config/deployments.json"
SOL_SCRIPT="script/DeployFull.s.sol"

# ─── Defaults ─────────────────────────────────────────────────────────────────
CHAIN_NAME=""
USE_PROD_FORWARDER=false
VERIFY=false
DRY_RUN=false
RESUME=false
CLEAN=false
SLOW=false
ONLY_VERIFY=false
CHAIN_GROUP=""       # auto-detected: testnets | mainnets

# ─── Help ─────────────────────────────────────────────────────────────────────
usage() {
cat <<EOF
${BOLD}Aletheia Protocol -- Unified Deployment Script${NC}

${BOLD}USAGE${NC}
  ./deploy.sh --chain <name> [options]

${BOLD}REQUIRED${NC}
  --chain <name>      Network name from config/networks.json
                      Testnets : ethSepolia | opSepolia | baseSepolia | arbSepolia | avaxFuji
                      Mainnets : ethereum | optimism | base | arbitrum | avalanche | polygon

${BOLD}OPTIONS${NC}
  --prod              Use production Keystone Forwarder instead of mock forwarder
  --verify            Verify contracts on the block explorer after deploy
  --dry-run           Simulate deployment without broadcasting (no tx sent)
  --resume            Resume a failed deployment using Forge's resume feature
  --clean             Run 'forge clean' before starting the deployment
  --slow              Send transactions one-by-one with more delay (better for flaky RPCs)
  --only-verify       Skip deployment/setup and ONLY verify contracts from deployments.json
  --help              Show this help message

${BOLD}ENVIRONMENT VARIABLES${NC}
  PRIVATE_KEY         Deployer private key (required)
  <CHAIN>_RPC_URL     RPC endpoint for the target chain (see .env.example)
  <CHAIN>_API_KEY     Block explorer API key for --verify (see .env.example)

${BOLD}EXAMPLES${NC}
  # Simulate (no broadcast) against OP Sepolia
  ./deploy.sh --chain opSepolia --dry-run

  # Deploy to Ethereum Sepolia with mock forwarder
  ./deploy.sh --chain ethSepolia

  # Deploy to Optimism mainnet with prod forwarder + verification
  ./deploy.sh --chain optimism --prod --verify

${BOLD}OUTPUT${NC}
  Deployed addresses are written to: config/deployments.json
EOF
}

# ─── Argument parsing ─────────────────────────────────────────────────────────
if [[ $# -eq 0 ]]; then usage; exit 0; fi

while [[ $# -gt 0 ]]; do
  case "$1" in
    --chain)     CHAIN_NAME="$2"; shift 2 ;;
    --prod)      USE_PROD_FORWARDER=true; shift ;;
    --verify)    VERIFY=true; shift ;;
    --dry-run)   DRY_RUN=true; shift ;;
    --resume)    RESUME=true; shift ;;
    --clean)     CLEAN=true; shift ;;
    --slow)      SLOW=true; shift ;;
    --only-verify) ONLY_VERIFY=true; shift ;;
    --help|-h)   usage; exit 0 ;;
    *) echo -e "${RED}Error: Unknown argument: $1${NC}"; usage; exit 1 ;;
  esac
done

# ─── Load .env if present ────────────────────────────────────────────────────
if [[ -f "$SCRIPT_DIR/.env" ]]; then
  set -a; source "$SCRIPT_DIR/.env"; set +a
fi

# ─── Validate jq ─────────────────────────────────────────────────────────────
if ! command -v jq &>/dev/null; then
  echo -e "${RED}Error: 'jq' is required but not installed.${NC}"
  echo "  Install: sudo apt install jq  (or brew install jq on macOS)"
  exit 1
fi

# ─── Validate Private Key ───────────────────────────────────────────────────
if [[ -z "${PRIVATE_KEY:-}" ]]; then
  echo -e "${RED}Error: Environment variable 'PRIVATE_KEY' is not set.${NC}"
  echo "  Set it in your .env file or export it. See .env.example for reference."
  exit 1
fi

# ─── Validate chain name and find it in networks.json ─────────────────────────
if [[ -z "$CHAIN_NAME" ]]; then
  echo -e "${RED}Error: --chain is required.${NC}"; usage; exit 1
fi

# Try testnets first, then mainnets
CHAIN_CFG="$(jq -r ".testnets[\"$CHAIN_NAME\"] // empty" "$NETWORKS_FILE")"
if [[ -n "$CHAIN_CFG" ]]; then
  CHAIN_GROUP="testnets"
else
  CHAIN_CFG="$(jq -r ".mainnets[\"$CHAIN_NAME\"] // empty" "$NETWORKS_FILE")"
  if [[ -n "$CHAIN_CFG" ]]; then
    CHAIN_GROUP="mainnets"
  else
    echo -e "${RED}Error: Chain '$CHAIN_NAME' not found in $NETWORKS_FILE${NC}"
    echo ""
    echo "Available testnets:"
    jq -r '.testnets | keys[]' "$NETWORKS_FILE" | sed 's/^/  /'
    echo "Available mainnets:"
    jq -r '.mainnets | keys[]' "$NETWORKS_FILE" | sed 's/^/  /'
    exit 1
  fi
fi

# ─── Extract chain config ──────────────────────────────────────────────────────
read_cfg() { echo "$CHAIN_CFG" | jq -r "$1"; }

CHAIN_ID="$(read_cfg '.chainId')"
RPC_ENV_VAR="$(read_cfg '.rpcUrlEnvVar')"
CHAIN_SELECTOR="$(read_cfg '.chainSelector')"
ROUTER="$(read_cfg '.router')"
TOKEN="$(read_cfg '.token')"
MOCK_FORWARDER="$(read_cfg '.mockForwarder')"
PROD_FORWARDER="$(read_cfg '.prodForwarder')"
EXPLORER_URL="$(read_cfg '.explorerVerifyUrl')"
EXPLORER_KEY_VAR="$(read_cfg '.explorerApiKeyEnvVar')"

# Select forwarder
if $USE_PROD_FORWARDER; then
  FORWARDER="$PROD_FORWARDER"
  FORWARDER_LABEL="Production"
else
  FORWARDER="$MOCK_FORWARDER"
  FORWARDER_LABEL="Mock (simulation)"
fi

# ─── Resolve RPC URL from environment ─────────────────────────────────────────
if [[ -z "${!RPC_ENV_VAR:-}" ]]; then
  echo -e "${RED}Error: Environment variable '$RPC_ENV_VAR' is not set.${NC}"
  echo "  Set it in your .env file or export it. See .env.example for reference."
  exit 1
fi
RPC_URL="${!RPC_ENV_VAR}"

# ─── Guard against zero-address token/forwarder on mainnet ────────────────────
ZERO_ADDR="0x0000000000000000000000000000000000000000"
if [[ "$TOKEN" == "$ZERO_ADDR" ]]; then
  echo -e "${YELLOW}Warning: token address is zero for '$CHAIN_NAME'. Update networks.json before deploying to this chain.${NC}"
  if $DRY_RUN; then
    echo -e "${YELLOW}Continuing in dry-run mode...${NC}"
  else
    echo -e "${RED}Aborting non-dry-run deployment with zero token address.${NC}"
    exit 1
  fi
fi
if [[ "$FORWARDER" == "$ZERO_ADDR" ]]; then
  echo -e "${YELLOW}Warning: forwarder address is zero for '$CHAIN_NAME'. Update networks.json before deploying to this chain.${NC}"
  if ! $DRY_RUN; then
    echo -e "${RED}Aborting non-dry-run deployment with zero forwarder address.${NC}"
    exit 1
  fi
fi

# ─── Build list of peer chain selectors to allowlist ─────────────────────────
# All chain selectors in the same group EXCEPT the chain being deployed to
ALL_SELECTORS="$(jq -r ".$CHAIN_GROUP | to_entries[] | select(.key != \"$CHAIN_NAME\") | .value.chainSelector" "$NETWORKS_FILE" | paste -sd ',' -)"

# ─── Print deployment summary ─────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${CYAN}══════════════════════════════════════════════════${NC}"
echo -e "${BOLD}${CYAN}  Aletheia — Deployment to: $CHAIN_NAME${NC}"
echo -e "${BOLD}${CYAN}══════════════════════════════════════════════════${NC}"
echo -e "  Chain ID       : ${BOLD}$CHAIN_ID${NC}"
echo -e "  Network group  : $CHAIN_GROUP"
echo -e "  Token          : $TOKEN"
echo -e "  CCIP Router    : $ROUTER"
echo -e "  Forwarder      : $FORWARDER (${FORWARDER_LABEL})"
echo -e "  Peer selectors : ${ALL_SELECTORS:-none}"
echo -e "  Verify         : $VERIFY"
echo -e "  Dry run        : $DRY_RUN"
echo -e "  Output file    : $DEPLOYMENTS_FILE"
echo -e "  Resume         : $RESUME"
echo -e "  Slow           : $SLOW"
echo -e "  Clean          : $CLEAN"
echo -e "${BOLD}${CYAN}══════════════════════════════════════════════════${NC}"
echo ""

# ─── Export DEPLOY_* env vars for the Foundry script ─────────────────────────
export DEPLOY_TOKEN="$TOKEN"
export DEPLOY_ROUTER="$ROUTER"
export DEPLOY_FORWARDER="$FORWARDER"
export DEPLOY_CHAIN_NAME="$CHAIN_NAME"
export DEPLOY_CHAIN_SELECTORS="$ALL_SELECTORS"
export DEPLOY_OUTPUT_PATH="$DEPLOYMENTS_FILE"

# ─── Clean ───────────────────────────────────────────────────────────────────
if $CLEAN; then
  echo -e "${CYAN}Running 'forge clean'...${NC}"
  forge clean
fi

# ─── Build forge command ──────────────────────────────────────────────────────
FORGE_ARGS=(
  forge script "$SOL_SCRIPT"
  --rpc-url "$RPC_URL"
  --chain-id "$CHAIN_ID"
)

if ! $DRY_RUN; then
  FORGE_ARGS+=(--broadcast)
fi

if $VERIFY; then
  if [[ -z "${!EXPLORER_KEY_VAR:-}" ]]; then
    echo -e "${YELLOW}Warning: '$EXPLORER_KEY_VAR' not set — skipping verification.${NC}"
  else
    FORGE_ARGS+=(--verify --verifier etherscan)
    if [[ -n "$EXPLORER_URL" && "$EXPLORER_URL" != "none" ]]; then
      FORGE_ARGS+=(--verifier-url "$EXPLORER_URL")
    fi
    FORGE_ARGS+=(--etherscan-api-key "${!EXPLORER_KEY_VAR}")
  fi
fi

if $RESUME; then
  FORGE_ARGS+=(--resume)
fi

if $SLOW; then
  FORGE_ARGS+=(--slow)
fi

# ─── Verify Existing ──────────────────────────────────────────────────────────
verify_existing() {
  echo -e "${CYAN}Running --only-verify for '$CHAIN_NAME'...${NC}"
  
  if [[ ! -f "$DEPLOYMENTS_FILE" ]]; then
    echo -e "${RED}Error: $DEPLOYMENTS_FILE not found.${NC}"; exit 1
  fi

  # Read addresses from JSON
  V_ADDR="$(jq -r ".\"$CHAIN_NAME\".vault // empty" "$DEPLOYMENTS_FILE")"
  C_ADDR="$(jq -r ".\"$CHAIN_NAME\".cashier // empty" "$DEPLOYMENTS_FILE")"
  P_ADDR="$(jq -r ".\"$CHAIN_NAME\".proofRegistry // empty" "$DEPLOYMENTS_FILE")"
  T_ADDR="$(jq -r ".\"$CHAIN_NAME\".truthRegistry // empty" "$DEPLOYMENTS_FILE")"

  if [[ -z "$V_ADDR" ]]; then
    echo -e "${RED}Error: No deployment found for '$CHAIN_NAME' in $DEPLOYMENTS_FILE${NC}"; exit 1
  fi

  if [[ -z "${!EXPLORER_KEY_VAR:-}" ]]; then
    echo -e "${RED}Error: '$EXPLORER_KEY_VAR' not set. Cannot verify.${NC}"; exit 1
  fi

  echo -e "  Vault         : $V_ADDR"
  echo -e "  Cashier       : $C_ADDR"
  echo -e "  ProofRegistry : $P_ADDR"
  echo -e "  TruthRegistry : $T_ADDR"
  echo ""

  BASE_VERIFY=(
    forge verify-contract
    --chain-id "$CHAIN_ID"
    --verifier etherscan
    --etherscan-api-key "${!EXPLORER_KEY_VAR}"
  )

  if [[ -n "$EXPLORER_URL" && "$EXPLORER_URL" != "none" ]]; then
    BASE_VERIFY+=(--verifier-url "$EXPLORER_URL")
  fi

  echo -e "${CYAN}Verifying Vault...${NC}"
  V_ARGS=$(cast abi-encode "constructor(address,address,address)" "$TOKEN" "$ROUTER" "$FORWARDER")
  "${BASE_VERIFY[@]}" "$V_ADDR" src/Vault.sol:Vault --constructor-args "$V_ARGS" --watch || true

  echo -e "${CYAN}Verifying ComplianceCashier...${NC}"
  C_ARGS=$(cast abi-encode "constructor(address,address)" "$V_ADDR" "$FORWARDER")
  "${BASE_VERIFY[@]}" "$C_ADDR" src/ComplianceCashier.sol:ComplianceCashier --constructor-args "$C_ARGS" --watch || true

  echo -e "${CYAN}Verifying ProofRegistry...${NC}"
  P_ARGS=$(cast abi-encode "constructor(address)" "$FORWARDER")
  "${BASE_VERIFY[@]}" "$P_ADDR" src/ProofRegistry.sol:ProofRegistry --constructor-args "$P_ARGS" --watch || true

  echo -e "${CYAN}Verifying TruthRegistry...${NC}"
  T_ARGS=$(cast abi-encode "constructor(address)" "$FORWARDER")
  "${BASE_VERIFY[@]}" "$T_ADDR" src/TruthRegistry.sol:TruthRegistry --constructor-args "$T_ARGS" --watch || true
  
  echo ""
  echo -e "${GREEN}${BOLD}✓ Verification process finished.${NC}"
}

# ─── Run ───────────────────────────────────────────────────────────────────────
cd "$SCRIPT_DIR"

if $ONLY_VERIFY; then
  verify_existing
  exit 0
fi

echo -e "${BOLD}Running:${NC} ${FORGE_ARGS[*]}"
echo ""

if "${FORGE_ARGS[@]}"; then
  echo ""
  echo -e "${GREEN}${BOLD}✓ Deployment successful!${NC}"
  if [[ -f "$DEPLOYMENTS_FILE" ]]; then
    echo ""
    echo -e "${BOLD}Deployed addresses for '$CHAIN_NAME':${NC}"
    jq -r ".\"$CHAIN_NAME\" // {} | to_entries[] | \"  \(.key): \(.value)\"" "$DEPLOYMENTS_FILE" 2>/dev/null || true
  fi
else
  echo ""
  echo -e "${RED}${BOLD}✗ Deployment failed. See forge output above.${NC}"
  exit 1
fi
