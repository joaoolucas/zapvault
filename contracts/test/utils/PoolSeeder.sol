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

/// @notice Helper contract to seed a pool with liquidity in tests
contract PoolSeeder is IUnlockCallback {
    using CurrencyLibrary for Currency;

    IPoolManager public immutable poolManager;
    address public immutable owner;

    constructor(IPoolManager _poolManager) {
        poolManager = _poolManager;
        owner = tx.origin;
    }

    /// @notice Withdraw leftover ETH and any ERC20 tokens after seeding
    function withdraw(address token) external {
        require(msg.sender == owner, "OnlyOwner");
        if (token == address(0)) {
            payable(owner).transfer(address(this).balance);
        } else {
            uint256 bal = IERC20(token).balanceOf(address(this));
            if (bal > 0) IERC20(token).transfer(owner, bal);
        }
    }

    struct SeedParams {
        PoolKey key;
        int24 tickLower;
        int24 tickUpper;
        int256 liquidityDelta;
    }

    function seed(PoolKey memory key, int24 tickLower, int24 tickUpper, int256 liquidityDelta) external payable {
        poolManager.unlock(abi.encode(SeedParams(key, tickLower, tickUpper, liquidityDelta)));
    }

    function unlockCallback(bytes calldata data) external override returns (bytes memory) {
        require(msg.sender == address(poolManager), "Not PoolManager");

        SeedParams memory params = abi.decode(data, (SeedParams));

        // First: add liquidity to learn exact deltas
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

        // Settle currency1 (USDC) — transfer exact amount needed
        int128 amount1 = delta.amount1();
        if (amount1 < 0) {
            uint256 needed = uint128(-amount1);
            poolManager.sync(params.key.currency1);
            IERC20(Currency.unwrap(params.key.currency1)).transfer(address(poolManager), needed);
            poolManager.settle();
        }

        // Settle currency0 (ETH) — send exact ETH needed
        int128 amount0 = delta.amount0();
        if (amount0 < 0) {
            poolManager.settle{value: uint128(-amount0)}();
        }

        return "";
    }

    receive() external payable {}
}
