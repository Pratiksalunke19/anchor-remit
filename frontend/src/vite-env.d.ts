/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CHAIN_ID: string;
  readonly VITE_MEZO_RPC: string;
  readonly VITE_BACKEND_URL: string;
  readonly VITE_REMITTANCE_VAULT: string;
  readonly VITE_INSURANCE_POOL: string;
  readonly VITE_MUSD_TOKEN: string;
  readonly VITE_BTC_TOKEN: string;
  readonly VITE_WALLETCONNECT_PROJECT_ID: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
