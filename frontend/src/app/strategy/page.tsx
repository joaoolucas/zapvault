"use client";

import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { RegisterStrategy } from "@/components/RegisterStrategy";

export default function StrategyPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header />

      <div className="px-12 pt-16 pb-40">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-10">
            <p className="font-serif text-xs text-muted uppercase tracking-[4px] mb-4">ENS Text Records</p>
            <h2 className="font-serif text-5xl font-bold text-foreground tracking-tighter leading-[0.9] mb-4">
              Your strategy,<br /><span className="italic font-normal">on-chain</span>
            </h2>
            <p className="text-sm text-muted leading-relaxed max-w-md mx-auto">
              Register your LP strategy as ENS text records. Anyone can follow your
              config when depositing into ZapVault.
            </p>
          </div>

          <RegisterStrategy />

          {/* Explanation */}
          <div className="mt-8 grid grid-cols-3 gap-4">
            <div className="bg-card border border-border rounded-xl p-5">
              <div className="text-[11px] font-semibold text-foreground mb-1">vault.range</div>
              <p className="text-[11px] text-muted leading-relaxed">
                Total tick width of your LP range. Wider = less impermanent loss, narrower = higher fees.
              </p>
            </div>
            <div className="bg-card border border-border rounded-xl p-5">
              <div className="text-[11px] font-semibold text-foreground mb-1">vault.rebalance</div>
              <p className="text-[11px] text-muted leading-relaxed">
                Price movement threshold (in bps) that triggers the AI keeper to rebalance your position.
              </p>
            </div>
            <div className="bg-card border border-border rounded-xl p-5">
              <div className="text-[11px] font-semibold text-foreground mb-1">vault.slippage</div>
              <p className="text-[11px] text-muted leading-relaxed">
                Maximum slippage tolerance (in bps) for swaps during deposit and rebalance operations.
              </p>
            </div>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
}
