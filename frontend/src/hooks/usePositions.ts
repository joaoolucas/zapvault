"use client";

import { useAccount, useReadContract } from "wagmi";
import { base } from "wagmi/chains";
import { ADDRESSES, HOOK_ABI } from "@/lib/constants";

export interface Position {
  tickLower: number;
  tickUpper: number;
  liquidity: bigint;
  depositedUSDC: bigint;
  depositTimestamp: bigint;
  salt: `0x${string}`;
}

export function usePosition() {
  const { address } = useAccount();

  const { data: position, refetch: refetchPosition } = useReadContract({
    address: ADDRESSES.HOOK,
    abi: HOOK_ABI,
    functionName: "getPosition",
    args: address ? [address] : undefined,
    chainId: base.id,
    query: { enabled: !!address },
  });

  const { data: needsRebalance, refetch: refetchRebalance } = useReadContract({
    address: ADDRESSES.HOOK,
    abi: HOOK_ABI,
    functionName: "needsRebalance",
    args: address ? [address] : undefined,
    chainId: base.id,
    query: { enabled: !!address },
  });

  const { data: config } = useReadContract({
    address: ADDRESSES.HOOK,
    abi: HOOK_ABI,
    functionName: "getConfig",
    args: address ? [address] : undefined,
    chainId: base.id,
    query: { enabled: !!address },
  });

  const hasPosition = position ? (position as Position).liquidity > 0n : false;

  return {
    position: position as Position | undefined,
    needsRebalance: needsRebalance as boolean | undefined,
    config,
    hasPosition,
    refetch: () => {
      refetchPosition();
      refetchRebalance();
    },
  };
}
