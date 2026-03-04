// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "forge-std/StdJson.sol";
import "../src/Vault.sol";
import "../src/ComplianceCashier.sol";
import "../src/ProofRegistry.sol";
import "../src/TruthRegistry.sol";

/**
 * @title DeployFull
 * @notice Unified deployment script for the entire Aletheia protocol suite.
 *         Deploys Vault, ComplianceCashier, ProofRegistry, TruthRegistry,
 *         wires them together, and writes addresses to config/deployments.json.
 *
 * @dev Reads configuration from environment variables injected by deploy.sh:
 *   DEPLOY_TOKEN           -- ERC20 token address for the Vault
 *   DEPLOY_ROUTER          -- Chainlink CCIP router address
 *   DEPLOY_FORWARDER       -- CRE Keystone Forwarder address (mock or prod)
 *   DEPLOY_CHAIN_NAME      -- Human-readable chain name (used as deployments.json key)
 *   DEPLOY_CHAIN_SELECTORS -- Comma-separated list of other chain CCIP selectors to allowlist
 *   DEPLOY_OUTPUT_PATH     -- Absolute path to write deployments.json (default: config/deployments.json)
 *
 * Usage (direct, single chain):
 *   forge script script/DeployFull.s.sol \
 *     --rpc-url $RPC_URL \
 *     --broadcast \
 *     --sig "run()"
 *
 * Usage (recommended — through deploy.sh):
 *   ./deploy.sh --chain opSepolia [--prod] [--verify] [--dry-run]
 */
contract DeployFull is Script {
    using stdJson for string;

    struct DeployConfig {
        address token;
        address router;
        address forwarder;
        string chainName;
        uint64[] additionalSelectors;
        string outputPath;
    }

    function run() external {
        DeployConfig memory cfg = _loadConfig();
        uint256 privateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(privateKey);

        console.log("=================================================");
        console.log(" Aletheia Protocol -- Full Suite Deployment");
        console.log("=================================================");
        console.log("Chain         :", cfg.chainName);
        console.log("Chain ID      :", block.chainid);
        console.log("Deployer      :", deployer);
        console.log("Token         :", cfg.token);
        console.log("CCIP Router   :", cfg.router);
        console.log("CRE Forwarder :", cfg.forwarder);
        console.log("-------------------------------------------------");

        vm.startBroadcast(privateKey);

        // ── 1. Deploy Vault ──────────────────────────────────────────────
        Vault vault = new Vault(cfg.token, cfg.router, cfg.forwarder);
        console.log("[1/4] Vault deployed           :", address(vault));

        // ── 2. Deploy ComplianceCashier ───────────────────────────────────
        ComplianceCashier cashier = new ComplianceCashier(
            payable(address(vault)),
            cfg.forwarder
        );
        console.log("[2/4] ComplianceCashier deployed:", address(cashier));

        // ── 3. Deploy ProofRegistry ───────────────────────────────────────
        ProofRegistry proofRegistry = new ProofRegistry(cfg.forwarder);
        console.log(
            "[3/4] ProofRegistry deployed    :",
            address(proofRegistry)
        );

        // ── 4. Deploy TruthRegistry ───────────────────────────────────────
        TruthRegistry truthRegistry = new TruthRegistry(cfg.forwarder);
        console.log(
            "[4/4] TruthRegistry deployed    :",
            address(truthRegistry)
        );

        // ── 5. Wire: Vault ↔ Cashier ──────────────────────────────────────
        vault.setCashier(address(cashier));
        console.log("[5] Vault.cashier set to ComplianceCashier");

        // ── 6. Wire: Allowlist destination chains on the Vault ─────────────
        for (uint256 i = 0; i < cfg.additionalSelectors.length; i++) {
            vault.allowlistDestinationChain(cfg.additionalSelectors[i], true);
            console.log(
                "[6] Allowlisted chain selector :",
                cfg.additionalSelectors[i]
            );
        }

        vm.stopBroadcast();

        // ── 7. Write deployment addresses to JSON ─────────────────────────
        _writeDeployments(
            cfg.chainName,
            cfg.outputPath,
            address(vault),
            address(cashier),
            address(proofRegistry),
            address(truthRegistry)
        );

        console.log("-------------------------------------------------");
        console.log(" Deployment complete! Addresses written to:");
        console.log(" ", cfg.outputPath);
        console.log("=================================================");
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  Internal helpers
    // ─────────────────────────────────────────────────────────────────────────

    function _loadConfig() internal view returns (DeployConfig memory cfg) {
        cfg.token = vm.envAddress("DEPLOY_TOKEN");
        cfg.router = vm.envAddress("DEPLOY_ROUTER");
        cfg.forwarder = vm.envAddress("DEPLOY_FORWARDER");
        cfg.chainName = vm.envString("DEPLOY_CHAIN_NAME");
        cfg.outputPath = vm.envOr(
            "DEPLOY_OUTPUT_PATH",
            string("config/deployments.json")
        );

        // Parse comma-separated chain selectors  e.g. "16015286601757825753,5224473277236331295"
        string memory selectorsRaw = vm.envOr(
            "DEPLOY_CHAIN_SELECTORS",
            string("")
        );
        cfg.additionalSelectors = _parseSelectors(selectorsRaw);
    }

    function _parseSelectors(
        string memory raw
    ) internal pure returns (uint64[] memory) {
        if (bytes(raw).length == 0) {
            return new uint64[](0);
        }

        // Count commas to determine array length
        bytes memory b = bytes(raw);
        uint256 count = 1;
        for (uint256 i = 0; i < b.length; i++) {
            if (b[i] == ",") count++;
        }

        uint64[] memory selectors = new uint64[](count);
        uint256 idx = 0;
        uint256 start = 0;

        for (uint256 i = 0; i <= b.length; i++) {
            if (i == b.length || b[i] == ",") {
                // Extract substring [start..i)
                bytes memory part = new bytes(i - start);
                for (uint256 j = start; j < i; j++) {
                    part[j - start] = b[j];
                }
                selectors[idx++] = uint64(_strToUint(string(part)));
                start = i + 1;
            }
        }

        return selectors;
    }

    function _strToUint(
        string memory s
    ) internal pure returns (uint256 result) {
        bytes memory b = bytes(s);
        for (uint256 i = 0; i < b.length; i++) {
            uint8 c = uint8(b[i]);
            // Skip whitespace
            if (c == 32 || c == 9 || c == 10 || c == 13) continue;
            require(
                c >= 48 && c <= 57,
                "DeployFull: invalid digit in chain selector"
            );
            result = result * 10 + (c - 48);
        }
    }

    function _writeDeployments(
        string memory chainName,
        string memory outputPath,
        address vault,
        address cashier,
        address proofRegistry,
        address truthRegistry
    ) internal {
        // Load existing JSON if it exists, otherwise start fresh
        string memory existing;
        try vm.readFile(outputPath) returns (string memory contents) {
            existing = contents;
        } catch {
            existing = "{}";
        }
        // Build the new chain entry
        string memory entry = string.concat(
            '{"vault":"',
            vm.toString(vault),
            '"',
            ',"cashier":"',
            vm.toString(cashier),
            '"',
            ',"proofRegistry":"',
            vm.toString(proofRegistry),
            '"',
            ',"truthRegistry":"',
            vm.toString(truthRegistry),
            '"',
            ',"chainId":',
            vm.toString(block.chainid),
            ',"deployedAt":',
            vm.toString(block.timestamp),
            "}"
        );

        // Write/update the key in the root JSON object
        vm.writeJson(entry, outputPath, string.concat(".", chainName));
    }
}
