"use client";

import { useState, useEffect } from "react";
import { DEFAULTS } from "@/lib/constants";

const UNISWAP_GATEWAY = "https://interface.gateway.uniswap.org/v1/graphql";
const V4_POOL_ID = "0x96d4b53a38337a5733179751781178a2613306063c511b78cd02684739288c0a";

const QUERY = `query {
  v4Pool(chain: BASE, poolId: "${V4_POOL_ID}") {
    feeTier
    totalLiquidity { value }
    cumulativeVolume(duration: DAY) { value }
    token0Supply
    token1Supply
  }
}`;

/**
 * Capital efficiency multiplier for concentrated liquidity.
 * A position covering W ticks is ~CE times more capital efficient than full-range.
 * CE = 1 / (1 - 1.0001^(-W/2))
 */
function capitalEfficiency(rangeWidthTicks: number): number {
  const halfWidth = rangeWidthTicks / 2;
  const ratio = Math.pow(1.0001, -halfWidth);
  return 1 / (1 - ratio);
}

export function usePoolAPR(rangeWidth?: number) {
  const [poolApr, setPoolApr] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const width = rangeWidth ?? DEFAULTS.RANGE_WIDTH;

  useEffect(() => {
    let cancelled = false;

    async function fetchAPR() {
      try {
        const res = await fetch(UNISWAP_GATEWAY, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Origin: "https://app.uniswap.org",
          },
          body: JSON.stringify({ query: QUERY }),
        });

        const json = await res.json();
        const pool = json?.data?.v4Pool;
        if (!pool || cancelled) return;

        const feeTier = pool.feeTier / 1_000_000; // 500 -> 0.0005
        const tvl = pool.totalLiquidity.value;
        const volume24h = pool.cumulativeVolume.value;

        if (tvl > 0) {
          const baseApr = (volume24h * feeTier / tvl) * 365 * 100;
          if (!cancelled) setPoolApr(Math.round(baseApr * 10) / 10);
        }
      } catch {
        // Silently fail
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchAPR();
    return () => { cancelled = true; };
  }, []);

  const ce = capitalEfficiency(width);
  const concentratedApr = poolApr !== null ? Math.round(poolApr * ce * 10) / 10 : null;

  const formatted = concentratedApr !== null ? `~${concentratedApr.toFixed(0)}%` : "—";

  return { poolApr, concentratedApr, capitalEfficiency: ce, formatted, loading };
}
