"use client";

import { useState, useEffect } from "react";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import { base } from "wagmi/chains";
import { formatUnits, parseAbiItem } from "viem";
import { usePosition } from "@/hooks/usePositions";
import { useENSConfig } from "@/hooks/useENSConfig";
import { VAULT_ABI, ADDRESSES } from "@/lib/constants";
import { usePoolAPR } from "@/hooks/usePoolAPR";

function tickToPrice(tick: number): number {
  return Math.pow(1.0001, tick) * 1e12;
}

function StatPill({ label, value, color = "text-foreground" }: { label: string; value: string; color?: string }) {
  return (
    <div className="px-5 py-3 rounded-xl bg-card border border-border">
      <div className="text-[10px] text-muted uppercase tracking-[1.5px] mb-1">{label}</div>
      <div className={`text-[15px] font-bold ${color}`}>{value}</div>
    </div>
  );
}

function RangeChart({ tickLower, tickUpper, needsRebalance }: { tickLower: number; tickUpper: number; needsRebalance: boolean }) {
  const priceLower = tickToPrice(tickLower);
  const priceUpper = tickToPrice(tickUpper);
  const priceMid = (priceLower + priceUpper) / 2;

  const pts = Array.from({ length: 30 }, (_, i) => {
    const x = (i / 29) * 100;
    const base = 50 + Math.sin(i * 0.4) * 15 + Math.cos(i * 0.7) * 10;
    const y = 100 - base;
    return `${i === 0 ? "M" : "L"} ${x} ${y}`;
  }).join(" ");

  return (
    <div className="bg-card rounded-2xl p-7 border border-border">
      <div className="flex items-center justify-between mb-4">
        <div>
          <span className="text-[15px] font-semibold text-foreground">ETH / USDC</span>
          <span className="text-[13px] text-muted ml-3">${priceMid.toFixed(2)}</span>
        </div>
        <div className={`px-3 py-1 rounded text-xs font-semibold ${
          needsRebalance
            ? "bg-accent-red/10 text-accent-red"
            : "bg-accent-green-soft text-accent-green"
        }`}>
          {needsRebalance ? "Out of Range" : "In Range"}
        </div>
      </div>

      <div className="relative">
        <div
          className="absolute top-0 bottom-6 border-l border-r border-dashed border-accent-blue/30 bg-accent-blue-soft"
          style={{ left: "25%", right: "25%" }}
        />
        <svg viewBox="0 0 100 100" className="w-full h-[200px]" preserveAspectRatio="none">
          <defs>
            <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0D0D0D" stopOpacity="0.08" />
              <stop offset="100%" stopColor="#0D0D0D" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={pts + " L 100 100 L 0 100 Z"} fill="url(#chartFill)" />
          <path d={pts} fill="none" stroke="#0D0D0D" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        </svg>
        <div className="flex justify-between text-[11px] text-muted">
          <span>${priceLower.toFixed(0)}</span>
          <span className="text-accent-blue font-medium">
            Range: ${priceLower.toFixed(0)} — ${priceUpper.toFixed(0)}
          </span>
          <span>${priceUpper.toFixed(0)}</span>
        </div>
      </div>
    </div>
  );
}

interface Activity {
  text: string;
  time: string;
  tag: string;
  color: string;
  txHash?: string;
}

