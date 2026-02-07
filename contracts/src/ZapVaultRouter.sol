// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IZapVault} from "./interfaces/IZapVault.sol";
import {ZapVault} from "./ZapVault.sol";

/// @title ZapVaultRouter
/// @notice Entry point for deposits. Supports both approve+deposit (frontend) and transfer+deposit (LI.FI).
contract ZapVaultRouter {
    ZapVault public immutable vault;
    IERC20 public immutable usdc;
    address public immutable owner;

    error ZeroAmount();
    error OnlyOwner();

    constructor(address _vault, address _usdc) {
        vault = ZapVault(payable(_vault));
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
    function depositWithAmount(
        uint256 amount,
        int24 rangeWidth,
        uint16 rebalanceThreshold,
        uint16 slippage
    ) external {
        if (amount == 0) revert ZeroAmount();

        usdc.transferFrom(msg.sender, address(this), amount);
        usdc.approve(address(vault), amount);

        vault.deposit(
            msg.sender,
            amount,
            IZapVault.UserConfig({
                rangeWidth: rangeWidth,
                rebalanceThreshold: rebalanceThreshold,
                slippage: slippage
            })
        );
    }

    /// @notice Deposit on behalf of user — pulls USDC from msg.sender (LI.FI Composer pattern)
    function deposit(
        address user,
        uint256 amount,
        int24 rangeWidth,
        uint16 rebalanceThreshold,
        uint16 slippage
    ) external {
        if (amount == 0) revert ZeroAmount();

        usdc.transferFrom(msg.sender, address(this), amount);
        usdc.approve(address(vault), amount);

        vault.deposit(
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
