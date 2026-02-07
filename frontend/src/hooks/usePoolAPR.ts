"use client";

import { useState, useEffect } from "react";

const UNISWAP_GATEWAY = "https://interface.gateway.uniswap.org/v1/graphql";
const V4_POOL_ID = "0x96d4b53a38337a5733179751781178a2613306063c511b78cd02684739288c0a";

const QUERY = `query {
  v4Pool(chain: BASE, poolId: "${V4_POOL_ID}") {
    feeTier
    totalLiquidity { value }
    cumulativeVolume(duration: DAY) { value }
  }
}`;

export function usePoolAPR() {
  const [apr, setApr] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

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
          const annualizedAPR = (volume24h * feeTier / tvl) * 365 * 100;
          if (!cancelled) setApr(Math.round(annualizedAPR * 10) / 10);
        }
      } catch {
        // Silently fail — show nothing instead of fake data
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchAPR();
    return () => { cancelled = true; };
  }, []);

  const formatted = apr !== null ? `${apr.toFixed(1)}%` : "—";

  return { apr, formatted, loading };
}
