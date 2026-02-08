# ZapVault

Cross-chain automated LP provision on Uniswap v4. Deposit any token from any EVM chain, get concentrated ETH/USDC liquidity on Base with AI-managed rebalancing.

## Architecture

```
User (any chain, any token)
  → LI.FI Composer (swap + bridge + contract call)
  → USDC on Base → ZapVaultRouter.deposit()
  → ZapVault: oracle-centered range, swap USDC→ETH, add concentrated liquidity
  → AI Keeper monitors positions, calls rebalance() when price drifts
  → Withdraw converts everything to USDC-only
```

ZapVault is a standalone vault implementing `IUnlockCallback`. It calls `poolManager.unlock()` and performs all pool operations (swap + modifyLiquidity) atomically inside the callback using v4's flash accounting. No custom hook is needed. The vault works with the existing hookless ETH/USDC 0.05% pool on Base.

## Prize Tracks

| Bounty | Integration |
|--------|-------------|
| **Uniswap Foundation** | Standalone vault using v4 PoolManager for concentrated LP management |
| **LI.FI** | Composer-compatible router for cross-chain deposits in a single transaction |
| **ENS** | Strategy configuration via text records (`vault.range`, `vault.rebalance`, `vault.slippage`) |

## Project Structure

```
zapvault/
├── contracts/                  # Foundry (Solidity 0.8.26, Cancun EVM, via_ir)
│   ├── src/
│   │   ├── ZapVault.sol        # Standalone vault, IUnlockCallback
│   │   ├── ZapVaultRouter.sol  # LI.FI Composer-compatible entry point
│   │   └── interfaces/IZapVault.sol
│   └── test/
├── frontend/                   # Next.js 16 + Tailwind + wagmi v3 + RainbowKit
│   └── src/
│       ├── app/                # Pages: home, positions, strategy, docs
│       ├── components/         # DepositModal, ENSConfigPanel, WithdrawModal
│       └── hooks/              # useENSConfig, usePositions, useDeposit, useWithdraw
└── pnpm-workspace.yaml
```

## Smart Contracts

### ZapVault

Standalone vault implementing `IUnlockCallback`. Manages per-user concentrated LP positions on any existing v4 pool.

| Function | Description |
|----------|-------------|
| `deposit(user, usdcAmount, config)` | Oracle-centered range, swap + provision LP |
| `withdraw()` | Remove LP, swap ETH→USDC, send USDC to user |
| `rebalance(user)` | Remove old position, re-center on oracle price |
| `needsRebalance(user)` | Check if price drifted beyond threshold |
| `getPosition(user)` | View position details |
| `getConfig(user)` | View user's strategy config |

### ZapVaultRouter

LI.FI Composer-compatible entry point. Handles USDC transfers and passes through to the vault.

| Function | Description |
|----------|-------------|
| `depositWithAmount(amount, range, threshold, slippage)` | Direct deposit from Base |
| `deposit(user, amount, range, threshold, slippage)` | Composer-compatible (explicit user address) |

### Deployed Addresses (Base Mainnet)

| Contract | Address |
|----------|---------|
| ZapVault | `0xc77d3CCFba9354db99972D11d994676d55709d5C` |
| ZapVaultRouter | `0x3F75D8E28A148380B186AcedcDE476F8E1CFDd78` |
| PoolManager (v4) | `0x498581fF718922c3f8e6A244956aF099B2652b2b` |
| USDC | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |
| Chainlink ETH/USD | `0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70` |

## ENS Integration

Strategy configuration stored as ENS text records on mainnet:

| Key | Description | Default |
|-----|-------------|---------|
| `vault.range` | Tick range width | 600 |
| `vault.rebalance` | Rebalance threshold (bps) | 500 (5%) |
| `vault.slippage` | Max slippage (bps) | 50 (0.5%) |

Anyone can follow a strategist's ENS name when depositing to auto-fill their published config.

## LI.FI Composer

The router's `deposit()` function is Composer-compatible. A cross-chain deposit works in a single user transaction:

1. LI.FI swaps the source token on the source chain
2. Bridges to Base as USDC
3. Composer calls `ZapVaultRouter.deposit(user, amount, ...)` as the final step

On withdraw, LI.FI bridges USDC from Base back to the user's origin chain. LI.Fuel provides gas abstraction so users don't need Base ETH.

## AI Keeper

A Vercel Cron serverless function powered by Claude Opus 4.6. Each tick it:

1. Discovers all active depositors
2. Calls `needsRebalance()` for each position
3. Executes `rebalance()` when price drifts beyond the user's threshold

The keeper is non-custodial. If it goes down, positions stay active and users can withdraw at any time.

## Setup

### Contracts

```bash
cd contracts
forge install
forge build
forge test --match-path "test/*"
```

### Frontend

```bash
cd frontend
pnpm install
pnpm dev
```

### Environment

```bash
# frontend/.env.local
NEXT_PUBLIC_VAULT_ADDRESS=0xc77d3CCFba9354db99972D11d994676d55709d5C
NEXT_PUBLIC_ROUTER_ADDRESS=0x3F75D8E28A148380B186AcedcDE476F8E1CFDd78
NEXT_PUBLIC_WC_PROJECT_ID=...
ANTHROPIC_API_KEY=...
CRON_SECRET=...
```

## Tech Stack

| Layer | Technologies |
|-------|-------------|
| Contracts | Solidity 0.8.26, Foundry, Uniswap v4 Core/Periphery |
| Frontend | Next.js 16, TypeScript, Tailwind CSS, wagmi v3, viem, RainbowKit |
| Integrations | LI.FI SDK + Composer, Chainlink Price Feeds, ENS Text Records |
| AI Keeper | Claude Opus 4.6, Vercel Cron |
| Chain | Base Mainnet (8453) |
