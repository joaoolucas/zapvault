"use client";

import { useAccount, useReadContract, useWriteContract } from "wagmi";
import { normalize } from "viem/ens";
import { mainnet } from "wagmi/chains";
import { ENS_KEYS, DEFAULTS } from "@/lib/constants";

const ENS_PUBLIC_RESOLVER = "0x231b0Ee14048e9dCcD1d247744d114a4EB5E8E63" as const;

const RESOLVER_ABI = [
  {
    type: "function",
    name: "setText",
    inputs: [
      { name: "node", type: "bytes32" },
      { name: "key", type: "string" },
      { name: "value", type: "string" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;

export interface VaultConfig {
  rangeWidth: number;
  rebalanceThreshold: number;
  slippage: number;
}

export function useENSConfig() {
  const { address } = useAccount();

  // Read ENS name for connected address
  const { data: ensName } = useReadContract({
    address: undefined, // Uses default ENS registry
    abi: [] as const,
    functionName: undefined as never,
    chainId: mainnet.id,
    query: { enabled: false }, // Disabled - we'll use wagmi's useEnsName instead
  });

  // For now, return defaults since ENS reads require useEnsName/useEnsText from wagmi
  // which need to be called at the component level
  const config: VaultConfig = {
    rangeWidth: DEFAULTS.RANGE_WIDTH,
    rebalanceThreshold: DEFAULTS.REBALANCE_THRESHOLD,
    slippage: DEFAULTS.SLIPPAGE,
  };

  const { writeContract, isPending: isSaving } = useWriteContract();

  const saveConfig = async (
    ensNode: `0x${string}`,
    key: string,
    value: string
  ) => {
    writeContract({
      address: ENS_PUBLIC_RESOLVER,
      abi: RESOLVER_ABI,
      functionName: "setText",
      args: [ensNode, key, value],
      chainId: mainnet.id,
    });
  };

  return {
    config,
    ensName: ensName as string | undefined,
    saveConfig,
    isSaving,
    isConnected: !!address,
  };
}

export function parseENSConfig(
  range?: string | null,
  rebalance?: string | null,
  slippage?: string | null
): VaultConfig {
  return {
    rangeWidth: range ? parseInt(range) : DEFAULTS.RANGE_WIDTH,
    rebalanceThreshold: rebalance
      ? parseInt(rebalance)
      : DEFAULTS.REBALANCE_THRESHOLD,
    slippage: slippage ? parseInt(slippage) : DEFAULTS.SLIPPAGE,
  };
}
