// Mock payout provider network. This is a SIMULATION ONLY — no real banking
// integrations are involved. Each provider exposes the metadata the cash-out
// UI needs to feel like a real settlement rail.

export type PayoutCurrency = "INR" | "USD" | "PHP";

export type PayoutRail = "UPI" | "Bank Transfer" | "Wire" | "GCash";

export type PayoutProvider = {
  id: string;
  name: string;
  region: string;
  flag: string;
  currency: PayoutCurrency;
  rail: PayoutRail;
  /** how many fiat units 1 MUSD buys */
  rate: number;
  /** decimal fee, e.g. 0.004 = 0.4% */
  feePct: number;
  /** human-readable settlement window */
  settlement: string;
  /** liquidity available (in fiat units) */
  liquidity: number;
  /** for UI accent */
  badge?: "fastest" | "best-rate" | "high-liquidity";
  blurb: string;
};

export const PAYOUT_PROVIDERS: PayoutProvider[] = [
  {
    id: "mumbai-lp",
    name: "Mumbai Liquidity Partner",
    region: "Mumbai, IN",
    flag: "🇮🇳",
    currency: "INR",
    rail: "UPI",
    rate: 83.42,
    feePct: 0.004,
    settlement: "Instant · under 30s",
    liquidity: 12_400_000,
    badge: "fastest",
    blurb: "Direct UPI payout via NPCI rails. Trusted by 40k recipients.",
  },
  {
    id: "delhi-otc",
    name: "Delhi OTC Desk",
    region: "Delhi, IN",
    flag: "🇮🇳",
    currency: "INR",
    rail: "Bank Transfer",
    rate: 83.71,
    feePct: 0.0025,
    settlement: "5–10 minutes",
    liquidity: 28_900_000,
    badge: "best-rate",
    blurb: "IMPS / NEFT payout with the tightest spread for amounts > ₹50k.",
  },
  {
    id: "global-usd",
    name: "Global USD Provider",
    region: "Singapore",
    flag: "🌐",
    currency: "USD",
    rail: "Wire",
    rate: 0.998,
    feePct: 0.005,
    settlement: "1–2 hours",
    liquidity: 5_200_000,
    badge: "high-liquidity",
    blurb: "USD wire to any major bank. Ideal for recipients holding USD accounts.",
  },
  {
    id: "ph-cash",
    name: "Philippines Cash Partner",
    region: "Manila, PH",
    flag: "🇵🇭",
    currency: "PHP",
    rail: "GCash",
    rate: 57.18,
    feePct: 0.006,
    settlement: "Instant · under 60s",
    liquidity: 3_800_000,
    blurb: "GCash + Palawan cash pickup across 8,000+ branches nationwide.",
  },
];

export function formatFiat(amount: number, currency: PayoutCurrency): string {
  const symbol = currency === "INR" ? "₹" : currency === "PHP" ? "₱" : "$";
  return `${symbol}${amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatLiquidity(amount: number, currency: PayoutCurrency): string {
  const symbol = currency === "INR" ? "₹" : currency === "PHP" ? "₱" : "$";
  if (amount >= 1_000_000) return `${symbol}${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `${symbol}${(amount / 1_000).toFixed(0)}k`;
  return `${symbol}${amount.toFixed(0)}`;
}

export function quote(provider: PayoutProvider, musd: number) {
  const gross = musd * provider.rate;
  const fee = gross * provider.feePct;
  const net = gross - fee;
  return { gross, fee, net };
}

export function fakeTxnRef(prefix = "AR"): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rnd = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${prefix}-${ts}-${rnd}`;
}

export function fakeBankRef(provider: PayoutProvider): string {
  if (provider.rail === "UPI") {
    const n = Math.floor(100000000000 + Math.random() * 899999999999);
    return `UPI/${n}/ANCHOR`;
  }
  if (provider.rail === "GCash") {
    const n = Math.floor(1000000000 + Math.random() * 8999999999);
    return `GCASH-${n}`;
  }
  if (provider.rail === "Wire") {
    return `FED${Math.floor(1e8 + Math.random() * 9e8)}`;
  }
  return `IMPS${Math.floor(1e10 + Math.random() * 9e10)}`;
}

export function settlementEta(provider: PayoutProvider): string {
  const now = new Date();
  if (provider.rail === "UPI" || provider.rail === "GCash") {
    const t = new Date(now.getTime() + 45 * 1000);
    return t.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  }
  if (provider.rail === "Bank Transfer") {
    const t = new Date(now.getTime() + 7 * 60 * 1000);
    return t.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  const t = new Date(now.getTime() + 90 * 60 * 1000);
  return t.toLocaleString([], { hour: "2-digit", minute: "2-digit", month: "short", day: "numeric" });
}

// ---- Transaction history (localStorage) ----

export type CashOutRecord = {
  id: string;
  txnRef: string;
  bankRef: string;
  orderId: string;
  walletAddress: string;
  musdAmount: number;
  providerId: string;
  providerName: string;
  providerFlag: string;
  rail: PayoutRail;
  currency: PayoutCurrency;
  rate: number;
  feePct: number;
  grossFiat: number;
  feeFiat: number;
  netFiat: number;
  createdAt: number;
  settlementEta: string;
  status: "PROCESSING" | "SETTLED" | "FAILED";
};

const HISTORY_KEY = "anchor-remit:cashout-history:v1";

export function loadHistory(): CashOutRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as CashOutRecord[];
  } catch {
    return [];
  }
}

export function saveHistory(rows: CashOutRecord[]) {
  try {
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(rows));
  } catch {
    /* ignore */
  }
}

export function appendHistory(rec: CashOutRecord) {
  const rows = loadHistory();
  rows.unshift(rec);
  saveHistory(rows.slice(0, 200));
}

export function findProvider(id: string): PayoutProvider | undefined {
  return PAYOUT_PROVIDERS.find((p) => p.id === id);
}
