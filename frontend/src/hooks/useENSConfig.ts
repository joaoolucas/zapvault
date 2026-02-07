"use client";

import { useAccount, useEnsName, useEnsText } from "wagmi";
import { mainnet } from "wagmi/chains";
import { namehash, normalize } from "viem/ens";
import { ENS_KEYS, DEFAULTS } from "@/lib/constants";

export interface VaultConfig {
  rangeWidth: number;
  rebalanceThreshold: number;
  slippage: number;
}

export function useENSConfig() {
  const { address } = useAccount();

  const { data: ensName } = useEnsName({
    address,
    chainId: mainnet.id,
  });

  const normalizedName = ensName ? normalize(ensName) : undefined;

  const { data: ensRange } = useEnsText({
    name: normalizedName,
    key: ENS_KEYS.RANGE,
    chainId: mainnet.id,
    query: { enabled: !!normalizedName },
  });

  const { data: ensRebalance } = useEnsText({
    name: normalizedName,
    key: ENS_KEYS.REBALANCE,
    chainId: mainnet.id,
    query: { enabled: !!normalizedName },
  });

  const { data: ensSlippage } = useEnsText({
    name: normalizedName,
    key: ENS_KEYS.SLIPPAGE,
    chainId: mainnet.id,
    query: { enabled: !!normalizedName },
  });

  const hasENS = !!ensName;
  const hasENSConfig = !!(ensRange || ensRebalance || ensSlippage);

  const config: VaultConfig = {
    rangeWidth: ensRange ? parseInt(ensRange) || DEFAULTS.RANGE_WIDTH : DEFAULTS.RANGE_WIDTH,
    rebalanceThreshold: ensRebalance ? parseInt(ensRebalance) || DEFAULTS.REBALANCE_THRESHOLD : DEFAULTS.REBALANCE_THRESHOLD,
    slippage: ensSlippage ? parseInt(ensSlippage) || DEFAULTS.SLIPPAGE : DEFAULTS.SLIPPAGE,
  };

  const ensNode = ensName ? namehash(ensName) : undefined;

  return {
    config,
    ensName: ensName ?? undefined,
    ensNode,
    hasENS,
    hasENSConfig,
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
    rebalanceThreshold: rebalance ? parseInt(rebalance) : DEFAULTS.REBALANCE_THRESHOLD,
    slippage: slippage ? parseInt(slippage) : DEFAULTS.SLIPPAGE,
  };
}
