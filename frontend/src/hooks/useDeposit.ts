"use client";

import { useCallback, useState } from "react";
import { useAccount, usePublicClient, useConfig } from "wagmi";
import { base } from "wagmi/chains";
import { parseUnits, encodeFunctionData } from "viem";
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
  | "approving"
  | "depositing"
  | "confirming"
  | "bridging"
  | "done"
  | "error";

export function useDeposit() {
  const { address } = useAccount();
  const basePublicClient = usePublicClient({ chainId: base.id });
  const wagmiConfig = useConfig();
  const [step, setStep] = useState<DepositStep>("idle");
  const [errorMsg, setErrorMsg] = useState("");

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

        setStep("approving");
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

  // Cross-chain deposit via LI.FI Composer (single tx: bridge + deposit atomically)
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
        // Step 1: Build the destination contract call
        setStep("bridging");

        const depositCallData = encodeFunctionData({
          abi: ROUTER_ABI,
          functionName: "deposit",
          args: [
            address,
            config.rangeWidth,
            config.rebalanceThreshold,
            config.slippage,
          ],
        });

        // Step 2: Get LI.FI contract calls quote (bridge + deposit in one tx)
        const quote = await getContractCallsQuote({
          fromChain: fromChainId,
          fromToken: fromTokenAddress,
          fromAddress: address,
          fromAmount: amount.toString(),
          toChain: base.id,
          toToken: ADDRESSES.USDC,
          contractCalls: [
            {
              fromAmount: amount.toString(),
              fromTokenAddress: ADDRESSES.USDC,
              toContractAddress: ADDRESSES.ROUTER,
              toContractCallData: depositCallData,
              toContractGasLimit: "800000",
            },
          ],
        });

        if (!quote.transactionRequest) {
          throw new Error("No transaction data in LI.FI quote");
        }

        // Step 3: Approve USDC on source chain for LI.FI contract
        setStep("approving");
        await switchChain(wagmiConfig, { chainId: fromChainId });
        const sourceWallet = await getWalletClient(wagmiConfig, {
          chainId: fromChainId,
        });

        const lifiContract = quote.transactionRequest.to as `0x${string}`;
        const sourceApproveHash = await sourceWallet.writeContract({
          address: fromTokenAddress as `0x${string}`,
          abi: ERC20_ABI,
          functionName: "approve",
          args: [lifiContract, amount],
        });
        await waitForTransactionReceipt(wagmiConfig, {
          hash: sourceApproveHash,
          chainId: fromChainId,
        });

        // Step 4: Send the bridge + deposit tx (user's only signing step)
        setStep("bridging");
        const txReq = quote.transactionRequest;
        const bridgeHash = await sourceWallet.sendTransaction({
          to: txReq.to as `0x${string}`,
          data: txReq.data as `0x${string}`,
          value: txReq.value ? BigInt(txReq.value) : 0n,
          gas: txReq.gasLimit ? BigInt(txReq.gasLimit) : undefined,
        });

        // Wait for source chain confirmation
        await waitForTransactionReceipt(wagmiConfig, {
          hash: bridgeHash,
          chainId: fromChainId,
        });

        // Step 5: Poll for bridge + deposit completion on Base
        setStep("confirming");
        for (let i = 0; i < 120; i++) {
          await new Promise((r) => setTimeout(r, 5000));
          try {
            const status = await getStatus({
              txHash: bridgeHash,
              bridge: quote.tool,
              fromChain: fromChainId,
              toChain: base.id,
            });
            if (status.status === "DONE") {
              setStep("done");
              return true;
            }
            if (status.status === "FAILED") {
              throw new Error(
                "Bridge failed. Check your wallet — funds may have been returned."
              );
            }
          } catch (e: any) {
            if (e.message?.includes("Bridge failed")) throw e;
            // getStatus may throw before tx is indexed — keep polling
          }
        }

        // If we get here, bridge timed out but may still complete
        throw new Error(
          "Bridge is taking longer than expected. Your deposit should complete shortly — check your positions."
        );
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
