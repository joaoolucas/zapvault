"use client";

import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { base, mainnet, arbitrum, polygon, optimism, avalanche, bsc, scroll, linea, zkSync, gnosis, fantom } from "wagmi/chains";
import { http } from "wagmi";

const baseRpc = process.env.NEXT_PUBLIC_BASE_RPC_URL;

export const config = getDefaultConfig({
  appName: "ZapVault",
  projectId: process.env.NEXT_PUBLIC_WC_PROJECT_ID ?? "YOUR_PROJECT_ID",
  chains: [base, mainnet, arbitrum, polygon, optimism, avalanche, bsc, scroll, linea, zkSync, gnosis, fantom],
  transports: baseRpc ? { [base.id]: http(baseRpc) } : undefined,
  ssr: true,
});
