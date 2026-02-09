// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/MockToken.sol";
import "../src/Vault.sol";

contract DeployVault is Script {
    function run() external {
        // Anvil default private key #0
        uint256 deployerPrivateKey = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;
        address deployer = vm.addr(deployerPrivateKey);

        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy Mock Token
        MockToken token = new MockToken();
        console.log("MockToken deployed at:", address(token));

        // 2. Deploy Vault
        AletheiaSimpleVault vault = new AletheiaSimpleVault(address(token));
        console.log("Vault deployed at:", address(vault));

        // 3. Mint tokens to deployer
        uint256 mintAmount = 1000 * 10 ** 18; // 1000 tokens
        token.mint(deployer, mintAmount);
        console.log("Minted", mintAmount, "tokens to deployer");

        // 4. Approve Vault to spend tokens
        token.approve(address(vault), type(uint256).max);
        console.log("Approved Vault for spending");

        // 5. Deposit 100 * 10^18 = 1 note of 100
        uint256 depositAmount = 100 * 10 ** 18;
        vault.deposit(depositAmount);
        console.log("Deposited", depositAmount, "to Vault");

        // 6. Check note count
        uint256 noteCount = vault.getNoteCount(deployer, 100);
        console.log("Note count (denom 100):", noteCount);

        vm.stopBroadcast();

        // Output addresses for scripts
        console.log("");
        console.log("=== DEPLOYMENT SUMMARY ===");
        console.log("TOKEN_ADDRESS=%s", address(token));
        console.log("VAULT_ADDRESS=%s", address(vault));
        console.log("DEPLOYER=%s", deployer);
    }
}
