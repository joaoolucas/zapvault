// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Script.sol";
import {ZapVaultRouter} from "../src/ZapVaultRouter.sol";
import {ZapVaultHook} from "../src/ZapVaultHook.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract SimDeposit is Script {
    address constant HOOK = 0xD520c4e9F1BC8195B7523F495C913a4Bcc07d040;
    address constant ROUTER = 0xA78e1c2302319c324BCf86a98F5e29b8CB371eEC;
    address constant USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;
    address constant USER = 0x8E9B5Ac88BEdc27c4096ac0353fCcc31ce796259;

    function run() external {
        vm.createSelectFork(vm.envString("BASE_RPC_URL"));

        // Check state
        uint256 routerBal = IERC20(USDC).balanceOf(ROUTER);
        console.log("Router USDC:", routerBal);
        console.log("Hook USDC:", IERC20(USDC).balanceOf(HOOK));

        // Approve router, then deposit (LI.FI Composer pattern)
        vm.startPrank(USER);
        IERC20(USDC).approve(ROUTER, 10e6);
        ZapVaultRouter(ROUTER).deposit(USER, 10e6, 1200, 500, 100);
        vm.stopPrank();

        console.log("Deposit succeeded!");

        // Check position
        ZapVaultHook hook = ZapVaultHook(payable(HOOK));
        (int24 tickLower, int24 tickUpper, int256 liquidity,,,) = hook.positions(USER);
        console.log("tickLower:", tickLower);
        console.log("tickUpper:", tickUpper);
    }
}
