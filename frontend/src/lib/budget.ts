// Budget & expense categorization. Pure client-side persistence (localStorage).
// Tax-purpose expense report builds on top of CashOutRecord history.

import { CashOutRecord, formatFiat, loadHistory } from "./payouts";

export type ExpenseCategory =
  | "Family Support"
  | "Housing"
  | "Education"
  | "Medical"
  | "Food & Groceries"
  | "Utilities"
  | "Transport"
  | "Business"
  | "Savings"
  | "Other";

export const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  "Family Support",
  "Housing",
  "Education",
  "Medical",
  "Food & Groceries",
  "Utilities",
  "Transport",
  "Business",
  "Savings",
  "Other",
];

export const CATEGORY_COLOR: Record<ExpenseCategory, string> = {
  "Family Support": "#f5b342",
  Housing: "#7aa2f7",
  Education: "#9b8cff",
  Medical: "#ef6f6c",
  "Food & Groceries": "#7ed3a4",
  Utilities: "#5fc7d1",
  Transport: "#f59e0b",
  Business: "#c4a55b",
  Savings: "#55b896",
  Other: "#8b8a85",
};

const CAT_KEY = "anchor-remit:expense-categories:v1";
const BUDGET_KEY = "anchor-remit:budget-config:v1";

export type BudgetConfig = {
  /** Monthly budget cap in MUSD. 0 disables the cap. */
  monthlyMusd: number;
  defaultCategory: ExpenseCategory;
};

const DEFAULT_BUDGET: BudgetConfig = {
  monthlyMusd: 0,
  defaultCategory: "Other",
};

export function loadBudgetConfig(): BudgetConfig {
  if (typeof window === "undefined") return DEFAULT_BUDGET;
  try {
    const raw = window.localStorage.getItem(BUDGET_KEY);
    if (!raw) return DEFAULT_BUDGET;
    return { ...DEFAULT_BUDGET, ...(JSON.parse(raw) as BudgetConfig) };
  } catch {
    return DEFAULT_BUDGET;
  }
}

export function saveBudgetConfig(cfg: BudgetConfig) {
  try {
    window.localStorage.setItem(BUDGET_KEY, JSON.stringify(cfg));
  } catch {
    /* ignore */
  }
}

export function loadCategoryMap(): Record<string, ExpenseCategory> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(CAT_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, ExpenseCategory>;
  } catch {
    return {};
  }
}

