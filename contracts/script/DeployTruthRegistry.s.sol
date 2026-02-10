// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/TruthRegistry.sol";

contract DeployTruthRegistry is Script {
    // Ethereum Sepolia MockForwarder (for simulation)
    address constant MOCK_FORWARDER =
        0x15fC6ae953E024d975e77382eEeC56A9101f9F88;
    // Ethereum Sepolia KeystoneForwarder (for production)
    address constant KEYSTONE_FORWARDER =
        0xF8344CFd5c43616a4366C34E3EEE75af79a74482;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("CRE_ETH_PRIVATE_KEY");

        // Default to MockForwarder for simulation testing
        // Change to KEYSTONE_FORWARDER for production deployment
        address forwarder = MOCK_FORWARDER;

        vm.startBroadcast(deployerPrivateKey);

        TruthRegistry registry = new TruthRegistry(forwarder);

        console.log("Deployed TruthRegistry at:", address(registry));
        console.log("Forwarder set to:", forwarder);

        vm.stopBroadcast();
    }
}
