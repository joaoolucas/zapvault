"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Dashboard } from "@/components/Dashboard";
import { DepositModal } from "@/components/DepositModal";
import { usePosition } from "@/hooks/usePositions";

export default function PositionsPage() {
  const [showDeposit, setShowDeposit] = useState(false);
  const router = useRouter();
  const { refetch } = usePosition();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header />

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
