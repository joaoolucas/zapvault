"use client";

import { useState, useEffect } from "react";
import { DEFAULTS } from "@/lib/constants";

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
        const res = await fetch("/api/pool-apr");
        if (!res.ok) throw new Error("API error");

        const data = await res.json();
        const { feeTier, tvl, volume24h } = data;

        if (tvl > 0 && !cancelled) {
          const baseApr = (volume24h * (feeTier / 1_000_000) / tvl) * 365 * 100;
          setPoolApr(Math.round(baseApr * 10) / 10);
        }
      } catch {
        // Silently fail — shows "—"
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
