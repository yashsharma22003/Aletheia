// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ReceiverTemplate} from "./ReceiverTemplate.sol";
import {IERC20} from "./IERC20.sol";
import {Vault} from "./Vault.sol";

/**
 * @title ComplianceCashier
 * @notice A vault that accepts deposits and automatically breaks them into standard denominations (1000, 500, 100).
 * @dev Stores cheques as structs with deterministic IDs based on user nonce, allowing for easy proof generation.
 */
contract ComplianceCashier is ReceiverTemplate {
    struct Cheque {
        address owner;
        uint96 denomination;
        uint64 targetChainId;
        bool isCompliant;
        uint256 blockNumber;
    }

    // Unique Cheque ID => Cheque Details
    mapping(bytes32 => Cheque) public cheques;

    // User Nonce for deterministic ID generation
    // chequeId = keccak256(abi.encodePacked(user, userNonce[user]))
    mapping(address => uint256) public userNonce;

    // Track consumed proof nullifiers to prevent double-spending
    mapping(bytes32 => bool) public usedNullifiers;

    Vault public immutable vault;
    IERC20 public immutable token;
    uint256 public immutable unit1000;
    uint256 public immutable unit500;
    uint256 public immutable unit100;

    // Events
    event ChequeCreated(
        bytes32 indexed chequeId,
        address indexed owner,
        uint256 denomination,
        uint256 targetChainId,
        uint256 blockNumber
    );

    event ComplianceUpdated(bytes32 indexed chequeId, bool isCompliant);

    event FundsReleased(
        bytes32 indexed nullifierHash,
        address indexed recipient,
        uint256 amount
    );

    /**
     * @notice Constructor
     * @param _vault The Vault contract to accept deposits
     * @param _forwarderAddress The address of the CRE Forwarder
     */
    constructor(
        address payable _vault,
        address _forwarderAddress
    ) ReceiverTemplate(_forwarderAddress) {
        vault = Vault(payable(address(_vault)));
        token = vault.token();
        uint8 decimals = token.decimals();

        // Calculate units based on decimals
        unit1000 = 1000 * (10 ** decimals);
        unit500 = 500 * (10 ** decimals);
        unit100 = 100 * (10 ** decimals);
    }

    /**
     * @notice Accepts token amount and breaks it into 1000, 500, 100 units.
     * @dev Generates deterministic cheque IDs using userNonce.
     * @param amount The amount of tokens to deposit.
     * @param targetChainId The chain ID where the user intends to withdraw.
     */
    function deposit(uint256 amount, uint64 targetChainId) external {
        require(amount >= unit100, "Minimum deposit is 100 units");

        // Transfer tokens from user to vault
        vault.deposit(msg.sender, amount);

        uint256 remaining = amount;

        // Greedy breakdown
        // 1. Process 1000s
        while (remaining >= unit1000) {
            _createCheque(msg.sender, 1000, targetChainId);
            remaining -= unit1000;
        }

        // 2. Process 500s
        while (remaining >= unit500) {
            _createCheque(msg.sender, 500, targetChainId);
            remaining -= unit500;
        }

        // 3. Process 100s
        while (remaining >= unit100) {
            _createCheque(msg.sender, 100, targetChainId);
            remaining -= unit100;
        }

        // Remaining dust is a donation to the protocol
    }

    /**
     * @dev Internal function to create a cheque with a deterministic ID.
     */
    function _createCheque(
        address owner,
        uint96 denom,
        uint64 targetChainId
    ) internal {
        uint256 nonce = userNonce[owner];
        userNonce[owner]++;

        // Deterministic ID generation
        bytes32 chequeId = keccak256(abi.encodePacked(owner, nonce));

        cheques[chequeId] = Cheque({
            owner: owner,
            denomination: denom,
            targetChainId: targetChainId,
            isCompliant: false,
            blockNumber: block.number
        });

        emit ChequeCreated(chequeId, owner, denom, targetChainId, block.number);
    }

    /**
     * @notice Processes a validated CRE report containing compliance or release updates.
     * @dev Called by ReceiverTemplate.onReport after forwarder validation passes.
     * @param report ABI-encoded payload. First parameter is uint8 reportType.
     *   Type 0 (Compliance): (uint8, bytes32 chequeId, bool status)
     *   Type 1 (Release): (uint8, bytes32 nullifierHash, address recipient, uint256 amount, bool status)
     */
    function _processReport(bytes calldata report) internal override {
        // Decode only the first parameter (32-byte padded uint8) to determine routing
        uint8 reportType = abi.decode(report, (uint8));

        if (reportType == 0) {
            (, bytes32 chequeId, bool status) = abi.decode(
                report,
                (uint8, bytes32, bool)
            );
            cheques[chequeId].isCompliant = status;
            emit ComplianceUpdated(chequeId, status);
        } else if (reportType == 1) {
            (
                ,
                bytes32 nullifierHash,
                address recipient,
                uint256 amount,
                bool status
            ) = abi.decode(report, (uint8, bytes32, address, uint256, bool));

            require(status == true, "CRE validation failed");
            require(!usedNullifiers[nullifierHash], "Nullifier already used");

            usedNullifiers[nullifierHash] = true;
            vault.withdraw(recipient, amount);

            emit FundsReleased(nullifierHash, recipient, amount);
        } else {
            revert("Invalid report logic");
        }
    }

    /**
     * @notice Helper to predict a cheque ID for a user.
     * @param user The user address
     * @param nonce The nonce to check
     */

    function predictChequeId(
        address user,
        uint256 nonce
    ) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(user, nonce));
    }

    /**
     * @notice Helper to predict all Cheque IDs and denominations for a given deposit amount.
     * @dev Simulates the deposit breakdown logic using the user's current nonce.
     * @param user The user address
     * @param amount The total deposit amount
     * @return ids The list of predicted Cheque IDs
     * @return denoms The list of denominations corresponding to the IDs
     */
    function getPredictedCheques(
        address user,
        uint256 amount
    ) external view returns (bytes32[] memory ids, uint256[] memory denoms) {
        uint256 tempAmount = amount;
        uint256 chequeCount = 0;

        // Pass 1: Count required cheques
        while (tempAmount >= unit1000) {
            chequeCount++;
            tempAmount -= unit1000;
        }
        while (tempAmount >= unit500) {
            chequeCount++;
            tempAmount -= unit500;
        }
        while (tempAmount >= unit100) {
            chequeCount++;
            tempAmount -= unit100;
        }

        // Allocate arrays
        ids = new bytes32[](chequeCount);
        denoms = new uint256[](chequeCount);

        // Pass 2: Generate IDs
        uint256 nonce = userNonce[user];
        uint256 idx = 0;
        tempAmount = amount; // Reset amount

        while (tempAmount >= unit1000) {
            ids[idx] = predictChequeId(user, nonce);
            denoms[idx] = 1000;
            nonce++;
            idx++;
            tempAmount -= unit1000;
        }
        while (tempAmount >= unit500) {
            ids[idx] = predictChequeId(user, nonce);
            denoms[idx] = 500;
            nonce++;
            idx++;
            tempAmount -= unit500;
        }
        while (tempAmount >= unit100) {
            ids[idx] = predictChequeId(user, nonce);
            denoms[idx] = 100;
            nonce++;
            idx++;
            tempAmount -= unit100;
        }
    }

    /**
     * @notice Accepts a specific amount and breaks it into user-defined denominations.
     * @param amount The total amount.
     * @param targetChainId The chain ID where the user intends to withdraw.
     * @param denominations Array of denominations (e.g., [1000, 200, 50]).
     */
    function customDeposit(
        uint256 amount,
        uint64 targetChainId,
        uint96[] calldata denominations
    ) external {
        uint256 sum = 0;
        for (uint i = 0; i < denominations.length; i++) {
            sum += denominations[i] * (10 ** token.decimals());
        }
        require(sum <= amount, "Denominations sum exceeds amount");

        // Transfer tokens to vault
        vault.deposit(msg.sender, sum);

        // Process cheques
        for (uint i = 0; i < denominations.length; i++) {
            _createCheque(msg.sender, denominations[i], targetChainId);
        }
    }

    /**
     * @notice Predicts Cheque IDs based on a custom list of denominations.
     * @param user The user address
     * @param denominations Array of Custom denominations
     * @return ids The predicted Cheque IDs
     */
    function getPredictedCustomCheques(
        address user,
        uint96[] calldata denominations
    ) external view returns (bytes32[] memory ids) {
        ids = new bytes32[](denominations.length);
        uint256 nonce = userNonce[user];

        for (uint i = 0; i < denominations.length; i++) {
            ids[i] = predictChequeId(user, nonce);
            nonce++;
        }
    }
}
