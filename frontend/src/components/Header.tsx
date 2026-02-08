"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount, useEnsName, useEnsAvatar } from "wagmi";
import { mainnet } from "wagmi/chains";
import { normalize } from "viem/ens";
import { usePosition } from "@/hooks/usePositions";

export function Header() {
  const { isConnected, address } = useAccount();
  const { hasPosition } = usePosition();
  const pathname = usePathname();

  const { data: ensName } = useEnsName({
    address,
    chainId: mainnet.id,
  });

  const normalizedName = ensName ? normalize(ensName) : undefined;

  const { data: ensAvatar } = useEnsAvatar({
    name: normalizedName,
    chainId: mainnet.id,
    query: { enabled: !!normalizedName },
  });

  const displayName = ensName ?? (address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "");

  return (
    <header className="flex items-center justify-between px-12 py-5 border-b border-border">
      <div className="flex items-center gap-8">
        <Link href="/" className="font-serif text-xl tracking-tight text-foreground">
          <span className="font-bold">Zap</span>
          <span className="font-normal">Vault</span>
        </Link>

        <nav className="flex items-center gap-1">
          {isConnected && (
            <>
              <Link
                href="/"
                className={`px-3 py-1.5 rounded-lg text-[13px] font-medium transition-colors ${
                  pathname === "/" ? "bg-surface text-foreground" : "text-muted hover:text-foreground"
                }`}
              >
                Home
              </Link>
              {hasPosition && (
                <Link
                  href="/positions"
                  className={`px-3 py-1.5 rounded-lg text-[13px] font-medium transition-colors ${
                    pathname === "/positions" ? "bg-surface text-foreground" : "text-muted hover:text-foreground"
                  }`}
                >
                  Positions
                </Link>
              )}
              <Link
                href="/strategy"
                className={`px-3 py-1.5 rounded-lg text-[13px] font-medium transition-colors ${
                  pathname === "/strategy" ? "bg-surface text-foreground" : "text-muted hover:text-foreground"
                }`}
              >
                Strategy
              </Link>
            </>
          )}
          <Link
            href="/docs"
            className={`px-3 py-1.5 rounded-lg text-[13px] font-medium transition-colors ${
              pathname === "/docs" ? "bg-surface text-foreground" : "text-muted hover:text-foreground"
            }`}
          >
            Docs
          </Link>
        </nav>
      </div>

      <div className="flex items-center gap-3 text-sm">
        <ConnectButton.Custom>
          {({ account, chain, openConnectModal, openAccountModal, mounted }) => {
            const connected = mounted && account && chain;
            return (
              <button
                onClick={connected ? openAccountModal : openConnectModal}
                className={`flex items-center gap-2.5 px-4 py-2 rounded-full text-sm font-semibold transition-all cursor-pointer ${
                  connected
                    ? "bg-foreground text-background"
                    : "bg-foreground text-background hover:opacity-90"
                }`}
              >
                {connected && ensAvatar && (
                  <img
                    src={ensAvatar}
                    alt=""
                    className="w-5 h-5 rounded-full"
                  />
                )}
                {connected ? displayName : "Connect Wallet"}
              </button>
            );
          }}
        </ConnectButton.Custom>
      </div>
    </header>
  );
}
