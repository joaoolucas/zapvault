"use client";

import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { base } from "wagmi/chains";
import { formatUnits } from "viem";
import { usePosition } from "@/hooks/usePositions";
import { ADDRESSES, VAULT_ABI } from "@/lib/constants";

export function PositionCard() {
  const { address } = useAccount();
  const { position, needsRebalance, hasPosition, refetch } = usePosition();

  const { writeContract: writeRebalance, data: rebalanceTx, isPending: isRebalancing } =
    useWriteContract();
  const { writeContract: writeWithdraw, data: withdrawTx, isPending: isWithdrawing } =
    useWriteContract();

  const { isLoading: isWaitingRebalance } = useWaitForTransactionReceipt({
    hash: rebalanceTx,
  });
  const { isLoading: isWaitingWithdraw } = useWaitForTransactionReceipt({
    hash: withdrawTx,
  });

  if (!address || !hasPosition || !position) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/20 bg-white/5 p-12">
        <div className="mb-4 text-5xl">📊</div>
        <p className="text-lg text-gray-400">No active position</p>
        <p className="mt-2 text-sm text-gray-500">
          Deposit USDC to create a concentrated liquidity position
        </p>
      </div>
    );
  }

  const tickLower = Number(position.tickLower);
  const tickUpper = Number(position.tickUpper);
  const tickCenter = (tickLower + tickUpper) / 2;
  const rangeWidth = tickUpper - tickLower;
  const depositedUSDC = formatUnits(position.depositedUSDC, 6);
  const depositDate = new Date(
    Number(position.depositTimestamp) * 1000
  ).toLocaleDateString();

  // Calculate approximate price range from ticks
  // price = 1.0001^tick (adjusted for decimals)
  const priceLower = Math.pow(1.0001, tickLower) * 1e12; // adjust for 18-6 decimal diff
  const priceUpper = Math.pow(1.0001, tickUpper) * 1e12;

  const handleRebalance = () => {
    if (!address) return;
    writeRebalance({
      address: ADDRESSES.VAULT,
      abi: VAULT_ABI,
      functionName: "rebalance",
      args: [address],
      chainId: base.id,
      gas: 800_000n,
    });
  };

  const handleWithdraw = () => {
    writeWithdraw({
      address: ADDRESSES.VAULT,
      abi: VAULT_ABI,
      functionName: "withdraw",
      args: [],
      chainId: base.id,
      gas: 800_000n,
    });
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white">
          ETH/USDC Position
        </h3>
        <span
          className={`rounded-full px-3 py-1 text-xs font-medium ${
            needsRebalance
              ? "bg-amber-500/20 text-amber-400"
              : "bg-emerald-500/20 text-emerald-400"
          }`}
        >
          {needsRebalance ? "Needs Rebalance" : "In Range"}
        </span>
      </div>

      {/* Range visualization */}
      <div className="mb-6">
        <div className="mb-2 flex justify-between text-xs text-gray-400">
          <span>${priceLower.toFixed(2)}</span>
          <span>Current Range</span>
          <span>${priceUpper.toFixed(2)}</span>
        </div>
        <div className="relative h-3 overflow-hidden rounded-full bg-white/10">
          <div
            className="absolute inset-y-0 rounded-full bg-gradient-to-r from-emerald-500 to-blue-500"
            style={{
              left: "10%",
              right: "10%",
            }}
          />
          {/* Current price indicator */}
          <div
            className="absolute inset-y-0 w-0.5 bg-white"
            style={{ left: "50%" }}
          />
        </div>
      </div>

      {/* Stats */}
      <div className="mb-6 grid grid-cols-2 gap-4">
        <div className="rounded-lg bg-white/5 p-3">
          <p className="text-xs text-gray-400">Deposited</p>
          <p className="text-lg font-semibold text-white">
            ${Number(depositedUSDC).toLocaleString()}
          </p>
        </div>
        <div className="rounded-lg bg-white/5 p-3">
          <p className="text-xs text-gray-400">Since</p>
          <p className="text-lg font-semibold text-white">{depositDate}</p>
        </div>
        <div className="rounded-lg bg-white/5 p-3">
          <p className="text-xs text-gray-400">Tick Range</p>
          <p className="text-sm font-mono text-white">
            {tickLower} → {tickUpper}
          </p>
        </div>
        <div className="rounded-lg bg-white/5 p-3">
          <p className="text-xs text-gray-400">Width</p>
          <p className="text-lg font-semibold text-white">
            {rangeWidth} ticks
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        {needsRebalance && (
          <button
            onClick={handleRebalance}
            disabled={isRebalancing || isWaitingRebalance}
            className="flex-1 rounded-xl bg-amber-500 px-4 py-3 font-semibold text-black transition hover:bg-amber-400 disabled:opacity-50"
          >
            {isRebalancing || isWaitingRebalance
              ? "Rebalancing..."
              : "Rebalance"}
          </button>
        )}
        <button
          onClick={handleWithdraw}
          disabled={isWithdrawing || isWaitingWithdraw}
          className="flex-1 rounded-xl border border-red-500/50 px-4 py-3 font-semibold text-red-400 transition hover:bg-red-500/10 disabled:opacity-50"
        >
          {isWithdrawing || isWaitingWithdraw ? "Withdrawing..." : "Withdraw"}
        </button>
      </div>
    </div>
  );
}
