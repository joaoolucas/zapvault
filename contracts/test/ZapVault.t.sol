// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "./utils/BaseTest.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";

contract ZapVaultTest is BaseTest {
    using PoolIdLibrary for PoolKey;
    using StateLibrary for IPoolManager;

    function test_vaultDeployedCorrectly() public view {
        assertEq(address(vault.poolManager()), address(POOL_MANAGER));
        assertEq(vault.router(), address(router));
    }

    function _depositViaRouter(address user, uint256 amount) internal {
        vm.prank(user);
        USDC.approve(address(router), amount);
        vm.prank(user);
        router.deposit(user, amount, 480, 500, 100);
    }

    function test_deposit() public {
        uint256 depositAmount = 1000e6; // 1000 USDC

        _depositViaRouter(alice, depositAmount);

        // Verify position was created
        IZapVault.UserPosition memory pos = vault.getPosition(alice);
        assertGt(pos.liquidity, 0, "Position should have liquidity");
        assertEq(pos.depositedUSDC, depositAmount, "Deposited amount mismatch");
        assertTrue(pos.tickLower < pos.tickUpper, "Invalid tick range");
    }

    function test_depositEmitsEvent() public {
        uint256 depositAmount = 1000e6;

        vm.prank(alice);
        USDC.approve(address(router), depositAmount);

        vm.expectEmit(true, false, false, false);
        emit IZapVault.Deposited(alice, depositAmount, 0, 0, 0);

        vm.prank(alice);
        router.deposit(alice, depositAmount, 480, 500, 100);
    }

    function test_withdraw() public {
        uint256 depositAmount = 1000e6;
        _depositViaRouter(alice, depositAmount);

        // Verify position exists
        IZapVault.UserPosition memory pos = vault.getPosition(alice);
        assertGt(pos.liquidity, 0, "Should have position before withdraw");

        // Withdraw
        vm.prank(alice);
        vault.withdraw();

        // Verify position cleared
        pos = vault.getPosition(alice);
        assertEq(pos.liquidity, 0, "Position should be cleared after withdraw");
    }

    function test_revertDepositNoRouter() public {
        vm.expectRevert(ZapVault.OnlyRouter.selector);
        vm.prank(alice);
        vault.deposit(alice, 1000e6, _defaultConfig());
    }

    function test_revertWithdrawNoPosition() public {
        vm.expectRevert(ZapVault.NoPosition.selector);
        vm.prank(alice);
        vault.withdraw();
    }

    function test_revertDoubleDeposit() public {
        uint256 depositAmount = 1000e6;

        _depositViaRouter(alice, depositAmount);

        // Second deposit should revert
        vm.prank(alice);
        USDC.approve(address(router), depositAmount);

        vm.expectRevert(ZapVault.PositionAlreadyExists.selector);
        vm.prank(alice);
        router.deposit(alice, depositAmount, 480, 500, 100);
    }

    function test_needsRebalance() public {
        uint256 depositAmount = 1000e6;
        _depositViaRouter(alice, depositAmount);

        // Initially should not need rebalance
        bool needs = vault.needsRebalance(alice);
        assertFalse(needs, "Should not need rebalance initially");
    }

    function test_configStored() public {
        uint256 depositAmount = 1000e6;
        _depositViaRouter(alice, depositAmount);

        IZapVault.UserConfig memory config = vault.getConfig(alice);
        assertEq(config.rangeWidth, 480);
        assertEq(config.rebalanceThreshold, 500);
        assertEq(config.slippage, 100);
    }
}
