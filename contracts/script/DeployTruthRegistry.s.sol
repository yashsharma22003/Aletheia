// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/TruthRegistry.sol";

contract DeployTruthRegistry is Script {
    // MockForwarder addresses for simulation (Source: Chainlink Docs)
    address constant ETH_SEPOLIA_MOCK =
        0x15fC6ae953E024d975e77382eEeC56A9101f9F88;
    address constant BASE_SEPOLIA_MOCK =
        0x82300bd7c3958625581cc2F77bC6464dcEcDF3e5;
    address constant OP_SEPOLIA_MOCK =
        0xA2888380dFF3704a8AB6D1CD1A8f69c15FEa5EE3;
    address constant ARB_SEPOLIA_MOCK =
        0xD41263567DdfeAd91504199b8c6c87371e83ca5d;
    address constant AVAX_FUJI_MOCK =
        0x2E7371a5D032489E4F60216d8D898A4C10805963;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("CRE_ETH_PRIVATE_KEY");
        address forwarder;

        if (block.chainid == 11155111) {
            forwarder = ETH_SEPOLIA_MOCK;
        } else if (block.chainid == 84532) {
            forwarder = BASE_SEPOLIA_MOCK;
        } else if (block.chainid == 11155420) {
            forwarder = OP_SEPOLIA_MOCK;
        } else if (block.chainid == 421614) {
            forwarder = ARB_SEPOLIA_MOCK;
        } else if (block.chainid == 43113) {
            forwarder = AVAX_FUJI_MOCK;
        } else {
            revert("Unsupported chainId for MockForwarder detection");
        }

        vm.startBroadcast(deployerPrivateKey);

        TruthRegistry registry = new TruthRegistry(forwarder);

        console.log("Chain ID:", block.chainid);
        console.log("Deployed TruthRegistry at:", address(registry));
        console.log("Forwarder set to:", forwarder);

        vm.stopBroadcast();
    }
}
