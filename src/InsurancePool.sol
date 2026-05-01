// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title InsurancePool
/// @notice Community-funded MUSD buffer that covers shortfalls from
///         liquidated / under-collateralised remittance orders and accrues
///         fees from each remittance routed through the vault.
contract InsurancePool is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable musd;

    /// @notice Address of the RemittanceVault authorised to draw funds / push fees.
    address public vault;

    uint256 public totalShares;
    mapping(address => uint256) public sharesOf;

    uint256 private constant PRECISION = 1e18;

    event Deposited(address indexed lp, uint256 amount, uint256 sharesMinted);
    event Withdrawn(address indexed lp, uint256 sharesBurned, uint256 amount);
    event ShortfallCovered(bytes32 indexed orderId, uint256 amount);
    event FeeReceived(bytes32 indexed orderId, uint256 amount);
    event VaultUpdated(address indexed newVault);

    modifier onlyVault() {
        require(msg.sender == vault, "not vault");
        _;
    }

    constructor(address _musd) Ownable(msg.sender) {
        require(_musd != address(0), "musd=0");
        musd = IERC20(_musd);
    }

    // -------------------- admin --------------------

    function setVault(address _vault) external onlyOwner {
        require(_vault != address(0), "vault=0");
        vault = _vault;
        emit VaultUpdated(_vault);
    }

    // -------------------- LP flow --------------------

    /// @notice Deposit MUSD, receive shares proportional to reserve.
    function deposit(uint256 amount) external nonReentrant returns (uint256 sharesMinted) {
        require(amount > 0, "amount=0");
        uint256 reserveBefore = totalReserve();
        musd.safeTransferFrom(msg.sender, address(this), amount);
        if (totalShares == 0 || reserveBefore == 0) {
            sharesMinted = amount;
        } else {
            sharesMinted = (amount * totalShares) / reserveBefore;
        }
        require(sharesMinted > 0, "shares=0");
        sharesOf[msg.sender] += sharesMinted;
        totalShares += sharesMinted;
        emit Deposited(msg.sender, amount, sharesMinted);
    }

    /// @notice Burn shares, redeem proportional MUSD.
    function withdraw(uint256 shares) external nonReentrant returns (uint256 amount) {
        require(shares > 0, "shares=0");
        require(sharesOf[msg.sender] >= shares, "insufficient shares");
        amount = (shares * totalReserve()) / totalShares;
        sharesOf[msg.sender] -= shares;
        totalShares -= shares;
        musd.safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, shares, amount);
    }

    // -------------------- vault-only flow --------------------

    /// @notice Cover `amount` MUSD shortfall for `orderId`, pushing funds to vault.
    function coverShortfall(bytes32 orderId, uint256 amount) external onlyVault nonReentrant {
        require(amount <= totalReserve(), "pool drained");
        musd.safeTransfer(vault, amount);
        emit ShortfallCovered(orderId, amount);
    }

    /// @notice Vault pushes protocol fees into the pool (MUSD).
    function recordFee(bytes32 orderId, uint256 amount) external onlyVault {
        // funds are already transferred in separately; we just emit for indexers
        emit FeeReceived(orderId, amount);
    }

    // -------------------- views --------------------

    function totalReserve() public view returns (uint256) {
        return musd.balanceOf(address(this));
    }

    /// @notice Returns pool health ratio scaled by 1e18 (reserve / shares).
    ///         For an untouched pool this starts at 1e18.
    function getPoolHealth() external view returns (uint256) {
        if (totalShares == 0) return PRECISION;
        return (totalReserve() * PRECISION) / totalShares;
    }
}
