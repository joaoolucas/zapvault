"use client";

import { useState, useEffect } from "react";
import { useAccount, usePublicClient, useWalletClient, useSwitchChain } from "wagmi";
import { mainnet } from "wagmi/chains";
import { encodeFunctionData, getContract } from "viem";
import { namehash, normalize } from "viem/ens";
import { useENSConfig } from "@/hooks/useENSConfig";
import { ENS_KEYS, DEFAULTS } from "@/lib/constants";

const ENS_REGISTRY = "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e" as const;
const ENS_REGISTRY_ABI = [
  {
    name: "owner",
    type: "function",
    inputs: [{ name: "node", type: "bytes32" }],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
  },
] as const;

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

function StrategyForm({
  ensName,
  config,
  onSaved,
}: {
  ensName: string;
  config: { rangeWidth: number; rebalanceThreshold: number; slippage: number };
  onSaved: () => void;
}) {
  const { address, chain } = useAccount();
  const publicClient = usePublicClient({ chainId: mainnet.id });
  const { data: walletClient } = useWalletClient();
  const { switchChainAsync } = useSwitchChain();

  const [range, setRange] = useState(String(config.rangeWidth));
  const [rebalance, setRebalance] = useState(String(config.rebalanceThreshold));
  const [slippage, setSlippage] = useState(String(config.slippage));
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const rangeNum = parseInt(range) || DEFAULTS.RANGE_WIDTH;
  const rebalanceNum = parseInt(rebalance) || DEFAULTS.REBALANCE_THRESHOLD;
  const slippageNum = parseInt(slippage) || DEFAULTS.SLIPPAGE;
  const priceRange = (Math.pow(1.0001, rangeNum) * 100 - 100).toFixed(1);

  const handleSave = async () => {
    if (!ensName || !walletClient || !publicClient || !address) return;

    setStatus("switching");
    setErrorMsg("");

    try {
      if (chain?.id !== mainnet.id) {
        await switchChainAsync({ chainId: mainnet.id });
      }

      setStatus("saving");

      const normalized = normalize(ensName);
      const node = namehash(normalized);

      const resolverAddr = await publicClient.getEnsResolver({ name: normalized });
      if (!resolverAddr) throw new Error("Could not find ENS resolver");

      const textRecords: [string, string][] = [
        [ENS_KEYS.RANGE, range],
        [ENS_KEYS.REBALANCE, rebalance],
        [ENS_KEYS.SLIPPAGE, slippage],
      ];

      const calls = textRecords.map(([key, value]) =>
        encodeFunctionData({
          abi: RESOLVER_ABI,
          functionName: "setText",
          args: [node, key, value],
        })
      );

      // Pre-simulate before wallet prompt to catch reverts with a useful message
      let useMulticall = false;
      try {
        await publicClient.simulateContract({
          address: resolverAddr,
          abi: RESOLVER_ABI,
          functionName: "multicall",
          args: [calls],
          account: address,
        });
        useMulticall = true;
      } catch {
        // multicall not supported, try individual setText
        try {
          await publicClient.simulateContract({
            address: resolverAddr,
            abi: RESOLVER_ABI,
            functionName: "setText",
            args: [node, textRecords[0][0], textRecords[0][1]],
            account: address,
          });
        } catch {
          // setText also reverts — diagnose why
          const registryOwner = await publicClient.readContract({
            address: ENS_REGISTRY,
            abi: ENS_REGISTRY_ABI,
            functionName: "owner",
            args: [node],
          });

          const ownerIsUser = registryOwner.toLowerCase() === address.toLowerCase();

          if (!ownerIsUser) {
            // Name is likely wrapped (registry owner = NameWrapper, not user)
            // Old resolver can't check NameWrapper → setText reverts
            throw new Error(
              `Your name is wrapped but uses an outdated resolver that doesn't recognize you as the owner. Go to app.ens.domains/${normalized}, click "Profile" → "Update resolver", then try again.`
            );
          }

          throw new Error(
            `Resolver (${resolverAddr.slice(0, 10)}…) rejected setText. Try updating your resolver at app.ens.domains/${normalized}.`
          );
        }
      }

      setStatus("saving");

      if (useMulticall) {
        const hash = await walletClient.writeContract({
          address: resolverAddr,
          abi: RESOLVER_ABI,
          functionName: "multicall",
          args: [calls],
          chain: mainnet,
        });
        setStatus("confirming");
        await publicClient.waitForTransactionReceipt({ hash });
      } else {
        for (const [key, value] of textRecords) {
          const hash = await walletClient.writeContract({
            address: resolverAddr,
            abi: RESOLVER_ABI,
            functionName: "setText",
            args: [node, key, value],
            chain: mainnet,
          });
          setStatus("confirming");
          await publicClient.waitForTransactionReceipt({ hash });
        }
      }
      setStatus("done");
      setTimeout(onSaved, 1500);
    } catch (e: any) {
      console.error("Failed to save strategy:", e);
      setErrorMsg(e?.shortMessage || e?.message || "Transaction failed");
      setStatus("error");
    }
  };

  return (
    <>
      <div className="grid grid-cols-3 gap-4 mb-6">
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
                ? "Saved!"
                : chain?.id !== mainnet.id
                  ? "Switch to Mainnet & Save"
                  : "Save to ENS"}
      </button>

      {status === "done" && (
        <p className="text-center text-[12px] text-accent-green mt-3 font-medium">
          Strategy saved to {ensName}.
        </p>
      )}
      {status === "error" && (
        <div className="text-center mt-3">
          <p className="text-[12px] text-accent-red font-medium">
            {errorMsg || "Transaction failed. Please try again."}
          </p>
          {errorMsg?.includes("resolver") && ensName && (
            <a
              href={`https://app.ens.domains/${ensName}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 mt-2 text-[11px] font-semibold text-accent-blue hover:underline"
            >
              Open {ensName} on ENS
              <svg className="w-3 h-3" viewBox="0 0 16 16" fill="none">
                <path d="M6 3h7v7M13 3L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </a>
          )}
        </div>
      )}

      <p className="text-[10px] text-muted text-center mt-4">
        Writes 3 text records to {ensName} on Ethereum Mainnet.
      </p>
    </>
  );
}

export function RegisterStrategy() {
  const { ensName, hasENS, hasENSConfig, config } = useENSConfig();
  const [editing, setEditing] = useState(false);

  // No ENS name
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

  // Has ENS config and not editing — show current strategy
  if (hasENSConfig && !editing) {
    const priceRange = (Math.pow(1.0001, config.rangeWidth) * 100 - 100).toFixed(1);

    return (
      <div className="bg-card border border-border rounded-2xl p-8">
        <div className="flex items-center justify-between mb-7">
          <div>
            <div className="font-serif text-xs text-muted uppercase tracking-[3px] mb-1">Your Strategy</div>
            <p className="text-[13px] text-muted">
              Active on <span className="font-semibold text-foreground">{ensName}</span>
            </p>
          </div>
          <span className="text-[10px] font-semibold text-accent-green px-2.5 py-1 rounded-lg bg-accent-green-soft">
            On-chain
          </span>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-7">
          <div className="bg-surface rounded-xl p-5 text-center">
            <div className="text-[10px] text-muted uppercase tracking-[1.5px] mb-2">vault.range</div>
            <div className="font-serif text-3xl font-bold text-foreground tracking-tight">{config.rangeWidth}</div>
            <div className="text-[11px] text-muted mt-1">±{config.rangeWidth / 2} ticks (~{priceRange}%)</div>
          </div>
          <div className="bg-surface rounded-xl p-5 text-center">
            <div className="text-[10px] text-muted uppercase tracking-[1.5px] mb-2">vault.rebalance</div>
            <div className="font-serif text-3xl font-bold text-foreground tracking-tight">{config.rebalanceThreshold}</div>
            <div className="text-[11px] text-muted mt-1">{config.rebalanceThreshold / 100}% trigger</div>
          </div>
          <div className="bg-surface rounded-xl p-5 text-center">
            <div className="text-[10px] text-muted uppercase tracking-[1.5px] mb-2">vault.slippage</div>
            <div className="font-serif text-3xl font-bold text-foreground tracking-tight">{config.slippage}</div>
            <div className="text-[11px] text-muted mt-1">{config.slippage / 100}% max</div>
          </div>
        </div>

        <button
          onClick={() => setEditing(true)}
          className="w-full py-3.5 text-[14px] font-semibold bg-surface text-foreground border border-border rounded-xl hover:bg-border transition-colors cursor-pointer"
        >
          Edit Strategy
        </button>

        <p className="text-[10px] text-muted text-center mt-4">
          Anyone who types <span className="font-semibold text-foreground">{ensName}</span> in the deposit modal will use your strategy.
        </p>
      </div>
    );
  }

  // No config yet or editing — show form
  return (
    <div className="bg-card border border-border rounded-2xl p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="font-serif text-xs text-muted uppercase tracking-[3px] mb-1">
            {hasENSConfig ? "Edit Strategy" : "Register Your Strategy"}
          </div>
          <p className="text-[13px] text-muted">
            Save to <span className="font-semibold text-foreground">{ensName}</span> as ENS text records.
          </p>
        </div>
        {hasENSConfig && (
          <button
            onClick={() => setEditing(false)}
            className="text-[12px] font-semibold text-muted hover:text-foreground transition-colors cursor-pointer"
          >
            Cancel
          </button>
        )}
      </div>

      <StrategyForm
        ensName={ensName!}
        config={config}
        onSaved={() => setEditing(false)}
      />
    </div>
  );
}
