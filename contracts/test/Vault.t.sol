// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import {Vault} from "../src/Vault.sol";
import {ReceiverTemplate} from "../src/ReceiverTemplate.sol";
import {MockERC20} from "./MockERC20.sol";
import {MockRouterClient} from "./MockRouterClient.sol";

contract VaultTest is Test {
    Vault public vault;
    MockERC20 public token;
    MockRouterClient public router;
    address public owner = address(this);
    address public cashier = address(0x1);
    address public user = address(0x2);
    address public relayer = address(0x3);
    address public forwarder = address(0x4);

    function setUp() public {
        token = new MockERC20("Test Token", "TST", 18);
        router = new MockRouterClient();
        vault = new Vault(address(token), address(router), forwarder);
        vault.setCashier(cashier);

        token.mint(user, 10000 * 10 ** 18);
        vm.prank(user);
        token.approve(address(vault), type(uint256).max);

        vm.deal(address(vault), 1 ether);
    }

    function testSetCashier() public {
        assertEq(vault.cashier(), cashier);

        vault.setCashier(address(0x4));
        assertEq(vault.cashier(), address(0x4));
    }

    function testSetCashierUnauthorized() public {
        vm.prank(user);
        vm.expectRevert(Vault.Unauthorized.selector);
        vault.setCashier(address(0x4));
    }

    function testSetForwarder() public {
        // forwarder is set at construction time
        assertEq(vault.getForwarderAddress(), forwarder);

        vault.setForwarderAddress(address(0x5));
        assertEq(vault.getForwarderAddress(), address(0x5));
    }

    function testSetForwarderUnauthorized() public {
        vm.prank(user);
        vm.expectRevert(ReceiverTemplate.NotOwner.selector);
        vault.setForwarderAddress(address(0x5));
    }

    function testDeposit() public {
        uint256 amount = 1000 * 10 ** 18;

        vm.prank(cashier);
        vault.deposit(user, amount);

        assertEq(token.balanceOf(address(vault)), amount);
        assertEq(token.balanceOf(user), (10000 - 1000) * 10 ** 18);
    }

    function testDepositUnauthorized() public {
        uint256 amount = 1000 * 10 ** 18;

        vm.prank(user);
        vm.expectRevert(Vault.Unauthorized.selector);
        vault.deposit(user, amount);
    }

    function testWithdraw() public {
        uint256 amount = 1000 * 10 ** 18;

        // Setup initial vault balance
        vm.prank(cashier);
        vault.deposit(user, amount);
        assertEq(token.balanceOf(address(vault)), amount);

        vm.prank(cashier);
        vault.withdraw(relayer, amount);

        assertEq(token.balanceOf(address(vault)), 0);
        assertEq(token.balanceOf(relayer), amount);
    }

    function testEmergencyPause() public {
        uint256 amount = 1000 * 10 ** 18;

        vault.pause();
        assertTrue(vault.isPaused());

        vm.startPrank(cashier);
        vm.expectRevert(Vault.EnforcedPause.selector);
        vault.deposit(user, amount);

        vm.expectRevert(Vault.EnforcedPause.selector);
        vault.withdraw(relayer, amount);
        vm.stopPrank();

        vault.unpause();
        assertFalse(vault.isPaused());

        vm.prank(cashier);
        vault.deposit(user, amount);
    }

    function testEmergencyWithdraw() public {
        uint256 amount = 1000 * 10 ** 18;

        vm.prank(cashier);
        vault.deposit(user, amount);

        // Only owner
        vm.prank(user);
        vm.expectRevert(Vault.Unauthorized.selector);
        vault.emergencyWithdraw(relayer, amount);

        // Owner withdraws
        vault.emergencyWithdraw(relayer, amount);
        assertEq(token.balanceOf(relayer), amount);
        assertEq(token.balanceOf(address(vault)), 0);
    }

    function testAllowlistDestinationChain() public {
        vault.allowlistDestinationChain(16015286601757825753, true);
        assertTrue(vault.allowlistedChains(16015286601757825753));
    }

    function testRebalanceCrossChain() public {
        uint256 amount = 1000 * 10 ** 18;
        uint64 destChain = 16015286601757825753; // Sepolia

        // Admin allowlists the chain
        vault.allowlistDestinationChain(destChain, true);

        // Cashier deposits into Vault
        vm.prank(cashier);
        vault.deposit(user, amount);

        // Admin triggers cross-chain rebalance
        vault.rebalanceCrossChain(destChain, address(0x4), amount);

        // Tokens should be sent to the router
        assertEq(token.balanceOf(address(vault)), 0);
        assertEq(token.balanceOf(address(router)), amount);

        // Fee should have been paid
        assertEq(address(vault).balance, 1 ether - router.MOCK_FEE());
    }

    function testRebalanceCrossChainByForwarder() public {
        uint256 amount = 1000 * 10 ** 18;
        uint64 destChain = 16015286601757825753; // Sepolia

        // Admin allowlists the chain (forwarder already set in setUp)
        vault.allowlistDestinationChain(destChain, true);

        // Cashier deposits into Vault
        vm.prank(cashier);
        vault.deposit(user, amount);

        // Forwarder (CRE Service) triggers cross-chain rebalance autonomosly
        vm.prank(forwarder);
        vault.rebalanceCrossChain(destChain, address(0x4), amount);

        // Tokens should be sent to the router
        assertEq(token.balanceOf(address(vault)), 0);
        assertEq(token.balanceOf(address(router)), amount);
    }

    function testRebalanceCrossChainUnauthorized() public {
        uint256 amount = 1000 * 10 ** 18;
        uint64 destChain = 16015286601757825753; // Sepolia

        // Admin allowlists the chain (forwarder already set in setUp)
        vault.allowlistDestinationChain(destChain, true);

        // Normal user attempts to trigger cross-chain rebalance (should revert)
        vm.prank(user);
        vm.expectRevert(Vault.Unauthorized.selector);
        vault.rebalanceCrossChain(destChain, address(0x4), amount);
    }

    function testRebalanceNotAllowlisted() public {
        uint256 amount = 1000 * 10 ** 18;
        uint64 destChain = 16015286601757825753;

        vm.expectRevert(
            abi.encodeWithSelector(
                Vault.DestinationChainNotAllowlisted.selector,
                destChain
            )
        );
        vault.rebalanceCrossChain(destChain, address(0x4), amount);
    }
}
