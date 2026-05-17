// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";
import {MockMezoVault} from "../src/mocks/MockMezoVault.sol";
import {FamilyCredit} from "../src/FamilyCredit.sol";

contract FamilyCreditTest is Test {
    MockERC20 internal musd;
    MockERC20 internal btc;
    MockMezoVault internal mezo;
    FamilyCredit internal credit;

    address internal head = address(0xFEED);
    address internal alice = address(0xA11CE); // member
    address internal bob = address(0xB0B); // member
    address internal stranger = address(0x57A);

    function setUp() public {
        musd = new MockERC20("Mezo USD", "MUSD", 18);
        btc = new MockERC20("Test BTC", "tBTC", 18);
        mezo = new MockMezoVault(address(musd), address(btc));
        credit = new FamilyCredit(address(mezo));

        btc.mint(head, 10 ether);
        vm.prank(head);
        btc.approve(address(credit), type(uint256).max);
    }

    function _create(uint256 collat, uint256 mint) internal {
        vm.prank(head);
        credit.createFamily(collat, mint);
    }

    function testCreateFamily() public {
        _create(0.1 ether, 2_000 ether);
        (
            bool exists,
            uint256 collat,
            uint256 minted,
            uint256 borrowed,
            uint256 available,
            address[] memory members
        ) = credit.getFamily(head);
        assertTrue(exists);
        assertEq(collat, 0.1 ether);
        assertEq(minted, 2_000 ether);
        assertEq(borrowed, 0);
        assertEq(available, 2_000 ether);
        assertEq(members.length, 0);
        assertEq(musd.balanceOf(address(credit)), 2_000 ether);
    }

    function testCannotCreateTwice() public {
        _create(0.1 ether, 2_000 ether);
        vm.prank(head);
        vm.expectRevert(bytes("family exists"));
        credit.createFamily(0.1 ether, 100 ether);
    }

    function testSetMemberLimitAndBorrow() public {
        _create(0.1 ether, 2_000 ether);
        vm.prank(head);
        credit.setMemberLimit(alice, 500 ether);

        vm.prank(alice);
        credit.borrow(head, 200 ether);

        assertEq(musd.balanceOf(alice), 200 ether);
        (uint256 limit, uint256 borrowed, bool active) = credit.getMember(
            head,
            alice
        );
        assertEq(limit, 500 ether);
        assertEq(borrowed, 200 ether);
        assertTrue(active);
    }

    function testBorrowOverLimitReverts() public {
        _create(0.1 ether, 2_000 ether);
        vm.prank(head);
        credit.setMemberLimit(alice, 500 ether);

        vm.prank(alice);
        vm.expectRevert(bytes("over limit"));
        credit.borrow(head, 600 ether);
    }

    function testNonMemberCannotBorrow() public {
        _create(0.1 ether, 2_000 ether);
        vm.prank(stranger);
        vm.expectRevert(bytes("not member"));
        credit.borrow(head, 1 ether);
    }

    function testRepayFreesLimitAndPool() public {
        _create(0.1 ether, 2_000 ether);
        vm.prank(head);
        credit.setMemberLimit(alice, 500 ether);

        vm.prank(alice);
        credit.borrow(head, 300 ether);

        vm.startPrank(alice);
        musd.approve(address(credit), type(uint256).max);
        credit.repay(head, 200 ether);
        vm.stopPrank();

        (, uint256 borrowed, ) = credit.getMember(head, alice);
        assertEq(borrowed, 100 ether);
        (, , , uint256 totalBorrowed, uint256 available, ) = credit.getFamily(
            head
        );
        assertEq(totalBorrowed, 100 ether);
        assertEq(available, 1_900 ether);
    }

    function testCannotLowerLimitBelowBorrowed() public {
        _create(0.1 ether, 2_000 ether);
        vm.prank(head);
        credit.setMemberLimit(alice, 500 ether);
        vm.prank(alice);
        credit.borrow(head, 400 ether);

        vm.prank(head);
        vm.expectRevert(bytes("limit<borrowed"));
        credit.setMemberLimit(alice, 100 ether);
    }

    function testCannotRemoveMemberWithDebt() public {
        _create(0.1 ether, 2_000 ether);
        vm.prank(head);
        credit.setMemberLimit(alice, 500 ether);
        vm.prank(alice);
        credit.borrow(head, 50 ether);

        vm.prank(head);
        vm.expectRevert(bytes("has debt"));
        credit.removeMember(alice);
    }

    function testWithdrawCollateralLimitedByAvailable() public {
        _create(0.1 ether, 2_000 ether);
        vm.prank(head);
        credit.setMemberLimit(alice, 1_500 ether);
        vm.prank(alice);
        credit.borrow(head, 1_500 ether); // available = 500

        // try repaying 800 → exceeds available 500
        vm.prank(head);
        vm.expectRevert(bytes("insufficient liquidity"));
        credit.withdrawCollateral(800 ether, 0.05 ether);

        // repay 500 → withdraw a fraction. Full BTC withdraw would break Mezo CR
        // (1500 debt remains backed only by the leftover BTC), so withdraw a
        // small slice that keeps CR safe.
        vm.prank(head);
        credit.withdrawCollateral(500 ether, 0.01 ether);

        (, uint256 collat, uint256 minted, , uint256 available, ) = credit
            .getFamily(head);
        assertEq(collat, 0.09 ether);
        assertEq(minted, 1_500 ether);
        assertEq(available, 0);
        assertEq(btc.balanceOf(head), 10 ether - 0.1 ether + 0.01 ether);
    }

    function testMultipleMembersShareLiquidity() public {
        _create(0.1 ether, 2_000 ether);
        vm.startPrank(head);
        credit.setMemberLimit(alice, 800 ether);
        credit.setMemberLimit(bob, 800 ether);
        vm.stopPrank();

        vm.prank(alice);
        credit.borrow(head, 700 ether);
        vm.prank(bob);
        credit.borrow(head, 700 ether);

        (
            ,
            ,
            ,
            uint256 totalBorrowed,
            uint256 available,
            address[] memory members
        ) = credit.getFamily(head);
        assertEq(totalBorrowed, 1_400 ether);
        assertEq(available, 600 ether);
        assertEq(members.length, 2);
    }

    function testBorrowFailsIfPoolDrained() public {
        _create(0.1 ether, 2_000 ether);
        vm.startPrank(head);
        credit.setMemberLimit(alice, 5_000 ether);
        vm.stopPrank();

        vm.prank(alice);
        vm.expectRevert(bytes("no liquidity"));
        credit.borrow(head, 2_500 ether);
    }
}
