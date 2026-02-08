export const CHAIN_ID_BASE = 8453;
export const CHAIN_ID_MAINNET = 1;

export const ADDRESSES = {
  POOL_MANAGER: "0x498581fF718922c3f8e6A244956aF099B2652b2b" as `0x${string}`,
  USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as `0x${string}`,
  VAULT: (process.env.NEXT_PUBLIC_VAULT_ADDRESS ?? "0x0000000000000000000000000000000000000000") as `0x${string}`,
  ROUTER: (process.env.NEXT_PUBLIC_ROUTER_ADDRESS ?? "0x0000000000000000000000000000000000000000") as `0x${string}`,
} as const;

export const ENS_KEYS = {
  RANGE: "vault.range",
  REBALANCE: "vault.rebalance",
  SLIPPAGE: "vault.slippage",
} as const;

export const DEFAULTS = {
  RANGE_WIDTH: 480,
  REBALANCE_THRESHOLD: 500,
  SLIPPAGE: 100,
} as const;

export const VAULT_ABI = [
  {
    type: "function",
    name: "deposit",
    inputs: [
      { name: "user", type: "address" },
      { name: "usdcAmount", type: "uint256" },
      {
        name: "config",
        type: "tuple",
        components: [
          { name: "rangeWidth", type: "int24" },
          { name: "rebalanceThreshold", type: "uint16" },
          { name: "slippage", type: "uint16" },
        ],
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "rebalance",
    inputs: [{ name: "user", type: "address" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "withdraw",
    inputs: [],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "getPosition",
    inputs: [{ name: "user", type: "address" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "tickLower", type: "int24" },
          { name: "tickUpper", type: "int24" },
          { name: "liquidity", type: "int256" },
          { name: "depositedUSDC", type: "uint256" },
          { name: "depositTimestamp", type: "uint256" },
          { name: "salt", type: "bytes32" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getConfig",
    inputs: [{ name: "user", type: "address" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "rangeWidth", type: "int24" },
          { name: "rebalanceThreshold", type: "uint16" },
          { name: "slippage", type: "uint16" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "needsRebalance",
    inputs: [{ name: "user", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
] as const;

export const ROUTER_ABI = [
  {
    type: "function",
    name: "deposit",
    inputs: [
      { name: "user", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "rangeWidth", type: "int24" },
      { name: "rebalanceThreshold", type: "uint16" },
      { name: "slippage", type: "uint16" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "depositWithAmount",
    inputs: [
      { name: "amount", type: "uint256" },
      { name: "rangeWidth", type: "int24" },
      { name: "rebalanceThreshold", type: "uint16" },
      { name: "slippage", type: "uint16" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;

export const ERC20_ABI = [
  {
    type: "function",
    name: "approve",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "balanceOf",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "allowance",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "transfer",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
  },
] as const;
