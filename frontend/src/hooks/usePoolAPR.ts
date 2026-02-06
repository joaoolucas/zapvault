"use client";

import { useState, useEffect } from "react";

const UNISWAP_GATEWAY = "https://interface.gateway.uniswap.org/v1/graphql";
const ETH_USDC_POOL = "0x6c561b446416e1a00e8e93e221854d6ea4171372";

const QUERY = `query {
  v3Pool(chain: BASE, address: "${ETH_USDC_POOL}") {
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
        const pool = json?.data?.v3Pool;
        if (!pool || cancelled) return;

        const feeTier = pool.feeTier / 1_000_000; // 3000 -> 0.003
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
