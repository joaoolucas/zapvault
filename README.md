# ZapVault

Cross-chain automated LP provision on Uniswap v4. Deposit any token from any EVM chain → get concentrated ETH/USDC liquidity on Base.

## Architecture

```
User (any chain, any token)
  → LI.FI Composer (swap + bridge + contract call)
  → USDC on Base → ZapVaultRouter.deposit()
  → ZapVaultHook: swap 50% USDC→ETH, add concentrated liquidity
  → afterSwap() monitors price, emits NeedsRebalance
  → Frontend/keeper calls hook.rebalance() when flagged
```

## Prize Tracks

- **Uniswap v4 Agentic Finance** — Custom hook with automated concentrated LP management
- **LI.FI** — Composer integration for cross-chain deposit in a single transaction
- **ENS** — Strategy configuration via ENS text records (`vault.range`, `vault.rebalance`, `vault.slippage`)

## Project Structure

```
zapvault/
├── contracts/                  # Foundry (Solidity 0.8.26, Cancun EVM)
│   ├── src/
│   │   ├── ZapVaultHook.sol   # Uniswap v4 hook — core LP management
│   │   ├── ZapVaultRouter.sol # LI.FI entry point
│   │   └── interfaces/IZapVault.sol
│   ├── test/
│   │   ├── ZapVaultHook.t.sol
│   │   ├── ZapVaultRouter.t.sol
│   │   └── utils/BaseTest.sol
│   └── script/
│       ├── DeployHook.s.sol   # CREATE2 + HookMiner deployment
│       └── DeployRouter.s.sol
├── frontend/                   # Next.js 16 + Tailwind + wagmi + RainbowKit
│   └── src/
│       ├── app/               # Landing page + Dashboard
│       ├── components/        # DepositWidget, ENSConfigPanel, PositionCard
│       └── hooks/             # useENSConfig, usePositions, useDeposit
└── pnpm-workspace.yaml
```

## Smart Contracts

### ZapVaultHook (Uniswap v4 Hook)

- **Hook permissions**: `afterInitialize` + `afterSwap`
- **deposit()**: Swaps ~50% USDC→ETH, provisions concentrated liquidity centered on current price
- **rebalance()**: Removes old position, re-centers at new price
- **withdraw()**: Removes position, returns ETH + USDC to user
- **afterSwap()**: Monitors price drift, emits rebalance signals
- Deployed with CREATE2 via HookMiner for correct address bits

### ZapVaultRouter (LI.FI Entry Point)

- Called by LI.FI executor after bridging USDC to Base
- Passes through to hook with user config (range, rebalance threshold, slippage)

### Key Addresses (Base Mainnet)

- PoolManager: `0x498581fF718922c3f8e6A244956aF099B2652b2b`
- USDC: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`
- ETH: native (`address(0)`)

## ENS Integration

Strategy configuration stored as ENS text records on mainnet:

| Key | Description | Default |
|-----|-------------|---------|
| `vault.range` | Tick range width | 1200 |
| `vault.rebalance` | Rebalance threshold (bps) | 500 (5%) |
| `vault.slippage` | Max slippage (bps) | 100 (1%) |

Frontend reads ENS records and passes as calldata to Base contracts.

## LI.FI Composer

The deposit widget uses LI.FI's ContractCalls API to build a single transaction that:
1. Swaps source token on source chain
2. Bridges to Base as USDC
3. Calls `ZapVaultRouter.deposit()` with user's config

User signs **one transaction** on their source chain.

## Setup

### Contracts

```bash
cd contracts
forge install
forge build
forge test --fork-url $BASE_RPC_URL -vvv
```

### Frontend

```bash
cd frontend
pnpm install
pnpm dev
```

### Environment

```bash
# .env
BASE_RPC_URL=https://mainnet.base.org
PRIVATE_KEY=0x...
NEXT_PUBLIC_HOOK_ADDRESS=0x...
NEXT_PUBLIC_ROUTER_ADDRESS=0x...
NEXT_PUBLIC_WC_PROJECT_ID=...
```

### Deploy

```bash
# 1. Deploy hook (mines CREATE2 salt for correct address bits)
forge script script/DeployHook.s.sol --rpc-url $BASE_RPC_URL --broadcast

# 2. Deploy router + initialize pool
HOOK_ADDRESS=0x... forge script script/DeployRouter.s.sol --rpc-url $BASE_RPC_URL --broadcast
```

## Tech Stack

- **Contracts**: Solidity 0.8.26, Foundry, Uniswap v4 Core/Periphery, OpenZeppelin
- **Frontend**: Next.js 16, Tailwind CSS, wagmi v3, viem v2, RainbowKit
- **Integrations**: LI.FI Composer API, ENS Text Records
- **Chain**: Base Mainnet (8453)
