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

  // Direct deposit on Base
  const depositBase = useCallback(
    async (usdcAmount: string, config: VaultConfig): Promise<boolean> => {
      if (!address || !basePublicClient) return false;

      const amount = parseUnits(usdcAmount, 6);

      try {
        // Ensure we're on Base
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

  // Cross-chain deposit via LI.FI: bridge to Base USDC, then deposit
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
        // Step 1: Get LI.FI quote for bridge
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

        // Step 2: Switch to source chain, approve USDC, and send bridge tx
        setStep("approving");
        await switchChain(wagmiConfig, { chainId: fromChainId });
        const sourceWallet = await getWalletClient(wagmiConfig, {
          chainId: fromChainId,
        });

        // Approve LI.FI contract to spend USDC on source chain
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

        // Send the bridge tx
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

        // Step 3: Poll for bridge completion (up to 5 minutes)
        let bridgeDone = false;
        for (let i = 0; i < 60; i++) {
          await new Promise((r) => setTimeout(r, 5000));
          try {
            const status = await getStatus({
              txHash: bridgeHash,
              bridge: quote.tool,
              fromChain: fromChainId,
              toChain: base.id,
            });
            if (status.status === "DONE") {
              bridgeDone = true;
              break;
            }
            if (status.status === "FAILED") {
              throw new Error("Bridge transaction failed");
            }
          } catch (e: any) {
            // getStatus may throw before tx is indexed — keep polling
            if (e.message === "Bridge transaction failed") throw e;
          }
        }

        if (!bridgeDone) {
          throw new Error(
            "Bridge timed out. USDC may arrive later — check your Base wallet."
          );
        }

        // Small buffer for indexing
        await new Promise((r) => setTimeout(r, 3000));

        // Step 4: Switch to Base and deposit into vault
        setStep("approving");
        await switchChain(wagmiConfig, { chainId: base.id });
        const baseWallet = await getWalletClient(wagmiConfig, {
          chainId: base.id,
        });

        const approveHash = await baseWallet.writeContract({
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
        const depositHash = await baseWallet.writeContract({
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
