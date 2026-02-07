"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount, useEnsName } from "wagmi";
import { mainnet } from "wagmi/chains";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { DepositModal } from "@/components/DepositModal";
import { LandingHero } from "@/components/LandingHero";
import { Landing } from "@/components/Landing";
import { usePosition } from "@/hooks/usePositions";

export default function Home() {
  const [showDeposit, setShowDeposit] = useState(false);
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const { data: ensName } = useEnsName({
    address,
    chainId: mainnet.id,
  });
  const { refetch } = usePosition();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header ensName={ensName ?? undefined} />

      {!isConnected ? (
        <LandingHero onDeposit={() => setShowDeposit(true)} />
      ) : (
        <Landing onDeposit={() => setShowDeposit(true)} />
      )}

      <Footer />

      {showDeposit && (
        <DepositModal
          onClose={() => {
            setShowDeposit(false);
            refetch();
          }}
          onDeposited={() => {
            setShowDeposit(false);
            refetch();
            router.push("/positions");
          }}
        />
      )}
    </div>
  );
}
