// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IZapVault} from "./interfaces/IZapVault.sol";
import {ZapVaultHook} from "./ZapVaultHook.sol";

/// @title ZapVaultRouter
/// @notice Entry point for LI.FI Composer deposits. LI.FI executor transfers USDC here then calls deposit().
contract ZapVaultRouter {
    ZapVaultHook public immutable hook;
    IERC20 public immutable usdc;

    error ZeroAmount();

    constructor(address _hook, address _usdc) {
        hook = ZapVaultHook(payable(_hook));
        usdc = IERC20(_usdc);
    }

    /// @notice Called by LI.FI executor after bridging USDC to this contract.
    /// @dev USDC must already be transferred to this contract before calling.
    /// @param user The depositor's address (passed through from source chain)
    /// @param rangeWidth Tick range width for LP position
    /// @param rebalanceThreshold Rebalance threshold in bps
    /// @param slippage Max slippage in bps
    function deposit(
        address user,
        int24 rangeWidth,
        uint16 rebalanceThreshold,
        uint16 slippage
    ) external {
        uint256 amount = usdc.balanceOf(address(this));
        if (amount == 0) revert ZeroAmount();

        usdc.approve(address(hook), amount);

        hook.deposit(
            user,
            amount,
            IZapVault.UserConfig({
                rangeWidth: rangeWidth,
                rebalanceThreshold: rebalanceThreshold,
                slippage: slippage
            })
        );
    }
}
