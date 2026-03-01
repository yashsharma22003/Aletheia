// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/ComplianceCashier.sol";
import "../src/ProofRegistry.sol";
import "../test/MockERC20.sol";

contract DeployAndDeposit is Script {
    function run() external {
        uint256 privateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(privateKey);

        vm.startBroadcast(privateKey);
        console.log("Deployer Address (msg.sender):", deployer);

        // 1. Deploy Mock Token
        MockERC20 token = new MockERC20("Test Token", "TST", 18);

        // 2. Deploy Mock Router (For script compilation, real deployment will need real CCIP routers)
        address mockRouter = address(0x123);

        // 3. Determine Forwarder Address based on Chain ID
        // Using MockKeystoneForwarder addresses for simulate --broadcast
        address forwarder;
        if (block.chainid == 11155420) {
            forwarder = 0xA2888380dFF3704a8AB6D1CD1A8f69c15FEa5EE3; // OP Sepolia
        } else if (block.chainid == 11155111) {
            forwarder = 0x15fC6ae953E024d975e77382eEeC56A9101f9F88; // Ethereum Sepolia
        } else if (block.chainid == 84532) {
            forwarder = 0x82300bd7c3958625581cc2F77bC6464dcEcDF3e5; // Base Sepolia
        } else if (block.chainid == 421614) {
            forwarder = 0xD41263567DdfeAd91504199b8c6c87371e83ca5d; // Arbitrum Sepolia
        } else if (block.chainid == 43113) {
            forwarder = 0x2E7371a5D032489E4F60216d8D898A4C10805963; // Avalanche Fuji
        } else {
            forwarder = address(0x123); // Dummy for local/anvil
        }

        // 4. Deploy Vault
        Vault vault = new Vault(address(token), mockRouter, forwarder);

        // 5. Deploy Cashier
        ComplianceCashier cashier = new ComplianceCashier(
            payable(address(vault)),
            forwarder
        );
        vault.setCashier(address(cashier));

        // 6. Deploy ProofRegistry (uses the same forwarder)
        ProofRegistry registry = new ProofRegistry(forwarder);

        console.log("Token Deployed at:", address(token));
        console.log("Vault Deployed at:", address(vault));
        console.log("Cashier Deployed at:", address(cashier));
        console.log("ProofRegistry Deployed at:", address(registry));

        // 7. Mint & Approve Vault (not cashier)
        token.mint(deployer, 10000 * 10 ** 18);
        token.approve(address(vault), type(uint256).max);

        // 8. Get Predicted Cheques
        uint256 amount = 1600 * 10 ** 18;
        (bytes32[] memory ids, ) = cashier.getPredictedCheques(
            deployer,
            amount
        );

        console.log("Predicting 3 Cheques:");
        console.logBytes32(ids[0]);
        console.logBytes32(ids[1]);
        console.logBytes32(ids[2]);

        // 9. Deposit
        cashier.deposit(amount, 11155111);
        console.log("Deposited 1600 units.");

        vm.stopBroadcast();
    }
}
