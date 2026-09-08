"use client";

import { PrivyProvider, type PrivyClientConfig } from "@privy-io/react-auth";
import type { ReactNode } from "react";
import Link from "next/link";
import { AuthScreen } from "./auth-screen";
import { ETHEREUM_CHAIN_ID, ETHEREUM_RPC_URL } from "../../../services/ethereum";

const sepolia = {
  id: ETHEREUM_CHAIN_ID,
  name: "Ethereum Sepolia",
  nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [ETHEREUM_RPC_URL] } },
  blockExplorers: { default: { name: "Etherscan", url: "https://sepolia.etherscan.io" } },
  testnet: true,
};

const config: PrivyClientConfig = {
  loginMethods: ["email"],
  defaultChain: sepolia,
  supportedChains: [sepolia],
  appearance: {
    theme: "light",
    accentColor: "#7048D8",
    logo: "/snitch-logo.png",
    landingHeader: "Sign in to Snitch",
    loginMessage: "Your company workspace, in one place.",
    walletChainType: "ethereum-only",
  },
  // Sign-in is separate from provisioning a company treasury wallet.
  embeddedWallets: { ethereum: { createOnLogin: "off" }, solana: { createOnLogin: "off" } },
};

export function SnitchAuthProvider({ appId, children }: { appId?: string; children: ReactNode }) {
  if (!appId) return <AuthScreen title="Sign-in is being configured." description="Please try again shortly. The public workspace preview is still available."><Link href="/?demo=1" className="snitch-auth__button">Explore the workspace</Link></AuthScreen>;
  return <PrivyProvider appId={appId} config={config}>{children}</PrivyProvider>;
}
