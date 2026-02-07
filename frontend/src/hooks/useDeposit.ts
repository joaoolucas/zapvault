"use client";

import { useCallback, useState } from "react";
import { useAccount, usePublicClient, useConfig } from "wagmi";
import { base } from "wagmi/chains";
import { parseUnits } from "viem";
import {
  switchChain,
  getWalletClient,
  waitForTransactionReceipt,
} from "wagmi/actions";
import {
  createConfig as createLiFiConfig,
  getQuote,
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

  // Cross-chain deposit via LI.FI: bridge to user on Base, then auto-deposit
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
        // Step 1: Get LI.FI quote to bridge USDC to user on Base
        setStep("bridging");

        const quote = await getQuote({
          fromAddress: address,
          fromChain: fromChainId,
          toChain: base.id,
          fromToken: fromTokenAddress,
          toToken: ADDRESSES.USDC,
          fromAmount: amount.toString(),
          toAddress: address,
          slippage: config.slippage / 10000,
        });

        if (!quote.transactionRequest) {
          throw new Error("No transaction data in LI.FI quote");
        }

        // Step 2: Switch to source chain, approve, and send bridge tx
        setStep("approving");
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

        setStep("bridging");
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

        // Step 3: Poll for bridge completion
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
            if (status.status === "DONE") break;
            if (status.status === "FAILED") {
              throw new Error(
                "Bridge failed. Check your wallet — funds may have been returned."
              );
            }
          } catch (e: any) {
            if (e.message?.includes("Bridge failed")) throw e;
          }
        }

        // Step 4: Bridge done — USDC is in user's wallet on Base. Auto-deposit.
        await new Promise((r) => setTimeout(r, 3000));

        setStep("approving");
        await switchChain(wagmiConfig, { chainId: base.id });
        const baseWallet = await getWalletClient(wagmiConfig, {
          chainId: base.id,
        });

        // Read actual USDC balance on Base (bridge fees reduce the amount)
        const baseBalance = (await basePublicClient.readContract({
          address: ADDRESSES.USDC,
          abi: ERC20_ABI,
          functionName: "balanceOf",
          args: [address],
        })) as bigint;

        const depositAmount = baseBalance < amount ? baseBalance : amount;
        if (depositAmount === 0n) {
          throw new Error("No USDC received on Base after bridge");
        }

        const baseApproveHash = await baseWallet.writeContract({
          address: ADDRESSES.USDC,
          abi: ERC20_ABI,
          functionName: "approve",
          args: [ADDRESSES.ROUTER, depositAmount],
          chain: base,
        });
        await basePublicClient.waitForTransactionReceipt({
          hash: baseApproveHash,
        });

        setStep("depositing");
        const depositHash = await baseWallet.writeContract({
          address: ADDRESSES.ROUTER,
          abi: ROUTER_ABI,
          functionName: "depositWithAmount",
          args: [
            depositAmount,
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
