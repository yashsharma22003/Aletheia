// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {
    IRouterClient
} from "@chainlink/contracts-ccip/src/v0.8/ccip/interfaces/IRouterClient.sol";
import {
    Client
} from "@chainlink/contracts-ccip/src/v0.8/ccip/libraries/Client.sol";
import {IERC20} from "../src/IERC20.sol";

contract MockRouterClient is IRouterClient {
    uint256 public constant MOCK_FEE = 1e15; // 0.001 ETH
    bytes32 public constant MOCK_MESSAGE_ID = keccak256("mock_message");

    mapping(uint64 => bool) public supportedChains;

    constructor() {
        supportedChains[16015286601757825753] = true; // Sepolia
    }

    function isChainSupported(
        uint64 destChainSelector
    ) external view returns (bool) {
        return supportedChains[destChainSelector];
    }

    function getSupportedTokens(
        uint64
    ) external pure returns (address[] memory) {
        return new address[](0);
    }

    function getFee(
        uint64,
        Client.EVM2AnyMessage memory
    ) external pure returns (uint256) {
        return MOCK_FEE;
    }

    function ccipSend(
        uint64 destinationChainSelector,
        Client.EVM2AnyMessage calldata message
    ) external payable returns (bytes32) {
        require(msg.value >= MOCK_FEE, "Insufficient fee");

        // Simulate pulling the tokens from the sender
        for (uint i = 0; i < message.tokenAmounts.length; i++) {
            IERC20(message.tokenAmounts[i].token).transferFrom(
                msg.sender,
                address(this),
                message.tokenAmounts[i].amount
            );
        }

        return MOCK_MESSAGE_ID;
    }
}
