"use client";

import { useState, useRef, useEffect } from "react";
import { ADDRESSES } from "@/lib/constants";

export interface ChainInfo {
  id: number;
  name: string;
  usdc: `0x${string}`;
  icon: string;
  color: string;
}

export const CHAINS: ChainInfo[] = [
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
    id: 137,
    name: "Polygon",
    usdc: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
    icon: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/polygon/info/logo.png",
    color: "#8247E5",
  },
];

export function ChainIcon({ chain, size = 28 }: { chain: ChainInfo; size?: number }) {
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

export function ChainDropdown({
  selected,
  onSelect,
  balances,
  label = "USDC",
}: {
  selected: number;
  onSelect: (i: number) => void;
  balances: number[];
  label?: string;
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
              ? `$${balances[selected].toFixed(2)} ${label}`
              : label}
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
                  {balances[i] > 0 ? `$${balances[i].toFixed(2)}` : "\u2014"}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
