// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ReceiverTemplate} from "./ReceiverTemplate.sol";

/**
 * @title TruthRegistry
 * @notice A registry to store state roots of various chains, updated by the Aletheia Oracle (Chainlink CRE).
 * @dev Inherits ReceiverTemplate for CRE-compliant onReport handling with ERC165 support.
 */
contract TruthRegistry is ReceiverTemplate {
    // Mapping from chainId => blockNumber => stateRoot
    mapping(uint256 => mapping(uint256 => bytes32)) public stateRoots;

    // Events
    event StateRootUpdated(
        uint256 indexed chainId,
        uint256 indexed blockNumber,
        bytes32 stateRoot
    );
    event ReportReceived(address indexed sender, uint256 numUpdates);

    /**
     * @notice Constructor sets the forwarder address for CRE report delivery.
     * @param _forwarderAddress The address of the MockForwarder (simulation) or KeystoneForwarder (production).
     */
    constructor(
        address _forwarderAddress
    ) ReceiverTemplate(_forwarderAddress) {}

    /**
     * @notice Processes a validated CRE report containing state root updates.
     * @dev Called by ReceiverTemplate.onReport after forwarder validation passes.
     * @param report ABI-encoded (uint256[], uint256[], bytes32[]) state root batch.
     */
    function _processReport(bytes calldata report) internal override {
        // Decode the report payload
        (
            uint256[] memory chainIds,
            uint256[] memory blockNumbers,
            bytes32[] memory _stateRoots
        ) = abi.decode(report, (uint256[], uint256[], bytes32[]));

        require(
            chainIds.length == blockNumbers.length &&
                blockNumbers.length == _stateRoots.length,
            "Array lengths mismatch"
        );

        for (uint256 i = 0; i < chainIds.length; i++) {
            stateRoots[chainIds[i]][blockNumbers[i]] = _stateRoots[i];
            emit StateRootUpdated(chainIds[i], blockNumbers[i], _stateRoots[i]);
        }

        emit ReportReceived(msg.sender, chainIds.length);
    }

    /**
     * @notice Reads a state root from the registry.
     * @param chainId The ID of the source chain.
     * @param blockNumber The block number.
     * @return The state root.
     */
    function getStateRoot(
        uint256 chainId,
        uint256 blockNumber
    ) external view returns (bytes32) {
        return stateRoots[chainId][blockNumber];
    }
}
