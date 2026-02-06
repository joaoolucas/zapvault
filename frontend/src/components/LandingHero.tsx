"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";

export function LandingHero({ onDeposit }: { onDeposit: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center px-12 pt-32 pb-40">
      <div className="text-center max-w-2xl">
        <p className="font-serif text-xs text-muted uppercase tracking-[4px] mb-6">
          Cross-Chain Automated LP
        </p>
        <h1 className="font-serif text-7xl font-bold text-foreground tracking-tighter leading-[0.9] mb-6">
          One click,<br />
          <span className="italic font-normal">any chain</span>
        </h1>
        <p className="text-base text-muted leading-relaxed max-w-md mx-auto mb-12">
          Deposit any token from any EVM chain. ZapVault provisions concentrated
          ETH/USDC liquidity on Uniswap v4 with AI-managed rebalancing.
        </p>

        <ConnectButton.Custom>
          {({ openConnectModal, mounted }) => (
            <button
              onClick={openConnectModal}
              disabled={!mounted}
              className="px-8 py-4 bg-foreground text-background text-sm font-bold rounded-xl hover:opacity-90 transition-opacity cursor-pointer"
            >
              Connect Wallet to Start
            </button>
          )}
        </ConnectButton.Custom>

        <div className="mt-20 flex items-center justify-center gap-12 text-xs text-muted">
          {[
            { name: "Uniswap v4", desc: "AutoRange Hook" },
            { name: "LI.FI", desc: "Cross-chain" },
            { name: "ENS", desc: "Strategy config" },
            { name: "Claude Opus 4.6", desc: "AI Keeper" },
          ].map(({ name, desc }) => (
            <div key={name} className="text-center">
              <div className="font-semibold text-foreground">{name}</div>
              <div>{desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
