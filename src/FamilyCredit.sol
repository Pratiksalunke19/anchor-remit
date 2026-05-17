// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {IMezoVault} from "./interfaces/IMezoVault.sol";

/// @title FamilyCredit
/// @notice Credit-delegation primitive for Anchor Remit families. A "head"
///         locks BTC collateral, mints MUSD via Mezo into a shared family
///         pool, and assigns per-member MUSD credit limits. Members can
///         borrow MUSD up to their limit and must repay before the head can
///         unlock the underlying BTC collateral.
contract FamilyCredit is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // -------------------- types --------------------

    struct Family {
        bool exists;
        uint256 collateralBTC; // BTC deposited into Mezo under this contract for this head
        uint256 musdMinted;    // total MUSD minted into the family pool
        uint256 totalBorrowed; // sum of outstanding borrows across members
        address[] memberList;  // append-only roster (UI filters by active)
    }

    struct Member {
        uint256 limit;    // max MUSD this member may have outstanding
        uint256 borrowed; // currently outstanding
        bool active;
    }

    // -------------------- storage --------------------

    IMezoVault public immutable mezo;
    IERC20 public immutable musd;
    IERC20 public immutable btc;

    /// @dev one family per head address.
    mapping(address => Family) internal families;
    /// @dev head => member => record
    mapping(address => mapping(address => Member)) public memberOf;

    // -------------------- events --------------------

    event FamilyCreated(address indexed head, uint256 collateralBTC, uint256 musdMinted);
    event CollateralAdded(address indexed head, uint256 extraBTC, uint256 extraMUSD);
    event MemberSet(address indexed head, address indexed member, uint256 limit);
    event MemberRemoved(address indexed head, address indexed member);
    event Borrowed(address indexed head, address indexed member, uint256 amount);
    event Repaid(address indexed head, address indexed member, uint256 amount);
    event CollateralWithdrawn(address indexed head, uint256 musdRepaid, uint256 btcOut);

    // -------------------- constructor --------------------

    constructor(address _mezo) {
        require(_mezo != address(0), "zero addr");
        mezo = IMezoVault(_mezo);
        musd = IERC20(IMezoVault(_mezo).musd());
        btc = IERC20(IMezoVault(_mezo).btc());
    }

    // -------------------- head: family lifecycle --------------------

    /// @notice Open a family pool by depositing BTC and minting MUSD.
    function createFamily(
        uint256 collateralBTC,
        uint256 musdToMint
    ) external nonReentrant {
        Family storage f = families[msg.sender];
        require(!f.exists, "family exists");
        require(collateralBTC > 0, "collat=0");
        require(musdToMint > 0, "mint=0");

        f.exists = true;
        _depositAndMint(f, collateralBTC, musdToMint);

        emit FamilyCreated(msg.sender, collateralBTC, musdToMint);
    }

    /// @notice Top up collateral and/or mint additional MUSD into the pool.
    function addCollateralAndMint(
        uint256 extraBTC,
        uint256 extraMUSD
    ) external nonReentrant {
        Family storage f = families[msg.sender];
        require(f.exists, "no family");
        require(extraBTC > 0 || extraMUSD > 0, "zero");
        _depositAndMint(f, extraBTC, extraMUSD);
        emit CollateralAdded(msg.sender, extraBTC, extraMUSD);
    }

    function _depositAndMint(
        Family storage f,
        uint256 collat,
        uint256 mint
    ) internal {
        if (collat > 0) {
            btc.safeTransferFrom(msg.sender, address(this), collat);
            btc.forceApprove(address(mezo), collat);
            mezo.depositCollateral(address(this), collat);
            f.collateralBTC += collat;
        }
        if (mint > 0) {
            mezo.mintMUSD(address(this), address(this), mint);
            f.musdMinted += mint;
        }
    }

    /// @notice Head burns MUSD from the available pool and withdraws BTC.
    /// @dev    Limited by `(musdMinted - totalBorrowed)` since borrowed funds
    ///         have already left the contract.
    function withdrawCollateral(
        uint256 musdRepay,
        uint256 btcOut
    ) external nonReentrant {
        Family storage f = families[msg.sender];
        require(f.exists, "no family");
        require(musdRepay > 0 && btcOut > 0, "zero");

        uint256 available = f.musdMinted - f.totalBorrowed;
        require(musdRepay <= available, "insufficient liquidity");
        require(btcOut <= f.collateralBTC, "over collat");

        // effects
        f.musdMinted -= musdRepay;
        f.collateralBTC -= btcOut;

        // interactions
        musd.forceApprove(address(mezo), musdRepay);
        mezo.repayAndWithdraw(address(this), msg.sender, musdRepay, btcOut);

        emit CollateralWithdrawn(msg.sender, musdRepay, btcOut);
    }

    // -------------------- head: member management --------------------

    /// @notice Assign or update a member's MUSD credit limit. Cannot drop
    ///         below their current outstanding borrow.
    function setMemberLimit(address member, uint256 limit) external {
        Family storage f = families[msg.sender];
        require(f.exists, "no family");
        require(member != address(0) && member != msg.sender, "bad member");

        Member storage m = memberOf[msg.sender][member];
        require(limit >= m.borrowed, "limit<borrowed");

        if (!m.active) {
            m.active = true;
            f.memberList.push(member);
        }
        m.limit = limit;
        emit MemberSet(msg.sender, member, limit);
    }

    /// @notice Remove a member. Member must have zero outstanding borrow.
    function removeMember(address member) external {
        Family storage f = families[msg.sender];
        require(f.exists, "no family");
        Member storage m = memberOf[msg.sender][member];
        require(m.active, "not member");
        require(m.borrowed == 0, "has debt");
        m.active = false;
        m.limit = 0;
        emit MemberRemoved(msg.sender, member);
    }

    // -------------------- member flow --------------------

    /// @notice Borrow MUSD against `head`'s family pool.
    function borrow(address head, uint256 amount) external nonReentrant {
        Family storage f = families[head];
        require(f.exists, "no family");
        require(amount > 0, "amount=0");

        Member storage m = memberOf[head][msg.sender];
        require(m.active, "not member");
        require(m.borrowed + amount <= m.limit, "over limit");

        uint256 available = f.musdMinted - f.totalBorrowed;
        require(amount <= available, "no liquidity");

        m.borrowed += amount;
        f.totalBorrowed += amount;

        musd.safeTransfer(msg.sender, amount);
        emit Borrowed(head, msg.sender, amount);
    }

    /// @notice Repay MUSD into the family pool, freeing the member's limit
    ///         and the head's withdrawable collateral.
    function repay(address head, uint256 amount) external nonReentrant {
        Family storage f = families[head];
        require(f.exists, "no family");
        require(amount > 0, "amount=0");

        Member storage m = memberOf[head][msg.sender];
        require(amount <= m.borrowed, "over debt");

        m.borrowed -= amount;
        f.totalBorrowed -= amount;

        musd.safeTransferFrom(msg.sender, address(this), amount);
        emit Repaid(head, msg.sender, amount);
    }

    // -------------------- views --------------------

    function getFamily(
        address head
    )
        external
        view
        returns (
            bool exists,
            uint256 collateralBTC,
            uint256 musdMinted,
            uint256 totalBorrowed,
            uint256 available,
            address[] memory memberList
        )
    {
        Family storage f = families[head];
        exists = f.exists;
        collateralBTC = f.collateralBTC;
        musdMinted = f.musdMinted;
        totalBorrowed = f.totalBorrowed;
        available = f.exists ? f.musdMinted - f.totalBorrowed : 0;
        memberList = f.memberList;
    }

    function getMember(
        address head,
        address member
    ) external view returns (uint256 limit, uint256 borrowed, bool active) {
        Member storage m = memberOf[head][member];
        return (m.limit, m.borrowed, m.active);
    }

    /// @notice Family-level collateral ratio inherited from Mezo for this contract.
    /// @dev    Note: shared across all families since Mezo tracks per-address.
    function poolCollateralRatio() external view returns (uint256) {
        return mezo.getCollateralRatio(address(this));
    }
}
