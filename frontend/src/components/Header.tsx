"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount } from "wagmi";

export function Header({ ensName }: { ensName?: string }) {
  const { isConnected, address } = useAccount();

  const displayName = ensName ?? (address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "");

  return (
    <header className="flex items-center justify-between px-12 py-5 border-b border-border">
      <div className="font-serif text-xl tracking-tight text-foreground">
        <span className="font-bold">Zap</span>
        <span className="font-normal">Vault</span>
      </div>

      <div className="flex items-center gap-3 text-sm">
        {isConnected && (
          <span className="text-muted text-xs tracking-wide">Base</span>
        )}
        <ConnectButton.Custom>
          {({ account, chain, openConnectModal, openAccountModal, mounted }) => {
            const connected = mounted && account && chain;
            return (
              <button
                onClick={connected ? openAccountModal : openConnectModal}
                className={`px-4 py-2 rounded-full text-sm font-semibold transition-all cursor-pointer ${
                  connected
                    ? "bg-foreground text-background"
                    : "bg-foreground text-background hover:opacity-90"
                }`}
              >
                {connected ? displayName : "Connect Wallet"}
              </button>
            );
          }}
        </ConnectButton.Custom>
      </div>
    </header>
  );
}