export function saveCategoryMap(map: Record<string, ExpenseCategory>) {
  try {
    window.localStorage.setItem(CAT_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

export function setRecordCategory(id: string, cat: ExpenseCategory) {
  const map = loadCategoryMap();
  map[id] = cat;
  saveCategoryMap(map);
}

export function categoryFor(
  rec: CashOutRecord,
  map: Record<string, ExpenseCategory>,
  fallback: ExpenseCategory = "Other",
): ExpenseCategory {
  return map[rec.id] ?? fallback;
}

export type MonthBucket = {
  /** YYYY-MM */
  key: string;
  label: string;
  totalMusd: number;
  recordCount: number;
};

export type BudgetSummary = {
  totalMusd: number;
  recordCount: number;
  thisMonthMusd: number;
  byCategory: { category: ExpenseCategory; musd: number; pct: number }[];
  byMonth: MonthBucket[];
};

export function summarize(
  records: CashOutRecord[] = loadHistory(),
  map: Record<string, ExpenseCategory> = loadCategoryMap(),
  fallback: ExpenseCategory = "Other",
): BudgetSummary {
  const totalMusd = records.reduce((s, r) => s + r.musdAmount, 0);
  const now = new Date();
  const ymNow = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const catMap = new Map<ExpenseCategory, number>();
  const monMap = new Map<string, number>();
  let thisMonthMusd = 0;

  for (const r of records) {
    const c = categoryFor(r, map, fallback);
    catMap.set(c, (catMap.get(c) ?? 0) + r.musdAmount);
    const d = new Date(r.createdAt);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    monMap.set(ym, (monMap.get(ym) ?? 0) + r.musdAmount);
    if (ym === ymNow) thisMonthMusd += r.musdAmount;
  }

  const byCategory = Array.from(catMap.entries())
    .map(([category, musd]) => ({
      category,
      musd,
      pct: totalMusd > 0 ? (musd / totalMusd) * 100 : 0,
    }))
    .sort((a, b) => b.musd - a.musd);

  const byMonth = Array.from(monMap.entries())
    .map(([key, musd]) => {
      const [y, m] = key.split("-");
      const label = new Date(Number(y), Number(m) - 1, 1).toLocaleDateString(
        undefined,
        { month: "short", year: "numeric" },
      );
      return {
        key,
        label,
        totalMusd: musd,
        recordCount: records.filter((r) => {
          const d = new Date(r.createdAt);
          const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
          return k === key;
        }).length,
      };
    })
    .sort((a, b) => (a.key < b.key ? 1 : -1));

  return {
    totalMusd,
    recordCount: records.length,
    thisMonthMusd,
    byCategory,
    byMonth,
  };
}

/**
 * Build a printable HTML expense report and open it in a new window. The
 * user can then "Save as PDF" from the browser print dialog. This avoids
 * pulling in a heavy PDF library.
 */
export function exportExpensePdf(opts: {
  walletAddress?: string;
  displayName?: string;
}) {
  const records = loadHistory();
  const map = loadCategoryMap();
  const summary = summarize(records, map);
  const generated = new Date().toLocaleString();

  const rows = records
    .slice()
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((r) => {
      const cat = categoryFor(r, map);
      return `
        <tr>
          <td>${new Date(r.createdAt).toLocaleDateString()}</td>
          <td>${cat}</td>
          <td>${escapeHtml(r.providerName)} (${r.rail})</td>
          <td>${escapeHtml(r.txnRef)}</td>
          <td class="num">${r.musdAmount.toFixed(2)}</td>
          <td class="num">${formatFiat(r.netFiat, r.currency)}</td>
          <td>${r.status}</td>
        </tr>`;
    })
    .join("");

  const catRows = summary.byCategory
    .map(
      (c) => `
        <tr>
          <td>${c.category}</td>
          <td class="num">${c.musd.toFixed(2)}</td>
          <td class="num">${c.pct.toFixed(1)}%</td>
        </tr>`,
    )
    .join("");

  const html = `<!doctype html>
<html><head><meta charset="utf-8" />
<title>Anchor Remit · Expense Report</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color:#1a1a1a; padding:32px; max-width:880px; margin:auto; }
  h1 { margin:0 0 4px; font-size:22px; }
  h2 { margin:24px 0 8px; font-size:15px; text-transform:uppercase; letter-spacing:0.08em; color:#555; }
  .meta { color:#666; font-size:12px; margin-bottom:16px; }
  table { width:100%; border-collapse:collapse; font-size:12px; }
  th, td { text-align:left; padding:6px 8px; border-bottom:1px solid #e5e5e5; }
  th { background:#f4f4f2; font-weight:600; text-transform:uppercase; font-size:10px; letter-spacing:0.06em; color:#555; }
  td.num, th.num { text-align:right; font-variant-numeric: tabular-nums; }
  .totals { margin-top:12px; display:flex; gap:24px; flex-wrap:wrap; }
  .totals div { background:#f7f5ef; padding:10px 14px; border-radius:8px; }
  .totals strong { display:block; font-size:18px; }
  .totals span { font-size:11px; color:#666; text-transform:uppercase; letter-spacing:0.06em; }
  footer { margin-top:32px; font-size:10px; color:#888; }
  @media print { body { padding:0; } .no-print { display:none; } }
  .no-print { margin: 16px 0; }
  .no-print button { padding:8px 14px; font-size:12px; cursor:pointer; }
</style>
</head><body>
  <div class="no-print"><button onclick="window.print()">Print / Save as PDF</button></div>
  <h1>Anchor Remit · Expense Report</h1>
  <div class="meta">
    Generated ${generated}
    ${opts.displayName ? ` · ${escapeHtml(opts.displayName)}` : ""}
    ${opts.walletAddress ? ` · ${escapeHtml(opts.walletAddress)}` : ""}
  </div>
  <div class="totals">
    <div><span>Total transactions</span><strong>${summary.recordCount}</strong></div>
    <div><span>Total MUSD</span><strong>${summary.totalMusd.toFixed(2)}</strong></div>
    <div><span>This month MUSD</span><strong>${summary.thisMonthMusd.toFixed(2)}</strong></div>
  </div>

  <h2>By category</h2>
  <table>
    <thead><tr><th>Category</th><th class="num">MUSD</th><th class="num">Share</th></tr></thead>
    <tbody>${catRows || `<tr><td colspan="3" style="color:#888">No data</td></tr>`}</tbody>
  </table>

  <h2>Itemised transactions</h2>
  <table>
    <thead><tr>
      <th>Date</th><th>Category</th><th>Provider</th><th>Reference</th>
      <th class="num">MUSD</th><th class="num">Fiat received</th><th>Status</th>
    </tr></thead>
    <tbody>${rows || `<tr><td colspan="7" style="color:#888">No transactions yet</td></tr>`}</tbody>
  </table>

  <footer>
    Anchor Remit — Bitcoin-backed remittances on Mezo. This report is a
    self-generated summary from on-device cash-out history. Verify against
    on-chain records before filing.
  </footer>
</body></html>`;

  const w = window.open("", "_blank", "width=900,height=900");
  if (!w) {
    alert("Pop-up blocked. Allow pop-ups to export the expense report.");
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === "&"
      ? "&amp;"
      : c === "<"
        ? "&lt;"
        : c === ">"
          ? "&gt;"
          : c === '"'
            ? "&quot;"
            : "&#39;",
  );
}
