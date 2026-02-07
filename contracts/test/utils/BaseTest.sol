// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Test.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency, CurrencyLibrary} from "@uniswap/v4-core/src/types/Currency.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {HookMiner} from "@uniswap/v4-periphery/src/utils/HookMiner.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {ZapVaultHook} from "../../src/ZapVaultHook.sol";
import {ZapVaultRouter} from "../../src/ZapVaultRouter.sol";
import {IZapVault} from "../../src/interfaces/IZapVault.sol";
import {PoolSeeder} from "./PoolSeeder.sol";

abstract contract BaseTest is Test {
    using CurrencyLibrary for Currency;

    // Base mainnet addresses
    IPoolManager constant POOL_MANAGER = IPoolManager(0x498581fF718922c3f8e6A244956aF099B2652b2b);
    address constant USDC_ADDRESS = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;
    IERC20 constant USDC = IERC20(USDC_ADDRESS);
    // Chainlink ETH/USD on Base
    address constant PRICE_FEED = 0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70;

    // Pool parameters
    uint24 constant FEE = 3000; // 0.3%
    int24 constant TICK_SPACING = 60;

    ZapVaultHook public hook;
    ZapVaultRouter public router;
    PoolKey public poolKey;
    PoolSeeder public seeder;

    address alice = makeAddr("alice");
    address bob = makeAddr("bob");

    function setUp() public virtual {
        // Fork Base mainnet
        vm.createSelectFork(vm.envOr("BASE_RPC_URL", string("https://mainnet.base.org")));

        // Deploy hook with correct address bits using HookMiner
        uint160 flags = uint160(Hooks.AFTER_INITIALIZE_FLAG | Hooks.AFTER_SWAP_FLAG);

        address tempRouter = address(0xdead);

        (address hookAddress, bytes32 salt) = HookMiner.find(
            address(this),
            flags,
            type(ZapVaultHook).creationCode,
            abi.encode(address(POOL_MANAGER), tempRouter, PRICE_FEED)
        );

        hook = new ZapVaultHook{salt: salt}(POOL_MANAGER, tempRouter, PRICE_FEED);
        require(address(hook) == hookAddress, "Hook address mismatch");

        // Deploy router
        router = new ZapVaultRouter(address(hook), USDC_ADDRESS);

        // Update router on hook (owner is tx.origin due to CREATE2 compatibility)
        vm.prank(tx.origin);
        hook.setRouter(address(router));

        // Deploy pool seeder
        seeder = new PoolSeeder(POOL_MANAGER);

        // Create pool key — ETH (address(0)) < USDC (0x8335...)
        poolKey = PoolKey({
            currency0: CurrencyLibrary.ADDRESS_ZERO, // ETH
            currency1: Currency.wrap(USDC_ADDRESS),
            fee: FEE,
            tickSpacing: TICK_SPACING,
            hooks: IHooks(address(hook))
        });

        // Initialize the pool at ~$3000 ETH/USDC price
        // For ETH/USDC pool: price = token1/token0 = USDC_per_ETH
        // With decimals: price_raw = 3000 * 1e6 / 1e18 = 3e-9
        // sqrtPriceX96 = sqrt(3e-9) * 2^96 = 5.477e-5 * 7.922e28 ≈ 4.339e24
        uint160 sqrtPriceX96 = 4339505247082498449408000;
        POOL_MANAGER.initialize(poolKey, sqrtPriceX96);

        // Seed pool with real liquidity
        _seedPool();

        // Fund test users
        deal(alice, 100 ether);
        deal(USDC_ADDRESS, alice, 100_000e6);
        deal(bob, 100 ether);
        deal(USDC_ADDRESS, bob, 100_000e6);
    }

    function _seedPool() internal {
        // Fund the seeder with ETH and USDC
        deal(address(seeder), 50 ether);
        deal(USDC_ADDRESS, address(seeder), 150_000e6);

        // Get current tick from the initialized pool
        // Use a wide range around current price for seed liquidity
        int24 tickLower = TickMath.minUsableTick(TICK_SPACING);
        int24 tickUpper = TickMath.maxUsableTick(TICK_SPACING);

        // Add seed liquidity — 1e15 requires ~18 ETH for full-range at $3000 ETH
        int256 seedLiquidity = 1e15;
        vm.prank(tx.origin);
        seeder.seed{value: 50 ether}(poolKey, tickLower, tickUpper, seedLiquidity);
    }

    function _defaultConfig() internal pure returns (IZapVault.UserConfig memory) {
        return IZapVault.UserConfig({
            rangeWidth: 1200, // +/- 600 ticks
            rebalanceThreshold: 500, // 5%
            slippage: 100 // 1%
        });
    }
}
