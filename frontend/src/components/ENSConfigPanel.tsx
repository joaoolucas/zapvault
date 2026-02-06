"use client";

import { useState } from "react";
import { useAccount, useEnsName, useEnsText } from "wagmi";
import { mainnet } from "wagmi/chains";
import { ENS_KEYS, DEFAULTS } from "@/lib/constants";
import { parseENSConfig, type VaultConfig } from "@/hooks/useENSConfig";

interface ENSConfigPanelProps {
  onConfigChange: (config: VaultConfig) => void;
  config: VaultConfig;
}

export function ENSConfigPanel({ onConfigChange, config }: ENSConfigPanelProps) {
  const { address } = useAccount();
  const { data: ensName } = useEnsName({
    address,
    chainId: mainnet.id,
  });

  const { data: ensRange } = useEnsText({
    name: ensName ?? undefined,
    key: ENS_KEYS.RANGE,
    chainId: mainnet.id,
    query: { enabled: !!ensName },
  });

  const { data: ensRebalance } = useEnsText({
    name: ensName ?? undefined,
    key: ENS_KEYS.REBALANCE,
    chainId: mainnet.id,
    query: { enabled: !!ensName },
  });

  const { data: ensSlippage } = useEnsText({
    name: ensName ?? undefined,
    key: ENS_KEYS.SLIPPAGE,
    chainId: mainnet.id,
    query: { enabled: !!ensName },
  });

  const ensConfig = parseENSConfig(ensRange, ensRebalance, ensSlippage);
  const hasENS = !!ensName;

  const [useENS, setUseENS] = useState(true);

  const activeConfig = useENS && hasENS ? ensConfig : config;

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white">Strategy Config</h3>
        {hasENS && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-emerald-400">{ensName}</span>
            <button
              onClick={() => setUseENS(!useENS)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                useENS
                  ? "bg-emerald-500/20 text-emerald-400"
                  : "bg-white/10 text-gray-400"
              }`}
            >
              {useENS ? "ENS Active" : "Manual"}
            </button>
          </div>
        )}
      </div>

      {!hasENS && (
        <p className="mb-4 text-sm text-gray-400">
          No ENS name detected. Set text records on your ENS name to configure
          your strategy automatically, or adjust manually below.
        </p>
      )}

      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-sm text-gray-400">
            Range Width (ticks)
          </label>
          <input
            type="number"
            value={activeConfig.rangeWidth}
            onChange={(e) =>
              onConfigChange({ ...config, rangeWidth: parseInt(e.target.value) || DEFAULTS.RANGE_WIDTH })
            }
            disabled={useENS && hasENS}
            className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-white placeholder-gray-500 disabled:opacity-50"
            placeholder="1200"
          />
          <p className="mt-1 text-xs text-gray-500">
            Total tick range. 1200 = +/- 600 ticks (~6% range)
          </p>
        </div>

        <div>
          <label className="mb-1 block text-sm text-gray-400">
            Rebalance Threshold (bps)
          </label>
          <input
            type="number"
            value={activeConfig.rebalanceThreshold}
            onChange={(e) =>
              onConfigChange({
                ...config,
                rebalanceThreshold: parseInt(e.target.value) || DEFAULTS.REBALANCE_THRESHOLD,
              })
            }
            disabled={useENS && hasENS}
            className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-white placeholder-gray-500 disabled:opacity-50"
            placeholder="500"
          />
          <p className="mt-1 text-xs text-gray-500">
            500 = 5% price deviation triggers rebalance
          </p>
        </div>

        <div>
          <label className="mb-1 block text-sm text-gray-400">
            Max Slippage (bps)
          </label>
          <input
            type="number"
            value={activeConfig.slippage}
            onChange={(e) =>
              onConfigChange({ ...config, slippage: parseInt(e.target.value) || DEFAULTS.SLIPPAGE })
            }
            disabled={useENS && hasENS}
            className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-white placeholder-gray-500 disabled:opacity-50"
            placeholder="100"
          />
          <p className="mt-1 text-xs text-gray-500">
            100 = 1% max slippage on swaps
          </p>
        </div>
      </div>

      {hasENS && useENS && (
        <div className="mt-4 rounded-lg bg-emerald-500/10 p-3">
          <p className="text-xs text-emerald-400">
            Using ENS text records from {ensName}. Edit records on your ENS
            name to update strategy configuration.
          </p>
          <p className="mt-1 text-xs text-gray-500">
            Keys: {ENS_KEYS.RANGE}, {ENS_KEYS.REBALANCE}, {ENS_KEYS.SLIPPAGE}
          </p>
        </div>
      )}
    </div>
  );
}
