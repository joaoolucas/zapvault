"use client";

import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { base, mainnet } from "wagmi/chains";

export const config = getDefaultConfig({
  appName: "ZapVault",
  projectId: process.env.NEXT_PUBLIC_WC_PROJECT_ID ?? "YOUR_PROJECT_ID",
  chains: [base, mainnet],
  ssr: true,
});