function timeAgo(timestamp: bigint): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - Number(timestamp);
  if (diff < 60) return "Just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function ActivityLog() {
  const { address } = useAccount();
  const publicClient = usePublicClient({ chainId: base.id });
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!address || !publicClient) return;

    async function fetchEvents() {
      try {
        const currentBlock = await publicClient!.getBlockNumber();
        // Look back ~10k blocks (~5.5h) — Chainstack range limit
        const fromBlock = currentBlock > 10000n ? currentBlock - 10000n : 0n;

        const [depositLogs, rebalanceLogs, withdrawLogs] = await Promise.all([
          publicClient!.getLogs({
            address: ADDRESSES.VAULT,
            event: parseAbiItem("event Deposited(address indexed user, uint256 usdcAmount, int24 tickLower, int24 tickUpper, int256 liquidity)"),
            args: { user: address },
            fromBlock,
          }),
          publicClient!.getLogs({
            address: ADDRESSES.VAULT,
            event: parseAbiItem("event Rebalanced(address indexed user, int24 newTickLower, int24 newTickUpper)"),
            args: { user: address },
            fromBlock,
          }),
          publicClient!.getLogs({
            address: ADDRESSES.VAULT,
            event: parseAbiItem("event Withdrawn(address indexed user, uint256 ethAmount, uint256 usdcAmount)"),
            args: { user: address },
            fromBlock,
          }),
        ]);

        const items: (Activity & { block: bigint })[] = [];

        for (const log of depositLogs) {
          const amount = Number(formatUnits(log.args.usdcAmount ?? 0n, 6));
          const block = await publicClient!.getBlock({ blockNumber: log.blockNumber });
          items.push({
            text: `Deposited $${amount.toFixed(2)} USDC`,
            time: timeAgo(block.timestamp),
            tag: "DEPOSIT",
            color: "text-accent-green",
            txHash: log.transactionHash,
            block: log.blockNumber,
          });
        }

        for (const log of rebalanceLogs) {
          const block = await publicClient!.getBlock({ blockNumber: log.blockNumber });
          items.push({
            text: `Position rebalanced to [${log.args.newTickLower}, ${log.args.newTickUpper}]`,
            time: timeAgo(block.timestamp),
            tag: "REBALANCE",
            color: "text-accent-blue",
            txHash: log.transactionHash,
            block: log.blockNumber,
          });
        }

        for (const log of withdrawLogs) {
          const usdcAmt = Number(formatUnits(log.args.usdcAmount ?? 0n, 6));
          const ethAmt = Number(formatUnits(log.args.ethAmount ?? 0n, 18));
          const block = await publicClient!.getBlock({ blockNumber: log.blockNumber });
          items.push({
            text: `Withdrew ${ethAmt > 0 ? ethAmt.toFixed(4) + " ETH + " : ""}$${usdcAmt.toFixed(2)} USDC`,
            time: timeAgo(block.timestamp),
            tag: "WITHDRAW",
            color: "text-accent-red",
            txHash: log.transactionHash,
            block: log.blockNumber,
          });
        }

        items.sort((a, b) => Number(b.block - a.block));
        setActivities(items);
      } catch (e) {
        console.error("Failed to fetch activity:", e);
      } finally {
        setLoading(false);
      }
    }

    fetchEvents();
  }, [address, publicClient]);

  return (
    <div className="bg-card rounded-2xl p-7 border border-border">
      <div className="font-serif text-xs text-muted uppercase tracking-[3px] mb-5">Activity</div>
      {loading ? (
        <div className="text-[13px] text-muted py-4">Loading activity...</div>
      ) : activities.length === 0 ? (
        <div className="text-[13px] text-muted py-4">No activity yet</div>
      ) : (
        activities.map((a, i) => (
          <div key={i} className={`flex items-start justify-between py-3.5 ${i < activities.length - 1 ? "border-b border-surface" : ""}`}>
            <div>
              <div className="text-[13px] text-foreground leading-relaxed">{a.text}</div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[11px] text-muted">{a.time}</span>
                {a.txHash && (
                  <a
                    href={`https://basescan.org/tx/${a.txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] text-accent-blue hover:underline"
                  >
                    View tx
                  </a>
                )}
              </div>
            </div>
            <span className={`px-2 py-0.5 rounded text-[10px] font-semibold tracking-wide flex-shrink-0 ml-4 ${a.color} bg-surface`}>
              {a.tag}
            </span>
          </div>
        ))
      )}
    </div>
  );
}

function DetailsPanel({ position }: { position: any }) {
  const depositedUSDC = position ? Number(formatUnits(position.depositedUSDC, 6)) : 0;

  const details = [
    { k: "Pool", v: "ETH/USDC · 0.05%" },
    { k: "Deposited", v: `$${depositedUSDC.toFixed(2)}` },
    { k: "Range", v: position ? `${tickToPrice(position.tickLower).toFixed(0)} — ${tickToPrice(position.tickUpper).toFixed(0)}` : "—" },
    { k: "Managed by", v: "Claude Opus 4.6" },
    { k: "Withdraw as", v: "ETH + USDC" },
  ];

  return (
    <div className="bg-card rounded-2xl p-6 border border-border">
      <div className="font-serif text-xs text-muted uppercase tracking-[3px] mb-4">Details</div>
      {details.map(({ k, v }) => (
        <div key={k} className="flex items-center justify-between py-2 text-[13px] border-b border-surface last:border-none">
          <span className="text-muted">{k}</span>
          <span className="text-foreground font-medium">{v}</span>
        </div>
      ))}
      <div className="flex gap-2 mt-4">
        <a
          href="https://app.uniswap.org/explore/pools/base/0x96d4b53a38337a5733179751781178a2613306063c511b78cd02684739288c0a"
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-surface text-[12px] font-semibold text-accent-blue hover:bg-border transition-colors"
        >
          View on Uniswap
          <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none">
            <path d="M6 3h7v7M13 3L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </a>
        <a
          href={`https://basescan.org/address/${ADDRESSES.VAULT}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-surface text-[12px] font-semibold text-accent-blue hover:bg-border transition-colors"
        >
          Basescan
          <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none">
            <path d="M6 3h7v7M13 3L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </a>
      </div>
    </div>
  );
}

function StrategyPanel({ config }: { config: any }) {
  const { ensName, hasENS, hasENSConfig } = useENSConfig();

  const strategies = [
    { k: "vault.range", v: config ? `±${(config.rangeWidth / 2).toFixed(0)} ticks` : "±240" },
    { k: "vault.rebalance", v: config ? `${(config.rebalanceThreshold / 100).toFixed(0)}%` : "5%" },
    { k: "vault.slippage", v: config ? `${(config.slippage / 100).toFixed(1)}%` : "1%" },
  ];

  return (
    <div className="bg-card rounded-2xl p-6 border border-border">
      <div className="flex items-center justify-between mb-4">
        <div className="font-serif text-xs text-muted uppercase tracking-[3px]">Strategy</div>
        {hasENS && hasENSConfig ? (
          <span className="text-[10px] font-semibold text-accent-blue px-2 py-0.5 rounded bg-accent-blue-soft">
            via {ensName}
          </span>
        ) : hasENS ? (
          <span className="text-[10px] font-semibold text-muted px-2 py-0.5 rounded bg-surface">
            defaults
          </span>
        ) : (
          <span className="text-[10px] font-semibold text-muted px-2 py-0.5 rounded bg-surface">
            no ENS
          </span>
        )}
      </div>
      {strategies.map(({ k, v }) => (
        <div key={k} className="flex items-center justify-between py-2 text-[13px] border-b border-surface last:border-none">
          <span className="text-muted">{k}</span>
          <span className="text-foreground font-bold">{v}</span>
        </div>
      ))}
      {hasENS ? (
        <a
          href={`https://app.ens.domains/${ensName}?tab=records`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-surface text-[12px] font-semibold text-accent-blue hover:bg-border transition-colors"
        >
          {hasENSConfig ? "Edit on ENS" : "Set Records on ENS"}
          <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none">
            <path d="M6 3h7v7M13 3L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </a>
      ) : (
        <div className="mt-4 text-[11px] text-muted text-center py-2 px-3 rounded-lg bg-surface">
          Connect an ENS name to configure strategy via text records
        </div>
      )}
    </div>
  );
}

function PoweredBy() {
  return (
    <div className="p-4 rounded-xl bg-surface">
      <div className="text-[10px] text-muted uppercase tracking-[2px] mb-3">Powered by</div>
      {[
        { name: "Uniswap v4", desc: "Concentrated LP" },
        { name: "LI.FI", desc: "Cross-chain deposit" },
        { name: "ENS", desc: "Strategy config" },
        { name: "Claude Opus 4.6", desc: "AI Keeper agent" },
      ].map(({ name, desc }) => (
        <div key={name} className="flex items-center justify-between py-1.5 text-xs">
          <span className="font-semibold text-foreground">{name}</span>
          <span className="text-muted">{desc}</span>
        </div>
      ))}
    </div>
  );
}

export function Dashboard({ onDeposit }: { onDeposit: () => void }) {
  const { address } = useAccount();
  const { position, needsRebalance, config, refetch } = usePosition();
  const publicClient = usePublicClient({ chainId: base.id });
  const { data: walletClient } = useWalletClient({ chainId: base.id });
  const rangeWidth = position ? Number(position.tickUpper) - Number(position.tickLower) : undefined;
  const { formatted: aprFormatted } = usePoolAPR(rangeWidth);

  if (!position) {
    return (
      <div className="px-12 pt-24 pb-40 text-center">
        <p className="font-serif text-xs text-muted uppercase tracking-[4px] mb-4">No Active Position</p>
        <h2 className="font-serif text-5xl font-bold text-foreground tracking-tighter leading-[0.9] mb-4">
          Nothing here yet
        </h2>
        <p className="text-sm text-muted leading-relaxed max-w-sm mx-auto mb-8">
          Deposit USDC to create your first managed LP position.
        </p>
        <button
          onClick={onDeposit}
          className="px-8 py-4 bg-foreground text-background text-sm font-bold rounded-xl hover:opacity-90 transition-opacity cursor-pointer"
        >
          Deposit
        </button>
      </div>
    );
  }

  const depositedUSDC = Number(formatUnits(position.depositedUSDC, 6));
  const inRange = !needsRebalance;

  const handleWithdraw = async () => {
    if (!walletClient || !publicClient) return;
    try {
      const hash = await walletClient.writeContract({
        address: ADDRESSES.VAULT,
        abi: VAULT_ABI,
        functionName: "withdraw",
        chain: base,
        gas: 800_000n,
      });
      await publicClient.waitForTransactionReceipt({ hash });
      refetch();
    } catch (e) {
      console.error("Withdraw failed:", e);
    }
  };

  return (
    <div className="px-12 pb-20">
      {/* Hero */}
      <div className="flex items-end justify-between pt-12 pb-9">
        <div>
          <p className="font-serif text-xs text-muted uppercase tracking-[3px] mb-3">Your Position</p>
          <div className="font-serif text-7xl font-bold text-foreground tracking-[-4px] leading-[0.9]">
            ${depositedUSDC.toLocaleString(undefined, { minimumFractionDigits: 0 })}
          </div>
          <div className="flex items-center gap-3 mt-3.5 text-sm">
            <span className="px-2.5 py-1 rounded text-xs font-semibold bg-accent-green-soft text-accent-green">
              {aprFormatted} APR
            </span>
            <span className={`px-2.5 py-1 rounded text-xs font-semibold ${
              inRange ? "bg-accent-green-soft text-accent-green" : "bg-accent-red/10 text-accent-red"
            }`}>
              {inRange ? "In Range" : "Out of Range"}
            </span>
            <span className="text-muted text-xs">ETH/USDC · 0.05%</span>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onDeposit}
            className="px-7 py-3.5 text-sm font-bold bg-foreground text-background rounded-xl hover:opacity-90 transition-opacity cursor-pointer"
          >
            Deposit
          </button>
          <button
            onClick={handleWithdraw}
            className="px-7 py-3.5 text-sm font-semibold bg-card text-foreground border border-border rounded-xl hover:bg-surface transition-colors cursor-pointer"
          >
            Withdraw
          </button>
        </div>
      </div>

      {/* Stat pills */}
      <div className="flex gap-3 mb-7">
        <StatPill label="APR (24h)" value={aprFormatted} color="text-accent-green" />
        <StatPill label="Pool" value="ETH / USDC" />
        <StatPill label="Deposited" value={`$${depositedUSDC.toFixed(2)}`} />
        <StatPill label="Status" value={inRange ? "In Range" : "Out of Range"} color={inRange ? "text-accent-green" : "text-accent-red"} />
        <StatPill label="Keeper" value="Claude Opus 4.6" color="text-accent-blue" />
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-[1fr_320px] gap-6">
        <div className="flex flex-col gap-6">
          <RangeChart tickLower={position.tickLower} tickUpper={position.tickUpper} needsRebalance={!!needsRebalance} />
          <ActivityLog />
        </div>
        <div className="flex flex-col gap-6">
          <DetailsPanel position={position} />
          <StrategyPanel config={config} />
          <PoweredBy />
        </div>
      </div>
    </div>
  );
}
