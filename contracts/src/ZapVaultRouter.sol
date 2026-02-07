// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IZapVault} from "./interfaces/IZapVault.sol";
import {ZapVaultHook} from "./ZapVaultHook.sol";

/// @title ZapVaultRouter
/// @notice Entry point for deposits. Supports both approve+deposit (frontend) and transfer+deposit (LI.FI).
contract ZapVaultRouter {
    ZapVaultHook public immutable hook;
    IERC20 public immutable usdc;
    address public immutable owner;

    error ZeroAmount();
    error OnlyOwner();

    constructor(address _hook, address _usdc) {
        hook = ZapVaultHook(payable(_hook));
        usdc = IERC20(_usdc);
        owner = msg.sender;
    }

    /// @notice Rescue stuck tokens — owner only
    function rescue(address token, address to, uint256 amount) external {
        if (msg.sender != owner) revert OnlyOwner();
        if (token == address(0)) {
            payable(to).transfer(amount);
        } else {
            IERC20(token).transfer(to, amount);
        }
    }

    /// @notice Deposit with explicit amount (approve pattern — frontend uses this)
    /// @dev User must approve this router for USDC first. Atomic: transferFrom + deposit in one tx.
    function depositWithAmount(
        uint256 amount,
        int24 rangeWidth,
        uint16 rebalanceThreshold,
        uint16 slippage
    ) external {
        if (amount == 0) revert ZeroAmount();

        usdc.transferFrom(msg.sender, address(this), amount);
        usdc.approve(address(hook), amount);

        hook.deposit(
            msg.sender,
            amount,
            IZapVault.UserConfig({
                rangeWidth: rangeWidth,
                rebalanceThreshold: rebalanceThreshold,
                slippage: slippage
            })
        );
    }

    /// @notice Deposit using balance already in router (LI.FI Composer pattern)
    /// @dev USDC must already be transferred to this contract before calling.
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
