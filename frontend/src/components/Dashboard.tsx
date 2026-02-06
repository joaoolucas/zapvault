"use client";

import { useAccount, useWriteContract, useReadContract } from "wagmi";
import { base } from "wagmi/chains";
import { formatUnits } from "viem";
import { usePosition } from "@/hooks/usePositions";
import { useENSConfig } from "@/hooks/useENSConfig";
import { HOOK_ABI, ADDRESSES, ERC20_ABI } from "@/lib/constants";
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

function ActivityLog() {
  const activities = [
    { text: "Claude Opus 4.6 monitoring position", time: "Just now", tag: "AI AGENT", color: "text-accent-blue" },
    { text: "Position deposited via ZapVault", time: "On deposit", tag: "DEPOSIT", color: "text-foreground" },
  ];

  return (
    <div className="bg-card rounded-2xl p-7 border border-border">
      <div className="font-serif text-xs text-muted uppercase tracking-[3px] mb-5">Activity</div>
      {activities.map((a, i) => (
        <div key={i} className={`flex items-start justify-between py-3.5 ${i < activities.length - 1 ? "border-b border-surface" : ""}`}>
          <div>
            <div className="text-[13px] text-foreground leading-relaxed">{a.text}</div>
            <div className="text-[11px] text-muted mt-0.5">{a.time}</div>
          </div>
          <span className={`px-2 py-0.5 rounded text-[10px] font-semibold tracking-wide flex-shrink-0 ml-4 ${a.color} bg-surface`}>
            {a.tag}
          </span>
        </div>
      ))}
    </div>
  );
}

function DetailsPanel({ position }: { position: any }) {
  const depositedUSDC = position ? Number(formatUnits(position.depositedUSDC, 6)) : 0;

  const details = [
    { k: "Pool", v: "ETH/USDC · 0.3%" },
    { k: "Deposited", v: `$${depositedUSDC.toFixed(2)}` },
    { k: "Liquidity", v: position ? BigInt(position.liquidity).toLocaleString() : "0" },
    { k: "Managed by", v: "Claude Opus 4.6" },
    { k: "Withdraw as", v: "USDC only" },
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
    </div>
  );
}

function StrategyPanel({ config }: { config: any }) {
  const strategies = [
    { k: "vault.range", v: config ? `±${(config.rangeWidth / 2).toFixed(0)} ticks` : "±600" },
    { k: "vault.rebalance", v: config ? `${(config.rebalanceThreshold / 100).toFixed(0)}%` : "5%" },
    { k: "vault.slippage", v: config ? `${(config.slippage / 100).toFixed(1)}%` : "1%" },
  ];

  return (
    <div className="bg-card rounded-2xl p-6 border border-border">
      <div className="flex items-center justify-between mb-4">
        <div className="font-serif text-xs text-muted uppercase tracking-[3px]">Strategy</div>
        <span className="text-[10px] font-semibold text-accent-blue px-2 py-0.5 rounded bg-accent-blue-soft">
          via ENS
        </span>
      </div>
      {strategies.map(({ k, v }) => (
        <div key={k} className="flex items-center justify-between py-2 text-[13px] border-b border-surface last:border-none">
          <span className="text-muted">{k}</span>
          <span className="text-foreground font-bold">{v}</span>
        </div>
      ))}
      <div className="mt-4 text-[11px] text-muted text-center py-2 px-3 rounded-lg bg-surface">
        Read from ENS text records
      </div>
    </div>
  );
}

