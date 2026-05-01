// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IMezoVault} from "../interfaces/IMezoVault.sol";
import {MockERC20} from "./MockERC20.sol";

/// @title MockMezoVault
/// @notice Simulates Mezo's BTC collateral / MUSD borrowing system for testnet.
/// @dev Uses a fixed BTC price (configurable) and a target collateral ratio.
///      Collateral is held by this contract; MUSD is minted via its owner role
///      on the MUSD mock token.
contract MockMezoVault is IMezoVault {
    using SafeERC20 for IERC20;

    MockERC20 public immutable musdToken;
    MockERC20 public immutable btcToken;

    /// @notice BTC price in USD, scaled by 1e18. Configurable for tests.
    uint256 public btcPriceUsd = 60_000 ether;

    /// @notice BTC and MUSD both use 18 decimals in this mock.
    uint256 private constant PRECISION = 1e18;

    mapping(address => uint256) public collateralOf; // btc units (18 dec)
    mapping(address => uint256) public debtOf;       // musd units (18 dec)

    address public priceAdmin;

    event CollateralDeposited(address indexed user, uint256 btcAmount);
    event Minted(address indexed user, address indexed to, uint256 musdAmount);
    event Repaid(address indexed user, uint256 musdAmount, uint256 btcOut);
    event PriceUpdated(uint256 newPriceUsd);

    constructor(address _musd, address _btc) {
        musdToken = MockERC20(_musd);
        btcToken = MockERC20(_btc);
        priceAdmin = msg.sender;
    }

    // -------------------- admin --------------------

    function setBtcPrice(uint256 newPrice) external {
        require(msg.sender == priceAdmin, "not admin");
        require(newPrice > 0, "price=0");
        btcPriceUsd = newPrice;
        emit PriceUpdated(newPrice);
    }

    // -------------------- IMezoVault --------------------

    function depositCollateral(address user, uint256 btcAmount) external {
        IERC20(address(btcToken)).safeTransferFrom(msg.sender, address(this), btcAmount);
        collateralOf[user] += btcAmount;
        emit CollateralDeposited(user, btcAmount);
    }

    function mintMUSD(address user, address to, uint256 musdAmount) external {
        debtOf[user] += musdAmount;
        // solvency check: new ratio must be >= 150%
        require(_ratio(user) >= 1.5e18, "undercollateralized");
        musdToken.mint(to, musdAmount);
        emit Minted(user, to, musdAmount);
    }

    function repayAndWithdraw(
        address user,
        address to,
        uint256 musdAmount,
        uint256 btcAmount
    ) external {
        require(musdAmount <= debtOf[user], "repay>debt");
        require(btcAmount <= collateralOf[user], "withdraw>collat");

        // pull MUSD from caller and burn via transfer-to-zero pattern
        IERC20(address(musdToken)).safeTransferFrom(msg.sender, address(this), musdAmount);
        // simulate burn: send to a dead address to reduce supply view
        IERC20(address(musdToken)).safeTransfer(address(0xdead), musdAmount);

        debtOf[user] -= musdAmount;
        collateralOf[user] -= btcAmount;

        // if there is remaining debt, require it stays solvent
        if (debtOf[user] > 0) {
            require(_ratio(user) >= 1.5e18, "withdraw breaks CR");
        }

        IERC20(address(btcToken)).safeTransfer(to, btcAmount);
        emit Repaid(user, musdAmount, btcAmount);
    }

    function getCollateralRatio(address user) external view returns (uint256) {
        return _ratio(user);
    }

    function musd() external view returns (address) {
        return address(musdToken);
    }

    function btc() external view returns (address) {
        return address(btcToken);
    }

    // -------------------- internal --------------------

    function _ratio(address user) internal view returns (uint256) {
        uint256 debt = debtOf[user];
        if (debt == 0) return type(uint256).max;
        // collateral value in USD = collateral * price / 1e18
        uint256 valueUsd = (collateralOf[user] * btcPriceUsd) / PRECISION;
        return (valueUsd * PRECISION) / debt;
    }
}
