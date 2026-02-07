"use client";

import { useState, useEffect } from "react";
import { useAccount, usePublicClient, useWalletClient, useSwitchChain } from "wagmi";
import { mainnet } from "wagmi/chains";
import { encodeFunctionData } from "viem";
import { namehash, normalize } from "viem/ens";
import { useENSConfig } from "@/hooks/useENSConfig";
import { ENS_KEYS, DEFAULTS } from "@/lib/constants";

const RESOLVER_ABI = [
  {
    name: "setText",
    type: "function",
    inputs: [
      { name: "node", type: "bytes32" },
      { name: "key", type: "string" },
      { name: "value", type: "string" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    name: "multicall",
    type: "function",
    inputs: [{ name: "data", type: "bytes[]" }],
    outputs: [{ name: "results", type: "bytes[]" }],
    stateMutability: "nonpayable",
  },
] as const;

type Status = "idle" | "switching" | "saving" | "confirming" | "done" | "error";

export function RegisterStrategy() {
  const { address, chain } = useAccount();
  const { ensName, hasENS, hasENSConfig, config } = useENSConfig();
  const publicClient = usePublicClient({ chainId: mainnet.id });
  const { data: walletClient } = useWalletClient();
  const { switchChainAsync } = useSwitchChain();

  const [range, setRange] = useState(String(DEFAULTS.RANGE_WIDTH));
  const [rebalance, setRebalance] = useState(String(DEFAULTS.REBALANCE_THRESHOLD));
  const [slippage, setSlippage] = useState(String(DEFAULTS.SLIPPAGE));
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState("");

  // Sync form with current ENS config when loaded
  useEffect(() => {
    if (hasENSConfig) {
      setRange(String(config.rangeWidth));
      setRebalance(String(config.rebalanceThreshold));
      setSlippage(String(config.slippage));
    }
  }, [hasENSConfig, config.rangeWidth, config.rebalanceThreshold, config.slippage]);

  const handleSave = async () => {
    if (!ensName || !walletClient || !publicClient || !address) return;

    setStatus("switching");
    setErrorMsg("");

    try {
      // Switch to mainnet if needed
      if (chain?.id !== mainnet.id) {
        await switchChainAsync({ chainId: mainnet.id });
      }

      setStatus("saving");

      const normalized = normalize(ensName);
      const node = namehash(normalized);

      // Resolve the user's ENS resolver address
      const resolverAddr = await publicClient.getEnsResolver({ name: normalized });
      if (!resolverAddr) throw new Error("Could not find ENS resolver");

      // Encode 3 setText calls
      const calls = [
        encodeFunctionData({
          abi: RESOLVER_ABI,
          functionName: "setText",
          args: [node, ENS_KEYS.RANGE, range],
        }),
        encodeFunctionData({
          abi: RESOLVER_ABI,
          functionName: "setText",
          args: [node, ENS_KEYS.REBALANCE, rebalance],
        }),
        encodeFunctionData({
          abi: RESOLVER_ABI,
          functionName: "setText",
          args: [node, ENS_KEYS.SLIPPAGE, slippage],
        }),
      ];

      // Single multicall tx
      const hash = await walletClient.writeContract({
        address: resolverAddr,
        abi: RESOLVER_ABI,
        functionName: "multicall",
        args: [calls],
        chain: mainnet,
      });

      setStatus("confirming");
      await publicClient.waitForTransactionReceipt({ hash });
      setStatus("done");
    } catch (e: any) {
      console.error("Failed to save strategy:", e);
      setErrorMsg(e?.shortMessage || e?.message || "Transaction failed");
      setStatus("error");
    }
  };

  const rangeNum = parseInt(range) || DEFAULTS.RANGE_WIDTH;
  const rebalanceNum = parseInt(rebalance) || DEFAULTS.REBALANCE_THRESHOLD;
  const slippageNum = parseInt(slippage) || DEFAULTS.SLIPPAGE;
  const priceRange = (Math.pow(1.0001, rangeNum) * 100 - 100).toFixed(1);

  if (!hasENS) {
    return (
      <div className="bg-card border border-border rounded-2xl p-8 text-center">
        <div className="font-serif text-xs text-muted uppercase tracking-[3px] mb-4">Register Your Strategy</div>
        <p className="text-sm text-muted leading-relaxed max-w-md mx-auto mb-4">
          Connect a wallet with an ENS name to register your LP strategy on-chain.
          Other users can follow your strategy when depositing.
        </p>
        <a
          href="https://app.ens.domains"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-[12px] font-semibold text-accent-blue hover:underline"
        >
          Get an ENS name
          <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none">
            <path d="M6 3h7v7M13 3L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </a>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-2xl p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="font-serif text-xs text-muted uppercase tracking-[3px] mb-1">Register Your Strategy</div>
          <p className="text-[13px] text-muted">
            Save to <span className="font-semibold text-foreground">{ensName}</span> as ENS text records. Others can follow you.
          </p>
        </div>
        {hasENSConfig && (
          <span className="text-[10px] font-semibold text-accent-green px-2.5 py-1 rounded-lg bg-accent-green-soft flex-shrink-0">
            Active
          </span>
        )}
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        {/* Range */}
        <div>
          <label className="block text-[10px] text-muted uppercase tracking-[1.5px] mb-2">vault.range</label>
          <input
            type="number"
            value={range}
            onChange={(e) => setRange(e.target.value)}
            className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-[15px] font-bold text-foreground text-center focus:border-foreground focus:outline-none transition-colors"
          />
          <p className="mt-1.5 text-[10px] text-muted text-center">
            ±{rangeNum / 2} ticks (~{priceRange}%)
          </p>
        </div>

        {/* Rebalance */}
        <div>
          <label className="block text-[10px] text-muted uppercase tracking-[1.5px] mb-2">vault.rebalance</label>
          <input
            type="number"
            value={rebalance}
            onChange={(e) => setRebalance(e.target.value)}
            className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-[15px] font-bold text-foreground text-center focus:border-foreground focus:outline-none transition-colors"
          />
          <p className="mt-1.5 text-[10px] text-muted text-center">
            {rebalanceNum / 100}% trigger
          </p>
        </div>

        {/* Slippage */}
        <div>
          <label className="block text-[10px] text-muted uppercase tracking-[1.5px] mb-2">vault.slippage</label>
          <input
            type="number"
            value={slippage}
            onChange={(e) => setSlippage(e.target.value)}
            className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-[15px] font-bold text-foreground text-center focus:border-foreground focus:outline-none transition-colors"
          />
          <p className="mt-1.5 text-[10px] text-muted text-center">
            {slippageNum / 100}% max
          </p>
        </div>
      </div>

      <button
        onClick={handleSave}
        disabled={status === "switching" || status === "saving" || status === "confirming"}
        className="w-full py-3.5 text-[14px] font-bold bg-foreground text-background rounded-xl hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {status === "switching"
          ? "Switch to Mainnet..."
          : status === "saving"
            ? "Confirm in wallet..."
            : status === "confirming"
              ? "Saving to ENS..."
              : status === "done"
                ? "Strategy Registered!"
                : chain?.id !== mainnet.id
                  ? "Switch to Mainnet & Save"
                  : "Save Strategy to ENS"}
      </button>

      {status === "done" && (
        <p className="text-center text-[12px] text-accent-green mt-3 font-medium">
          Strategy saved to {ensName}. Anyone can now follow your config.
        </p>
      )}
      {status === "error" && (
        <p className="text-center text-[12px] text-accent-red mt-3 font-medium">
          {errorMsg || "Transaction failed. Please try again."}
        </p>
      )}

      <p className="text-[10px] text-muted text-center mt-4">
        This writes 3 text records to your ENS name on Ethereum Mainnet in a single transaction.
      </p>
    </div>
  );
}
