// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/Vault.sol";
import "../src/IERC20.sol";

contract DebugVault is Script {
    function run() external {
        uint256 privateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(privateKey);

        address vaultAddress = 0x9AC6F9B50fc8B808a1f8f631618F89500ee2DBce;
        Vault vault = Vault(payable(vaultAddress));
        IERC20 token = vault.token();

        console.log("--- Vault State ---");
        console.log("Vault Address:", vaultAddress);
        console.log("Token Address:", address(token));
        console.log("Forwarder:", vault.getForwarderAddress());
        console.log("Owner:", vault.owner());
        console.log("Vault USDC Balance:", token.balanceOf(vaultAddress));
        console.log("Vault ETH Balance:", vaultAddress.balance);
        console.log(
            "Allowlisted 16015286601757825753:",
            vault.allowlistedChains(16015286601757825753)
        );

        vm.startBroadcast(privateKey);

        // 1. Ensure allowlist is correct (Self transfer for testing)
        if (!vault.allowlistedChains(16015286601757825753)) {
            console.log("Fixing allowlist for Eth Sepolia...");
            vault.allowlistDestinationChain(16015286601757825753, true);
        }

        // 2. Fund with some USDC if balance is low
        uint256 currentBalance = token.balanceOf(vaultAddress);
        if (currentBalance < 10000000) {
            // 10 USDC
            uint256 amountToFund = 50000000; // 50 USDC
            console.log("Funding Vault with USDC...");
            if (token.balanceOf(deployer) >= amountToFund) {
                token.transfer(vaultAddress, amountToFund);
                console.log("Funded 50 USDC.");
            } else {
                console.log(
                    "Warning: Deployer has insufficient USDC to fund Vault."
                );
            }
        }

        vm.stopBroadcast();
    }
}
