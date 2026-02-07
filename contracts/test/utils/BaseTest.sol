// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Test.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency, CurrencyLibrary} from "@uniswap/v4-core/src/types/Currency.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {ZapVault} from "../../src/ZapVault.sol";
import {ZapVaultRouter} from "../../src/ZapVaultRouter.sol";
import {IZapVault} from "../../src/interfaces/IZapVault.sol";
import {PoolSeeder} from "./PoolSeeder.sol";

abstract contract BaseTest is Test {
    using CurrencyLibrary for Currency;

    // Base mainnet addresses
    IPoolManager constant POOL_MANAGER = IPoolManager(0x498581fF718922c3f8e6A244956aF099B2652b2b);
    address constant USDC_ADDRESS = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;
    IERC20 constant USDC = IERC20(USDC_ADDRESS);
    address constant PRICE_FEED = 0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70;

    // Pool parameters — 0.05% fee, tick spacing 10
    uint24 constant FEE = 500;
    int24 constant TICK_SPACING = 10;

    ZapVault public vault;
    ZapVaultRouter public router;
    PoolKey public poolKey;
    PoolSeeder public seeder;

    address alice = makeAddr("alice");
    address bob = makeAddr("bob");

    function setUp() public virtual {
        // Fork Base mainnet
        vm.createSelectFork(vm.envOr("BASE_RPC_URL", string("https://mainnet.base.org")));

        // Hookless pool key — ETH/USDC 0.05% pool (already exists on Base mainnet)
        poolKey = PoolKey({
            currency0: CurrencyLibrary.ADDRESS_ZERO,
            currency1: Currency.wrap(USDC_ADDRESS),
            fee: FEE,
            tickSpacing: TICK_SPACING,
            hooks: IHooks(address(0))
        });

        // Deploy vault with placeholder router
        vault = new ZapVault(POOL_MANAGER, poolKey, address(0xdead), PRICE_FEED);

        // Deploy router
        router = new ZapVaultRouter(address(vault), USDC_ADDRESS);

        // Set router on vault
        vault.setRouter(address(router));

        // Fund test users
        deal(alice, 100 ether);
        deal(USDC_ADDRESS, alice, 100_000e6);
        deal(bob, 100 ether);
        deal(USDC_ADDRESS, bob, 100_000e6);
    }

    function _seedPool() internal {
        deal(address(seeder), 50 ether);
        deal(USDC_ADDRESS, address(seeder), 150_000e6);

        int24 tickLower = TickMath.minUsableTick(TICK_SPACING);
        int24 tickUpper = TickMath.maxUsableTick(TICK_SPACING);

        int256 seedLiquidity = 1e15;
        vm.prank(tx.origin);
        seeder.seed{value: 50 ether}(poolKey, tickLower, tickUpper, seedLiquidity);
    }

    function _defaultConfig() internal pure returns (IZapVault.UserConfig memory) {
        return IZapVault.UserConfig({
            rangeWidth: 480,
            rebalanceThreshold: 500,
            slippage: 100
        });
    }
}
