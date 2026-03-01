// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/Vault.sol";

contract SetupVault is Script {
    // Forwarder addresses from Chainlink CRE documentation
    // Simulation: MockKeystoneForwarder
    address constant ETH_SEPOLIA_MOCK_FORWARDER =
        0x15fC6ae953E024d975e77382eEeC56A9101f9F88;
    address constant OP_SEPOLIA_MOCK_FORWARDER =
        0xA2888380dFF3704a8AB6D1CD1A8f69c15FEa5EE3;

    // Production: KeystoneForwarder
    address constant ETH_SEPOLIA_PROD_FORWARDER =
        0xF8344CFd5c43616a4366C34E3EEE75af79a74482;
    address constant OP_SEPOLIA_PROD_FORWARDER =
        0x76c9cf548b4179F8901cda1f8623568b58215E62;

    // CCIP Chain Selectors
    uint64 constant ETH_SEPOLIA_SELECTOR = 16015286601757825753;
    uint64 constant OP_SEPOLIA_SELECTOR = 5224473277236331295;

    function run() external {
        uint256 privateKey = vm.envUint("PRIVATE_KEY");

        // Use the newly deployed Vault address based on your command line output
        address vaultAddress = 0x24539f784823DB3DBec8022b21cAb703dB916037;
        Vault vault = Vault(payable(vaultAddress));

        // Determine forwarder based on chainId (using Mock for simulation by default)
        address forwarder;
        if (block.chainid == 11155111) {
            // Eth Sepolia
            forwarder = ETH_SEPOLIA_MOCK_FORWARDER;
        } else if (block.chainid == 11155420) {
            // OP Sepolia
            forwarder = OP_SEPOLIA_MOCK_FORWARDER;
        } else {
            revert("Unsupported chain for automated forwarder selection");
        }

        vm.startBroadcast(privateKey);

        console.log("Configuring Vault at:", vaultAddress);

        console.log("Setting Forwarder to:", forwarder);
        vault.setForwarderAddress(forwarder);

        console.log("Allowlisting Ethereum Sepolia selector...");
        vault.allowlistDestinationChain(ETH_SEPOLIA_SELECTOR, true);

        console.log("Allowlisting OP Sepolia selector...");
        vault.allowlistDestinationChain(OP_SEPOLIA_SELECTOR, true);

        // Ensure the Vault has some ETH for CCIP fees
        // Rebalance pays fees in native gas
        if (address(vault).balance < 0.05 ether) {
            console.log("Funding Vault with 0.1 ETH for CCIP fees...");
            (bool sent, ) = address(vault).call{value: 0.1 ether}("");
            require(sent, "Failed to fund Vault");
        } else {
            console.log("Vault already has sufficient ETH balance for fees.");
        }

        vm.stopBroadcast();

        console.log("Vault Setup Complete.");
    }
}
