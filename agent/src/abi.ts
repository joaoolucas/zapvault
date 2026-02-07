export const VAULT_ABI = [
  {
    type: "function",
    name: "needsRebalance",
    inputs: [{ name: "user", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
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
    type: "event",
    name: "Deposited",
    inputs: [
      { name: "user", type: "address", indexed: true },
      { name: "usdcAmount", type: "uint256", indexed: false },
      { name: "tickLower", type: "int24", indexed: false },
      { name: "tickUpper", type: "int24", indexed: false },
      { name: "liquidity", type: "int256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Rebalanced",
    inputs: [
      { name: "user", type: "address", indexed: true },
      { name: "newTickLower", type: "int24", indexed: false },
      { name: "newTickUpper", type: "int24", indexed: false },
    ],
  },
] as const;

export const POOL_MANAGER_ABI = [
  {
    type: "function",
    name: "extsload",
    inputs: [{ name: "slot", type: "bytes32" }],
    outputs: [{ name: "", type: "bytes32" }],
    stateMutability: "view",
  },
] as const;
