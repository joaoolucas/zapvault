"use client";

import Link from "next/link";
import { usePoolAPR } from "@/hooks/usePoolAPR";

export function Landing({ onDeposit }: { onDeposit: () => void }) {
  const { formatted: aprFormatted } = usePoolAPR();

  return (
    <div className="px-12 pt-16 pb-40">
      <div className="max-w-4xl mx-auto">
        {/* Hero */}
        <div className="text-center mb-16">
          <p className="font-serif text-xs text-muted uppercase tracking-[4px] mb-4">Cross-Chain Automated LP</p>
          <h2 className="font-serif text-6xl font-bold text-foreground tracking-tighter leading-[0.9] mb-4">
            Start earning<br /><span className="italic font-normal">on autopilot</span>
          </h2>
          <p className="text-sm text-muted leading-relaxed max-w-md mx-auto mb-10">
            Deposit USDC from any chain. Your LP is managed by Claude Opus 4.6 —
            an AI agent that monitors and rebalances your position 24/7.
          </p>
          <div className="flex items-center justify-center gap-4">
            <button
              onClick={onDeposit}
              className="px-8 py-4 bg-foreground text-background text-sm font-bold rounded-xl hover:opacity-90 transition-opacity cursor-pointer"
            >
              Deposit
            </button>
            <Link
              href="/strategy"
              className="px-8 py-4 bg-surface text-foreground text-sm font-bold rounded-xl border border-border hover:bg-border transition-colors"
            >
              Strategy
            </Link>
          </div>
        </div>

        {/* Value props */}
        <div className="grid grid-cols-3 gap-5 mb-12">
          <div className="bg-card border border-border rounded-2xl p-7">
            <div className="text-[10px] text-muted uppercase tracking-[2px] mb-3">Concentrated APR</div>
            <div className="font-serif text-4xl font-bold text-accent-green tracking-tight mb-2">{aprFormatted}</div>
            <p className="text-xs text-muted leading-relaxed">
              Concentrated ETH/USDC liquidity with 0.05% fee tier on Uniswap v4
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
              { step: "02", title: "Split & LP", desc: "Vault swaps USDC → ETH and adds concentrated liquidity on Uniswap v4." },
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
