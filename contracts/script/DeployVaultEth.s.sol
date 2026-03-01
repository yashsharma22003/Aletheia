// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/Vault.sol";

contract DeployVaultEth is Script {
    function run() external {
        uint256 privateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(privateKey);

        // Ethereum Sepolia Config
        // Router: https://docs.chain.link/ccip/directory/testnet/chain/ethereum-testnet-sepolia
        address router = 0x0BF3dE8c5D3e8A2B34D2BEeB17ABfCeBaf363A59;
        // USDC: https://docs.chain.link/ccip/directory/testnet/chain/ethereum-testnet-sepolia
        address token = 0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238;
        // CRE Forwarder (Simulation): MockKeystoneForwarder
        address forwarder = 0x15fC6ae953E024d975e77382eEeC56A9101f9F88;

        vm.startBroadcast(privateKey);
        console.log("Deploying Vault on Ethereum Sepolia");
        console.log("Deployer:", deployer);
        console.log("Router:", router);
        console.log("Token:", token);
        console.log("Forwarder:", forwarder);

        Vault vault = new Vault(token, router, forwarder);
        console.log("Vault Deployed at:", address(vault));

        vm.stopBroadcast();
    }
}
