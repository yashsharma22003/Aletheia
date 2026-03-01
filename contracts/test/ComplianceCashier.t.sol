// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import {ComplianceCashier} from "../src/ComplianceCashier.sol";
import {MockERC20} from "./MockERC20.sol";
import {Vault} from "../src/Vault.sol";

contract ComplianceCashierTest is Test {
    ComplianceCashier public cashier;
    Vault public vault;
    MockERC20 public token;
    address public forwarder = address(0x1);
    address public user = address(0x2);

    function setUp() public {
        token = new MockERC20("Test Token", "TST", 18);
        vault = new Vault(address(token), address(0x55), forwarder); // Mock router address
        cashier = new ComplianceCashier(payable(address(vault)), forwarder);
        vault.setCashier(address(cashier));
        token.mint(user, 10000 * 10 ** 18);
        vm.prank(user);
        token.approve(address(vault), type(uint256).max);
    }

    function testDepositBreakdownAndDeterminism() public {
        vm.startPrank(user);
        // Deposit 1600 units (1000 + 500 + 100)
        uint256 amount = 1600 * 10 ** 18;
        uint64 targetChainId = 11155111;

        // 1. Get Simulation
        (
            bytes32[] memory predictedIds,
            uint256[] memory predictedDenoms
        ) = cashier.getPredictedCheques(user, amount);

        // Assert lengths and values from simulation
        assertEq(predictedIds.length, 3);
        assertEq(predictedDenoms.length, 3);
        assertEq(predictedDenoms[0], 1000);
        assertEq(predictedDenoms[1], 500);
        assertEq(predictedDenoms[2], 100);

        // 2. Execute Deposit
        cashier.deposit(amount, targetChainId);

        // 3. Verify On-Chain State matches Simulation

        // Cheque 0 (1000)
        (address owner0, uint96 denom0, uint64 chain0, bool comp0, ) = cashier
            .cheques(predictedIds[0]);
        assertEq(owner0, user);
        assertEq(denom0, 1000);
        assertEq(chain0, targetChainId);
        assertEq(comp0, false);

        // Cheque 1 (500)
        (address owner1, uint96 denom1, , , ) = cashier.cheques(
            predictedIds[1]
        );
        assertEq(owner1, user);
        assertEq(denom1, 500);

        // Cheque 2 (100)
        (address owner2, uint96 denom2, , , ) = cashier.cheques(
            predictedIds[2]
        );
        assertEq(owner2, user);
        assertEq(denom2, 100);

        // Verify Nonce incremented by 3
        assertEq(cashier.userNonce(user), 3);

        vm.stopPrank();
    }

    function testComplianceUpdate() public {
        vm.startPrank(user);
        uint256 amount = 1000 * 10 ** 18;
        cashier.deposit(amount, 1);
        bytes32 chequeId = cashier.predictChequeId(user, 0);
        vm.stopPrank();

        // Simulate Oracle Report
        vm.prank(forwarder);
        // Encode report: uint8(0), bytes32 chequeId, bool status
        bytes memory report = abi.encode(uint8(0), chequeId, true);
        cashier.onReport("", report);

        // Assert updated
        (, , , bool isCompliant, ) = cashier.cheques(chequeId);
        assertEq(isCompliant, true);
    }

    function testFundRelease() public {
        vm.startPrank(user);
        uint256 amount = 1000 * 10 ** 18;
        cashier.deposit(amount, 1);
        vm.stopPrank();

        bytes32 nullifierHash = keccak256("test_nullifier");
        address employee = address(0x3);

        // Simulate Oracle Report for releasing funds
        vm.prank(forwarder);
        // Encode report: uint8(1), bytes32 nullifierHash, address recipient, uint256 amount, bool status
        bytes memory report = abi.encode(
            uint8(1),
            nullifierHash,
            employee,
            amount,
            true
        );
        cashier.onReport("", report);

        // Assert vault token balance decreased and employee balance increased
        assertEq(token.balanceOf(employee), amount);
        assertTrue(cashier.usedNullifiers(nullifierHash));
    }

    function testFundReleaseReplayAttack() public {
        vm.startPrank(user);
        uint256 amount = 1000 * 10 ** 18;
        cashier.deposit(amount, 1);
        cashier.deposit(amount, 1); // Deposit more to test replay
        vm.stopPrank();

        bytes32 nullifierHash = keccak256("test_nullifier");
        address employee = address(0x3);

        // Simulate Oracle Report for releasing funds
        vm.prank(forwarder);
        bytes memory report = abi.encode(
            uint8(1),
            nullifierHash,
            employee,
            amount,
            true
        );
        cashier.onReport("", report);

        // Try second time with same nullifier
        vm.prank(forwarder);
        vm.expectRevert("Nullifier already used");
        cashier.onReport("", report);
    }
}
