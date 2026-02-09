// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/Vault.sol";

// Minimal Mock ERC20
contract MockERC20 is IERC20 {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    uint8 public decimalsVal;

    constructor(uint8 _decimals) {
        decimalsVal = _decimals;
    }

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function transferFrom(
        address sender,
        address recipient,
        uint256 amount
    ) external override returns (bool) {
        require(balanceOf[sender] >= amount, "Insufficient balance");
        require(
            allowance[sender][msg.sender] >= amount,
            "Insufficient allowance"
        );
        balanceOf[sender] -= amount;
        balanceOf[recipient] += amount;
        allowance[sender][msg.sender] -= amount;
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function decimals() external view override returns (uint8) {
        return decimalsVal;
    }
}

contract VaultTest is Test {
    AletheiaSimpleVault public vault;
    MockERC20 public token;
    address user = address(0x1);

    function setUp() public {
        token = new MockERC20(18); // 18 decimals like ETH/USDC standard
        vault = new AletheiaSimpleVault(address(token));

        // Mint tokens to user
        // We want to test splitting 160 units.
        // 1 unit = 10^18.
        // 160 units = 160 * 10^18.
        uint256 amountToMint = 160 * 10 ** 18;
        token.mint(user, amountToMint);

        vm.prank(user);
        token.approve(address(vault), amountToMint);
    }

    function testDepositSplitting() public {
        uint256 depositAmount = 160 * 10 ** 18;

        console.log("User depositing:", depositAmount);

        vm.prank(user);
        vault.deposit(depositAmount);

        uint256 notes100 = vault.getNoteCount(user, 100);
        uint256 notes50 = vault.getNoteCount(user, 50);
        uint256 notes10 = vault.getNoteCount(user, 10);

        console.log("--- Post Deposit State ---");
        console.log("User 100-unit notes:", notes100);
        console.log("User 50-unit notes:", notes50);
        console.log("User 10-unit notes:", notes10);

        assertEq(notes100, 1, "Should have 1x 100 note");
        assertEq(notes50, 1, "Should have 1x 50 note");
        assertEq(notes10, 1, "Should have 1x 10 note");
    }
}
