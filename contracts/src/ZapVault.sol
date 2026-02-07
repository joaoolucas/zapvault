// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "@uniswap/v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency, CurrencyLibrary} from "@uniswap/v4-core/src/types/Currency.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {SwapParams, ModifyLiquidityParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IZapVault} from "./interfaces/IZapVault.sol";

interface AggregatorV3Interface {
    function latestRoundData() external view returns (
        uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound
    );
}

/// @title ZapVault — AI-managed concentrated LP on Uniswap v4
/// @notice Standalone vault (no hook) that manages positions on any existing v4 pool
contract ZapVault is IUnlockCallback, IZapVault {
    using PoolIdLibrary for PoolKey;
    using CurrencyLibrary for Currency;
    using StateLibrary for IPoolManager;

    // --- State ---
    IPoolManager public immutable poolManager;
    PoolKey public poolKey;
    address public router;
    address public owner;
    AggregatorV3Interface public immutable priceFeed;

    mapping(address => UserPosition) public positions;
    mapping(address => UserConfig) public configs;

    uint256 private _saltCounter;

    // --- Unlock action types ---
    enum Action { DEPOSIT, REBALANCE, WITHDRAW }

    struct DepositParams {
        address user;
        uint256 usdcAmount;
        UserConfig config;
    }

    // --- Errors ---
    error OnlyRouter();
    error OnlyOwner();
    error OnlyPoolManager();
    error PositionAlreadyExists();
    error NoPosition();
    error InvalidConfig();
    error StaleOracle();

    constructor(
        IPoolManager _poolManager,
        PoolKey memory _poolKey,
        address _router,
        address _priceFeed
    ) {
        poolManager = _poolManager;
        poolKey = _poolKey;
        router = _router;
        owner = msg.sender;
        priceFeed = AggregatorV3Interface(_priceFeed);
    }

    function setRouter(address _router) external {
        if (msg.sender != owner) revert OnlyOwner();
        router = _router;
    }

    /// @notice Rescue stuck tokens (ETH or ERC20) — owner only
    function rescue(address token, address to, uint256 amount) external {
        if (msg.sender != owner) revert OnlyOwner();
        if (token == address(0)) {
            payable(to).transfer(amount);
        } else {
            IERC20(token).transfer(to, amount);
        }
    }

    // --- External functions ---

    function deposit(address user, uint256 usdcAmount, UserConfig calldata config) external {
        if (msg.sender != router) revert OnlyRouter();
        if (positions[user].liquidity > 0) revert PositionAlreadyExists();
        if (config.rangeWidth <= 0 || config.rebalanceThreshold == 0) revert InvalidConfig();

        configs[user] = config;

        Currency usdc = poolKey.currency1;
        IERC20(Currency.unwrap(usdc)).transferFrom(msg.sender, address(this), usdcAmount);

        bytes memory data = abi.encode(Action.DEPOSIT, abi.encode(DepositParams(user, usdcAmount, config)));
        poolManager.unlock(data);
    }

    function rebalance(address user) external {
        if (positions[user].liquidity == 0) revert NoPosition();

        bytes memory data = abi.encode(Action.REBALANCE, abi.encode(user));
        poolManager.unlock(data);
    }

    function withdraw() external {
        if (positions[msg.sender].liquidity == 0) revert NoPosition();

        bytes memory data = abi.encode(Action.WITHDRAW, abi.encode(msg.sender));
        poolManager.unlock(data);
    }

    // --- Unlock callback ---

    function unlockCallback(bytes calldata data) external override returns (bytes memory) {
        if (msg.sender != address(poolManager)) revert OnlyPoolManager();

        (Action action, bytes memory params) = abi.decode(data, (Action, bytes));

        if (action == Action.DEPOSIT) {
            _executeDeposit(abi.decode(params, (DepositParams)));
        } else if (action == Action.REBALANCE) {
            _executeRebalance(abi.decode(params, (address)));
        } else if (action == Action.WITHDRAW) {
            _executeWithdraw(abi.decode(params, (address)));
        }

        return "";
    }

    // --- Oracle ---

    function _getOracleTick() internal view returns (int24) {
        (, int256 answer,, uint256 updatedAt,) = priceFeed.latestRoundData();
        if (answer <= 0 || block.timestamp - updatedAt > 3600) revert StaleOracle();

        uint256 price = uint256(answer);
        uint256 sqrtPrice = _sqrt(price);
        uint256 targetSqrtPriceX96 = (sqrtPrice * (1 << 96)) / 1e10;

        if (targetSqrtPriceX96 < uint256(uint160(TickMath.MIN_SQRT_PRICE))) {
            return TickMath.MIN_TICK;
        }
        if (targetSqrtPriceX96 > uint256(uint160(TickMath.MAX_SQRT_PRICE))) {
            return TickMath.MAX_TICK;
        }

        return TickMath.getTickAtSqrtPrice(uint160(targetSqrtPriceX96));
    }

    function _sqrt(uint256 x) internal pure returns (uint256) {
        if (x == 0) return 0;
        uint256 z = (x + 1) / 2;
        uint256 y = x;
        while (z < y) {
            y = z;
            z = (x / z + z) / 2;
        }
        return y;
    }

    // --- Internal execution ---

    function _executeDeposit(DepositParams memory params) internal {
        PoolKey memory key = poolKey;
        PoolId poolId = key.toId();

        Currency usdc = key.currency1;
        uint256 usdcAmount = params.usdcAmount;

        // 1. Calculate LP range from ORACLE tick
        int24 oracleTick = _getOracleTick();
        int24 tickSpacing = key.tickSpacing;
        int24 halfRange = params.config.rangeWidth / 2;
        int24 tickLower = _alignTick(oracleTick - halfRange, tickSpacing);
        int24 tickUpper = _alignTick(oracleTick + halfRange, tickSpacing);
        tickLower = tickLower < TickMath.MIN_TICK ? TickMath.minUsableTick(tickSpacing) : tickLower;
        tickUpper = tickUpper > TickMath.MAX_TICK ? TickMath.maxUsableTick(tickSpacing) : tickUpper;

        // 2. Read current POOL price to determine swap ratio
        (uint160 sqrtPriceCurrent, int24 currentTick,,) = poolManager.getSlot0(poolId);

        // 3. Calculate swap amount based on position vs pool price
        uint256 swapAmount;
        if (currentTick >= tickUpper) {
            swapAmount = 0;
        } else if (currentTick <= tickLower) {
            swapAmount = usdcAmount;
        } else {
            uint256 totalRange = uint256(int256(tickUpper - tickLower));
            uint256 ethRange = uint256(int256(tickUpper - currentTick));
            swapAmount = (usdcAmount * ethRange) / totalRange;
        }

        // 4. Transfer ALL USDC to PoolManager and settle
        poolManager.sync(usdc);
        IERC20(Currency.unwrap(usdc)).transfer(address(poolManager), usdcAmount);
        poolManager.settle();

        // 5. Swap USDC → ETH
        BalanceDelta swapDelta;
        if (swapAmount > 0) {
            swapDelta = poolManager.swap(
                key,
                SwapParams({
                    zeroForOne: false,
                    amountSpecified: -int256(swapAmount),
                    sqrtPriceLimitX96: TickMath.MAX_SQRT_PRICE - 1
                }),
                ""
            );
        }

        // 6. Re-read pool price AFTER swap
        (sqrtPriceCurrent,,,) = poolManager.getSlot0(poolId);

        uint256 ethAmount = swapDelta.amount0() > 0 ? uint256(uint128(swapDelta.amount0())) : 0;
        uint256 remainingUsdc = usdcAmount - swapAmount;

        bytes32 salt = bytes32(_saltCounter++);
        uint160 sqrtPriceLower = TickMath.getSqrtPriceAtTick(tickLower);
        uint160 sqrtPriceUpper = TickMath.getSqrtPriceAtTick(tickUpper);

        int256 liquidityDelta = int256(_calculateLiquidity(
            sqrtPriceCurrent, sqrtPriceLower, sqrtPriceUpper, ethAmount, remainingUsdc
        ));

        // 7. Add concentrated liquidity
        BalanceDelta lpDelta;
        if (liquidityDelta > 0) {
            lpDelta = _modifyLiquidity(key, tickLower, tickUpper, liquidityDelta, salt);
        }

        // 8. Settle net deltas
        int128 netEth = swapDelta.amount0() + lpDelta.amount0();
        if (netEth > 0) {
            poolManager.take(key.currency0, address(this), uint128(netEth));
        } else if (netEth < 0) {
            poolManager.settle{value: uint128(-netEth)}();
        }

        int128 netUsdc = int128(int256(usdcAmount)) + swapDelta.amount1() + lpDelta.amount1();
        if (netUsdc > 0) {
            poolManager.take(usdc, address(this), uint128(netUsdc));
        } else if (netUsdc < 0) {
            poolManager.sync(usdc);
            IERC20(Currency.unwrap(usdc)).transfer(address(poolManager), uint128(-netUsdc));
            poolManager.settle();
        }

        // Store position
        positions[params.user] = UserPosition({
            tickLower: tickLower,
            tickUpper: tickUpper,
            liquidity: liquidityDelta,
            depositedUSDC: params.usdcAmount,
            depositTimestamp: block.timestamp,
            salt: salt
        });

        emit Deposited(params.user, params.usdcAmount, tickLower, tickUpper, liquidityDelta);
    }

    function _executeRebalance(address user) internal {
        PoolKey memory key = poolKey;
        PoolId poolId = key.toId();
        UserPosition memory pos = positions[user];
        UserConfig memory config = configs[user];

        // Remove old liquidity
        BalanceDelta removeDelta = _modifyLiquidity(
            key, pos.tickLower, pos.tickUpper, -pos.liquidity, pos.salt
        );

        // Use ORACLE price for new range centering
        int24 oracleTick = _getOracleTick();
        int24 tickSpacing = key.tickSpacing;
        int24 halfRange = config.rangeWidth / 2;
        int24 newTickLower = _alignTick(oracleTick - halfRange, tickSpacing);
        int24 newTickUpper = _alignTick(oracleTick + halfRange, tickSpacing);
        newTickLower = newTickLower < TickMath.MIN_TICK ? TickMath.minUsableTick(tickSpacing) : newTickLower;
        newTickUpper = newTickUpper > TickMath.MAX_TICK ? TickMath.maxUsableTick(tickSpacing) : newTickUpper;

        uint256 ethBal = removeDelta.amount0() > 0 ? uint256(uint128(removeDelta.amount0())) : 0;
        uint256 usdcBal = removeDelta.amount1() > 0 ? uint256(uint128(removeDelta.amount1())) : 0;

        (uint160 sqrtPriceCurrent,,,) = poolManager.getSlot0(poolId);
        uint160 sqrtPriceLower = TickMath.getSqrtPriceAtTick(newTickLower);
        uint160 sqrtPriceUpper = TickMath.getSqrtPriceAtTick(newTickUpper);

        int256 newLiquidity = int256(_calculateLiquidity(
            sqrtPriceCurrent, sqrtPriceLower, sqrtPriceUpper, ethBal, usdcBal
        ));

        bytes32 newSalt = bytes32(_saltCounter++);

        BalanceDelta lpDelta;
        if (newLiquidity > 0) {
            lpDelta = _modifyLiquidity(key, newTickLower, newTickUpper, newLiquidity, newSalt);
        }

        int128 netEth = removeDelta.amount0() + lpDelta.amount0();
        int128 netUsdc = removeDelta.amount1() + lpDelta.amount1();

        if (netEth > 0) {
            poolManager.take(key.currency0, address(this), uint128(netEth));
        } else if (netEth < 0) {
            poolManager.settle{value: uint128(-netEth)}();
        }

        if (netUsdc > 0) {
            poolManager.take(key.currency1, address(this), uint128(netUsdc));
        } else if (netUsdc < 0) {
            poolManager.sync(key.currency1);
            IERC20(Currency.unwrap(key.currency1)).transfer(address(poolManager), uint128(-netUsdc));
            poolManager.settle();
        }

        positions[user] = UserPosition({
            tickLower: newTickLower,
            tickUpper: newTickUpper,
            liquidity: newLiquidity,
            depositedUSDC: pos.depositedUSDC,
            depositTimestamp: pos.depositTimestamp,
            salt: newSalt
        });

        emit Rebalanced(user, newTickLower, newTickUpper);
    }

    function _executeWithdraw(address user) internal {
        PoolKey memory key = poolKey;
        UserPosition memory pos = positions[user];

        BalanceDelta removeDelta = _modifyLiquidity(
            key, pos.tickLower, pos.tickUpper, -pos.liquidity, pos.salt
        );

        uint256 ethOut = 0;
        if (removeDelta.amount0() > 0) {
            ethOut = uint128(removeDelta.amount0());
            poolManager.take(key.currency0, user, ethOut);
        }

        uint256 usdcOut = 0;
        if (removeDelta.amount1() > 0) {
            usdcOut = uint128(removeDelta.amount1());
            poolManager.take(key.currency1, user, usdcOut);
        }

        emit Withdrawn(user, ethOut, usdcOut);

        delete positions[user];
        delete configs[user];
    }

    // --- Helpers ---

    function _modifyLiquidity(
        PoolKey memory key,
        int24 tickLower,
        int24 tickUpper,
        int256 liquidityDelta,
        bytes32 salt
    ) internal returns (BalanceDelta) {
        (BalanceDelta delta,) = poolManager.modifyLiquidity(
            key,
            ModifyLiquidityParams({
                tickLower: tickLower,
                tickUpper: tickUpper,
                liquidityDelta: liquidityDelta,
                salt: salt
            }),
            ""
        );
        return delta;
    }

    function _alignTick(int24 tick, int24 tickSpacing) internal pure returns (int24) {
        int24 aligned = (tick / tickSpacing) * tickSpacing;
        if (tick < 0 && tick % tickSpacing != 0) {
            aligned -= tickSpacing;
        }
        return aligned;
    }

    function _calculateLiquidity(
        uint160 sqrtPriceCurrent,
        uint160 sqrtPriceLower,
        uint160 sqrtPriceUpper,
        uint256 amount0,
        uint256 amount1
    ) internal pure returns (uint256) {
        if (sqrtPriceCurrent <= sqrtPriceLower) {
            return _mulDiv(amount0, uint256(sqrtPriceLower) * uint256(sqrtPriceUpper), (uint256(sqrtPriceUpper) - uint256(sqrtPriceLower)) * (1 << 96));
        } else if (sqrtPriceCurrent >= sqrtPriceUpper) {
            return _mulDiv(amount1, 1 << 96, uint256(sqrtPriceUpper) - uint256(sqrtPriceLower));
        } else {
            uint256 liquidity0 = _mulDiv(
                amount0,
                uint256(sqrtPriceCurrent) * uint256(sqrtPriceUpper),
                (uint256(sqrtPriceUpper) - uint256(sqrtPriceCurrent)) * (1 << 96)
            );
            uint256 liquidity1 = _mulDiv(
                amount1,
                1 << 96,
                uint256(sqrtPriceCurrent) - uint256(sqrtPriceLower)
            );
            return liquidity0 < liquidity1 ? liquidity0 : liquidity1;
        }
    }

    function _mulDiv(uint256 a, uint256 b, uint256 c) internal pure returns (uint256) {
        return (a * b) / c;
    }

    /// @notice Check if a user's position needs rebalancing (oracle price outside LP range)
    function needsRebalance(address user) external view returns (bool) {
        UserPosition memory pos = positions[user];
        if (pos.liquidity == 0) return false;

        int24 oracleTick = _getOracleTick();
        return oracleTick < pos.tickLower || oracleTick > pos.tickUpper;
    }

    function getPosition(address user) external view returns (UserPosition memory) {
        return positions[user];
    }

    function getConfig(address user) external view returns (UserConfig memory) {
        return configs[user];
    }

    receive() external payable {}
}
