"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Dashboard } from "@/components/Dashboard";
import { DepositModal } from "@/components/DepositModal";
import { WithdrawModal } from "@/components/WithdrawModal";
import { usePosition } from "@/hooks/usePositions";
import { formatUnits } from "viem";

export default function PositionsPage() {
  const [showDeposit, setShowDeposit] = useState(false);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const router = useRouter();
  const { position, refetch } = usePosition();

  const depositedUSDC = position
    ? Number(formatUnits(position.depositedUSDC, 6))
    : 0;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header />

      <Dashboard
        onDeposit={() => setShowDeposit(true)}
        onWithdraw={() => setShowWithdraw(true)}
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

      {showWithdraw && (
        <WithdrawModal
          depositedUSDC={depositedUSDC}
          onClose={() => {
            setShowWithdraw(false);
            refetch();
          }}
          onWithdrawn={() => {
            setShowWithdraw(false);
            refetch();
            router.push("/");
          }}
        />
      )}
    </div>
  );
}
