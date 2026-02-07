// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "@uniswap/v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency, CurrencyLibrary} from "@uniswap/v4-core/src/types/Currency.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {ModifyLiquidityParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @notice Helper contract to seed a pool with liquidity and recover it later
contract PoolSeeder is IUnlockCallback {
    using CurrencyLibrary for Currency;

    IPoolManager public immutable poolManager;
    address public immutable owner;

    // Track the seed position so it can be removed later
    bool public seeded;
    PoolKey public seedKey;
    int24 public seedTickLower;
    int24 public seedTickUpper;
    int256 public seedLiquidity;

    enum CallbackAction { SEED, REMOVE }

    struct CallbackParams {
        CallbackAction action;
        PoolKey key;
        int24 tickLower;
        int24 tickUpper;
        int256 liquidityDelta;
    }

    constructor(IPoolManager _poolManager) {
        poolManager = _poolManager;
        owner = tx.origin;
    }

    /// @notice Seed the pool with liquidity
    function seed(PoolKey memory key, int24 tickLower, int24 tickUpper, int256 liquidityDelta) external payable {
        require(msg.sender == owner, "OnlyOwner");

        // Store position info for later removal
        seedKey = key;
        seedTickLower = tickLower;
        seedTickUpper = tickUpper;
        seedLiquidity = liquidityDelta;
        seeded = true;

        poolManager.unlock(abi.encode(CallbackParams(
            CallbackAction.SEED, key, tickLower, tickUpper, liquidityDelta
        )));
    }

    /// @notice Remove seed liquidity and recover tokens
    function removeSeed() external {
        require(msg.sender == owner, "OnlyOwner");
        require(seeded, "NotSeeded");

        poolManager.unlock(abi.encode(CallbackParams(
            CallbackAction.REMOVE, seedKey, seedTickLower, seedTickUpper, -seedLiquidity
        )));

        seeded = false;
        seedLiquidity = 0;
    }

    /// @notice Withdraw any tokens held by the seeder (leftover or recovered)
    function withdraw(address token) external {
        require(msg.sender == owner, "OnlyOwner");
        if (token == address(0)) {
            payable(owner).transfer(address(this).balance);
        } else {
            uint256 bal = IERC20(token).balanceOf(address(this));
            if (bal > 0) IERC20(token).transfer(owner, bal);
        }
    }

    function unlockCallback(bytes calldata data) external override returns (bytes memory) {
        require(msg.sender == address(poolManager), "Not PoolManager");

        CallbackParams memory params = abi.decode(data, (CallbackParams));

        (BalanceDelta delta,) = poolManager.modifyLiquidity(
            params.key,
            ModifyLiquidityParams({
                tickLower: params.tickLower,
                tickUpper: params.tickUpper,
                liquidityDelta: params.liquidityDelta,
                salt: bytes32(0)
            }),
            ""
        );

        if (params.action == CallbackAction.SEED) {
            // Settle: pay tokens INTO the pool
            int128 amount1 = delta.amount1();
            if (amount1 < 0) {
                uint256 needed = uint128(-amount1);
                poolManager.sync(params.key.currency1);
                IERC20(Currency.unwrap(params.key.currency1)).transfer(address(poolManager), needed);
                poolManager.settle();
            }

            int128 amount0 = delta.amount0();
            if (amount0 < 0) {
                poolManager.settle{value: uint128(-amount0)}();
            }
        } else {
            // Remove: take tokens OUT of the pool
            int128 amount0 = delta.amount0();
            if (amount0 > 0) {
                poolManager.take(params.key.currency0, address(this), uint128(amount0));
            }

            int128 amount1 = delta.amount1();
            if (amount1 > 0) {
                poolManager.take(params.key.currency1, address(this), uint128(amount1));
            }
        }

        return "";
    }

    receive() external payable {}
}
