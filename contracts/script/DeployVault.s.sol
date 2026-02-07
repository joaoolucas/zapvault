// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Script.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency, CurrencyLibrary} from "@uniswap/v4-core/src/types/Currency.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {ZapVault} from "../src/ZapVault.sol";
import {ZapVaultRouter} from "../src/ZapVaultRouter.sol";

contract DeployVaultScript is Script {
    address constant POOL_MANAGER = 0x498581fF718922c3f8e6A244956aF099B2652b2b;
    address constant USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;
    address constant PRICE_FEED = 0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70;

    // Hookless ETH/USDC 0.05% pool
    uint24 constant FEE = 500;
    int24 constant TICK_SPACING = 10;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");

        PoolKey memory poolKey = PoolKey({
            currency0: CurrencyLibrary.ADDRESS_ZERO,
            currency1: Currency.wrap(USDC),
            fee: FEE,
            tickSpacing: TICK_SPACING,
            hooks: IHooks(address(0))
        });

        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy vault with placeholder router
        ZapVault vault = new ZapVault(
            IPoolManager(POOL_MANAGER),
            poolKey,
            address(0xdead),
            PRICE_FEED
        );
        console.log("Vault deployed to:", address(vault));

        // 2. Deploy router
        ZapVaultRouter router = new ZapVaultRouter(address(vault), USDC);
        console.log("Router deployed to:", address(router));

        // 3. Set router on vault
        vault.setRouter(address(router));
        console.log("Router set on vault");

        vm.stopBroadcast();
    }
}
