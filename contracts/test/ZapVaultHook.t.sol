// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "./utils/BaseTest.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";

contract ZapVaultHookTest is BaseTest {
    using PoolIdLibrary for PoolKey;
    using StateLibrary for IPoolManager;

    function test_hookDeployedCorrectly() public view {
        // Verify hook address has correct permission bits
        uint160 addr = uint160(address(hook));
        assertTrue(addr & uint160(Hooks.AFTER_INITIALIZE_FLAG) != 0, "afterInitialize bit not set");
        assertTrue(addr & uint160(Hooks.AFTER_SWAP_FLAG) != 0, "afterSwap bit not set");
    }

    function test_poolInitialized() public view {
        // Verify pool was initialized and hook stored the pool key
        assertTrue(hook.poolKeySet(), "Pool key not set");
    }

    function test_deposit() public {
        uint256 depositAmount = 1000e6; // 1000 USDC

        // Approve USDC to router
        vm.startPrank(alice);
        USDC.transfer(address(router), depositAmount);
        vm.stopPrank();

        // Call deposit via router
        router.deposit(alice, 1200, 500, 100);

        // Verify position was created
        IZapVault.UserPosition memory pos = hook.getPosition(alice);
        assertGt(pos.liquidity, 0, "Position should have liquidity");
        assertEq(pos.depositedUSDC, depositAmount, "Deposited amount mismatch");
        assertTrue(pos.tickLower < pos.tickUpper, "Invalid tick range");
    }

    function test_depositEmitsEvent() public {
        uint256 depositAmount = 1000e6;

        vm.startPrank(alice);
        USDC.transfer(address(router), depositAmount);
        vm.stopPrank();

        vm.expectEmit(true, false, false, false);
        emit IZapVault.Deposited(alice, depositAmount, 0, 0, 0);

        router.deposit(alice, 1200, 500, 100);
    }

    function test_withdraw() public {
        // First deposit
        uint256 depositAmount = 1000e6;
        vm.startPrank(alice);
        USDC.transfer(address(router), depositAmount);
        vm.stopPrank();
        router.deposit(alice, 1200, 500, 100);

        // Verify position exists
        IZapVault.UserPosition memory pos = hook.getPosition(alice);
        assertGt(pos.liquidity, 0, "Should have position before withdraw");

        // Withdraw
        vm.prank(alice);
        hook.withdraw();

        // Verify position cleared
        pos = hook.getPosition(alice);
        assertEq(pos.liquidity, 0, "Position should be cleared after withdraw");
    }

    function test_revertDepositNoRouter() public {
        vm.expectRevert(ZapVaultHook.OnlyRouter.selector);
        vm.prank(alice);
        hook.deposit(alice, 1000e6, _defaultConfig());
    }

    function test_revertWithdrawNoPosition() public {
        vm.expectRevert(ZapVaultHook.NoPosition.selector);
        vm.prank(alice);
        hook.withdraw();
    }

    function test_revertDoubleDeposit() public {
        uint256 depositAmount = 1000e6;

        // First deposit
        vm.startPrank(alice);
        USDC.transfer(address(router), depositAmount);
        vm.stopPrank();
        router.deposit(alice, 1200, 500, 100);

        // Second deposit should revert
        vm.startPrank(alice);
        USDC.transfer(address(router), depositAmount);
        vm.stopPrank();

        vm.expectRevert(ZapVaultHook.PositionAlreadyExists.selector);
        router.deposit(alice, 1200, 500, 100);
    }

    function test_needsRebalance() public {
        uint256 depositAmount = 1000e6;

        vm.startPrank(alice);
        USDC.transfer(address(router), depositAmount);
        vm.stopPrank();
        router.deposit(alice, 1200, 500, 100);

        // Initially should not need rebalance
        bool needs = hook.needsRebalance(alice);
        assertFalse(needs, "Should not need rebalance initially");
    }

    function test_configStored() public {
        uint256 depositAmount = 1000e6;

        vm.startPrank(alice);
        USDC.transfer(address(router), depositAmount);
        vm.stopPrank();
        router.deposit(alice, 1200, 500, 100);

        IZapVault.UserConfig memory config = hook.getConfig(alice);
        assertEq(config.rangeWidth, 1200);
        assertEq(config.rebalanceThreshold, 500);
        assertEq(config.slippage, 100);
    }
}
