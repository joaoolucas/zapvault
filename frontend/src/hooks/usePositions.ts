"use client";

import { useAccount, useReadContract } from "wagmi";
import { base } from "wagmi/chains";
import { ADDRESSES, VAULT_ABI } from "@/lib/constants";

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
    address: ADDRESSES.VAULT,
    abi: VAULT_ABI,
    functionName: "getPosition",
    args: address ? [address] : undefined,
    chainId: base.id,
    query: { enabled: !!address, refetchInterval: 5000 },
  });

  const { data: needsRebalance, refetch: refetchRebalance } = useReadContract({
    address: ADDRESSES.VAULT,
    abi: VAULT_ABI,
    functionName: "needsRebalance",
    args: address ? [address] : undefined,
    chainId: base.id,
    query: { enabled: !!address },
  });

  const { data: config } = useReadContract({
    address: ADDRESSES.VAULT,
    abi: VAULT_ABI,
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
