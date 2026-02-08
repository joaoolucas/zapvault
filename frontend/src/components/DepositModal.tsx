"use client";

import { useState, useRef, useEffect } from "react";
import { useAccount, useReadContracts, useEnsText, useEnsAvatar } from "wagmi";
import { mainnet, base } from "wagmi/chains";
import { formatUnits } from "viem";
import { normalize } from "viem/ens";
import { useDeposit } from "@/hooks/useDeposit";
import { useENSConfig, type VaultConfig } from "@/hooks/useENSConfig";
import { ADDRESSES, ERC20_ABI, DEFAULTS, ENS_KEYS } from "@/lib/constants";
import { DepositProgress } from "./DepositProgress";
import { CHAINS, ChainDropdown } from "./ChainSelector";

const FEATURED_STRATEGISTS = ["joaoliberato.eth", "0xliberato.eth"] as const;

function StrategistCard({
  name,
  selected,
  onSelect,
}: {
  name: string;
  selected: boolean;
  onSelect: (name: string) => void;
}) {
  const normalized = normalize(name);
  const { data: avatar } = useEnsAvatar({
    name: normalized,
    chainId: mainnet.id,
  });
  const { data: range } = useEnsText({
    name: normalized,
    key: ENS_KEYS.RANGE,
    chainId: mainnet.id,
  });
  const { data: rebalance } = useEnsText({
    name: normalized,
    key: ENS_KEYS.REBALANCE,
    chainId: mainnet.id,
  });
  const { data: slippage } = useEnsText({
    name: normalized,
    key: ENS_KEYS.SLIPPAGE,
    chainId: mainnet.id,
  });

  const hasConfig = !!(range || rebalance || slippage);
  const rw = range ? parseInt(range) || DEFAULTS.RANGE_WIDTH : DEFAULTS.RANGE_WIDTH;
  const rb = rebalance ? parseInt(rebalance) || DEFAULTS.REBALANCE_THRESHOLD : DEFAULTS.REBALANCE_THRESHOLD;
  const sl = slippage ? parseInt(slippage) || DEFAULTS.SLIPPAGE : DEFAULTS.SLIPPAGE;

  return (
    <button
      type="button"
      onClick={() => onSelect(name)}
      className={`flex-1 flex flex-col items-center gap-2 p-3 rounded-xl border transition-colors cursor-pointer ${
        selected
          ? "border-accent-blue bg-accent-blue-soft"
          : "border-border bg-surface hover:border-muted"
      }`}
    >
      {avatar ? (
        <img src={avatar} alt="" className="w-8 h-8 rounded-full" />
      ) : (
        <div className="w-8 h-8 rounded-full bg-border flex items-center justify-center text-[11px] font-bold text-muted">
          {name.charAt(0).toUpperCase()}
        </div>
      )}
      <span className="text-[11px] font-semibold text-foreground truncate max-w-full">{name}</span>
      {hasConfig && (
        <div className="flex flex-wrap justify-center gap-1">
          <span className="px-1.5 py-0.5 rounded bg-card text-[9px] text-muted font-medium">&plusmn;{rw / 2}</span>
          <span className="px-1.5 py-0.5 rounded bg-card text-[9px] text-muted font-medium">{rb / 100}%</span>
          <span className="px-1.5 py-0.5 rounded bg-card text-[9px] text-muted font-medium">{sl / 100}%</span>
        </div>
      )}
    </button>
  );
}

