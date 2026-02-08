"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
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
  const { isConnected } = useAccount();
  const { position, hasPosition, refetch } = usePosition();

  // Redirect to home if not connected or no position — but NOT while withdrawing
  useEffect(() => {
    if (showWithdraw) return;
    if (!isConnected || (isConnected && position !== undefined && !hasPosition)) {
      router.replace("/");
    }
  }, [isConnected, position, hasPosition, router, showWithdraw]);

  const depositedUSDC = position
    ? Number(formatUnits(position.depositedUSDC, 6))
    : 0;

  if (!showWithdraw && (!isConnected || !hasPosition)) {
    return null;
  }

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
          onClose={() => setShowWithdraw(false)}
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
