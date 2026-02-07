"use client";

import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { base, mainnet, arbitrum, polygon, optimism, avalanche, bsc, scroll, linea, zkSync, gnosis, fantom } from "wagmi/chains";

export const config = getDefaultConfig({
  appName: "ZapVault",
  projectId: process.env.NEXT_PUBLIC_WC_PROJECT_ID ?? "YOUR_PROJECT_ID",
  chains: [base, mainnet, arbitrum, polygon, optimism, avalanche, bsc, scroll, linea, zkSync, gnosis, fantom],
  ssr: true,
});
