"use client";

import { useCallback, useState } from "react";
import { useAccount, usePublicClient, useConfig } from "wagmi";
import { base } from "wagmi/chains";
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
import { ADDRESSES, VAULT_ABI, ERC20_ABI } from "@/lib/constants";

// Initialize LI.FI SDK
createLiFiConfig({
  integrator: "ZapVault",
});

export type WithdrawStep =
  | "idle"
  | "withdrawing"
  | "confirming"
  | "bridge-quote"
  | "approve-bridge"
  | "bridge-send"
  | "bridge-wait"
  | "done"
  | "error";

export function useWithdraw() {
  const { address } = useAccount();
  const basePublicClient = usePublicClient({ chainId: base.id });
  const wagmiConfig = useConfig();
  const [step, setStep] = useState<WithdrawStep>("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const resetStep = useCallback(() => {
    setStep("idle");
    setErrorMsg("");
  }, []);

  // Direct withdraw on Base (vault.withdraw → USDC to user)
  const withdrawBase = useCallback(
    async (): Promise<boolean> => {
      if (!address || !basePublicClient) return false;

      try {
        await switchChain(wagmiConfig, { chainId: base.id });
        const walletClient = await getWalletClient(wagmiConfig, {
          chainId: base.id,
        });

        setStep("withdrawing");
        const hash = await walletClient.writeContract({
          address: ADDRESSES.VAULT,
          abi: VAULT_ABI,
          functionName: "withdraw",
          chain: base,
          gas: 800_000n,
        });

        setStep("confirming");
        await basePublicClient.waitForTransactionReceipt({ hash });

        setStep("done");
        return true;
      } catch (e: any) {
        console.error("Withdraw failed:", e);
        setErrorMsg(e?.shortMessage || e?.message || "Withdraw failed");
        setStep("error");
        return false;
      }
    },
    [address, basePublicClient, wagmiConfig]
  );

  // Cross-chain withdraw: vault.withdraw on Base → bridge USDC to target chain
  const withdrawCrossChain = useCallback(
    async (
      targetChainId: number,
      targetUsdcAddress: string
    ): Promise<boolean> => {
      if (!address || !basePublicClient) return false;

      try {
        // Step 1: Withdraw from vault on Base
        await switchChain(wagmiConfig, { chainId: base.id });
        const walletClient = await getWalletClient(wagmiConfig, {
          chainId: base.id,
        });

        setStep("withdrawing");
        const hash = await walletClient.writeContract({
          address: ADDRESSES.VAULT,
          abi: VAULT_ABI,
          functionName: "withdraw",
          chain: base,
          gas: 800_000n,
        });

        setStep("confirming");
        await basePublicClient.waitForTransactionReceipt({ hash });

        // Step 2: Read USDC balance on Base after withdrawal
        const usdcBalance = (await basePublicClient.readContract({
          address: ADDRESSES.USDC,
          abi: ERC20_ABI,
          functionName: "balanceOf",
          args: [address],
        })) as bigint;

        if (usdcBalance === 0n) {
          throw new Error("No USDC received from vault withdrawal");
        }

        // Step 3: Get LI.FI bridge quote (LI.Fuel converts a small portion to destination gas)
        setStep("bridge-quote");
        const quote = await getQuote({
          fromAddress: address,
          fromChain: base.id,
          toChain: targetChainId,
          fromToken: ADDRESSES.USDC,
          toToken: targetUsdcAddress,
          fromAmount: usdcBalance.toString(),
          toAddress: address,
          slippage: 0.01,
          fromAmountForGas: "100000", // 0.10 USDC → native gas on destination chain
        });

        if (!quote.transactionRequest) {
          throw new Error("No transaction data in LI.FI quote");
        }

        // Step 4: Approve LI.FI contract for USDC spend
        setStep("approve-bridge");
        const lifiContract = quote.transactionRequest.to as `0x${string}`;
        const approveHash = await walletClient.writeContract({
          address: ADDRESSES.USDC,
          abi: ERC20_ABI,
          functionName: "approve",
          args: [lifiContract, usdcBalance],
          chain: base,
        });
        await basePublicClient.waitForTransactionReceipt({
          hash: approveHash,
        });

        // Step 5: Send bridge transaction
        setStep("bridge-send");
        const txReq = quote.transactionRequest;
        const bridgeHash = await walletClient.sendTransaction({
          to: txReq.to as `0x${string}`,
          data: txReq.data as `0x${string}`,
          value: txReq.value ? BigInt(txReq.value) : 0n,
          gas: txReq.gasLimit ? BigInt(txReq.gasLimit) : undefined,
          chain: base,
        });

        await waitForTransactionReceipt(wagmiConfig, {
          hash: bridgeHash,
          chainId: base.id,
        });

        // Step 6: Wait for bridge completion
        setStep("bridge-wait");
        for (let i = 0; i < 120; i++) {
          await new Promise((r) => setTimeout(r, 5000));
          try {
            const status = await getStatus({
              txHash: bridgeHash,
              bridge: quote.tool,
              fromChain: base.id,
              toChain: targetChainId,
            });
            if (status.status === "DONE") break;
            if (status.status === "FAILED") {
              throw new Error(
                "Bridge failed. Check your wallet — funds may have been returned to Base."
              );
            }
          } catch (e: any) {
            if (e.message?.includes("Bridge failed")) throw e;
          }
        }

        setStep("done");
        return true;
      } catch (e: any) {
        console.error("Cross-chain withdraw failed:", e);
        setErrorMsg(
          e?.shortMessage || e?.message || "Cross-chain withdraw failed"
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
    withdrawBase,
    withdrawCrossChain,
    step,
    errorMsg,
    isLoading,
    resetStep,
  };
}
