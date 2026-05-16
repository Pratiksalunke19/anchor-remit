import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  Banknote,
  Filter as FilterIcon,
  Search,
  Trash2,
  Inbox,
} from "lucide-react";
import {
  CashOutRecord,
  formatFiat,
  loadHistory,
  saveHistory,
} from "../lib/payouts";

type Filter = "ALL" | "PROCESSING" | "SETTLED" | "FAILED";

export default function History() {
  const [rows, setRows] = useState<CashOutRecord[]>([]);
  const [filter, setFilter] = useState<Filter>("ALL");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    setRows(loadHistory());
    const onStorage = () => setRows(loadHistory());
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter !== "ALL" && r.status !== filter) return false;
      if (q.trim()) {
        const hay =
          `${r.providerName} ${r.txnRef} ${r.bankRef} ${r.orderId}`.toLowerCase();
        if (!hay.includes(q.toLowerCase())) return false;
      }
      return true;
    });
  }, [rows, filter, q]);

  const totals = useMemo(() => {
    const totalMusd = rows.reduce((s, r) => s + r.musdAmount, 0);
    const settled = rows.filter((r) => r.status === "SETTLED").length;
    return { totalMusd, settled, count: rows.length };
  }, [rows]);

  function clearAll() {
    if (!confirm("Clear all simulated cash-out history?")) return;
    saveHistory([]);
    setRows([]);
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <span className="eyebrow">Recipient activity</span>
          <h1 className="font-display text-4xl text-ivory mt-2">
            Transaction history
          </h1>
          <p className="text-ivory/60 mt-2 max-w-xl">
            Every MUSD claim cashed-out through the partner payout network.
          </p>
        </div>
        {rows.length > 0 && (
          <button className="btn-ghost text-xs" onClick={clearAll}>
            <Trash2 className="w-3.5 h-3.5" /> Clear
          </button>
        )}
      </div>

      <div className="grid sm:grid-cols-3 gap-3">
        <Stat label="Cash-outs" value={totals.count.toString()} />
        <Stat
          label="MUSD converted"
          value={totals.totalMusd.toLocaleString("en-US", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        />
        <Stat label="Settled" value={`${totals.settled} / ${totals.count}`} />
      </div>

      <div className="card space-y-4">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ivory/40" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search ref, provider, order…"
              className="input pl-9"
            />
          </div>
          <div className="flex items-center gap-1 bg-charcoal-900/60 border border-ivory/10 rounded-full p-1">
            <FilterIcon className="w-3.5 h-3.5 text-ivory/40 ml-2" />
            {(["ALL", "PROCESSING", "SETTLED", "FAILED"] as Filter[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition
                  ${
                    filter === f
                      ? "bg-amber-sheen text-charcoal-900"
                      : "text-ivory/60 hover:text-ivory"
                  }`}
              >
                {f.charAt(0) + f.slice(1).toLowerCase()}
              </button>
            ))}
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="py-16 text-center text-ivory/55">
            <Inbox className="w-10 h-10 mx-auto mb-3 text-ivory/30" />
            <p className="font-medium text-ivory/75">No cash-outs yet</p>
            <p className="text-sm mt-1">
              When you claim MUSD and convert to fiat, your receipts appear here.
            </p>
            <Link to="/" className="btn-soft mt-4 inline-flex">
              Go to overview <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        ) : (
          <ul className="divide-y divide-ivory/10">
            {filtered.map((r) => (
              <motion.li
                key={r.id}
                layout
                className="py-3"
              >
                <button
                  className="w-full flex items-center gap-3 text-left"
                  onClick={() => setOpen(open === r.id ? null : r.id)}
                >
                  <span className="text-2xl shrink-0">{r.providerFlag}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium truncate">
                        {r.providerName}
                      </span>
                      <StatusBadge status={r.status} />
                      <span className="pill-muted">{r.rail}</span>
                    </div>
                    <div className="text-xs text-ivory/55 mt-0.5 font-mono truncate">
                      {r.txnRef} · {new Date(r.createdAt).toLocaleString()}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-display text-lg text-amber-300">
                      {formatFiat(r.netFiat, r.currency)}
                    </div>
                    <div className="text-[11px] text-ivory/55">
                      from {r.musdAmount.toFixed(2)} MUSD
                    </div>
                  </div>
                </button>

                {open === r.id && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mt-3 rounded-xl bg-charcoal-900/60 border border-ivory/10 p-4 grid sm:grid-cols-2 gap-3 text-sm"
                  >
                    <Detail k="Order" v={`${r.orderId.slice(0, 10)}…${r.orderId.slice(-6)}`} mono />
                    <Detail k="Wallet" v={`${r.walletAddress.slice(0, 6)}…${r.walletAddress.slice(-4)}`} mono />
                    <Detail
                      k="Rate"
                      v={`1 MUSD = ${r.rate.toFixed(r.currency === "USD" ? 4 : 2)} ${r.currency}`}
                    />
                    <Detail k="Fee" v={`${(r.feePct * 100).toFixed(2)}% · ${formatFiat(r.feeFiat, r.currency)}`} />
                    <Detail k="Gross" v={formatFiat(r.grossFiat, r.currency)} />
                    <Detail k="Net" v={formatFiat(r.netFiat, r.currency)} />
                    <Detail k={`${r.rail} ref`} v={r.bankRef} mono />
                    <Detail k="Settlement" v={r.settlementEta} />
                  </motion.div>
                )}
              </motion.li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card !p-4 flex items-center gap-3">
      <span className="w-9 h-9 rounded-xl bg-amber/10 border border-amber/25 text-amber-300 flex items-center justify-center">
        <Banknote className="w-4 h-4" />
      </span>
      <div>
        <div className="stat-label">{label}</div>
        <div className="font-display text-xl text-ivory">{value}</div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: CashOutRecord["status"] }) {
  if (status === "SETTLED") return <span className="pill-forest">Settled</span>;
  if (status === "FAILED") return <span className="pill-clay">Failed</span>;
  return <span className="pill-amber">Processing</span>;
}

function Detail({
  k,
  v,
  mono,
}: {
  k: string;
  v: string;
  mono?: boolean;
}) {
  return (
    <div className="flex justify-between items-center gap-3">
      <span className="text-ivory/50 text-xs uppercase tracking-wider">{k}</span>
      <span className={mono ? "font-mono text-xs" : "text-sm"}>{v}</span>
    </div>
  );
}
