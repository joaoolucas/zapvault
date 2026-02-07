"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount } from "wagmi";
import { usePosition } from "@/hooks/usePositions";

export function Header({ ensName }: { ensName?: string }) {
  const { isConnected, address } = useAccount();
  const { hasPosition } = usePosition();
  const pathname = usePathname();

  const displayName = ensName ?? (address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "");

  return (
    <header className="flex items-center justify-between px-12 py-5 border-b border-border">
      <div className="flex items-center gap-8">
        <Link href="/" className="font-serif text-xl tracking-tight text-foreground">
          <span className="font-bold">Zap</span>
          <span className="font-normal">Vault</span>
        </Link>

        {isConnected && hasPosition && (
          <nav className="flex items-center gap-1">
            <Link
              href="/"
              className={`px-3 py-1.5 rounded-lg text-[13px] font-medium transition-colors ${
                pathname === "/" ? "bg-surface text-foreground" : "text-muted hover:text-foreground"
              }`}
            >
              Home
            </Link>
            <Link
              href="/positions"
              className={`px-3 py-1.5 rounded-lg text-[13px] font-medium transition-colors ${
                pathname === "/positions" ? "bg-surface text-foreground" : "text-muted hover:text-foreground"
              }`}
            >
              Your Positions
            </Link>
          </nav>
        )}
      </div>

      <div className="flex items-center gap-3 text-sm">
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
