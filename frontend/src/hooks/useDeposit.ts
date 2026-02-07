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
    "idle" | "transferring" | "depositing" | "confirming" | "done" | "error"
  >("idle");

  const deposit = useCallback(
    async (usdcAmount: string, config: VaultConfig) => {
      if (!address || !walletClient || !publicClient) return;

      const amount = parseUnits(usdcAmount, 6);

      try {
        // Step 1: Transfer USDC to router
        setStep("transferring");
        const transferHash = await walletClient.writeContract({
          address: ADDRESSES.USDC,
          abi: ERC20_ABI,
          functionName: "transfer",
          args: [ADDRESSES.ROUTER, amount],
          chain: base,
        });
        await publicClient.waitForTransactionReceipt({ hash: transferHash });

        // Step 2: Call router.deposit (single tx, no second signature for transfer)
        setStep("depositing");
        const depositHash = await walletClient.writeContract({
          address: ADDRESSES.ROUTER,
          abi: ROUTER_ABI,
          functionName: "deposit",
          args: [
            address,
            config.rangeWidth,
            config.rebalanceThreshold,
            config.slippage,
          ],
          chain: base,
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
    isLoading: step === "transferring" || step === "depositing" || step === "confirming",
  };
}
