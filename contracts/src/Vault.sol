// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "./IERC20.sol";
import {
    IRouterClient
} from "@chainlink/contracts-ccip/src/v0.8/ccip/interfaces/IRouterClient.sol";
import {
    Client
} from "@chainlink/contracts-ccip/src/v0.8/ccip/libraries/Client.sol";

/**
 * @title Vault
 * @notice A secure repository for storing protocol liquidity, controlled by the ComplianceCashier.
 * @dev Isolates fund custody from logical accounting. Features an emergency pause.
 */
contract Vault {
    IERC20 public immutable token;
    address public cashier;
    address public owner;
    bool public isPaused;
    IRouterClient public router;
    address public forwarder;

    mapping(uint64 => bool) public allowlistedChains;

    event CashierUpdated(address oldCashier, address newCashier);
    event ForwarderUpdated(address oldForwarder, address newForwarder);
    event Paused(address account);
    event Unpaused(address account);
    event RebalanceInitiated(
        bytes32 indexed messageId,
        uint64 indexed destinationChainSelector,
        address receiver,
        uint256 tokenAmount,
        uint256 nativeFeesPaid
    );
    event EmergencyWithdrawn(address token, address to, uint256 amount);

    error Unauthorized();
    error EnforcedPause();
    error ZeroAddress();
    error DestinationChainNotAllowlisted(uint64 destinationChainSelector);
    error NotEnoughNativeBalance(
        uint256 currentBalance,
        uint256 requiredBalance
    );

    modifier onlyCashier() {
        if (msg.sender != cashier) revert Unauthorized();
        _;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    modifier onlyOwnerOrForwarder() {
        if (msg.sender != owner && msg.sender != forwarder)
            revert Unauthorized();
        _;
    }

    modifier whenNotPaused() {
        if (isPaused) revert EnforcedPause();
        _;
    }

    modifier onlyAllowlistedChain(uint64 _destinationChainSelector) {
        if (!allowlistedChains[_destinationChainSelector]) {
            revert DestinationChainNotAllowlisted(_destinationChainSelector);
        }
        _;
    }

    /**
     * @notice Constructor
     * @param _token The underlying ERC20 token
     * @param _router The CCIP router address
     */
    constructor(address _token, address _router) {
        if (_token == address(0)) revert ZeroAddress();
        if (_router == address(0)) revert ZeroAddress();
        token = IERC20(_token);
        router = IRouterClient(_router);
        owner = msg.sender;
    }

    /**
     * @notice Links the authorized ComplianceCashier to the Vault
     * @param _cashier The address of the ComplianceCashier
     */
    function setCashier(address _cashier) external onlyOwner {
        if (_cashier == address(0)) revert ZeroAddress();
        address oldCashier = cashier;
        cashier = _cashier;
        emit CashierUpdated(oldCashier, _cashier);
    }

    /**
     * @notice Links an authorized Chainlink CRE Forwarder to the Vault
     * @param _forwarder The address of the Forwarder
     */
    function setForwarder(address _forwarder) external onlyOwner {
        if (_forwarder == address(0)) revert ZeroAddress();
        address oldForwarder = forwarder;
        forwarder = _forwarder;
        emit ForwarderUpdated(oldForwarder, _forwarder);
    }

    /**
     * @notice Allows the Cashier to pull funds from a user into the Vault.
     * @dev User must have approved the Vault or Cashier to spend tokens. The Cashier handles the 'transferFrom'.
     * @param from The address of the user depositing funds
     * @param amount The amount to pull
     */
    function deposit(
        address from,
        uint256 amount
    ) external onlyCashier whenNotPaused {
        require(
            token.transferFrom(from, address(this), amount),
            "Transfer failed"
        );
    }

    /**
     * @notice Allows the Cashier to release funds from the Vault to a destination address.
     * @param to The recipient address
     * @param amount The amount to transfer
     */
    function withdraw(
        address to,
        uint256 amount
    ) external onlyCashier whenNotPaused {
        require(token.transfer(to, amount), "Transfer failed");
    }

    /**
     * @notice Admin function to halt deposits and withdrawals.
     */
    function pause() external onlyOwner {
        isPaused = true;
        emit Paused(msg.sender);
    }

    /**
     * @notice Admin function to resume deposits and withdrawals.
     */
    function unpause() external onlyOwner {
        isPaused = false;
        emit Unpaused(msg.sender);
    }

    /**
     * @notice Admin backstop to recover funds in case of a critical vulnerability in the Cashier.
     * @param to The recipient to recover funds to
     * @param amount The amount to recover
     */
    function emergencyWithdraw(address to, uint256 amount) external onlyOwner {
        require(token.transfer(to, amount), "Transfer failed");
        emit EmergencyWithdrawn(address(token), to, amount);
    }

    /* ================= CCIP Cross-Chain Rebalancing ================= */

    /**
     * @notice Updates the allowlist status of a destination chain for cross-chain rebalancing.
     * @param _destinationChainSelector The ID of the destination chain to update.
     * @param allowed The allowlist status.
     */
    function allowlistDestinationChain(
        uint64 _destinationChainSelector,
        bool allowed
    ) external onlyOwner {
        allowlistedChains[_destinationChainSelector] = allowed;
    }

    /**
     * @notice Rebalances liquidity to a Vault on another blockchain using Chainlink CCIP.
     * @dev Pays CCIP fees from the Vault's native gas (ETH) balance.
     * @param _destinationChainSelector CCIP chain identifier.
     * @param _receiver The destination Vault address.
     * @param _amount The amount of ERC20 tokens to transfer.
     */
    function rebalanceCrossChain(
        uint64 _destinationChainSelector,
        address _receiver,
        uint256 _amount
    )
        external
        onlyOwnerOrForwarder
        onlyAllowlistedChain(_destinationChainSelector)
        whenNotPaused
        returns (bytes32 messageId)
    {
        Client.EVM2AnyMessage memory evm2AnyMessage = _buildCCIPMessage(
            _receiver,
            _amount
        );

        // Calculate native gas fees
        uint256 fees = router.getFee(_destinationChainSelector, evm2AnyMessage);

        if (fees > address(this).balance) {
            revert NotEnoughNativeBalance(address(this).balance, fees);
        }

        // Approve router to transfer tokens
        token.approve(address(router), _amount);

        // Execute Cross-Chain Transfer
        messageId = router.ccipSend{value: fees}(
            _destinationChainSelector,
            evm2AnyMessage
        );

        emit RebalanceInitiated(
            messageId,
            _destinationChainSelector,
            _receiver,
            _amount,
            fees
        );

        return messageId;
    }

    /**
     * @notice Construct a CCIP message to transfer tokens using native gas for fees.
     */
    function _buildCCIPMessage(
        address _receiver,
        uint256 _amount
    ) private view returns (Client.EVM2AnyMessage memory) {
        Client.EVMTokenAmount[]
            memory tokenAmounts = new Client.EVMTokenAmount[](1);
        tokenAmounts[0] = Client.EVMTokenAmount({
            token: address(token),
            amount: _amount
        });

        return
            Client.EVM2AnyMessage({
                receiver: abi.encode(_receiver),
                data: "",
                tokenAmounts: tokenAmounts,
                extraArgs: Client._argsToBytes(
                    Client.EVMExtraArgsV2({
                        gasLimit: 0,
                        allowOutOfOrderExecution: true
                    })
                ),
                feeToken: address(0) // indicates native gas
            });
    }

    /**
     * @notice Allows the contract to receive native ETH/AVAX for CCIP fees.
     */
    receive() external payable {}

    /**
     * @notice Withdraw excess native gas tokens
     */
    function withdrawNative(address to) external onlyOwner {
        uint256 amount = address(this).balance;
        (bool sent, ) = to.call{value: amount}("");
        require(sent, "Native transfer failed");
    }
}
