// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {BaseHook} from "@uniswap/v4-periphery/src/utils/BaseHook.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "@uniswap/v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
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

contract ZapVaultHook is BaseHook, IUnlockCallback, IZapVault {
    using PoolIdLibrary for PoolKey;
    using CurrencyLibrary for Currency;
    using StateLibrary for IPoolManager;

    // --- State ---
    mapping(address => UserPosition) public positions;
    mapping(address => UserConfig) public configs;
    PoolKey public poolKey;
    bool public poolKeySet;
    address public router;
    address public owner;
    AggregatorV3Interface public immutable priceFeed;

    // Track user salt counter for unique positions
    uint256 private _saltCounter;

    // --- Unlock action types ---
    enum Action {
        DEPOSIT,
        REBALANCE,
        WITHDRAW
    }

    struct DepositParams {
        address user;
        uint256 usdcAmount;
        UserConfig config;
    }

    // --- Errors ---
    error OnlyRouter();
    error OnlyOwner();
    error PoolKeyNotSet();
    error PositionAlreadyExists();
    error NoPosition();
    error InvalidConfig();
    error StaleOracle();

    constructor(IPoolManager _poolManager, address _router, address _priceFeed) BaseHook(_poolManager) {
        router = _router;
        owner = tx.origin;
        priceFeed = AggregatorV3Interface(_priceFeed);
    }

    function setRouter(address _router) external {
        if (msg.sender != owner) revert OnlyOwner();
        router = _router;
    }

    // --- Hook permissions ---
    function getHookPermissions() public pure override returns (Hooks.Permissions memory) {
        return Hooks.Permissions({
            beforeInitialize: false,
            afterInitialize: true,
            beforeAddLiquidity: false,
            afterAddLiquidity: false,
            beforeRemoveLiquidity: false,
            afterRemoveLiquidity: false,
            beforeSwap: false,
            afterSwap: true,
            beforeDonate: false,
            afterDonate: false,
            beforeSwapReturnDelta: false,
            afterSwapReturnDelta: false,
            afterAddLiquidityReturnDelta: false,
            afterRemoveLiquidityReturnDelta: false
        });
    }

    // --- Hook callbacks ---

    function _afterInitialize(address, PoolKey calldata key, uint160, int24)
        internal
        override
        returns (bytes4)
    {
        poolKey = key;
        poolKeySet = true;
        return this.afterInitialize.selector;
    }

    function _afterSwap(
        address,
        PoolKey calldata,
        SwapParams calldata,
        BalanceDelta,
        bytes calldata
    ) internal override returns (bytes4, int128) {
        return (this.afterSwap.selector, 0);
    }

    // --- External functions ---

    function deposit(address user, uint256 usdcAmount, UserConfig calldata config) external {
        if (msg.sender != router) revert OnlyRouter();
        if (!poolKeySet) revert PoolKeyNotSet();
        if (positions[user].liquidity > 0) revert PositionAlreadyExists();
        if (config.rangeWidth <= 0 || config.rebalanceThreshold == 0) revert InvalidConfig();

        configs[user] = config;

        Currency usdc = poolKey.currency1;
        IERC20(Currency.unwrap(usdc)).transferFrom(msg.sender, address(this), usdcAmount);

        bytes memory data = abi.encode(Action.DEPOSIT, abi.encode(DepositParams(user, usdcAmount, config)));
        poolManager.unlock(data);
    }

    function rebalance(address user) external {
        if (!poolKeySet) revert PoolKeyNotSet();
        if (positions[user].liquidity == 0) revert NoPosition();

        bytes memory data = abi.encode(Action.REBALANCE, abi.encode(user));
        poolManager.unlock(data);
    }

    function withdraw() external {
        if (!poolKeySet) revert PoolKeyNotSet();
        if (positions[msg.sender].liquidity == 0) revert NoPosition();

        bytes memory data = abi.encode(Action.WITHDRAW, abi.encode(msg.sender));
        poolManager.unlock(data);
    }

    // --- Unlock callback ---

    function unlockCallback(bytes calldata data) external override returns (bytes memory) {
        if (msg.sender != address(poolManager)) revert NotPoolManager();

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

    /// @notice Convert Chainlink ETH/USD price to a Uniswap tick
    /// @dev Chainlink returns price with 8 decimals. Uniswap tick: price = 1.0001^tick * 10^12
    ///      tick = ln(price / 10^12) / ln(1.0001)
    ///      We use an iterative approach to avoid floating point
    function _getOracleTick() internal view returns (int24) {
        (, int256 answer,, uint256 updatedAt,) = priceFeed.latestRoundData();
        if (answer <= 0 || block.timestamp - updatedAt > 3600) revert StaleOracle();

        // price in 8 decimals → e.g., 270000000000 = $2700
        uint256 price = uint256(answer);

        // We need tick such that: 1.0001^tick = price / 10^12 * 10^(-8) * 10^8
        // Simplify: 1.0001^tick = price * 10^(-8) / 10^12 = price / 10^20
        // tick = log(price / 10^20) / log(1.0001)
        //
        // Use binary search over ticks to find closest match
        // TickMath.getSqrtPriceAtTick gives us sqrtPriceX96 = sqrt(1.0001^tick) * 2^96
        // sqrtPriceX96^2 / 2^192 = 1.0001^tick = rawPrice
        // We want rawPrice * 10^12 = humanPrice = price * 10^(-8)
        // rawPrice = price / 10^20
        //
        // targetSqrtPriceX96 = sqrt(price / 10^20) * 2^96
        // = sqrt(price) * 2^96 / sqrt(10^20)
        // = sqrt(price) * 2^96 / 10^10

        // Compute target sqrtPriceX96
        uint256 sqrtPrice = _sqrt(price); // sqrt of price (8 decimals)
        // sqrtPrice is sqrt of e.g. 270000000000 ≈ 519615
        // target = sqrtPrice * 2^96 / 10^10
        uint256 targetSqrtPriceX96 = (sqrtPrice * (1 << 96)) / 1e10;

        // Clamp to valid range
        if (targetSqrtPriceX96 < uint256(uint160(TickMath.MIN_SQRT_PRICE))) {
            return TickMath.MIN_TICK;
        }
        if (targetSqrtPriceX96 > uint256(uint160(TickMath.MAX_SQRT_PRICE))) {
            return TickMath.MAX_TICK;
        }

        // Use TickMath to get the tick from sqrtPrice
        return TickMath.getTickAtSqrtPrice(uint160(targetSqrtPriceX96));
    }

    /// @notice Integer square root (Babylonian method)
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
            // Position is entirely below pool tick → need 100% USDC, 0% ETH
            swapAmount = 0;
        } else if (currentTick <= tickLower) {
            // Position is entirely above pool tick → need 100% ETH, 0% USDC
            swapAmount = usdcAmount;
        } else {
            // Position straddles pool tick → need both tokens
            // Fraction above current tick needs ETH
            uint256 totalRange = uint256(int256(tickUpper - tickLower));
            uint256 ethRange = uint256(int256(tickUpper - currentTick));
            swapAmount = (usdcAmount * ethRange) / totalRange;
        }

        // 4. Transfer ALL USDC to PoolManager and settle to create credit
        poolManager.sync(usdc);
        IERC20(Currency.unwrap(usdc)).transfer(address(poolManager), usdcAmount);
        poolManager.settle();

        // 5. Swap USDC → ETH (only what's needed)
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

        // 6. Calculate liquidity using POOL price (not oracle)
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
            // Safety: if we owe more USDC than deposited, settle from hook balance
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

        // Use POOL price for liquidity calculation (not oracle)
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

        int128 ethAmount = removeDelta.amount0();

        // Swap all ETH → USDC so user receives only USDC
        BalanceDelta swapDelta;
        if (ethAmount > 0) {
            swapDelta = poolManager.swap(
                key,
                SwapParams({
                    zeroForOne: true,
                    amountSpecified: -int256(uint256(uint128(ethAmount))),
                    sqrtPriceLimitX96: TickMath.MIN_SQRT_PRICE + 1
                }),
                ""
            );
        }

        int128 netEth = removeDelta.amount0() + swapDelta.amount0();
        int128 netUsdc = removeDelta.amount1() + swapDelta.amount1();

        if (netEth > 0) {
            poolManager.take(key.currency0, address(this), uint128(netEth));
        }

        uint256 totalUsdc = 0;
        if (netUsdc > 0) {
            totalUsdc = uint128(netUsdc);
            poolManager.take(key.currency1, user, totalUsdc);
        }

        emit Withdrawn(user, 0, totalUsdc);

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

    /// @notice Check if a user's position needs rebalancing (uses oracle price)
    function needsRebalance(address user) external view returns (bool) {
        UserPosition memory pos = positions[user];
        if (pos.liquidity == 0) return false;

        UserConfig memory config = configs[user];

        // Use oracle tick instead of pool tick for checking range
        int24 oracleTick = _getOracleTick();

        int24 positionCenter = (pos.tickLower + pos.tickUpper) / 2;
        int24 deviation = oracleTick > positionCenter ? oracleTick - positionCenter : positionCenter - oracleTick;
        int24 threshold = int24(uint24(config.rebalanceThreshold)) * (pos.tickUpper - pos.tickLower) / 10000;

        return deviation > threshold;
    }

    function getPosition(address user) external view returns (UserPosition memory) {
        return positions[user];
    }

    function getConfig(address user) external view returns (UserConfig memory) {
        return configs[user];
    }

    receive() external payable {}
}
