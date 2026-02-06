// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

interface IZapVault {
    struct UserConfig {
        int24 rangeWidth; // total tick range width (e.g. 1200 = +/- 600 ticks)
        uint16 rebalanceThreshold; // bps deviation to trigger rebalance (e.g. 500 = 5%)
        uint16 slippage; // max slippage in bps (e.g. 100 = 1%)
    }

    struct UserPosition {
        int24 tickLower;
        int24 tickUpper;
        int256 liquidity;
        uint256 depositedUSDC;
        uint256 depositTimestamp;
        bytes32 salt;
    }

    event Deposited(address indexed user, uint256 usdcAmount, int24 tickLower, int24 tickUpper, int256 liquidity);
    event Rebalanced(address indexed user, int24 newTickLower, int24 newTickUpper);
    event Withdrawn(address indexed user, uint256 ethAmount, uint256 usdcAmount);
    event NeedsRebalance(address indexed user, int24 currentTick, int24 tickLower, int24 tickUpper);
}
