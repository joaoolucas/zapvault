"use client";

import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { base, mainnet, arbitrum, polygon, optimism, avalanche, scroll, linea, zkSync, gnosis } from "wagmi/chains";
import { http } from "wagmi";

const baseRpc = process.env.NEXT_PUBLIC_BASE_RPC_URL;
const mainnetRpc = process.env.NEXT_PUBLIC_MAINNET_RPC_URL;

export const config = getDefaultConfig({
  appName: "ZapVault",
  projectId: process.env.NEXT_PUBLIC_WC_PROJECT_ID ?? "YOUR_PROJECT_ID",
  chains: [base, mainnet, arbitrum, polygon, optimism, avalanche, scroll, linea, zkSync, gnosis],
  transports: {
    [base.id]: http(baseRpc),
    [mainnet.id]: http(mainnetRpc),
    [arbitrum.id]: http("https://arb1.arbitrum.io/rpc"),
    [polygon.id]: http("https://polygon.llamarpc.com"),
    [optimism.id]: http("https://mainnet.optimism.io"),
    [avalanche.id]: http("https://api.avax.network/ext/bc/C/rpc"),
    [scroll.id]: http("https://rpc.scroll.io"),
    [linea.id]: http("https://rpc.linea.build"),
    [zkSync.id]: http("https://mainnet.era.zksync.io"),
    [gnosis.id]: http("https://rpc.gnosischain.com"),
  },
  ssr: true,
});
