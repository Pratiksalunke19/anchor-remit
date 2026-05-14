// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";
import {MockMezoVault} from "../src/mocks/MockMezoVault.sol";
import {InsurancePool} from "../src/InsurancePool.sol";
import {RemittanceVault} from "../src/RemittanceVault.sol";

contract RemittanceVaultTest is Test {
    MockERC20 internal musd;
    MockERC20 internal btc;
    MockMezoVault internal mezo;
    InsurancePool internal pool;
    RemittanceVault internal vault;

    address internal deployer = address(this);
    address internal sender = address(0xA11CE);
    address internal recipient = address(0xB0B);
    address internal lp = address(0xC0FFEE);
    address internal keeper = address(0xDEAD);

    bytes32 internal constant PIN =
        keccak256(abi.encodePacked(uint256(123456)));

    function setUp() public {
        musd = new MockERC20("Mezo USD", "MUSD", 18);
        btc = new MockERC20("Test BTC", "tBTC", 18);
        mezo = new MockMezoVault(address(musd), address(btc));
        pool = new InsurancePool(address(musd));
        vault = new RemittanceVault(address(mezo), address(pool));
        pool.setVault(address(vault));
        vault.setKeeper(keeper);

        // fund sender with BTC
        btc.mint(sender, 100 ether);
        // fund LP with MUSD so pool has reserves
        musd.mint(lp, 50_000 ether);
        vm.prank(lp);
        musd.approve(address(pool), type(uint256).max);
        vm.prank(lp);
        pool.deposit(10_000 ether);
    }

    // -------------------- helpers --------------------

    function _create(
        uint256 musdAmount,
        uint256 collat,
        uint256 expiry,
        address _recipient
    ) internal returns (bytes32 orderId) {
        vm.startPrank(sender);
        btc.approve(address(vault), collat);
        orderId = vault.createRemittance(
            _recipient,
            musdAmount,
            collat,
            PIN,
            expiry
        );
        vm.stopPrank();
    }

    // -------------------- tests --------------------

    function testCreateRemittance() public {
        bytes32 orderId = _create(1_000 ether, 0.05 ether, 3 days, recipient);
        RemittanceVault.RemittanceOrder memory o = vault.getOrder(orderId);
        assertEq(o.sender, sender);
        assertEq(o.recipient, recipient);
        assertEq(o.musdAmount, 1_000 ether);
        assertEq(o.collateralBTC, 0.05 ether);
        assertEq(uint8(o.status), uint8(RemittanceVault.OrderStatus.PENDING));
        // vault should hold 1000 MUSD in escrow
        assertEq(musd.balanceOf(address(vault)), 1_000 ether);
    }

    function testClaimWithCorrectPin() public {
        bytes32 orderId = _create(1_000 ether, 0.05 ether, 3 days, recipient);
        vm.prank(recipient);
        vault.claimRemittance(orderId, PIN);

        // 0.10% fee → 1 MUSD to pool, 999 MUSD to recipient
        assertEq(musd.balanceOf(recipient), 999 ether);
        assertEq(musd.balanceOf(address(vault)), 0);

        RemittanceVault.RemittanceOrder memory o = vault.getOrder(orderId);
        assertEq(uint8(o.status), uint8(RemittanceVault.OrderStatus.CLAIMED));
    }

    function testClaimWithWrongPin() public {
        bytes32 orderId = _create(1_000 ether, 0.05 ether, 3 days, recipient);
        bytes32 badPin = keccak256(abi.encodePacked(uint256(999999)));
        vm.prank(recipient);
        vm.expectRevert(bytes("bad pin"));
        vault.claimRemittance(orderId, badPin);
    }

    function testCancelAfterExpiry() public {
        bytes32 orderId = _create(1_000 ether, 0.05 ether, 3 days, recipient);
        vm.warp(block.timestamp + 3 days + 1);

        uint256 btcBefore = btc.balanceOf(sender);
        vm.prank(sender);
        vault.cancelRemittance(orderId);
        uint256 btcAfter = btc.balanceOf(sender);
        assertEq(btcAfter - btcBefore, 0.05 ether);

        RemittanceVault.RemittanceOrder memory o = vault.getOrder(orderId);
        assertEq(uint8(o.status), uint8(RemittanceVault.OrderStatus.CANCELLED));
    }

    function testCancelBeforeExpiryReverts() public {
        bytes32 orderId = _create(1_000 ether, 0.05 ether, 3 days, recipient);
        vm.prank(sender);
        vm.expectRevert(bytes("not expired"));
        vault.cancelRemittance(orderId);
    }

    function testCollateralTopUp() public {
        bytes32 orderId = _create(1_000 ether, 0.05 ether, 3 days, recipient);
        uint256 ratioBefore = vault.vaultCollateralRatio();

        vm.startPrank(sender);
        btc.approve(address(vault), 0.05 ether);
        vault.topUpCollateral(orderId, 0.05 ether);
        vm.stopPrank();

        uint256 ratioAfter = vault.vaultCollateralRatio();
        assertGt(ratioAfter, ratioBefore);

        RemittanceVault.RemittanceOrder memory o = vault.getOrder(orderId);
        assertEq(o.collateralBTC, 0.1 ether);
    }

    function testInsurancePoolCover() public {
        bytes32 orderId = _create(1_000 ether, 0.05 ether, 3 days, recipient);

        // crash BTC price so vault CR falls below liquidation threshold (110%)
        // start CR ~ 0.05 * 60000 / 1000 = 3e18 (300%)
        // to get CR < 110%, need price * 0.05 / 1000 < 1.1 → price < 22000
        mezo.setBtcPrice(20_000 ether);

        uint256 senderMusdBefore = musd.balanceOf(sender);
        vm.prank(keeper);
        vault.liquidationGuard(orderId);
        uint256 senderMusdAfter = musd.balanceOf(sender);

        // sender gets full MUSD refund
        assertEq(senderMusdAfter - senderMusdBefore, 1_000 ether);

        RemittanceVault.RemittanceOrder memory o = vault.getOrder(orderId);
        assertEq(
            uint8(o.status),
            uint8(RemittanceVault.OrderStatus.LIQUIDATED)
        );
    }

    function testFullHappyPath() public {
        // create
        bytes32 orderId = _create(500 ether, 0.02 ether, 2 days, recipient);
        // recipient claims
        vm.prank(recipient);
        vault.claimRemittance(orderId, PIN);
        // recipient has 500 - 0.10% = 499.5 MUSD
        assertEq(musd.balanceOf(recipient), 499.5 ether);
        // pool accumulated 0.5 MUSD of fees
        assertEq(musd.balanceOf(address(pool)), 10_000 ether + 0.5 ether);
    }

    function testPoolDepositWithdraw() public {
        uint256 beforeReserve = pool.totalReserve();
        uint256 shares = pool.sharesOf(lp);

        vm.prank(lp);
        uint256 out = pool.withdraw(shares / 2);

        assertApproxEqAbs(out, beforeReserve / 2, 1);
        assertEq(pool.sharesOf(lp), shares - shares / 2);
    }

    function testClaimAnyoneIfRecipientUnset() public {
        // recipient = address(0) → any wallet that knows the PIN can claim
        address anon = address(0xA0A0);
        bytes32 orderId = _create(100 ether, 0.005 ether, 1 days, address(0));
        vm.prank(anon);
        vault.claimRemittance(orderId, PIN);
        assertEq(musd.balanceOf(anon), 99.9 ether);
    }

    // -------------------- repayAndUnlock --------------------

    /// Helper: claim + fund the sender with MUSD so they can repay. We mint
    /// directly to the sender via the mock so tests stay isolated from the
    /// recipient's wallet.
    function _claimAndFundSender(
        uint256 musdAmount,
        uint256 collat
    ) internal returns (bytes32 orderId) {
        orderId = _create(musdAmount, collat, 3 days, recipient);
        vm.prank(recipient);
        vault.claimRemittance(orderId, PIN);
        musd.mint(sender, musdAmount); // arm sender to repay full notional
        vm.prank(sender);
        musd.approve(address(vault), type(uint256).max);
    }

    function testRepayAndUnlockFull() public {
        bytes32 orderId = _claimAndFundSender(1_000 ether, 0.05 ether);

        uint256 btcBefore = btc.balanceOf(sender);
        uint256 musdBefore = musd.balanceOf(sender);

        vm.prank(sender);
        vault.repayAndUnlock(orderId, 1_000 ether);

        // sender got their full BTC back, MUSD reduced by full debt
        assertEq(btc.balanceOf(sender) - btcBefore, 0.05 ether);
        assertEq(musdBefore - musd.balanceOf(sender), 1_000 ether);

        RemittanceVault.RemittanceOrder memory o = vault.getOrder(orderId);
        assertEq(uint8(o.status), uint8(RemittanceVault.OrderStatus.SETTLED));
        assertEq(o.musdRepaid, 1_000 ether);
        assertEq(o.btcUnlocked, 0.05 ether);
    }

    function testRepayAndUnlockPartial() public {
        bytes32 orderId = _claimAndFundSender(1_000 ether, 0.05 ether);

        uint256 btcBefore = btc.balanceOf(sender);

        // Repay 25% → expect 25% BTC out, status still CLAIMED.
        vm.prank(sender);
        vault.repayAndUnlock(orderId, 250 ether);

        assertEq(btc.balanceOf(sender) - btcBefore, 0.0125 ether);

        RemittanceVault.RemittanceOrder memory o = vault.getOrder(orderId);
        assertEq(uint8(o.status), uint8(RemittanceVault.OrderStatus.CLAIMED));
        assertEq(o.musdRepaid, 250 ether);
        assertEq(o.btcUnlocked, 0.0125 ether);
    }

    function testRepayAndUnlockMultipleSteps() public {
        bytes32 orderId = _claimAndFundSender(1_000 ether, 0.05 ether);

        // 1st: 30% → 0.015 BTC
        vm.prank(sender);
        vault.repayAndUnlock(orderId, 300 ether);

        // 2nd: 30% of remaining 700 → 210 MUSD, btc = 0.035 * 210/700 = 0.0105
        vm.prank(sender);
        vault.repayAndUnlock(orderId, 210 ether);

        RemittanceVault.RemittanceOrder memory o1 = vault.getOrder(orderId);
        assertEq(o1.musdRepaid, 510 ether);
        assertEq(o1.btcUnlocked, 0.0255 ether);
        assertEq(uint8(o1.status), uint8(RemittanceVault.OrderStatus.CLAIMED));

        // 3rd: pay off remaining 490 → exact remaining BTC, no dust
        vm.prank(sender);
        vault.repayAndUnlock(orderId, 490 ether);

        RemittanceVault.RemittanceOrder memory o2 = vault.getOrder(orderId);
        assertEq(o2.musdRepaid, 1_000 ether);
        assertEq(o2.btcUnlocked, 0.05 ether);
        assertEq(uint8(o2.status), uint8(RemittanceVault.OrderStatus.SETTLED));
    }

    function testRepayAndUnlockRevertsForNonSender() public {
        bytes32 orderId = _claimAndFundSender(1_000 ether, 0.05 ether);

        address bystander = address(0xB75A);
        musd.mint(bystander, 1_000 ether);
        vm.prank(bystander);
        musd.approve(address(vault), type(uint256).max);

        vm.prank(bystander);
        vm.expectRevert(bytes("not sender"));
        vault.repayAndUnlock(orderId, 100 ether);
    }

    function testRepayAndUnlockRevertsBeforeClaim() public {
        bytes32 orderId = _create(1_000 ether, 0.05 ether, 3 days, recipient);
        musd.mint(sender, 1_000 ether);
        vm.startPrank(sender);
        musd.approve(address(vault), type(uint256).max);
        vm.expectRevert(bytes("not claimed"));
        vault.repayAndUnlock(orderId, 100 ether);
        vm.stopPrank();
    }

    function testRepayAndUnlockRevertsAfterCancel() public {
        bytes32 orderId = _create(1_000 ether, 0.05 ether, 3 days, recipient);
        vm.warp(block.timestamp + 3 days + 1);
        vm.prank(sender);
        vault.cancelRemittance(orderId);

        musd.mint(sender, 1_000 ether);
        vm.startPrank(sender);
        musd.approve(address(vault), type(uint256).max);
        vm.expectRevert(bytes("not claimed"));
        vault.repayAndUnlock(orderId, 100 ether);
        vm.stopPrank();
    }

    function testRepayAndUnlockRevertsExceedingDebt() public {
        bytes32 orderId = _claimAndFundSender(1_000 ether, 0.05 ether);
        musd.mint(sender, 500 ether); // need a bit more headroom

        vm.prank(sender);
        vm.expectRevert(bytes("exceeds debt"));
        vault.repayAndUnlock(orderId, 1_001 ether);
    }

    function testRepayAndUnlockRevertsWhenAlreadySettled() public {
        bytes32 orderId = _claimAndFundSender(1_000 ether, 0.05 ether);

        vm.prank(sender);
        vault.repayAndUnlock(orderId, 1_000 ether); // fully settle

        // arm again then attempt another repayment
        musd.mint(sender, 1 ether);
        vm.prank(sender);
        vm.expectRevert(bytes("already settled"));
        vault.repayAndUnlock(orderId, 1 ether);
    }
}
