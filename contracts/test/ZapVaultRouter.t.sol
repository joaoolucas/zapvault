// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "./utils/BaseTest.sol";

contract ZapVaultRouterTest is BaseTest {
    function test_routerDeployedCorrectly() public view {
        assertEq(address(router.vault()), address(vault));
        assertEq(address(router.usdc()), USDC_ADDRESS);
    }

    function test_depositViaRouter() public {
        uint256 amount = 500e6;

        // Approve router to pull USDC (simulating LI.FI executor approve pattern)
        vm.prank(alice);
        USDC.approve(address(router), amount);

        // Call deposit
        vm.prank(alice);
        router.deposit(alice, amount, 480, 500, 100);

        // Verify position created
        IZapVault.UserPosition memory pos = vault.getPosition(alice);
        assertGt(pos.liquidity, 0, "Position should exist");
        assertEq(pos.depositedUSDC, amount, "Deposited amount mismatch");
    }

    function test_revertDepositZeroAmount() public {
        vm.expectRevert(ZapVaultRouter.ZeroAmount.selector);
        router.deposit(alice, 0, 480, 500, 100);
    }
}