export function DepositModal({ onClose, onDeposited }: { onClose: () => void; onDeposited?: () => void }) {
  const [chain, setChain] = useState(0);
  const [amount, setAmount] = useState("");
  const { address } = useAccount();
  const { depositBase, depositCrossChain, step, errorMsg, isLoading, resetStep } = useDeposit();
  const { config: ensConfig, ensName, hasENS, hasENSConfig } = useENSConfig();

  const showProgress = step !== "idle";

  // "Follow a strategist" — resolve any ENS name's vault config
  const [followInput, setFollowInput] = useState("");
  const [followName, setFollowName] = useState<string | undefined>(undefined);
  const followDebounce = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    clearTimeout(followDebounce.current);
    const trimmed = followInput.trim();
    if (trimmed && trimmed.includes(".")) {
      followDebounce.current = setTimeout(() => {
        try {
          setFollowName(normalize(trimmed));
        } catch {
          setFollowName(undefined);
        }
      }, 400);
    } else {
      setFollowName(undefined);
    }
    return () => clearTimeout(followDebounce.current);
  }, [followInput]);

  const { data: followRange } = useEnsText({
    name: followName,
    key: ENS_KEYS.RANGE,
    chainId: mainnet.id,
    query: { enabled: !!followName },
  });
  const { data: followRebalance } = useEnsText({
    name: followName,
    key: ENS_KEYS.REBALANCE,
    chainId: mainnet.id,
    query: { enabled: !!followName },
  });
  const { data: followSlippage } = useEnsText({
    name: followName,
    key: ENS_KEYS.SLIPPAGE,
    chainId: mainnet.id,
    query: { enabled: !!followName },
  });
  const { data: followAvatar } = useEnsAvatar({
    name: followName,
    chainId: mainnet.id,
    query: { enabled: !!followName },
  });

  const hasFollowConfig = !!(followRange || followRebalance || followSlippage);
  const followConfig: VaultConfig | null = hasFollowConfig
    ? {
        rangeWidth: followRange ? parseInt(followRange) || DEFAULTS.RANGE_WIDTH : DEFAULTS.RANGE_WIDTH,
        rebalanceThreshold: followRebalance ? parseInt(followRebalance) || DEFAULTS.REBALANCE_THRESHOLD : DEFAULTS.REBALANCE_THRESHOLD,
        slippage: followSlippage ? parseInt(followSlippage) || DEFAULTS.SLIPPAGE : DEFAULTS.SLIPPAGE,
      }
    : null;

  // Active config: follow > own ENS > defaults
  const isFollowing = hasFollowConfig && !!followName;
  const activeConfig = isFollowing && followConfig
    ? followConfig
    : ensConfig;

  // Fetch USDC balance on all chains
  const { data: balanceResults } = useReadContracts({
    contracts: CHAINS.map((ch) => ({
      address: ch.usdc,
      abi: ERC20_ABI,
      functionName: "balanceOf" as const,
      args: address ? [address] : undefined,
      chainId: ch.id,
    })),
    query: { enabled: !!address },
  });

  const balances = CHAINS.map((_, i) => {
    const result = balanceResults?.[i];
    if (result?.status === "success" && result.result) {
      return Number(formatUnits(result.result as bigint, 6));
    }
    return 0;
  });

  const selectedBalance = balances[chain];
  const amountNum = Number(amount) || 0;
  const exceedsBalance = amountNum > selectedBalance;
  const isBase = CHAINS[chain].id === base.id;

  const handleDeposit = async () => {
    if (!amount || amountNum <= 0 || exceedsBalance) return;

    let success: boolean;
    if (isBase) {
      success = await depositBase(amount, activeConfig);
    } else {
      success = await depositCrossChain(
        amount,
        activeConfig,
        CHAINS[chain].id,
        CHAINS[chain].usdc
      );
    }
    if (success) onDeposited?.();
  };

  const handleProgressClose = () => {
    resetStep();
    if (step === "done") {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center">
      <div onClick={showProgress ? undefined : onClose} className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

      <div className="relative w-[480px] max-h-[90vh] overflow-y-auto bg-card rounded-2xl p-9 border border-border shadow-2xl">
        {showProgress ? (
          <DepositProgress
            step={step}
            errorMsg={errorMsg}
            isBase={isBase}
            chainName={CHAINS[chain].name}
            amount={amount}
            onClose={handleProgressClose}
            onDone={() => {
              onDeposited?.();
              onClose();
            }}
          />
        ) : (
          <>
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

            {/* Chain selector dropdown */}
            <div className="mb-6">
              <label className="block text-[11px] text-muted uppercase tracking-[2px] font-medium mb-2">From</label>
              <ChainDropdown selected={chain} onSelect={setChain} balances={balances} />
            </div>

            {/* Amount input */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <label className="text-[11px] text-muted uppercase tracking-[2px] font-medium">Amount</label>
                <span className="text-[11px] text-muted">
                  Balance: <button onClick={() => setAmount(selectedBalance.toFixed(6))} className="font-semibold text-foreground hover:text-accent-blue transition-colors cursor-pointer">{selectedBalance.toFixed(2)} USDC</button>
                </span>
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
                <p className="text-xs text-accent-red mt-1.5 font-medium">Insufficient USDC balance on {CHAINS[chain].name}</p>
              )}
            </div>

            {/* Route preview */}
            <div className="p-4 rounded-xl bg-surface mb-6">
              <div className="text-[13px] font-semibold text-foreground">
                {isBase ? "Base" : CHAINS[chain].name} &rarr; Uniswap v4 LP
              </div>
              <div className="text-[11px] text-muted mt-1">
                {isBase
                  ? "Direct deposit \u00B7 instant"
                  : "Bridge + deposit via LI.FI \u00B7 ~45s \u00B7 no gas needed on Base"}
              </div>
            </div>

            {/* Strategy — always visible */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-3">
                <label className="text-[11px] text-muted uppercase tracking-[2px] font-medium">Strategy</label>
                {isFollowing ? (
                  <span className="flex items-center gap-1.5 text-[10px] font-semibold text-accent-blue px-2 py-0.5 rounded bg-accent-blue-soft">
                    {followAvatar && (
                      <img src={followAvatar} alt="" className="w-3.5 h-3.5 rounded-full" />
                    )}
                    following {followName}
                  </span>
                ) : hasENSConfig ? (
                  <span className="text-[10px] font-semibold text-accent-blue px-2 py-0.5 rounded bg-accent-blue-soft">
                    via {ensName}
                  </span>
                ) : (
                  <span className="text-[10px] font-semibold text-muted px-2 py-0.5 rounded bg-surface">
                    defaults
                  </span>
                )}
              </div>

              {/* Config pills */}
              <div className="flex gap-3 text-[11px]">
                <div className="flex-1 text-center py-2.5 rounded-xl bg-surface">
                  <div className="text-muted mb-0.5">Range</div>
                  <div className="font-semibold text-foreground">&plusmn;{activeConfig.rangeWidth / 2} ticks</div>
                </div>
                <div className="flex-1 text-center py-2.5 rounded-xl bg-surface">
                  <div className="text-muted mb-0.5">Rebalance</div>
                  <div className="font-semibold text-foreground">{activeConfig.rebalanceThreshold / 100}%</div>
                </div>
                <div className="flex-1 text-center py-2.5 rounded-xl bg-surface">
                  <div className="text-muted mb-0.5">Slippage</div>
                  <div className="font-semibold text-foreground">{activeConfig.slippage / 100}%</div>
                </div>
              </div>

              {/* Follow a strategist */}
              <div className="mt-4 p-4 rounded-xl border border-border bg-card">
                <div className="text-[12px] font-semibold text-foreground mb-1">Follow a strategist</div>
                <p className="text-[11px] text-muted mb-3">
                  Pick a featured strategist or enter any ENS name to copy their LP strategy.
                </p>
                <div className="flex gap-2 mb-3">
                  {FEATURED_STRATEGISTS.map((s) => (
                    <StrategistCard
                      key={s}
                      name={s}
                      selected={followName === normalize(s)}
                      onSelect={(n) => setFollowInput(n)}
                    />
                  ))}
                </div>
                <div className="flex items-center gap-3">
                  {followAvatar && isFollowing && (
                    <img src={followAvatar} alt="" className="w-9 h-9 rounded-full flex-shrink-0 border-2 border-accent-blue" />
                  )}
                  <div className="relative flex-1">
                    <input
                      type="text"
                      value={followInput}
                      onChange={(e) => setFollowInput(e.target.value)}
                      placeholder="vitalik.eth"
                      className="w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-[13px] text-foreground placeholder:text-muted/40 focus:border-accent-blue focus:outline-none transition-colors"
                    />
                    {followName && isFollowing && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        <svg className="w-4 h-4 text-accent-green" viewBox="0 0 16 16" fill="none">
                          <path d="M3 8.5l3.5 3.5L13 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </div>
                    )}
                  </div>
                </div>
                {followName && !hasFollowConfig && (
                  <p className="mt-2 text-[11px] text-muted">
                    No vault strategy records found on <span className="font-semibold">{followName}</span>
                  </p>
                )}
                {isFollowing && followConfig && (
                  <div className="mt-3 flex gap-2 text-[10px]">
                    <span className="px-2 py-1 rounded-lg bg-accent-blue-soft text-accent-blue font-semibold">
                      range &plusmn;{followConfig.rangeWidth / 2}
                    </span>
                    <span className="px-2 py-1 rounded-lg bg-accent-blue-soft text-accent-blue font-semibold">
                      rebalance {followConfig.rebalanceThreshold / 100}%
                    </span>
                    <span className="px-2 py-1 rounded-lg bg-accent-blue-soft text-accent-blue font-semibold">
                      slippage {followConfig.slippage / 100}%
                    </span>
                  </div>
                )}
              </div>

              {/* ENS config hint */}
              {!isFollowing && (
                <div className="mt-3 text-[10px] text-muted text-center">
                  {hasENSConfig
                    ? `Using your strategy from ${ensName}. Follow someone above to override.`
                    : hasENS
                      ? <>Set <span className="font-mono">vault.range</span>, <span className="font-mono">vault.rebalance</span>, <span className="font-mono">vault.slippage</span> on <a href={`https://app.ens.domains/${ensName}?tab=records`} target="_blank" rel="noopener noreferrer" className="text-accent-blue hover:underline">{ensName}</a> to customize.</>
                      : "Using default strategy. Connect an ENS name or follow a strategist to customize."
                  }
                </div>
              )}
            </div>

            {/* Submit */}
            <button
              onClick={handleDeposit}
              disabled={isLoading || !amount || amountNum <= 0 || exceedsBalance}
              className="w-full py-4 text-[15px] font-bold bg-foreground text-background rounded-xl hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isBase ? "Deposit" : `Deposit via LI.FI`}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
