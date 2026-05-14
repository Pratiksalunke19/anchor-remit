// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {IMezoVault} from "./interfaces/IMezoVault.sol";
import {InsurancePool} from "./InsurancePool.sol";

/// @title RemittanceVault
/// @notice Accepts BTC collateral from a sender, mints MUSD via Mezo's
///         borrowing system, and locks the minted MUSD under a PIN-gated
///         remittance order that a recipient can claim (or the sender can
///         cancel after expiry).
contract RemittanceVault is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // -------------------- types --------------------

    enum OrderStatus {
        PENDING,
        CLAIMED,
        CANCELLED,
        LIQUIDATED,
        SETTLED
    }

    struct RemittanceOrder {
        address sender;
        address recipient; // can be address(0) if phone-based
        uint256 musdAmount;
        uint256 collateralBTC;
        uint256 createdAt;
        uint256 expiryTimestamp;
        bytes32 claimCode; // keccak256(abi.encodePacked(orderId, pin))
        OrderStatus status;
        // Post-claim settlement tracking. Sender repays MUSD to unlock BTC
        // proportionally. Both fields are 0 until repayAndUnlock is called.
        uint256 musdRepaid;
        uint256 btcUnlocked;
    }

    // -------------------- storage --------------------

    IMezoVault public immutable mezo;
    InsurancePool public immutable pool;
    IERC20 public immutable musd;
    IERC20 public immutable btc;

    /// @notice Protocol fee in basis points (10 = 0.10%).
    uint16 public feeBps = 10;
    /// @notice Keeper authorised to trigger liquidation guard.
    address public keeper;

    /// @notice Collateral ratio below which a keeper can step in (scaled 1e18).
    uint256 public liquidationThreshold = 1.1e18; // 110%
    /// @notice Warning threshold for off-chain monitors (scaled 1e18).
    uint256 public warningThreshold = 1.25e18; // 125%

    uint256 public nextOrderNonce;
    mapping(bytes32 => RemittanceOrder) public orders;

    // -------------------- events --------------------

    event RemittanceCreated(
        bytes32 indexed orderId,
        address indexed sender,
        address indexed recipient,
        uint256 musdAmount,
        uint256 collateralBTC,
        uint256 expiryTimestamp
    );
    event RemittanceClaimed(
        bytes32 indexed orderId,
        address indexed recipient,
        uint256 amount,
        uint256 timestamp
    );
    event RemittanceCancelled(
        bytes32 indexed orderId,
        address indexed sender,
        uint256 refundBTC
    );
    event CollateralUnlocked(
        bytes32 indexed orderId,
        address indexed sender,
        uint256 musdRepaid,
        uint256 btcOut,
        uint256 musdRemaining,
        uint256 btcRemaining
    );
    event CollateralToppedUp(
        bytes32 indexed orderId,
        uint256 addedBTC,
        uint256 newRatio
    );
    event CollateralWarning(bytes32 indexed orderId, uint256 currentRatio);
    event LiquidationGuardTriggered(bytes32 indexed orderId, uint256 covered);
    event FeeUpdated(uint16 newFeeBps);
    event KeeperUpdated(address indexed newKeeper);

    // -------------------- modifiers --------------------

    modifier onlyKeeper() {
        require(msg.sender == keeper || msg.sender == owner(), "not keeper");
        _;
    }

    // -------------------- constructor --------------------

    constructor(address _mezo, address _pool) Ownable(msg.sender) {
        require(_mezo != address(0) && _pool != address(0), "zero addr");
        mezo = IMezoVault(_mezo);
        pool = InsurancePool(_pool);
        musd = IERC20(IMezoVault(_mezo).musd());
        btc = IERC20(IMezoVault(_mezo).btc());
    }

    // -------------------- admin --------------------

    function setFeeBps(uint16 newFee) external onlyOwner {
        require(newFee <= 500, "fee too high"); // cap 5%
        feeBps = newFee;
        emit FeeUpdated(newFee);
    }

    function setKeeper(address _keeper) external onlyOwner {
        keeper = _keeper;
        emit KeeperUpdated(_keeper);
    }

    function setThresholds(
        uint256 warningCR,
        uint256 liquidationCR
    ) external onlyOwner {
        require(liquidationCR < warningCR, "bad thresholds");
        require(liquidationCR >= 1e18, "liq<100%");
        warningThreshold = warningCR;
        liquidationThreshold = liquidationCR;
    }

    // -------------------- core flow --------------------

    /// @notice Create a remittance: pulls `collateralBTC` from sender, mints
    ///         `musdAmount` MUSD via Mezo, and locks it under `claimCodeHash`.
    /// @param recipient Recipient address (can be `address(0)` for phone-based).
    /// @param musdAmount MUSD amount to mint & lock (before fee).
    /// @param collateralBTC BTC collateral to deposit for this order.
    /// @param claimCodeHash `keccak256(abi.encodePacked(orderId, pin))` — but
    ///                     since orderId is computed on-chain the client
    ///                     instead submits `keccak256(pin)` and we combine.
    /// @param expirySeconds Seconds from now until the order can be cancelled.
    function createRemittance(
        address recipient,
        uint256 musdAmount,
        uint256 collateralBTC,
        bytes32 claimCodeHash,
        uint256 expirySeconds
    ) external nonReentrant returns (bytes32 orderId) {
        require(musdAmount > 0, "amount=0");
        require(collateralBTC > 0, "collat=0");
        require(
            expirySeconds >= 1 hours && expirySeconds <= 30 days,
            "bad expiry"
        );
        require(claimCodeHash != bytes32(0), "code=0");

        // pull BTC collateral and forward to Mezo
        btc.safeTransferFrom(msg.sender, address(this), collateralBTC);
        btc.forceApprove(address(mezo), collateralBTC);
        mezo.depositCollateral(address(this), collateralBTC);

        // mint MUSD to this contract (held in escrow until claim)
        mezo.mintMUSD(address(this), address(this), musdAmount);

        // compute order id and store
        orderId = keccak256(
            abi.encodePacked(
                msg.sender,
                recipient,
                musdAmount,
                block.chainid,
                block.timestamp,
                nextOrderNonce++
            )
        );

        orders[orderId] = RemittanceOrder({
            sender: msg.sender,
            recipient: recipient,
            musdAmount: musdAmount,
            collateralBTC: collateralBTC,
            createdAt: block.timestamp,
            expiryTimestamp: block.timestamp + expirySeconds,
            claimCode: keccak256(abi.encodePacked(orderId, claimCodeHash)),
            status: OrderStatus.PENDING,
            musdRepaid: 0,
            btcUnlocked: 0
        });

        emit RemittanceCreated(
            orderId,
            msg.sender,
            recipient,
            musdAmount,
            collateralBTC,
            block.timestamp + expirySeconds
        );
    }

    /// @notice Claim a remittance by presenting the PIN pre-image.
    /// @dev The client must compute `claimCodeHash = keccak256(pin)` off-chain
    ///      and here we re-derive `keccak256(orderId || claimCodeHash)` and
    ///      compare with stored `claimCode`.
    function claimRemittance(
        bytes32 orderId,
        bytes32 claimCodeHash
    ) external nonReentrant {
        RemittanceOrder storage o = orders[orderId];
        require(o.status == OrderStatus.PENDING, "not pending");
        require(block.timestamp <= o.expiryTimestamp, "expired");

        bytes32 derived = keccak256(abi.encodePacked(orderId, claimCodeHash));
        require(derived == o.claimCode, "bad pin");

        // If a specific recipient was set, enforce it; otherwise any claimer OK.
        if (o.recipient != address(0)) {
            require(msg.sender == o.recipient, "not recipient");
        }

        o.status = OrderStatus.CLAIMED;

        uint256 fee = (o.musdAmount * feeBps) / 10_000;
        uint256 net = o.musdAmount - fee;

        if (fee > 0) {
            musd.safeTransfer(address(pool), fee);
            pool.recordFee(orderId, fee);
        }
        musd.safeTransfer(msg.sender, net);

        emit RemittanceClaimed(orderId, msg.sender, net, block.timestamp);
    }

    /// @notice Cancel an expired remittance and recover the BTC collateral.
    function cancelRemittance(bytes32 orderId) external nonReentrant {
        RemittanceOrder storage o = orders[orderId];
        require(o.status == OrderStatus.PENDING, "not pending");
        require(msg.sender == o.sender, "not sender");
        require(block.timestamp > o.expiryTimestamp, "not expired");

        o.status = OrderStatus.CANCELLED;

        // repay MUSD debt and withdraw collateral to sender
        musd.forceApprove(address(mezo), o.musdAmount);
        mezo.repayAndWithdraw(
            address(this),
            o.sender,
            o.musdAmount,
            o.collateralBTC
        );

        emit RemittanceCancelled(orderId, o.sender, o.collateralBTC);
    }

    /// @notice Repay MUSD to unlock BTC collateral after a recipient has
    ///         claimed. Supports partial repayments: each call releases BTC
    ///         proportional to how much of the *remaining* debt is repaid.
    /// @dev    The caller must approve this contract to pull `musdRepay` MUSD.
    /// @param  orderId   The remittance to settle against.
    /// @param  musdRepay MUSD amount to repay (≤ remaining debt for this order).
    function repayAndUnlock(
        bytes32 orderId,
        uint256 musdRepay
    ) external nonReentrant {
        RemittanceOrder storage o = orders[orderId];
        require(msg.sender == o.sender, "not sender");
        require(
            o.status == OrderStatus.CLAIMED || o.status == OrderStatus.SETTLED,
            "not claimed"
        );
        require(musdRepay > 0, "amount=0");

        uint256 musdRemaining = o.musdAmount - o.musdRepaid;
        uint256 btcRemaining = o.collateralBTC - o.btcUnlocked;
        require(musdRemaining > 0 && btcRemaining > 0, "already settled");
        require(musdRepay <= musdRemaining, "exceeds debt");

        // Proportional release; on the final repayment we hand back the exact
        // remaining BTC so integer-division dust doesn't strand collateral.
        uint256 btcOut;
        if (musdRepay == musdRemaining) {
            btcOut = btcRemaining;
        } else {
            btcOut = (btcRemaining * musdRepay) / musdRemaining;
            require(btcOut > 0, "btc=0");
        }

        // effects
        o.musdRepaid += musdRepay;
        o.btcUnlocked += btcOut;
        bool fullySettled = o.musdRepaid == o.musdAmount &&
            o.btcUnlocked == o.collateralBTC;
        if (fullySettled) {
            o.status = OrderStatus.SETTLED;
        }

        // interactions
        musd.safeTransferFrom(msg.sender, address(this), musdRepay);
        musd.forceApprove(address(mezo), musdRepay);
        mezo.repayAndWithdraw(address(this), o.sender, musdRepay, btcOut);

        emit CollateralUnlocked(
            orderId,
            o.sender,
            musdRepay,
            btcOut,
            o.musdAmount - o.musdRepaid,
            o.collateralBTC - o.btcUnlocked
        );
    }

    /// @notice Top up collateral on an active order (sender only).
    function topUpCollateral(
        bytes32 orderId,
        uint256 extraBTC
    ) external nonReentrant {
        RemittanceOrder storage o = orders[orderId];
        require(o.status == OrderStatus.PENDING, "not pending");
        require(msg.sender == o.sender, "not sender");
        require(extraBTC > 0, "amount=0");

        btc.safeTransferFrom(msg.sender, address(this), extraBTC);
        btc.forceApprove(address(mezo), extraBTC);
        mezo.depositCollateral(address(this), extraBTC);
        o.collateralBTC += extraBTC;

        uint256 newRatio = mezo.getCollateralRatio(address(this));
        emit CollateralToppedUp(orderId, extraBTC, newRatio);
    }

    /// @notice Current pooled collateral ratio across all of the vault's debt.
    function vaultCollateralRatio() public view returns (uint256) {
        return mezo.getCollateralRatio(address(this));
    }

    /// @notice Triggered by a keeper when vault CR < liquidationThreshold.
    ///         Pulls MUSD from the InsurancePool to cover the order so the
    ///         recipient can still claim.
    function liquidationGuard(
        bytes32 orderId
    ) external onlyKeeper nonReentrant {
        RemittanceOrder storage o = orders[orderId];
        require(o.status == OrderStatus.PENDING, "not pending");

        uint256 cr = mezo.getCollateralRatio(address(this));
        require(cr < liquidationThreshold, "CR ok");

        // Estimate the shortfall against this specific order. In the mock
        // model (1 BTC price), we cover the full musdAmount; the pool only
        // forwards what is missing from the escrowed balance.
        uint256 heldByVault = musd.balanceOf(address(this));
        uint256 needed = o.musdAmount;
        uint256 shortfall = heldByVault >= needed ? 0 : needed - heldByVault;

        if (shortfall > 0) {
            pool.coverShortfall(orderId, shortfall);
        }

        o.status = OrderStatus.LIQUIDATED;
        // recipient / sender can claim (sender has a recourse to full amount)
        // we transfer MUSD to sender as refund-in-kind so they can resend
        musd.safeTransfer(o.sender, needed);

        emit LiquidationGuardTriggered(orderId, shortfall);
        emit CollateralWarning(orderId, cr);
    }

    /// @notice Anyone can emit a warning event for monitors if CR dips.
    function pingWarning(bytes32 orderId) external {
        RemittanceOrder storage o = orders[orderId];
        require(o.status == OrderStatus.PENDING, "not pending");
        uint256 cr = mezo.getCollateralRatio(address(this));
        require(cr < warningThreshold, "CR ok");
        emit CollateralWarning(orderId, cr);
    }

    // -------------------- views --------------------

    function getOrder(
        bytes32 orderId
    ) external view returns (RemittanceOrder memory) {
        return orders[orderId];
    }
}
