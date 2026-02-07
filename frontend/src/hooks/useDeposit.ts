"use client";

import { useCallback, useState } from "react";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import { base } from "wagmi/chains";
import { parseUnits } from "viem";
import { ADDRESSES, ERC20_ABI, ROUTER_ABI } from "@/lib/constants";
import type { VaultConfig } from "./useENSConfig";

export function useDeposit() {
  const { address } = useAccount();
  const publicClient = usePublicClient({ chainId: base.id });
  const { data: walletClient } = useWalletClient({ chainId: base.id });
  const [step, setStep] = useState<
    "idle" | "approving" | "depositing" | "confirming" | "done" | "error"
  >("idle");

  const deposit = useCallback(
    async (usdcAmount: string, config: VaultConfig) => {
      if (!address || !walletClient || !publicClient) return;

      const amount = parseUnits(usdcAmount, 6);

      try {
        // Step 1: Approve router to spend USDC
        setStep("approving");
        const approveHash = await walletClient.writeContract({
          address: ADDRESSES.USDC,
          abi: ERC20_ABI,
          functionName: "approve",
          args: [ADDRESSES.ROUTER, amount],
          chain: base,
        });
        await publicClient.waitForTransactionReceipt({ hash: approveHash });

        // Step 2: Call router.depositWithAmount (atomic: transferFrom + deposit in one tx)
        setStep("depositing");
        const depositHash = await walletClient.writeContract({
          address: ADDRESSES.ROUTER,
          abi: ROUTER_ABI,
          functionName: "depositWithAmount",
          args: [
            amount,
            config.rangeWidth,
            config.rebalanceThreshold,
            config.slippage,
          ],
          chain: base,
          gas: 800_000n,
        });

        setStep("confirming");
        await publicClient.waitForTransactionReceipt({ hash: depositHash });

        setStep("done");
      } catch (e) {
        console.error("Deposit failed:", e);
        setStep("error");
      }
    },
    [address, walletClient, publicClient]
  );

  return {
    deposit,
    step,
    isLoading: step === "approving" || step === "depositing" || step === "confirming",
  };
}
