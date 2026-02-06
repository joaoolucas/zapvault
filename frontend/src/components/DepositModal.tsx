"use client";

import { useState } from "react";
import { useAccount, useReadContract } from "wagmi";
import { base } from "wagmi/chains";
import { formatUnits } from "viem";
import { useDeposit } from "@/hooks/useDeposit";
import { useENSConfig } from "@/hooks/useENSConfig";
import { ADDRESSES, ERC20_ABI } from "@/lib/constants";

const CHAINS = ["Ethereum", "Arbitrum", "Polygon", "Optimism", "Base"];
const PRESETS = ["100", "500", "1000", "5000"];

export function DepositModal({ onClose }: { onClose: () => void }) {
  const [chain, setChain] = useState(4);
  const [amount, setAmount] = useState("");
  const { address } = useAccount();
  const { deposit, step, isLoading } = useDeposit();
  const { config } = useENSConfig();

  const { data: usdcBalance } = useReadContract({
    address: ADDRESSES.USDC,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: base.id,
    query: { enabled: !!address },
  });

  const balanceFormatted = usdcBalance ? Number(formatUnits(usdcBalance as bigint, 6)) : 0;
  const amountNum = Number(amount) || 0;
  const exceedsBalance = amountNum > balanceFormatted;
  const isBase = chain === 4;

  const handleDeposit = async () => {
    if (!amount || amountNum <= 0 || exceedsBalance) return;
    await deposit(amount, config);
    setTimeout(() => window.location.reload(), 5000);
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center">
      <div onClick={onClose} className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

      <div className="relative w-[480px] bg-card rounded-2xl p-9 border border-border shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-7">
          <h2 className="font-serif text-2xl font-bold text-foreground tracking-tight">Deposit</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-surface flex items-center justify-center text-muted text-sm hover:bg-border transition-colors cursor-pointer"
          >
            &#10005;
          </button>
        </div>

        {/* Chain selector */}
        <div className="mb-6">
          <label className="block text-[11px] text-muted uppercase tracking-[2px] font-medium mb-2">From</label>
          <div className="flex flex-wrap gap-2">
            {CHAINS.map((ch, i) => (
              <button
                key={ch}
                onClick={() => setChain(i)}
                className={`px-4 py-2.5 text-[13px] rounded-lg cursor-pointer transition-all ${
                  chain === i
                    ? "bg-foreground text-background font-semibold"
                    : "bg-surface text-muted hover:text-foreground"
                }`}
              >
                {ch}
              </button>
            ))}
          </div>
        </div>

        {/* Amount input */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <label className="text-[11px] text-muted uppercase tracking-[2px] font-medium">Amount</label>
            {isBase && (
              <span className="text-[11px] text-muted">
                Balance: <span className="font-semibold text-foreground">{balanceFormatted.toFixed(2)} USDC</span>
              </span>
            )}
          </div>
          <div className={`flex items-baseline gap-2 border-b-2 pb-2 ${exceedsBalance ? "border-accent-red" : "border-foreground"}`}>
            <span className="text-base text-muted">$</span>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              type="text"
              inputMode="numeric"
              className="text-4xl font-bold font-serif bg-transparent border-none text-foreground outline-none w-full tracking-tighter"
              placeholder="0"
            />
            <span className="text-sm text-muted flex-shrink-0">USDC</span>
          </div>
          {exceedsBalance && (
            <p className="text-xs text-accent-red mt-1.5 font-medium">Insufficient USDC balance</p>
          )}
          <div className="flex gap-1.5 mt-3">
            {PRESETS.map((p) => (
              <button
                key={p}
                onClick={() => setAmount(p)}
                className={`px-4 py-1.5 text-xs rounded-full cursor-pointer transition-all border ${
                  amount === p
                    ? "bg-foreground text-background border-foreground font-medium"
                    : "bg-transparent text-muted border-border hover:border-foreground"
                }`}
              >
                ${p}
              </button>
            ))}
            {isBase && (
              <button
                onClick={() => setAmount(balanceFormatted.toFixed(2))}
                className="px-4 py-1.5 text-xs rounded-full cursor-pointer transition-all border border-accent-blue text-accent-blue font-semibold hover:bg-accent-blue-soft"
              >
                Max
              </button>
            )}
          </div>
        </div>

        {/* Route preview */}
        <div className="p-4 rounded-xl bg-surface mb-6">
          <div className="text-[13px] font-semibold text-foreground">
            {isBase ? "Base" : CHAINS[chain]} &rarr; {isBase ? "" : "Base → "}Uniswap v4 LP
          </div>
          <div className="text-[11px] text-muted mt-1">
            {isBase
              ? "Direct deposit · instant · managed by Claude Opus 4.6"
              : "Swap + bridge via LI.FI · ~45s · fee ~$0.80"}
          </div>
        </div>

        {/* Strategy summary */}
        <div className="flex gap-4 mb-6 text-[11px]">
          <div className="flex-1 text-center py-2 rounded-lg bg-surface">
            <div className="text-muted mb-0.5">Range</div>
            <div className="font-semibold text-foreground">±{config.rangeWidth / 2} ticks</div>
          </div>
          <div className="flex-1 text-center py-2 rounded-lg bg-surface">
            <div className="text-muted mb-0.5">Rebalance</div>
            <div className="font-semibold text-foreground">{config.rebalanceThreshold / 100}%</div>
          </div>
          <div className="flex-1 text-center py-2 rounded-lg bg-surface">
            <div className="text-muted mb-0.5">Slippage</div>
            <div className="font-semibold text-foreground">{config.slippage / 100}%</div>
          </div>
        </div>

        {/* Submit */}
        <button
          onClick={handleDeposit}
          disabled={isLoading || !amount || amountNum <= 0 || exceedsBalance}
          className="w-full py-4 text-[15px] font-bold bg-foreground text-background rounded-xl hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading
            ? step === "approving"
              ? "Transferring USDC..."
              : step === "depositing"
                ? "Depositing..."
                : "Processing..."
            : step === "done"
              ? "Deposited!"
              : isBase
                ? "Deposit"
                : "Deposit via LI.FI"}
        </button>

        {step === "done" && (
          <p className="text-center text-xs text-accent-green mt-3 font-medium">
            Position created. Claude Opus 4.6 is now managing your LP.
          </p>
        )}
        {step === "error" && (
          <p className="text-center text-xs text-accent-red mt-3 font-medium">
            Transaction failed. Please try again.
          </p>
        )}
      </div>
    </div>
  );
}
