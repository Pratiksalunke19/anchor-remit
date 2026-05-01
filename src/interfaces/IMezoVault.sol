// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IMezoVault
/// @notice Minimal abstraction over the Mezo BTC collateral / MUSD mint system.
/// @dev Implemented by `MockMezoVault` on testnet. On mainnet the adapter
///      should forward calls to the real Mezo borrowing contracts.
interface IMezoVault {
    /// @notice Deposit BTC collateral on behalf of `user`.
    /// @dev The caller must have approved / sent the BTC amount; on testnet
    ///      the mock accepts ERC20 transfers or raw uint accounting.
    function depositCollateral(address user, uint256 btcAmount) external;

    /// @notice Mint `musdAmount` MUSD to `to` using collateral previously
    ///         deposited by `user`.
    function mintMUSD(address user, address to, uint256 musdAmount) external;

    /// @notice Repay MUSD debt on behalf of `user` and release `btcAmount`
    ///         of collateral to `to`.
    function repayAndWithdraw(
        address user,
        address to,
        uint256 musdAmount,
        uint256 btcAmount
    ) external;

    /// @notice Current collateralisation ratio for `user`, scaled by 1e18.
    ///         200% is returned as `2e18`.
    function getCollateralRatio(address user) external view returns (uint256);

    /// @notice Address of the MUSD ERC20 token minted by this vault.
    function musd() external view returns (address);

    /// @notice Address of the BTC ERC20 token (wrapped BTC on testnet).
    function btc() external view returns (address);
}
