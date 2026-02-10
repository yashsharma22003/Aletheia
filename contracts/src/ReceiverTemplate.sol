// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {IERC165} from "./IERC165.sol";
import {IReceiver} from "./IReceiver.sol";

/// @title ReceiverTemplate - Abstract receiver with optional permission controls
/// @notice Provides flexible, updatable security checks for receiving workflow reports
/// @dev Based on Chainlink CRE ReceiverTemplate. Simplified (no OpenZeppelin Ownable).
abstract contract ReceiverTemplate is IReceiver {
    // Required permission field
    address private s_forwarderAddress;

    // Owner for access control
    address private s_owner;

    // Custom errors
    error InvalidForwarderAddress();
    error InvalidSender(address sender, address expected);
    error NotOwner();

    // Events
    event ForwarderAddressUpdated(
        address indexed previousForwarder,
        address indexed newForwarder
    );

    modifier onlyOwner() {
        if (msg.sender != s_owner) revert NotOwner();
        _;
    }

    /// @notice Constructor sets msg.sender as owner and configures the forwarder address
    /// @param _forwarderAddress The address of the Chainlink Forwarder contract
    constructor(address _forwarderAddress) {
        if (_forwarderAddress == address(0)) {
            revert InvalidForwarderAddress();
        }
        s_owner = msg.sender;
        s_forwarderAddress = _forwarderAddress;
        emit ForwarderAddressUpdated(address(0), _forwarderAddress);
    }

    /// @notice Returns the configured forwarder address
    function getForwarderAddress() external view returns (address) {
        return s_forwarderAddress;
    }

    /// @notice Returns the owner address
    function owner() external view returns (address) {
        return s_owner;
    }

    /// @inheritdoc IReceiver
    function onReport(
        bytes calldata metadata,
        bytes calldata report
    ) external override {
        // Verify caller is the trusted Chainlink Forwarder
        if (
            s_forwarderAddress != address(0) && msg.sender != s_forwarderAddress
        ) {
            revert InvalidSender(msg.sender, s_forwarderAddress);
        }
        _processReport(report);
    }

    /// @notice Updates the forwarder address
    /// @param _forwarder The new forwarder address
    function setForwarderAddress(address _forwarder) external onlyOwner {
        address previousForwarder = s_forwarderAddress;
        s_forwarderAddress = _forwarder;
        emit ForwarderAddressUpdated(previousForwarder, _forwarder);
    }

    /// @notice Abstract function to process the report data
    /// @param report The report calldata containing your workflow's encoded data
    function _processReport(bytes calldata report) internal virtual;

    /// @inheritdoc IERC165
    function supportsInterface(
        bytes4 interfaceId
    ) public view virtual override returns (bool) {
        return
            interfaceId == type(IReceiver).interfaceId ||
            interfaceId == type(IERC165).interfaceId;
    }
}
