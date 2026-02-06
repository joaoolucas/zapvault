"use client";

import { useState } from "react";
import { useAccount, useEnsName } from "wagmi";
import { mainnet } from "wagmi/chains";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Dashboard } from "@/components/Dashboard";
import { DepositModal } from "@/components/DepositModal";
import { LandingHero } from "@/components/LandingHero";
import { usePosition } from "@/hooks/usePositions";

export default function Home() {
  const [showDeposit, setShowDeposit] = useState(false);
  const { address, isConnected } = useAccount();
  const { data: ensName } = useEnsName({
    address,
    chainId: mainnet.id,
  });
  const { hasPosition, refetch } = usePosition();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header ensName={ensName ?? undefined} />

      {!isConnected ? (
        <LandingHero onDeposit={() => setShowDeposit(true)} />
      ) : (
        <Dashboard
          onDeposit={() => setShowDeposit(true)}
          hasPosition={hasPosition}
        />
      )}

      <Footer />

      {showDeposit && (
        <DepositModal
          onClose={() => {
            setShowDeposit(false);
            refetch();
          }}
        />
      )}
    </div>
  );
}
