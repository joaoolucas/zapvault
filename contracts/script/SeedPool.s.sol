// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Script.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency, CurrencyLibrary} from "@uniswap/v4-core/src/types/Currency.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {PoolSeeder} from "../test/utils/PoolSeeder.sol";

contract SeedPool is Script {
    address constant POOL_MANAGER = 0x498581fF718922c3f8e6A244956aF099B2652b2b;
    address constant USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;

    uint24 constant FEE = 3000;
    int24 constant TICK_SPACING = 60;

    function run() external {
        address hookAddress = vm.envAddress("HOOK_ADDRESS");
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");

        PoolKey memory poolKey = PoolKey({
            currency0: CurrencyLibrary.ADDRESS_ZERO,
            currency1: Currency.wrap(USDC),
            fee: FEE,
            tickSpacing: TICK_SPACING,
            hooks: IHooks(hookAddress)
        });

        vm.startBroadcast(deployerPrivateKey);

        // Deploy seeder
        PoolSeeder seeder = new PoolSeeder(IPoolManager(POOL_MANAGER));
        console.log("Seeder deployed to:", address(seeder));

        // Fund seeder with ETH and USDC
        uint256 ethToSeed = 0.002 ether;
        uint256 usdcToSeed = 5e5; // 0.5 USDC

        payable(address(seeder)).transfer(ethToSeed);
        IERC20(USDC).transfer(address(seeder), usdcToSeed);

        // Full range liquidity with small amount
        int24 tickLower = TickMath.minUsableTick(TICK_SPACING);
        int24 tickUpper = TickMath.maxUsableTick(TICK_SPACING);

        // Tiny liquidity — 1e10 needs ~0.5 USDC + ~0.0002 ETH for full-range at $3000
        int256 seedLiquidity = 8e9;
        seeder.seed{value: 0}(poolKey, tickLower, tickUpper, seedLiquidity);

        console.log("Pool seeded!");

        // Withdraw leftover ETH and USDC from seeder back to deployer
        seeder.withdraw(address(0)); // ETH
        seeder.withdraw(USDC);       // USDC
        console.log("Leftover funds recovered from seeder");

        vm.stopBroadcast();
    }
}
