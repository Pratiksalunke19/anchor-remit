import { http } from "wagmi";
import { defineChain } from "viem";
import { getDefaultConfig } from "@rainbow-me/rainbowkit";

export const mezoMatsnet = defineChain({
  id: Number(import.meta.env.VITE_CHAIN_ID || 31611),
  name: "Mezo Matsnet",
  nativeCurrency: { name: "Bitcoin", symbol: "BTC", decimals: 18 },
  rpcUrls: {
    default: { http: [import.meta.env.VITE_MEZO_RPC || "https://rpc.test.mezo.org"] },
    public: { http: [import.meta.env.VITE_MEZO_RPC || "https://rpc.test.mezo.org"] },
  },
  blockExplorers: {
    default: { name: "Mezo Explorer", url: "https://explorer.test.mezo.org" },
  },
  testnet: true,
});

export const wagmiConfig = getDefaultConfig({
  appName: "Anchor Remit",
  projectId: import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || "anchor-remit-dev",
  chains: [mezoMatsnet],
  transports: {
    [mezoMatsnet.id]: http(),
  },
  ssr: false,
});

export const contractAddresses = {
  remittanceVault: (import.meta.env.VITE_REMITTANCE_VAULT || "0x0000000000000000000000000000000000000000") as `0x${string}`,
  insurancePool: (import.meta.env.VITE_INSURANCE_POOL || "0x0000000000000000000000000000000000000000") as `0x${string}`,
  musd: (import.meta.env.VITE_MUSD_TOKEN || "0x0000000000000000000000000000000000000000") as `0x${string}`,
  btc: (import.meta.env.VITE_BTC_TOKEN || "0x0000000000000000000000000000000000000000") as `0x${string}`,
  mezoVault: (import.meta.env.VITE_MEZO_VAULT || "0x0000000000000000000000000000000000000000") as `0x${string}`,
  familyCredit: (import.meta.env.VITE_FAMILY_CREDIT || "0x0000000000000000000000000000000000000000") as `0x${string}`,
};

export const backendUrl = import.meta.env.VITE_BACKEND_URL || "http://localhost:3001";
