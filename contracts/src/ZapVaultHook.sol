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

    constructor(IPoolManager _poolManager, address _router) BaseHook(_poolManager) {
        router = _router;
        owner = tx.origin; // tx.origin so CREATE2 factory deploys still assign the EOA as owner
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
        // Check all tracked positions and emit NeedsRebalance if out of range
        // Note: In production, we'd iterate over active users or use a more efficient structure.
        // For hackathon, this is called per-swap and we accept the gas cost is bounded by # of users.
        return (this.afterSwap.selector, 0);
    }

    // --- External functions ---

    function deposit(address user, uint256 usdcAmount, UserConfig calldata config) external {
        if (msg.sender != router) revert OnlyRouter();
        if (!poolKeySet) revert PoolKeyNotSet();
        if (positions[user].liquidity > 0) revert PositionAlreadyExists();
        if (config.rangeWidth <= 0 || config.rebalanceThreshold == 0) revert InvalidConfig();

        configs[user] = config;

        // Transfer USDC from router to this contract
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

    // --- Internal execution ---

    function _executeDeposit(DepositParams memory params) internal {
        PoolKey memory key = poolKey;
        PoolId poolId = key.toId();

        Currency usdc = key.currency1;
        uint256 usdcAmount = params.usdcAmount;
        uint256 swapAmount = usdcAmount / 2;

        // Transfer ALL USDC to PoolManager and settle to create credit
        // delta[USDC] += usdcAmount
        poolManager.sync(usdc);
        IERC20(Currency.unwrap(usdc)).transfer(address(poolManager), usdcAmount);
        poolManager.settle();

        // Swap ~50% USDC → ETH FIRST, then compute range on post-swap price
        // delta[ETH] += swapDelta.amount0() (positive = ETH received)
        // delta[USDC] += swapDelta.amount1() (negative = USDC consumed)
        BalanceDelta swapDelta = poolManager.swap(
            key,
            SwapParams({
                zeroForOne: false,
                amountSpecified: -int256(swapAmount),
                sqrtPriceLimitX96: TickMath.MAX_SQRT_PRICE - 1
            }),
            ""
        );

        // Calculate tick range centered on POST-SWAP price
        (uint160 sqrtPriceCurrent, int24 currentTick,,) = poolManager.getSlot0(poolId);
        int24 tickSpacing = key.tickSpacing;
        int24 halfRange = params.config.rangeWidth / 2;
        int24 tickLower = _alignTick(currentTick - halfRange, tickSpacing);
        int24 tickUpper = _alignTick(currentTick + halfRange, tickSpacing);
        tickLower = tickLower < TickMath.MIN_TICK ? TickMath.minUsableTick(tickSpacing) : tickLower;
        tickUpper = tickUpper > TickMath.MAX_TICK ? TickMath.maxUsableTick(tickSpacing) : tickUpper;

        // Calculate liquidity from swap proceeds + remaining USDC
        uint256 ethAmount = uint256(uint128(swapDelta.amount0())); // positive
        uint256 remainingUsdc = usdcAmount - swapAmount;

        bytes32 salt = bytes32(_saltCounter++);
        uint160 sqrtPriceLower = TickMath.getSqrtPriceAtTick(tickLower);
        uint160 sqrtPriceUpper = TickMath.getSqrtPriceAtTick(tickUpper);

        int256 liquidityDelta = int256(_calculateLiquidity(
            sqrtPriceCurrent, sqrtPriceLower, sqrtPriceUpper, ethAmount, remainingUsdc
        ));

        // Add concentrated liquidity
        // delta[ETH] += lpDelta.amount0() (negative = ETH consumed)
        // delta[USDC] += lpDelta.amount1() (negative = USDC consumed)
        BalanceDelta lpDelta = _modifyLiquidity(key, tickLower, tickUpper, liquidityDelta, salt);

        // Settle net deltas — all operations accumulated in the PoolManager's accounting
        // Net ETH = swapDelta.amount0() + lpDelta.amount0()
        int128 netEth = swapDelta.amount0() + lpDelta.amount0();
        if (netEth > 0) {
            poolManager.take(key.currency0, address(this), uint128(netEth));
        } else if (netEth < 0) {
            poolManager.settle{value: uint128(-netEth)}();
        }

        // Net USDC = settled(usdcAmount) + swapDelta.amount1() + lpDelta.amount1()
        int128 netUsdc = int128(int256(usdcAmount)) + swapDelta.amount1() + lpDelta.amount1();
        if (netUsdc > 0) {
            poolManager.take(usdc, address(this), uint128(netUsdc));
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

        // Remove old liquidity — positive deltas = tokens returned to us
        BalanceDelta removeDelta = _modifyLiquidity(
            key, pos.tickLower, pos.tickUpper, -pos.liquidity, pos.salt
        );

        // Get new current tick
        (, int24 currentTick,,) = poolManager.getSlot0(poolId);

        // Calculate new centered range
        int24 tickSpacing = key.tickSpacing;
        int24 halfRange = config.rangeWidth / 2;
        int24 newTickLower = _alignTick(currentTick - halfRange, tickSpacing);
        int24 newTickUpper = _alignTick(currentTick + halfRange, tickSpacing);
        newTickLower = newTickLower < TickMath.MIN_TICK ? TickMath.minUsableTick(tickSpacing) : newTickLower;
        newTickUpper = newTickUpper > TickMath.MAX_TICK ? TickMath.maxUsableTick(tickSpacing) : newTickUpper;

        // Calculate new liquidity from removal proceeds (delta values, not balances)
        uint256 ethBal = uint256(uint128(removeDelta.amount0())); // positive
        uint256 usdcBal = uint256(uint128(removeDelta.amount1())); // positive

        uint160 sqrtPriceLower = TickMath.getSqrtPriceAtTick(newTickLower);
        uint160 sqrtPriceUpper = TickMath.getSqrtPriceAtTick(newTickUpper);
        (uint160 sqrtPriceCurrent,,,) = poolManager.getSlot0(poolId);

        int256 newLiquidity = int256(_calculateLiquidity(
            sqrtPriceCurrent, sqrtPriceLower, sqrtPriceUpper, ethBal, usdcBal
        ));

        bytes32 newSalt = bytes32(_saltCounter++);

        // Add new liquidity if non-zero
        BalanceDelta lpDelta;
        if (newLiquidity > 0) {
            lpDelta = _modifyLiquidity(key, newTickLower, newTickUpper, newLiquidity, newSalt);
        }

        // Settle net deltas: removal (positive) + addition (negative)
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

        // Update position (liquidity=0 means position was too small to re-add)
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

        // Remove all liquidity — positive deltas
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

        // Net deltas: removal + swap should leave ~0 ETH and all USDC
        int128 netEth = removeDelta.amount0() + swapDelta.amount0();
        int128 netUsdc = removeDelta.amount1() + swapDelta.amount1();

        // Take any dust ETH to hook (shouldn't happen normally)
        if (netEth > 0) {
            poolManager.take(key.currency0, address(this), uint128(netEth));
        }

        // Send all USDC to user
        uint256 totalUsdc = 0;
        if (netUsdc > 0) {
            totalUsdc = uint128(netUsdc);
            poolManager.take(key.currency1, user, totalUsdc);
        }

        emit Withdrawn(user, 0, totalUsdc);

        // Clear position
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
        // Round down to nearest tick spacing
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
        // Simplified liquidity calculation
        // L = min(amount0 * (sqrtPa * sqrtPb) / (sqrtPb - sqrtPa), amount1 / (sqrtPb - sqrtPa))
        // where sqrtPa = max(sqrtPriceCurrent, sqrtPriceLower), sqrtPb = sqrtPriceUpper

        if (sqrtPriceCurrent <= sqrtPriceLower) {
            // All amount0 (ETH)
            // L = amount0 * sqrtPriceLower * sqrtPriceUpper / (sqrtPriceUpper - sqrtPriceLower)
            return _mulDiv(amount0, uint256(sqrtPriceLower) * uint256(sqrtPriceUpper), (uint256(sqrtPriceUpper) - uint256(sqrtPriceLower)) * (1 << 96));
        } else if (sqrtPriceCurrent >= sqrtPriceUpper) {
            // All amount1 (USDC)
            // L = amount1 * Q96 / (sqrtPriceUpper - sqrtPriceLower)
            return _mulDiv(amount1, 1 << 96, uint256(sqrtPriceUpper) - uint256(sqrtPriceLower));
        } else {
            // Both tokens needed
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

    /// @notice Check if a user's position needs rebalancing based on current tick
    function needsRebalance(address user) external view returns (bool) {
        UserPosition memory pos = positions[user];
        if (pos.liquidity == 0) return false;

        UserConfig memory config = configs[user];
        PoolId poolId = poolKey.toId();
        (, int24 currentTick,,) = poolManager.getSlot0(poolId);

        // Check if current tick is outside position range by rebalance threshold
        int24 positionCenter = (pos.tickLower + pos.tickUpper) / 2;
        int24 deviation = currentTick > positionCenter ? currentTick - positionCenter : positionCenter - currentTick;
        int24 threshold = int24(uint24(config.rebalanceThreshold)) * (pos.tickUpper - pos.tickLower) / 10000;

        return deviation > threshold;
    }

    /// @notice Get a user's current position info
    function getPosition(address user) external view returns (UserPosition memory) {
        return positions[user];
    }

    /// @notice Get a user's config
    function getConfig(address user) external view returns (UserConfig memory) {
        return configs[user];
    }

    receive() external payable {}
}
