// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/ComplianceCashier.sol";
import "../test/MockERC20.sol";

contract DeployAndDeposit is Script {
    function run() external {
        uint256 privateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(privateKey);

        vm.startBroadcast(privateKey);
        console.log("Deployer Address (msg.sender):", deployer);

        // 1. Deploy Mock Token
        MockERC20 token = new MockERC20("Test Token", "TST", 18);

        // 2. Deploy Cashier
        // Use a dummy forwarder for local test
        address forwarder = address(0x123);
        ComplianceCashier cashier = new ComplianceCashier(
            address(token),
            forwarder
        );

        console.log("Token Deployed at:", address(token));
        console.log("Cashier Deployed at:", address(cashier));

        // 3. Mint & Approve
        token.mint(deployer, 10000 * 10 ** 18);
        token.approve(address(cashier), type(uint256).max);

        // 4. Get Predicted Cheques
        uint256 amount = 1600 * 10 ** 18;
        (bytes32[] memory ids, ) = cashier.getPredictedCheques(
            deployer,
            amount
        );

        console.log("Predicting 3 Cheques:");
        console.logBytes32(ids[0]);
        console.logBytes32(ids[1]);
        console.logBytes32(ids[2]);

        // 5. Deposit
        cashier.deposit(amount, 11155111);
        console.log("Deposited 1600 units.");

        vm.stopBroadcast();
    }
}
