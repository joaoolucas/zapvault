"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount, useEnsName } from "wagmi";
import { mainnet } from "wagmi/chains";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Dashboard } from "@/components/Dashboard";
import { DepositModal } from "@/components/DepositModal";
import { usePosition } from "@/hooks/usePositions";

export default function PositionsPage() {
  const [showDeposit, setShowDeposit] = useState(false);
  const router = useRouter();
  const { address } = useAccount();
  const { data: ensName } = useEnsName({
    address,
    chainId: mainnet.id,
  });
  const { refetch } = usePosition();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header ensName={ensName ?? undefined} />

      <Dashboard
        onDeposit={() => setShowDeposit(true)}
        onWithdrawn={() => router.push("/")}
      />

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
          }}
        />
      )}
    </div>
  );
}
