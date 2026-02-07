"use client";

import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { base, mainnet, arbitrum, polygon, optimism, avalanche, bsc, scroll, linea, zkSync, gnosis, fantom } from "wagmi/chains";
import { http } from "wagmi";

const baseRpc = process.env.NEXT_PUBLIC_BASE_RPC_URL;
const mainnetRpc = process.env.NEXT_PUBLIC_MAINNET_RPC_URL;

export const config = getDefaultConfig({
  appName: "ZapVault",
  projectId: process.env.NEXT_PUBLIC_WC_PROJECT_ID ?? "YOUR_PROJECT_ID",
  chains: [base, mainnet, arbitrum, polygon, optimism, avalanche, bsc, scroll, linea, zkSync, gnosis, fantom],
  transports: {
    [base.id]: http(baseRpc),
    [mainnet.id]: http(mainnetRpc),
    [arbitrum.id]: http(),
    [polygon.id]: http(),
    [optimism.id]: http(),
    [avalanche.id]: http(),
    [bsc.id]: http(),
    [scroll.id]: http(),
    [linea.id]: http(),
    [zkSync.id]: http(),
    [gnosis.id]: http(),
    [fantom.id]: http(),
  },
  ssr: true,
});
