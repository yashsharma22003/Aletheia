// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/Vault.sol";

contract DeployVaultOP is Script {
    function run() external {
        uint256 privateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(privateKey);

        // OP Sepolia Config
        address router = 0x114A20A10b43D4115e5aeef7345a1A71d2a60C57;
        address token = 0x5fd84259d66Cd46123540766Be93DFE6D43130D7; // Our USD token
        // CRE Forwarder (Simulation): MockKeystoneForwarder on OP Sepolia
        address forwarder = 0xA2888380dFF3704a8AB6D1CD1A8f69c15FEa5EE3;

        vm.startBroadcast(privateKey);
        console.log("Deploying Vault on OP Sepolia");
        console.log("Deployer:", deployer);
        console.log("Router:", router);
        console.log("Token:", token);
        console.log("Forwarder:", forwarder);

        Vault vault = new Vault(token, router, forwarder);
        console.log("Vault Deployed at:", address(vault));

        vm.stopBroadcast();
    }
}
