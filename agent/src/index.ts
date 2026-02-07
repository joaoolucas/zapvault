import "dotenv/config";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbiItem,
  formatUnits,
  type Address,
  type PublicClient,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import Anthropic from "@anthropic-ai/sdk";
import { VAULT_ABI } from "./abi.js";

// --- Config ---
const VAULT_ADDRESS = process.env.VAULT_ADDRESS as Address;
const POOL_MANAGER = "0x498581fF718922c3f8e6A244956aF099B2652b2b" as Address;
const POLL_INTERVAL = Number(process.env.POLL_INTERVAL_MS ?? 30_000);

// --- Clients ---
const account = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`);

const publicClient = createPublicClient({
  chain: base,
  transport: http(process.env.BASE_RPC_URL),
});

const walletClient = createWalletClient({
  account,
  chain: base,
  transport: http(process.env.BASE_RPC_URL),
});

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// --- Tracked users ---
const trackedUsers = new Set<Address>();

function log(msg: string) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] ${msg}`);
}

// --- Discover users from Deposited events ---
async function discoverUsers() {
  try {
    const currentBlock = await publicClient.getBlockNumber();
    const fromBlock = currentBlock > 10000n ? currentBlock - 10000n : 0n;
    const logs = await publicClient.getLogs({
      address: VAULT_ADDRESS,
      event: parseAbiItem(
        "event Deposited(address indexed user, uint256 usdcAmount, int24 tickLower, int24 tickUpper, int256 liquidity)"
      ),
      fromBlock,
      toBlock: "latest",
    });

    for (const entry of logs) {
      const user = entry.args.user;
      if (user && !trackedUsers.has(user)) {
        trackedUsers.add(user);
        log(`Discovered user: ${user}`);
      }
    }
  } catch (e: any) {
    log(`Event scan error: ${e.message}`);
  }
}

// --- Read on-chain state for a user ---
async function getUserState(user: Address) {
  const [position, config, needs] = await Promise.all([
    publicClient.readContract({
      address: VAULT_ADDRESS,
      abi: VAULT_ABI,
      functionName: "getPosition",
      args: [user],
    }),
    publicClient.readContract({
      address: VAULT_ADDRESS,
      abi: VAULT_ABI,
      functionName: "getConfig",
      args: [user],
    }),
    publicClient.readContract({
      address: VAULT_ADDRESS,
      abi: VAULT_ABI,
      functionName: "needsRebalance",
      args: [user],
    }),
  ]);

  return { position, config, needsRebalance: needs };
}

// --- Ask Claude whether to rebalance ---
async function askClaude(
  user: Address,
  state: Awaited<ReturnType<typeof getUserState>>,
  gasPrice: bigint
): Promise<{ shouldRebalance: boolean; reasoning: string }> {
  const { position, config, needsRebalance } = state;

  const gasCostEth = formatUnits(gasPrice * 500_000n, 18); // ~500k gas estimate

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
    const response = await anthropic.messages.create({
      model: "claude-opus-4-6",
      max_tokens: 300,
      messages: [{ role: "user", content: prompt }],
    });

    const text =
      response.content[0].type === "text" ? response.content[0].text : "";
    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return { shouldRebalance: false, reasoning: "Could not parse AI response" };
  } catch (e: any) {
    log(`Claude API error: ${e.message}`);
    // Fallback: just use the on-chain check
    return {
      shouldRebalance: state.needsRebalance,
      reasoning: "Fallback: using on-chain needsRebalance() result",
    };
  }
}

// --- Execute rebalance ---
async function executeRebalance(user: Address): Promise<string | null> {
  try {
    const { request } = await publicClient.simulateContract({
      account,
      address: VAULT_ADDRESS,
      abi: VAULT_ABI,
      functionName: "rebalance",
      args: [user],
    });

    const txHash = await walletClient.writeContract(request);
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash,
    });

    return receipt.transactionHash;
  } catch (e: any) {
    log(`Rebalance tx failed for ${user}: ${e.message}`);
    return null;
  }
}

// --- Main loop ---
async function tick() {
  // Discover any new users
  await discoverUsers();

  if (trackedUsers.size === 0) {
    log("No active positions to monitor");
    return;
  }

  const gasPrice = await publicClient.getGasPrice();
  log(
    `Checking ${trackedUsers.size} position(s) | gas: ${formatUnits(gasPrice, 9)} gwei`
  );

  for (const user of trackedUsers) {
    try {
      const state = await getUserState(user);

      // Skip users with no active position (withdrawn)
      if (state.position.liquidity === 0n) {
        trackedUsers.delete(user);
        log(`  ${user} — position closed, removing from watchlist`);
        continue;
      }

      if (!state.needsRebalance) {
        log(`  ${user} — in range, no action needed`);
        continue;
      }

      // Position needs rebalance — ask Claude
      log(`  ${user} — OUT OF RANGE, consulting AI...`);
      const decision = await askClaude(user, state, gasPrice);
      log(`  AI decision: ${decision.reasoning}`);

      if (decision.shouldRebalance) {
        log(`  Executing rebalance for ${user}...`);
        const txHash = await executeRebalance(user);
        if (txHash) {
          log(`  Rebalanced! tx: ${txHash}`);
        }
      } else {
        log(`  AI decided to skip rebalance`);
      }
    } catch (e: any) {
      log(`  Error checking ${user}: ${e.message}`);
    }
  }
}

// --- Entrypoint ---
async function main() {
  log("=================================");
  log("  ZapVault AI Keeper Agent");
  log("=================================");
  log(`Vault: ${VAULT_ADDRESS}`);
  log(`Agent wallet: ${account.address}`);
  log(`Poll interval: ${POLL_INTERVAL / 1000}s`);
  log(`AI model: claude-opus-4-6`);
  log("");

  // Initial scan
  await tick();

  // Poll loop
  setInterval(tick, POLL_INTERVAL);
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
