// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/ProofRegistry.sol";

contract DeployProofRegistryOP is Script {
    function run() external {
        uint256 privateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(privateKey);

        // OP Sepolia Config
        // CRE Forwarder (Simulation): MockKeystoneForwarder on OP Sepolia
        address forwarder = 0xA2888380dFF3704a8AB6D1CD1A8f69c15FEa5EE3;

        vm.startBroadcast(privateKey);
        console.log("Deploying ProofRegistry on OP Sepolia");
        console.log("Deployer:", deployer);
        console.log("Forwarder:", forwarder);

        ProofRegistry registry = new ProofRegistry(forwarder);
        console.log("ProofRegistry Deployed at:", address(registry));

        vm.stopBroadcast();
    }
}
