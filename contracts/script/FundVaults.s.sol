// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/Vault.sol";
import "../src/IERC20.sol";

contract FundVaults is Script {
    function run() external {
        uint256 privateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(privateKey);

        // Sepolia
        address ethVault = 0x9AC6F9B50fc8B808a1f8f631618F89500ee2DBce;
        address ethUSDC = 0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238;

        // OP Sepolia
        address opVault = 0x24539f784823DB3DBec8022b21cAb703dB916037;
        address opUSDC = 0x5fd84259d66Cd46123540766Be93DFE6D43130D7;

        vm.startBroadcast(privateKey);

        if (block.chainid == 11155111) {
            console.log("Funding Eth Sepolia Vault...");
            IERC20(ethUSDC).transfer(ethVault, 1 * 10 ** 6); // 1 USDC
            console.log("Funded 1 USDC to Eth Sepolia Vault.");
        } else if (block.chainid == 11155420) {
            console.log("Funding OP Sepolia Vault...");
            IERC20(opUSDC).transfer(opVault, 1 * 10 ** 18); // 1 Mock USDC (18 decimals)
            console.log("Funded 1 Mock USDC to OP Sepolia Vault.");
        }

        vm.stopBroadcast();
    }
}
