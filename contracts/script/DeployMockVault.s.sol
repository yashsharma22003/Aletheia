// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/Vault.sol";
import "../test/MockERC20.sol";

contract DeployMockVault is Script {
    function run() external {
        uint256 privateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(privateKey);

        vm.startBroadcast(privateKey);
        console.log("Deployer Address (msg.sender):", deployer);

        // 1. Deploy Mock Token
        MockERC20 token = new MockERC20("Test Token", "TST", 18);
        console.log("Mock Token Deployed at:", address(token));

        // 2. Mock Router (Since CCIP router is not strictly needed just for the simulation read/write if we don't broadcast the CCIP part, or we can use the real Sepolia router)
        // Sepolia CCIP Router: 0x0BF3dE8c5D3e8A2B34D2BEeB17ABfCeBaf363A59
        address mockRouter = 0x0BF3dE8c5D3e8A2B34D2BEeB17ABfCeBaf363A59;

        // 3. Deploy Vault (address(0x1) used as dummy forwarder for local/mock deployments)
        Vault vault = new Vault(address(token), mockRouter, address(0x1));
        console.log("Vault Deployed at:", address(vault));

        // 4. Mint some tokens to the vault so simulation has balance > threshold
        token.mint(address(vault), 1000000 * 10 ** 18); // 1 million TST
        console.log("Minted 1,000,000 TST to Vault");

        vm.stopBroadcast();
    }
}
