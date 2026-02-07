"use client";

import { useState, useRef, useEffect } from "react";
import { useAccount, useReadContracts, useEnsText, useEnsAvatar } from "wagmi";
import { mainnet, base } from "wagmi/chains";
import { formatUnits } from "viem";
import { normalize } from "viem/ens";
import { useDeposit } from "@/hooks/useDeposit";
import { useENSConfig, type VaultConfig } from "@/hooks/useENSConfig";
import { ADDRESSES, ERC20_ABI, DEFAULTS, ENS_KEYS } from "@/lib/constants";

interface ChainInfo {
  id: number;
  name: string;
  usdc: `0x${string}`;
  icon: string;
  color: string;
}

const CHAINS: ChainInfo[] = [
  {
    id: 8453,
    name: "Base",
    usdc: ADDRESSES.USDC,
    icon: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/base/info/logo.png",
    color: "#0052FF",
  },
  {
    id: 1,
    name: "Ethereum",
    usdc: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    icon: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png",
    color: "#627EEA",
  },
  {
    id: 42161,
    name: "Arbitrum",
    usdc: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    icon: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/arbitrum/info/logo.png",
    color: "#28A0F0",
  },
  {
    id: 10,
    name: "Optimism",
    usdc: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
    icon: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/optimism/info/logo.png",
    color: "#FF0420",
  },
  {
    id: 137,
    name: "Polygon",
    usdc: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
    icon: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/polygon/info/logo.png",
    color: "#8247E5",
  },
  {
    id: 43114,
    name: "Avalanche",
    usdc: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E",
    icon: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/avalanchec/info/logo.png",
    color: "#E84142",
  },
  {
    id: 56,
    name: "BNB Chain",
    usdc: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
    icon: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/smartchain/info/logo.png",
    color: "#F3BA2F",
  },
  {
    id: 534352,
    name: "Scroll",
    usdc: "0x06eFdBFf2a14a7c8E15944D1F4A48F9F95F663A4",
    icon: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/scroll/info/logo.png",
    color: "#FFEEDA",
  },
  {
    id: 59144,
    name: "Linea",
    usdc: "0x176211869cA2b568f2A7D4EE941E073a821EE1ff",
    icon: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/linea/info/logo.png",
    color: "#121212",
  },
  {
    id: 324,
    name: "zkSync Era",
    usdc: "0x1d17CBcF0D6D143135aE902365D2E5e2A16538D4",
    icon: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/zksync/info/logo.png",
    color: "#8C8DFC",
  },
  {
    id: 100,
    name: "Gnosis",
    usdc: "0xDDAfbb505ad214D7b80b1f830fcCc89B60fb7A83",
    icon: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/xdai/info/logo.png",
    color: "#04795B",
  },
  {
    id: 250,
    name: "Fantom",
    usdc: "0x04068DA6C83AFCFA0e13ba15A6696662335D5B75",
    icon: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/fantom/info/logo.png",
    color: "#1969FF",
  },
];

function ChainIcon({ chain, size = 28 }: { chain: ChainInfo; size?: number }) {
  const [error, setError] = useState(false);

  if (error) {
    return (
      <div
        className="rounded-full flex items-center justify-center text-white font-bold"
        style={{ width: size, height: size, backgroundColor: chain.color, fontSize: size * 0.4 }}
      >
        {chain.name[0]}
      </div>
    );
  }

  return (
    <img
      src={chain.icon}
      alt={chain.name}
      width={size}
      height={size}
      className="rounded-full"
      style={{ width: size, height: size }}
      onError={() => setError(true)}
    />
  );
}

function ChainDropdown({
  selected,
  onSelect,
  balances,
}: {
  selected: number;
  onSelect: (i: number) => void;
  balances: number[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const selectedChain = CHAINS[selected];

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-surface border border-border hover:border-foreground/30 transition-colors cursor-pointer"
      >
        <ChainIcon chain={selectedChain} size={32} />
        <div className="flex-1 text-left">
          <div className="text-[14px] font-semibold text-foreground">{selectedChain.name}</div>
          <div className="text-[11px] text-muted">
            {balances[selected] > 0
              ? `$${balances[selected].toFixed(2)} USDC`
              : "USDC"}
          </div>
        </div>
        <svg
          className={`w-4 h-4 text-muted transition-transform ${open ? "rotate-180" : ""}`}
          viewBox="0 0 16 16"
          fill="none"
        >
          <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="absolute z-50 top-[calc(100%+6px)] left-0 right-0 bg-card rounded-xl border border-border shadow-xl overflow-hidden">
          <div className="px-4 pt-3 pb-2">
            <div className="text-[10px] text-muted uppercase tracking-[2px] font-medium">Select Chain</div>
          </div>
          <div className="max-h-[280px] overflow-y-auto">
            {CHAINS.map((ch, i) => (
              <button
                key={ch.id}
                onClick={() => { onSelect(i); setOpen(false); }}
                className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-surface transition-colors cursor-pointer ${
                  i === selected ? "bg-surface" : ""
                }`}
              >
                <ChainIcon chain={ch} size={28} />
                <span className="flex-1 text-left text-[13px] font-medium text-foreground">{ch.name}</span>
                <span className="text-[13px] text-muted tabular-nums">
                  {balances[i] > 0 ? `$${balances[i].toFixed(2)}` : "—"}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function DepositModal({ onClose, onDeposited }: { onClose: () => void; onDeposited?: () => void }) {
  const [chain, setChain] = useState(0);
  const [amount, setAmount] = useState("");
  const { address } = useAccount();
  const { deposit, step, isLoading } = useDeposit();
  const { config: ensConfig, ensName, hasENS, hasENSConfig } = useENSConfig();

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
    : hasENSConfig
      ? ensConfig
      : ensConfig; // always uses ensConfig (defaults if no records)

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
    await deposit(amount, activeConfig);
    onDeposited?.();
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center">
      <div onClick={onClose} className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

      <div className="relative w-[480px] max-h-[90vh] overflow-y-auto bg-card rounded-2xl p-9 border border-border shadow-2xl">
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
            {isBase ? "Base" : CHAINS[chain].name} &rarr; {isBase ? "" : "Base → "}Uniswap v4 LP
          </div>
          <div className="text-[11px] text-muted mt-1">
            {isBase
              ? "Direct deposit · instant · managed by Claude Opus 4.6"
              : "Swap + bridge via LI.FI · ~45s · fee ~$0.80"}
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
              <div className="font-semibold text-foreground">±{activeConfig.rangeWidth / 2} ticks</div>
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

          {/* Follow a strategist — always visible, prominent */}
          <div className="mt-4 p-4 rounded-xl border border-border bg-card">
            <div className="text-[12px] font-semibold text-foreground mb-1">Follow a strategist</div>
            <p className="text-[11px] text-muted mb-3">
              Enter any ENS name to copy their LP strategy from their text records.
            </p>
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
                  range ±{followConfig.rangeWidth / 2}
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
          {isLoading
            ? step === "approving"
              ? "Approving USDC..."
              : step === "depositing"
                ? "Depositing into vault..."
                : step === "confirming"
                  ? "Confirming..."
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
