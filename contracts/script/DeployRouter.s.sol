// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Script.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency, CurrencyLibrary} from "@uniswap/v4-core/src/types/Currency.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {ZapVaultRouter} from "../src/ZapVaultRouter.sol";
import {ZapVaultHook} from "../src/ZapVaultHook.sol";

contract DeployRouter is Script {
    address constant POOL_MANAGER = 0x498581fF718922c3f8e6A244956aF099B2652b2b;
    address constant USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;

    uint24 constant FEE = 3000;
    int24 constant TICK_SPACING = 60;

    function run() external {
        address hookAddress = vm.envAddress("HOOK_ADDRESS");
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(deployerPrivateKey);

        // Deploy router
        ZapVaultRouter router = new ZapVaultRouter(hookAddress, USDC);
        console.log("Router deployed to:", address(router));

        // Update router on hook
        ZapVaultHook hook = ZapVaultHook(payable(hookAddress));
        hook.setRouter(address(router));
        console.log("Router set on hook");

        // Initialize pool
        PoolKey memory poolKey = PoolKey({
            currency0: CurrencyLibrary.ADDRESS_ZERO,
            currency1: Currency.wrap(USDC),
            fee: FEE,
            tickSpacing: TICK_SPACING,
            hooks: IHooks(hookAddress)
        });

        // ~$3000 ETH/USDC price
        uint160 sqrtPriceX96 = 4339505247082498449408000;
        IPoolManager(POOL_MANAGER).initialize(poolKey, sqrtPriceX96);
        console.log("Pool initialized");

        vm.stopBroadcast();
    }
}
