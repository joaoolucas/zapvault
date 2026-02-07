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
    [arbitrum.id]: http("https://arbitrum-one-rpc.publicnode.com"),
    [polygon.id]: http("https://polygon-bor-rpc.publicnode.com"),
    [optimism.id]: http("https://optimism-rpc.publicnode.com"),
    [avalanche.id]: http("https://avalanche-c-chain-rpc.publicnode.com"),
    [scroll.id]: http("https://scroll-rpc.publicnode.com"),
    [linea.id]: http("https://linea-rpc.publicnode.com"),
    [zkSync.id]: http("https://mainnet.era.zksync.io"),
    [gnosis.id]: http("https://gnosis-rpc.publicnode.com"),
  },
  ssr: true,
});