function PoweredBy() {
  return (
    <div className="p-4 rounded-xl bg-surface">
      <div className="text-[10px] text-muted uppercase tracking-[2px] mb-3">Powered by</div>
      {[
        { name: "Uniswap v4", desc: "AutoRange Hook" },
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

function EmptyState({ onDeposit, aprFormatted }: { onDeposit: () => void; aprFormatted: string }) {
  return (
    <div className="px-12 pt-16 pb-40">
      <div className="max-w-4xl mx-auto">
        {/* Hero */}
        <div className="text-center mb-16">
          <p className="font-serif text-xs text-muted uppercase tracking-[4px] mb-4">No Active Position</p>
          <h2 className="font-serif text-6xl font-bold text-foreground tracking-tighter leading-[0.9] mb-4">
            Start earning<br /><span className="italic font-normal">on autopilot</span>
          </h2>
          <p className="text-sm text-muted leading-relaxed max-w-md mx-auto mb-10">
            Deposit USDC from any chain. Your LP is managed by Claude Opus 4.6 —
            an AI agent that monitors and rebalances your position 24/7.
          </p>
          <button
            onClick={onDeposit}
            className="px-8 py-4 bg-foreground text-background text-sm font-bold rounded-xl hover:opacity-90 transition-opacity cursor-pointer"
          >
            Deposit from Anywhere &rarr;
          </button>
        </div>

        {/* Value props */}
        <div className="grid grid-cols-3 gap-5 mb-12">
          <div className="bg-card border border-border rounded-2xl p-7">
            <div className="text-[10px] text-muted uppercase tracking-[2px] mb-3">Pool APR (24h)</div>
            <div className="font-serif text-4xl font-bold text-accent-green tracking-tight mb-2">{aprFormatted}</div>
            <p className="text-xs text-muted leading-relaxed">
              Concentrated ETH/USDC liquidity with 0.3% fee tier on Uniswap v4
            </p>
          </div>
          <div className="bg-card border border-border rounded-2xl p-7">
            <div className="text-[10px] text-muted uppercase tracking-[2px] mb-3">AI Managed</div>
            <div className="font-serif text-4xl font-bold text-foreground tracking-tight mb-2">24/7</div>
            <p className="text-xs text-muted leading-relaxed">
              Claude Opus 4.6 monitors your position and rebalances when out of range
            </p>
          </div>
          <div className="bg-card border border-border rounded-2xl p-7">
            <div className="text-[10px] text-muted uppercase tracking-[2px] mb-3">Cross-Chain</div>
            <div className="font-serif text-4xl font-bold text-foreground tracking-tight mb-2">1-click</div>
            <p className="text-xs text-muted leading-relaxed">
              Deposit any token from any EVM chain via LI.FI Composer in a single transaction
            </p>
          </div>
        </div>

        {/* How it works */}
        <div className="bg-card border border-border rounded-2xl p-8">
          <div className="font-serif text-xs text-muted uppercase tracking-[3px] mb-6">How it works</div>
          <div className="grid grid-cols-4 gap-6">
            {[
              { step: "01", title: "Deposit", desc: "Any token, any EVM chain. LI.FI swaps & bridges to Base USDC." },
              { step: "02", title: "Split & LP", desc: "Hook swaps 50% USDC → ETH and adds concentrated liquidity." },
              { step: "03", title: "AI Monitor", desc: "Claude Opus 4.6 watches your position and market conditions." },
              { step: "04", title: "Rebalance", desc: "When out of range, the AI agent automatically rebalances." },
            ].map(({ step, title, desc }) => (
              <div key={step}>
                <div className="text-[11px] text-muted font-medium mb-2">{step}</div>
                <div className="text-sm font-semibold text-foreground mb-1">{title}</div>
                <div className="text-xs text-muted leading-relaxed">{desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function Dashboard({ onDeposit, hasPosition }: { onDeposit: () => void; hasPosition: boolean }) {
  const { address } = useAccount();
  const { position, needsRebalance, config } = usePosition();
  const { writeContract } = useWriteContract();
  const { formatted: aprFormatted } = usePoolAPR();

  if (!hasPosition || !position) {
    return <EmptyState onDeposit={onDeposit} aprFormatted={aprFormatted} />;
  }

  const depositedUSDC = Number(formatUnits(position.depositedUSDC, 6));
  const inRange = !needsRebalance;

  const handleWithdraw = () => {
    writeContract({
      address: ADDRESSES.HOOK,
      abi: HOOK_ABI,
      functionName: "withdraw",
      chainId: base.id,
    });
    setTimeout(() => window.location.reload(), 5000);
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
            <span className="text-muted text-xs">ETH/USDC · 0.3%</span>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onDeposit}
            className="px-7 py-3.5 text-sm font-bold bg-foreground text-background rounded-xl hover:opacity-90 transition-opacity cursor-pointer"
          >
            Deposit from Anywhere &rarr;
          </button>
          <button
            onClick={handleWithdraw}
            className="px-7 py-3.5 text-sm font-semibold bg-card text-foreground border border-border rounded-xl hover:bg-surface transition-colors cursor-pointer"
          >
            Withdraw as USDC
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
