import "dotenv/config";
import { createPublicClient, createWalletClient, defineChain, http, Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

export const mezoMatsnet = defineChain({
  id: Number(process.env.CHAIN_ID || 31611),
  name: "Mezo Matsnet",
  nativeCurrency: { name: "Bitcoin", symbol: "BTC", decimals: 18 },
  rpcUrls: {
    default: { http: [process.env.MEZO_RPC || "https://rpc.test.mezo.org"] },
    public: { http: [process.env.MEZO_RPC || "https://rpc.test.mezo.org"] },
  },
  blockExplorers: {
    default: { name: "Mezo Explorer", url: "https://explorer.test.mezo.org" },
  },
});

export const publicClient = createPublicClient({
  chain: mezoMatsnet,
  transport: http(),
});

export const keeperAccount = process.env.KEEPER_PRIVATE_KEY
  ? privateKeyToAccount(process.env.KEEPER_PRIVATE_KEY as Hex)
  : undefined;

export const walletClient = keeperAccount
  ? createWalletClient({
      chain: mezoMatsnet,
      transport: http(),
      account: keeperAccount,
    })
  : undefined;

export const addresses = {
  remittanceVault: (process.env.REMITTANCE_VAULT || "") as `0x${string}`,
  insurancePool: (process.env.INSURANCE_POOL || "") as `0x${string}`,
  mezoVault: (process.env.MEZO_VAULT || "") as `0x${string}`,
  musd: (process.env.MUSD_TOKEN || "") as `0x${string}`,
  btc: (process.env.BTC_TOKEN || "") as `0x${string}`,
};

export const serverConfig = {
  port: Number(process.env.PORT || 3001),
  corsOrigin: process.env.CORS_ORIGIN || "http://localhost:5173",
  sqlitePath: process.env.SQLITE_PATH || "./data/anchor-remit.db",
};

export const twilioConfig = {
  sid: process.env.TWILIO_SID || "",
  token: process.env.TWILIO_TOKEN || "",
  from: process.env.TWILIO_FROM || "",
};

export const transakConfig = {
  apiKey: process.env.TRANSAK_API_KEY || "",
  env: (process.env.TRANSAK_ENV || "STAGING").toUpperCase(),
};
