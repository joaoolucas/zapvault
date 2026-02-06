"use client";

import { useState, useEffect } from "react";
import { useAccount, useSendTransaction, useWaitForTransactionReceipt } from "wagmi";
import { encodeFunctionData, parseUnits } from "viem";
import { type VaultConfig } from "@/hooks/useENSConfig";
import { ADDRESSES, ROUTER_ABI } from "@/lib/constants";

const SUPPORTED_CHAINS = [
  { id: 1, name: "Ethereum", symbol: "ETH" },
  { id: 42161, name: "Arbitrum", symbol: "ARB" },
  { id: 10, name: "Optimism", symbol: "OP" },
  { id: 137, name: "Polygon", symbol: "POL" },
  { id: 8453, name: "Base", symbol: "BASE" },
];

interface DepositWidgetProps {
  config: VaultConfig;
}

interface LiFiQuote {
  transactionRequest?: {
    to: string;
    data: string;
    value: string;
    gasLimit: string;
  };
  estimate?: {
    toAmount: string;
    executionDuration: number;
  };
  action?: {
    fromToken: { symbol: string };
    toToken: { symbol: string };
  };
}

export function DepositWidget({ config }: DepositWidgetProps) {
  const { address, isConnected } = useAccount();
  const [fromChain, setFromChain] = useState(1);
  const [amount, setAmount] = useState("");
  const [quote, setQuote] = useState<LiFiQuote | null>(null);
  const [isQuoting, setIsQuoting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { sendTransaction, data: txHash, isPending } = useSendTransaction();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  // Fetch LI.FI quote with Composer contract call
  const fetchQuote = async () => {
    if (!address || !amount || parseFloat(amount) <= 0) return;

    setIsQuoting(true);
    setError(null);
    setQuote(null);

    try {
      // Build the deposit calldata for the destination contract call
      const depositCalldata = encodeFunctionData({
        abi: ROUTER_ABI,
        functionName: "deposit",
        args: [
          address,
          config.rangeWidth,
          config.rebalanceThreshold,
          config.slippage,
        ],
      });

      // Use LI.FI ContractCalls API for Composer integration
      const response = await fetch("https://li.quest/v1/quote/contractCalls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromChain: fromChain,
          fromToken: fromChain === 8453
            ? ADDRESSES.USDC // If on Base, use USDC directly
            : "0x0000000000000000000000000000000000000000", // Native token
          fromAddress: address,
          fromAmount: fromChain === 8453
            ? parseUnits(amount, 6).toString()
            : parseUnits(amount, 18).toString(),
          toChain: 8453,
          toToken: ADDRESSES.USDC,
          contractCalls: [
            {
              fromAmount: "0", // Will be filled by LI.FI
              fromTokenAddress: ADDRESSES.USDC,
              toContractAddress: ADDRESSES.ROUTER,
              toContractCallData: depositCalldata,
              toContractGasLimit: "500000",
            },
          ],
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || "Failed to get quote");
      }

      const data = await response.json();
      setQuote(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to get quote");
    } finally {
      setIsQuoting(false);
    }
  };

  // Execute the LI.FI transaction
  const executeDeposit = () => {
    if (!quote?.transactionRequest) return;

    const txReq = quote.transactionRequest;
    sendTransaction({
      to: txReq.to as `0x${string}`,
      data: txReq.data as `0x${string}`,
      value: BigInt(txReq.value || "0"),
    });
  };

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-white/10 bg-white/5 p-12 backdrop-blur">
        <div className="mb-4 text-6xl opacity-50">&#9889;</div>
        <p className="text-lg text-gray-400">Connect your wallet to deposit</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur">
      <h3 className="mb-2 text-lg font-semibold text-white">
        Deposit from Any Chain
      </h3>
      <p className="mb-6 text-sm text-gray-400">
        Powered by LI.FI Composer — swap, bridge, and deposit atomically.
      </p>

      {/* Source chain */}
      <div className="mb-4">
        <label className="mb-1 block text-sm text-gray-400">From Chain</label>
        <div className="grid grid-cols-5 gap-2">
          {SUPPORTED_CHAINS.map((chain) => (
            <button
              key={chain.id}
              onClick={() => setFromChain(chain.id)}
              className={`rounded-lg px-3 py-2 text-xs font-medium transition ${
                fromChain === chain.id
                  ? "bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/50"
                  : "bg-white/5 text-gray-400 hover:bg-white/10"
              }`}
            >
              {chain.symbol}
            </button>
          ))}
        </div>
      </div>

      {/* Amount */}
      <div className="mb-4">
        <label className="mb-1 block text-sm text-gray-400">
          Amount ({fromChain === 8453 ? "USDC" : "Native Token"})
        </label>
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder={fromChain === 8453 ? "1000" : "0.5"}
          className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-gray-500"
        />
      </div>

      {/* Destination info */}
      <div className="mb-4 rounded-lg bg-white/5 p-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-400">Destination</span>
          <span className="text-white">Base — USDC → ETH/USDC LP</span>
        </div>
        {quote?.estimate && (
          <>
            <div className="mt-2 flex items-center justify-between text-sm">
              <span className="text-gray-400">You receive</span>
              <span className="text-emerald-400">
                ~{(Number(quote.estimate.toAmount) / 1e6).toFixed(2)} USDC
              </span>
            </div>
            <div className="mt-1 flex items-center justify-between text-sm">
              <span className="text-gray-400">Est. time</span>
              <span className="text-white">
                ~{Math.ceil(quote.estimate.executionDuration / 60)} min
              </span>
            </div>
          </>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 rounded-lg bg-red-500/10 p-3">
          <p className="text-xs text-red-400">{error}</p>
        </div>
      )}

      {/* Success */}
      {isSuccess && (
        <div className="mb-4 rounded-lg bg-emerald-500/10 p-3">
          <p className="text-sm text-emerald-400">
            Transaction submitted! Your LP position will be created once the
            bridge completes.
          </p>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        {!quote ? (
          <button
            onClick={fetchQuote}
            disabled={!amount || parseFloat(amount) <= 0 || isQuoting}
            className="flex-1 rounded-xl bg-emerald-500 px-4 py-3 font-semibold text-black transition hover:bg-emerald-400 disabled:opacity-50"
          >
            {isQuoting ? "Getting Quote..." : "Get Quote"}
          </button>
        ) : (
          <>
            <button
              onClick={executeDeposit}
              disabled={isPending || isConfirming}
              className="flex-1 rounded-xl bg-emerald-500 px-4 py-3 font-semibold text-black transition hover:bg-emerald-400 disabled:opacity-50"
            >
              {isPending
                ? "Confirm in Wallet..."
                : isConfirming
                ? "Confirming..."
                : "Deposit"}
            </button>
            <button
              onClick={() => setQuote(null)}
              className="rounded-xl border border-white/10 px-4 py-3 text-gray-400 transition hover:bg-white/5"
            >
              Reset
            </button>
          </>
        )}
      </div>

      <div className="mt-4 rounded-lg bg-blue-500/10 p-3">
        <p className="text-xs text-blue-400">
          LI.FI Composer executes the swap, bridge, and contract call in a
          single transaction on the source chain. Your LP position is created
          automatically on Base.
        </p>
      </div>
    </div>
  );
}
