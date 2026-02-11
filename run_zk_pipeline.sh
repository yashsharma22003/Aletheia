#!/bin/bash
set -e

# Configuration
ANVIL_PORT=8545
RPC_URL="http://127.0.0.1:$ANVIL_PORT"
export PRIVATE_KEY="0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" # Anvil Account 0

echo "=== ZK Verification Pipeline ==="

# 1. Check Dependencies
echo "[1/6] Checking dependencies..."
command -v anvil >/dev/null 2>&1 || { echo >&2 "anvil not found. Install Foundry."; exit 1; }
command -v forge >/dev/null 2>&1 || { echo >&2 "forge not found. Install Foundry."; exit 1; }
command -v bb >/dev/null 2>&1 || { echo >&2 "bb not found. Install Barretenberg."; exit 1; }
command -v nargo >/dev/null 2>&1 || { echo >&2 "nargo not found. Install Noir."; exit 1; }
command -v node >/dev/null 2>&1 || { echo >&2 "node not found. Install Node.js."; exit 1; }

# 2. Start Anvil
echo "[2/6] Starting Anvil..."
# Kill anvil if running on port
fuser -k $ANVIL_PORT/tcp || true

anvil --block-time 1 --port $ANVIL_PORT > anvil.log 2>&1 &
ANVIL_PID=$!
echo "Anvil output logged to anvil.log (PID: $ANVIL_PID)"

# Wait for Anvil to be ready
echo "Waiting for Anvil to respond..."
while ! cast block-number --rpc-url $RPC_URL > /dev/null 2>&1; do
    sleep 1
done
echo "Anvil is ready."

# Cleanup trap
cleanup() {
    echo "Stopping Anvil..."
    kill $ANVIL_PID || true
}
trap cleanup EXIT

# 3. Deploy Contracts
echo "[3/6] Deploying Contracts & Depositing..."
# We need to compile first likely, but forge script handles it.
cd contracts
forge script script/DeployAndDeposit.s.sol --rpc-url $RPC_URL --broadcast --private-key $PRIVATE_KEY > ../deployment.log
cd ..

# Extract Cashier Address
# Search specifically for "Cashier Deployed at: 0x..."
CASHIER_ADDR=$(grep "Cashier Deployed at:" deployment.log | awk '{print $4}')

if [ -z "$CASHIER_ADDR" ]; then
    echo "Error: Could not extract Cashier Address from deployment log."
    cat deployment.log
    exit 1
fi

echo "Cashier deployed at: $CASHIER_ADDR"
export CASHIER_ADDR="$CASHIER_ADDR"

# 4. Generate Proofs Loop
echo "[4/6] Starting Proof Generation Loop (Nonces 0, 1, 2)..."

for NONCE in 0 1 2; do
    echo "---------------------------------------------------"
    echo "Processing Cheque Nonce: $NONCE"
    
    # 4a. Generate Prover.toml inputs
    echo "  > Generating Prover.toml..."
    node scripts/prove_deposit.js $NONCE > script_nonce_$NONCE.log 2>&1
    
    # 4b. Execute Circuit (Generate Witness)
    echo "  > Executing Circuit (Nargo)..."
    cd circuits
    nargo execute > ../execution_nonce_$NONCE.log 2>&1
    
    # 4c. Generate Proof (Barretenberg)
    echo "  > Generating Proof (bb)..."
    # Target path relative to circuits folder
    # Note: witness file is usually target/<package_name>.gz check circuits/Nargo.toml
    # We confirmed package name is 'circuits'.
    
    # bb prove -b ./target/circuits.json -w ./target/circuits.gz --write_vk -o target
    # Wait, bb output can be noisy, let's capture it.
    bb prove -b ./target/circuits.json -w ./target/circuits.gz --write_vk -o target > ../bb_prove_nonce_$NONCE.log 2>&1
    
    # 4d. Verify Proof
    echo "  > Verifying Proof (bb)..."
    if bb verify -p ./target/proof -k ./target/vk > ../bb_verify_nonce_$NONCE.log 2>&1; then
        echo "  ✅ Proof Verified Successfully!"
    else
        echo "  ❌ Proof Verification FAILED!"
        echo "BB Verify Output:"
        cat ../bb_verify_nonce_$NONCE.log
        exit 1
    fi
    
    cd ..
done

echo "========================================"
echo "=== Pipeline Completed Successfully! ==="
echo "========================================"
