"use client";

import { useCallback, useState } from "react";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import { base } from "wagmi/chains";
import { parseUnits, encodeFunctionData } from "viem";
import { createConfig, getQuote, executeRoute, convertQuoteToRoute } from "@lifi/sdk";
import { ADDRESSES, ERC20_ABI, ROUTER_ABI } from "@/lib/constants";
import type { VaultConfig } from "./useENSConfig";

// Initialize LI.FI SDK
createConfig({
  integrator: "ZapVault",
});

export type DepositStep =
  | "idle"
  | "approving"
  | "depositing"
  | "confirming"
  | "bridging"
  | "done"
  | "error";

export function useDeposit() {
  const { address } = useAccount();
  const publicClient = usePublicClient({ chainId: base.id });
  const { data: walletClient } = useWalletClient({ chainId: base.id });
  const [step, setStep] = useState<DepositStep>("idle");
  const [errorMsg, setErrorMsg] = useState("");

  // Direct deposit on Base
  const depositBase = useCallback(
    async (usdcAmount: string, config: VaultConfig): Promise<boolean> => {
      if (!address || !walletClient || !publicClient) return false;

      const amount = parseUnits(usdcAmount, 6);

      try {
        setStep("approving");
        const approveHash = await walletClient.writeContract({
          address: ADDRESSES.USDC,
          abi: ERC20_ABI,
          functionName: "approve",
          args: [ADDRESSES.ROUTER, amount],
          chain: base,
        });
        await publicClient.waitForTransactionReceipt({ hash: approveHash });

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
        return true;
      } catch (e: any) {
        console.error("Deposit failed:", e);
        setErrorMsg(e?.shortMessage || e?.message || "Deposit failed");
        setStep("error");
        return false;
      }
    },
    [address, walletClient, publicClient]
  );

  // Cross-chain deposit via LI.FI: bridge to Base USDC → user's wallet, then deposit on Base
  const depositCrossChain = useCallback(
    async (
      usdcAmount: string,
      config: VaultConfig,
      fromChainId: number,
      fromTokenAddress: string
    ): Promise<boolean> => {
      if (!address || !walletClient || !publicClient) return false;

      const amount = parseUnits(usdcAmount, 6);

      try {
        // Step 1: Get LI.FI quote — bridge USDC to user on Base
        setStep("bridging");

        const quote = await getQuote({
          fromAddress: address,
          fromChain: fromChainId,
          toChain: base.id,
          fromToken: fromTokenAddress,
          toToken: ADDRESSES.USDC,
          fromAmount: amount.toString(),
          toAddress: address,
          slippage: config.slippage / 10000, // bps to decimal
        });

        // Step 2: Execute the bridge route
        const route = convertQuoteToRoute(quote);
        await executeRoute(route, {
          updateRouteHook: (updatedRoute) => {
            const execution = updatedRoute.steps[0]?.execution;
            if (execution?.status === "DONE") {
              setStep("approving");
            }
          },
        });

        // Step 3: Bridge done — now do the Base deposit
        // Small delay for USDC to be indexed
        await new Promise((r) => setTimeout(r, 2000));

        // Check actual USDC balance on Base
        setStep("approving");
        const approveHash = await walletClient.writeContract({
          address: ADDRESSES.USDC,
          abi: ERC20_ABI,
          functionName: "approve",
          args: [ADDRESSES.ROUTER, amount],
          chain: base,
        });
        await publicClient.waitForTransactionReceipt({ hash: approveHash });

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
        return true;
      } catch (e: any) {
        console.error("Cross-chain deposit failed:", e);
        setErrorMsg(e?.shortMessage || e?.message || "Cross-chain deposit failed");
        setStep("error");
        return false;
      }
    },
    [address, walletClient, publicClient]
  );

  return {
    depositBase,
    depositCrossChain,
    step,
    errorMsg,
    isLoading:
      step === "approving" ||
      step === "depositing" ||
      step === "confirming" ||
      step === "bridging",
  };
}
