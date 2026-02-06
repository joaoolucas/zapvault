// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "./utils/BaseTest.sol";

contract ZapVaultRouterTest is BaseTest {
    function test_routerDeployedCorrectly() public view {
        assertEq(address(router.hook()), address(hook));
        assertEq(address(router.usdc()), USDC_ADDRESS);
    }

    function test_depositViaRouter() public {
        uint256 amount = 500e6;

        // Transfer USDC to router (simulating LI.FI executor behavior)
        vm.prank(alice);
        USDC.transfer(address(router), amount);

        // Call deposit
        router.deposit(alice, 1200, 500, 100);

        // Verify position created
        IZapVault.UserPosition memory pos = hook.getPosition(alice);
        assertGt(pos.liquidity, 0, "Position should exist");
        assertEq(pos.depositedUSDC, amount, "Deposited amount mismatch");
    }

    function test_revertDepositZeroAmount() public {
        vm.expectRevert(ZapVaultRouter.ZeroAmount.selector);
        router.deposit(alice, 1200, 500, 100);
    }
}
