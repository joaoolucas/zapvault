"use client";

import { useCallback, useState } from "react";
import {
  useAccount,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { base } from "wagmi/chains";
import { parseUnits } from "viem";
import { ADDRESSES, ERC20_ABI, ROUTER_ABI } from "@/lib/constants";
import type { VaultConfig } from "./useENSConfig";

export function useDeposit() {
  const { address } = useAccount();
  const [step, setStep] = useState<
    "idle" | "approving" | "depositing" | "done" | "error"
  >("idle");

  const {
    writeContract: writeApprove,
    data: approveTx,
    isPending: isApproving,
  } = useWriteContract();
  const {
    writeContract: writeTransfer,
    data: transferTx,
    isPending: isTransferring,
  } = useWriteContract();
  const {
    writeContract: writeDeposit,
    data: depositTx,
    isPending: isDepositing,
  } = useWriteContract();

  const { isLoading: isWaitingApprove } = useWaitForTransactionReceipt({
    hash: approveTx,
  });
  const { isLoading: isWaitingTransfer } = useWaitForTransactionReceipt({
    hash: transferTx,
  });
  const { isLoading: isWaitingDeposit } = useWaitForTransactionReceipt({
    hash: depositTx,
  });

  const deposit = useCallback(
    async (usdcAmount: string, config: VaultConfig) => {
      if (!address) return;

      const amount = parseUnits(usdcAmount, 6);

      try {
        setStep("approving");

        // Step 1: Transfer USDC to router
        // First approve the router to spend USDC (for user to transfer)
        writeTransfer({
          address: ADDRESSES.USDC,
          abi: ERC20_ABI,
          functionName: "transfer",
          args: [ADDRESSES.ROUTER, amount],
          chainId: base.id,
        });

        setStep("depositing");

        // Step 2: Call router.deposit
        writeDeposit({
          address: ADDRESSES.ROUTER,
          abi: ROUTER_ABI,
          functionName: "deposit",
          args: [
            address,
            config.rangeWidth,
            config.rebalanceThreshold,
            config.slippage,
          ],
          chainId: base.id,
        });

        setStep("done");
      } catch {
        setStep("error");
      }
    },
    [address, writeTransfer, writeDeposit]
  );

  return {
    deposit,
    step,
    isLoading:
      isApproving ||
      isTransferring ||
      isDepositing ||
      isWaitingApprove ||
      isWaitingTransfer ||
      isWaitingDeposit,
  };
}
