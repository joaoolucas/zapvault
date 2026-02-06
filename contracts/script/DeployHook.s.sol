// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Script.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {HookMiner} from "@uniswap/v4-periphery/src/utils/HookMiner.sol";
import {ZapVaultHook} from "../src/ZapVaultHook.sol";

contract DeployHook is Script {
    // Base mainnet PoolManager
    address constant POOL_MANAGER = 0x498581fF718922c3f8e6A244956aF099B2652b2b;
    // CREATE2 deployer (deterministic deployment proxy)
    address constant CREATE2_DEPLOYER = 0x4e59b44847b379578588920cA78FbF26c0B4956C;

    function run() external {
        address router = vm.envAddress("ROUTER_ADDRESS");
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");

        // Required hook flags: afterInitialize + afterSwap
        uint160 flags = uint160(Hooks.AFTER_INITIALIZE_FLAG | Hooks.AFTER_SWAP_FLAG);

        // Mine salt for correct address bits
        (address hookAddress, bytes32 salt) = HookMiner.find(
            CREATE2_DEPLOYER,
            flags,
            type(ZapVaultHook).creationCode,
            abi.encode(POOL_MANAGER, router)
        );

        console.log("Hook will deploy to:", hookAddress);
        console.log("Salt:", vm.toString(salt));

        vm.startBroadcast(deployerPrivateKey);

        // Deploy via CREATE2
        ZapVaultHook hook = new ZapVaultHook{salt: salt}(IPoolManager(POOL_MANAGER), router);
        require(address(hook) == hookAddress, "Address mismatch");

        console.log("Hook deployed to:", address(hook));

        vm.stopBroadcast();
    }
}
