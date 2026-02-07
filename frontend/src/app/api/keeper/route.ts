import { NextResponse } from "next/server";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbiItem,
  formatUnits,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import Anthropic from "@anthropic-ai/sdk";

// --- ABI ---
const VAULT_ABI = [
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
] as const;

// --- Lazy-init clients (env vars unavailable at build time) ---
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _clients: any = null;

function clients() {
  if (!_clients) {
    const account = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`);
    const rpcUrl = process.env.BASE_RPC_URL!;
    _clients = {
      account,
      pub: createPublicClient({ chain: base, transport: http(rpcUrl) }),
      wallet: createWalletClient({ account, chain: base, transport: http(rpcUrl) }),
      ai: new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }),
      vault: process.env.VAULT_ADDRESS as Address,
    };
  }
  return _clients;
}

// --- Auth ---
function authorize(request: Request): boolean {
  const authHeader = request.headers.get("authorization");
  if (process.env.CRON_SECRET) {
    return authHeader === `Bearer ${process.env.CRON_SECRET}`;
  }
  return true;
}

// --- Discover users from Deposited events ---
async function discoverUsers(): Promise<Address[]> {
  const { pub, vault } = clients();
  const currentBlock = await pub.getBlockNumber();
  const fromBlock = currentBlock > 10000n ? currentBlock - 10000n : 0n;
  const logs = await pub.getLogs({
    address: vault,
    event: parseAbiItem(
      "event Deposited(address indexed user, uint256 usdcAmount, int24 tickLower, int24 tickUpper, int256 liquidity)"
    ),
    fromBlock,
    toBlock: "latest",
  });

  const users = new Set<Address>();
  for (const entry of logs) {
    if (entry.args.user) users.add(entry.args.user);
  }
  return Array.from(users);
}

// --- Read on-chain state ---
async function getUserState(user: Address) {
  const { pub, vault } = clients();
  const [position, config, needs] = await Promise.all([
    pub.readContract({ address: vault, abi: VAULT_ABI, functionName: "getPosition", args: [user] }),
    pub.readContract({ address: vault, abi: VAULT_ABI, functionName: "getConfig", args: [user] }),
    pub.readContract({ address: vault, abi: VAULT_ABI, functionName: "needsRebalance", args: [user] }),
  ]);
  return { position, config, needsRebalance: needs };
}

// --- Ask Claude ---
async function askClaude(
  user: Address,
  state: Awaited<ReturnType<typeof getUserState>>,
  gasPrice: bigint
): Promise<{ shouldRebalance: boolean; reasoning: string }> {
  const { ai } = clients();
  const { position, config, needsRebalance } = state;
  const gasCostEth = formatUnits(gasPrice * 500_000n, 18);

  const prompt = `You are an autonomous DeFi keeper agent managing concentrated liquidity positions on Uniswap v4.

A user's position needs your assessment. Here is the on-chain state:

User: ${user}
Position:
  - Tick range: [${position.tickLower}, ${position.tickUpper}]
  - Liquidity: ${position.liquidity.toString()}
  - Deposited USDC: ${formatUnits(position.depositedUSDC, 6)}
  - Deposit time: ${new Date(Number(position.depositTimestamp) * 1000).toISOString()}

Config:
  - Range width: ${config.rangeWidth} ticks
  - Rebalance threshold: ${config.rebalanceThreshold} bps (${Number(config.rebalanceThreshold) / 100}%)
  - Slippage tolerance: ${config.slippage} bps

On-chain check:
  - needsRebalance() returned: ${needsRebalance}

Current gas price: ${formatUnits(gasPrice, 9)} gwei
Estimated rebalance tx cost: ~${gasCostEth} ETH

Should the agent execute a rebalance transaction right now?

Consider:
1. Is the position actually out of range (needsRebalance = true)?
2. Is the gas cost reasonable relative to the position size?
3. Is there any reason to wait (e.g., position too small to justify gas)?

Respond with a JSON object only, no markdown:
{"shouldRebalance": true/false, "reasoning": "your explanation"}`;

  try {
    const response = await ai.messages.create({
      model: "claude-opus-4-6",
      max_tokens: 300,
      messages: [{ role: "user", content: prompt }],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return { shouldRebalance: false, reasoning: "Could not parse AI response" };
  } catch (e: any) {
    return {
      shouldRebalance: state.needsRebalance,
      reasoning: `Fallback: on-chain needsRebalance() (Claude error: ${e.message})`,
    };
  }
}

// --- Execute rebalance ---
async function executeRebalance(user: Address): Promise<string | null> {
  const { account, pub, wallet, vault } = clients();
  try {
    const { request } = await pub.simulateContract({
      account,
      address: vault,
      abi: VAULT_ABI,
      functionName: "rebalance",
      args: [user],
    });

    const txHash = await wallet.writeContract(request);
    const receipt = await pub.waitForTransactionReceipt({ hash: txHash });
    return receipt.transactionHash;
  } catch {
    return null;
  }
}

// --- Handler (one tick per cron invocation) ---
export async function GET(request: Request) {
  if (!authorize(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const output: string[] = [];
  const log = (msg: string) => {
    const line = `[${new Date().toISOString()}] ${msg}`;
    console.log(line);
    output.push(line);
  };

  try {
    log("Keeper tick started");
    log(`Vault: ${clients().vault}`);

    const users = await discoverUsers();
    if (users.length === 0) {
      log("No active positions to monitor");
      return NextResponse.json({ ok: true, logs: output });
    }

    const gasPrice = await clients().pub.getGasPrice();
    log(`Checking ${users.length} position(s) | gas: ${formatUnits(gasPrice, 9)} gwei`);

    let rebalanced = 0;

    for (const user of users) {
      try {
        const state = await getUserState(user);

        if (state.position.liquidity === 0n) {
          log(`  ${user} — position closed, skipping`);
          continue;
        }

        if (!state.needsRebalance) {
          log(`  ${user} — in range`);
          continue;
        }

        log(`  ${user} — OUT OF RANGE, consulting AI...`);
        const decision = await askClaude(user, state, gasPrice);
        log(`  AI: ${decision.reasoning}`);

        if (decision.shouldRebalance) {
          log(`  Executing rebalance for ${user}...`);
          const txHash = await executeRebalance(user);
          if (txHash) {
            log(`  Rebalanced! tx: ${txHash}`);
            rebalanced++;
          } else {
            log(`  Rebalance tx failed`);
          }
        } else {
          log(`  AI decided to skip`);
        }
      } catch (e: any) {
        log(`  Error checking ${user}: ${e.message}`);
      }
    }

    log(`Tick complete. ${rebalanced} rebalance(s) executed.`);
    return NextResponse.json({ ok: true, rebalanced, users: users.length, logs: output });
  } catch (e: any) {
    log(`Fatal error: ${e.message}`);
    return NextResponse.json({ ok: false, error: e.message, logs: output }, { status: 500 });
  }
}
