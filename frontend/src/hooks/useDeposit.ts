"use client";

import { useCallback, useState } from "react";
import { useAccount, usePublicClient, useConfig } from "wagmi";
import { base } from "wagmi/chains";
import { encodeFunctionData, parseUnits } from "viem";
import {
  switchChain,
  getWalletClient,
  waitForTransactionReceipt,
} from "wagmi/actions";
import {
  createConfig as createLiFiConfig,
  getContractCallsQuote,
  getStatus,
} from "@lifi/sdk";
import { ADDRESSES, ERC20_ABI, ROUTER_ABI } from "@/lib/constants";
import type { VaultConfig } from "./useENSConfig";

// Initialize LI.FI SDK
createLiFiConfig({
  integrator: "ZapVault",
});

export type DepositStep =
  | "idle"
  | "quoting"
  | "approve-source"
  | "bridge-send"
  | "bridge-wait"
  | "approve-base"
  | "depositing"
  | "confirming"
  | "done"
  | "error";

export function useDeposit() {
  const { address } = useAccount();
  const basePublicClient = usePublicClient({ chainId: base.id });
  const wagmiConfig = useConfig();
  const [step, setStep] = useState<DepositStep>("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const resetStep = useCallback(() => {
    setStep("idle");
    setErrorMsg("");
  }, []);

  // Direct deposit on Base (approve + depositWithAmount)
  const depositBase = useCallback(
    async (usdcAmount: string, config: VaultConfig): Promise<boolean> => {
      if (!address || !basePublicClient) return false;

      const amount = parseUnits(usdcAmount, 6);

      try {
        await switchChain(wagmiConfig, { chainId: base.id });
        const walletClient = await getWalletClient(wagmiConfig, {
          chainId: base.id,
        });

        setStep("approve-base");
        const approveHash = await walletClient.writeContract({
          address: ADDRESSES.USDC,
          abi: ERC20_ABI,
          functionName: "approve",
          args: [ADDRESSES.ROUTER, amount],
          chain: base,
        });
        await basePublicClient.waitForTransactionReceipt({
          hash: approveHash,
        });

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
        await basePublicClient.waitForTransactionReceipt({
          hash: depositHash,
        });

        setStep("done");
        return true;
      } catch (e: any) {
        console.error("Deposit failed:", e);
        setErrorMsg(e?.shortMessage || e?.message || "Deposit failed");
        setStep("error");
        return false;
      }
    },
    [address, basePublicClient, wagmiConfig]
  );

  // Cross-chain deposit via LI.FI Composer: bridge + deposit in one step, no gas on Base
  const depositCrossChain = useCallback(
    async (
      usdcAmount: string,
      config: VaultConfig,
      fromChainId: number,
      fromTokenAddress: string
    ): Promise<boolean> => {
      if (!address || !basePublicClient) return false;

      const amount = parseUnits(usdcAmount, 6);

      try {
        setStep("quoting");

        // Encode the router deposit call for LI.FI Composer
        const depositCallData = encodeFunctionData({
          abi: ROUTER_ABI,
          functionName: "deposit",
          args: [
            address,
            amount,
            config.rangeWidth,
            config.rebalanceThreshold,
            config.slippage,
          ],
        });

        // Use getContractCallsQuote — LI.FI bridges USDC to Base,
        // approves it to the router, and calls deposit() in one step.
        // User only signs on the source chain. No gas needed on Base.
        const quote = await getContractCallsQuote({
          fromAddress: address,
          fromChain: fromChainId,
          fromToken: fromTokenAddress,
          fromAmount: amount.toString(),
          toChain: base.id,
          toToken: ADDRESSES.USDC,
          toFallbackAddress: address,
          slippage: config.slippage / 10000,
          contractCalls: [
            {
              fromAmount: amount.toString(),
              fromTokenAddress: ADDRESSES.USDC,
              toContractAddress: ADDRESSES.ROUTER,
              toContractCallData: depositCallData,
              toContractGasLimit: "800000",
              toApprovalAddress: ADDRESSES.ROUTER,
            },
          ],
        });

        if (!quote.transactionRequest) {
          throw new Error("No transaction data in LI.FI quote");
        }

        setStep("approve-source");
        await switchChain(wagmiConfig, { chainId: fromChainId });
        const sourceWallet = await getWalletClient(wagmiConfig, {
          chainId: fromChainId,
        });

        const lifiContract = quote.transactionRequest.to as `0x${string}`;
        const approveHash = await sourceWallet.writeContract({
          address: fromTokenAddress as `0x${string}`,
          abi: ERC20_ABI,
          functionName: "approve",
          args: [lifiContract, amount],
        });
        await waitForTransactionReceipt(wagmiConfig, {
          hash: approveHash,
          chainId: fromChainId,
        });

        setStep("bridge-send");
        const txReq = quote.transactionRequest;
        const bridgeHash = await sourceWallet.sendTransaction({
          to: txReq.to as `0x${string}`,
          data: txReq.data as `0x${string}`,
          value: txReq.value ? BigInt(txReq.value) : 0n,
          gas: txReq.gasLimit ? BigInt(txReq.gasLimit) : undefined,
        });

        await waitForTransactionReceipt(wagmiConfig, {
          hash: bridgeHash,
          chainId: fromChainId,
        });

        // LI.FI Composer handles the deposit on Base — just poll for completion
        setStep("bridge-wait");
        for (let i = 0; i < 120; i++) {
          await new Promise((r) => setTimeout(r, 5000));
          try {
            const status = await getStatus({
              txHash: bridgeHash,
              bridge: quote.tool,
              fromChain: fromChainId,
              toChain: base.id,
            });
            if (status.status === "DONE") break;
            if (status.status === "FAILED") {
              throw new Error(
                "Bridge failed. Check your wallet — funds may have been returned to your address."
              );
            }
          } catch (e: any) {
            if (e.message?.includes("Bridge failed")) throw e;
          }
        }

        setStep("done");
        return true;
      } catch (e: any) {
        console.error("Cross-chain deposit failed:", e);
        setErrorMsg(
          e?.shortMessage || e?.message || "Cross-chain deposit failed"
        );
        setStep("error");
        return false;
      }
    },
    [address, basePublicClient, wagmiConfig]
  );

  const isLoading =
    step !== "idle" && step !== "done" && step !== "error";

  return {
    depositBase,
    depositCrossChain,
    step,
    errorMsg,
    isLoading,
    resetStep,
  };
}
