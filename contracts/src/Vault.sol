// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function transferFrom(
        address sender,
        address recipient,
        uint256 amount
    ) external returns (bool);
    function decimals() external view returns (uint8);
}

contract AletheiaSimpleVault {
    // Structure: address => denomination => count
    // Example: 0xAlice => 100 => 3 (Alice has three 100-unit notes)
    mapping(address => mapping(uint256 => uint256)) public userNotes;

    IERC20 public immutable token;
    uint256 public immutable unit100;
    uint256 public immutable unit50;
    uint256 public immutable unit10;

    event DepositCategorized(address indexed user, uint256 amount);

    constructor(address _token) {
        token = IERC20(_token);
        uint8 decimals = token.decimals();

        // Calculate units based on decimals
        unit100 = 100 * (10 ** decimals);
        unit50 = 50 * (10 ** decimals);
        unit10 = 10 * (10 ** decimals);
    }

    /**
     * @dev Accepts arbitrary token amount and breaks it into the largest possible bills.
     * @param amount The amount of tokens to deposit.
     */
    function deposit(uint256 amount) external {
        require(amount >= unit10, "Minimum deposit is 10 units");

        // Transfer tokens from user to vault
        require(
            token.transferFrom(msg.sender, address(this), amount),
            "Transfer failed"
        );

        uint256 remaining = amount;

        // 1. Process 100s
        if (remaining >= unit100) {
            uint256 count100 = remaining / unit100;
            userNotes[msg.sender][100] += count100;
            remaining %= unit100;
        }

        // 2. Process 50s
        if (remaining >= unit50) {
            uint256 count50 = remaining / unit50;
            userNotes[msg.sender][50] += count50;
            remaining %= unit50;
        }

        // 3. Process 10s
        if (remaining >= unit10) {
            uint256 count10 = remaining / unit10;
            userNotes[msg.sender][10] += count10;
            remaining %= unit10;
        }

        // Note: Dust (remaining < 10 units) is kept in the contract but not credited as notes.
        // In a real system, you might want to refund it, but simplified here as requested.
        // Or we can refund explicitly if we implement transfer.
        // For now, let's just log what was actually categorized.

        emit DepositCategorized(msg.sender, amount - remaining);
    }

    /**
     * @dev Helper to see exactly how many "bills" a user has.
     */
    function getNoteCount(
        address user,
        uint256 denomination
    ) external view returns (uint256) {
        return userNotes[user][denomination];
    }
}
