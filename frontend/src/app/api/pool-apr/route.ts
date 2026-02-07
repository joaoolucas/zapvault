import { NextResponse } from "next/server";

const UNISWAP_GATEWAY = "https://interface.gateway.uniswap.org/v1/graphql";
const V4_POOL_ID =
  "0x96d4b53a38337a5733179751781178a2613306063c511b78cd02684739288c0a";

const QUERY = `{
  v4Pool(chain: BASE, poolId: "${V4_POOL_ID}") {
    feeTier
    totalLiquidity { value }
    cumulativeVolume(duration: DAY) { value }
  }
}`;

export async function GET() {
  try {
    const res = await fetch(UNISWAP_GATEWAY, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://app.uniswap.org",
      },
      body: JSON.stringify({ query: QUERY }),
      next: { revalidate: 300 }, // cache 5 min
    });

    const json = await res.json();
    const pool = json?.data?.v4Pool;

    if (!pool) {
      return NextResponse.json({ error: "Pool not found" }, { status: 404 });
    }

    return NextResponse.json({
      feeTier: pool.feeTier,
      tvl: pool.totalLiquidity.value,
      volume24h: pool.cumulativeVolume.value,
    });
  } catch {
    return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
  }
}
