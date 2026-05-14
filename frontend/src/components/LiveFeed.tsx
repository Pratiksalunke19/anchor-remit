import { useEffect, useMemo, useState } from "react";
import { formatEther } from "viem";
import { Activity, ArrowRight, Droplet, ShieldCheck } from "lucide-react";
import {
  fetchLiveDashboard,
  goldskyEnabled,
  type ClaimEventRow,
  type GlobalStats,
  type LpPositionRow,
  type RemittanceCreatedRow,
} from "../lib/goldsky";

const POLL_MS = 6_000;

function shortAddr(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function relTime(unix: string | number) {
  const t = typeof unix === "string" ? Number(unix) : unix;
  const diff = Math.max(0, Math.floor(Date.now() / 1000 - t));
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function fmtMusd(wei: string) {
  return Number(formatEther(BigInt(wei))).toLocaleString(undefined, {
    maximumFractionDigits: 2,
  });
}

export default function LiveFeed() {
  const [stats, setStats] = useState<GlobalStats | null>(null);
  const [claims, setClaims] = useState<ClaimEventRow[]>([]);
  const [recent, setRecent] = useState<RemittanceCreatedRow[]>([]);
  const [lps, setLps] = useState<LpPositionRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!goldskyEnabled) return;
    let cancelled = false;
    async function tick() {
      try {
        const d = await fetchLiveDashboard(20);
        if (cancelled) return;
        setStats(d.globalStats);
        setClaims(d.claimEvents);
        setRecent(d.recentRemittances);
        setLps(d.topLps);
        setError(null);
      } catch (e: any) {
        if (cancelled) return;
        setError(e?.message || "Subgraph query failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    tick();
    const id = setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const tvlMusd = useMemo(() => {
    if (!stats) return null;
    try {
      return Number(formatEther(BigInt(stats.poolReserve)));
    } catch {
      return null;
    }
  }, [stats]);

  if (!goldskyEnabled) {
    return (
      <div className="card text-ivory/60 text-sm">
        <div className="flex items-center gap-2 mb-1 text-ivory/80 font-medium">
          <Activity className="w-4 h-4" /> Live feed (offline)
        </div>
        Set <code className="text-btc">VITE_GOLDSKY_SUBGRAPH_URL</code> to enable
        the Goldsky-indexed live dashboard. Deploy the subgraph from{" "}
        <code className="text-ivory/80">/subgraph</code> and paste the endpoint
        into your <code>frontend/.env</code>.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Activity className="w-4 h-4 text-ok animate-pulse" />
        <h2 className="text-xl font-semibold">Live activity</h2>
        <span className="text-xs text-ivory/40 ml-2">
          via Goldsky · refreshes every {POLL_MS / 1000}s
        </span>
      </div>

      {error && (
        <div className="card text-danger text-sm">Subgraph error: {error}</div>
      )}

      {loading && !stats ? (
        <div className="card text-ivory/60">Loading live data…</div>
      ) : (
        <>
          {stats && (
            <div className="grid md:grid-cols-4 gap-4">
              <KpiCard
                icon={<ShieldCheck className="w-4 h-4" />}
                label="Total settled"
                value={`${fmtMusd(stats.totalMusdSettled)} MUSD`}
                sub={`${stats.totalClaimed} claims`}
              />
              <KpiCard
                icon={<Droplet className="w-4 h-4" />}
                label="LP TVL"
                value={tvlMusd !== null ? `${tvlMusd.toLocaleString(undefined, { maximumFractionDigits: 2 })} MUSD` : "—"}
                sub={`${stats.totalShares} shares`}
              />
              <KpiCard
                icon={<Activity className="w-4 h-4" />}
                label="Total remittances"
                value={stats.totalRemittances}
                sub={`${stats.totalLiquidated} liquidated`}
              />
              <KpiCard
                icon={<ShieldCheck className="w-4 h-4" />}
                label="Shortfall covered"
                value={`${fmtMusd(stats.totalShortfallCovered)} MUSD`}
                sub={`${fmtMusd(stats.totalFeesAccrued)} MUSD fees`}
              />
            </div>
          )}

          <div className="grid lg:grid-cols-2 gap-4">
            <div className="card">
              <h3 className="font-semibold mb-3">Settled remittances</h3>
              {claims.length === 0 ? (
                <p className="text-ivory/50 text-sm">No claims yet — be the first.</p>
              ) : (
                <ul className="divide-y divide-ivory/5 text-sm">
                  {claims.map((c) => (
                    <li key={c.id} className="py-2 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-medium">
                          {fmtMusd(c.amount)} MUSD
                        </div>
                        <div className="text-xs text-ivory/50 truncate">
                          {shortAddr(c.remittance.sender)}{" "}
                          <ArrowRight className="inline w-3 h-3 mx-0.5 -mt-0.5" />{" "}
                          {shortAddr(c.recipient)}
                        </div>
                      </div>
                      <div className="text-xs text-ivory/40 whitespace-nowrap">
                        {relTime(c.timestamp)}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="card">
              <h3 className="font-semibold mb-3">New remittances</h3>
              {recent.length === 0 ? (
                <p className="text-ivory/50 text-sm">No remittances indexed yet.</p>
              ) : (
                <ul className="divide-y divide-ivory/5 text-sm">
                  {recent.map((r) => (
                    <li key={r.id} className="py-2 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-medium">
                          {fmtMusd(r.musdAmount)} MUSD ·{" "}
                          <span className="text-ivory/50">{r.status}</span>
                        </div>
                        <div className="text-xs text-ivory/50 truncate">
                          {shortAddr(r.sender)}{" "}
                          <ArrowRight className="inline w-3 h-3 mx-0.5 -mt-0.5" />{" "}
                          {r.recipient === "0x0000000000000000000000000000000000000000"
                            ? "phone"
                            : shortAddr(r.recipient)}
                        </div>
                      </div>
                      <div className="text-xs text-ivory/40 whitespace-nowrap">
                        {relTime(r.createdAt)}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {lps.length > 0 && (
            <div className="card">
              <h3 className="font-semibold mb-3">Top LPs</h3>
              <ul className="divide-y divide-ivory/5 text-sm">
                {lps.map((p) => (
                  <li key={p.id} className="py-2 flex items-center justify-between">
                    <span className="font-mono text-ivory/80">{shortAddr(p.lp)}</span>
                    <span className="text-ivory/60">
                      {fmtMusd(p.totalDeposited)} MUSD deposited ·{" "}
                      {p.shares} shares
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="card">
      <div className="flex items-center gap-2 text-ivory/60 text-xs uppercase tracking-wide">
        {icon} {label}
      </div>
      <div className="text-2xl font-bold mt-2">{value}</div>
      {sub && <div className="text-xs text-ivory/40 mt-1">{sub}</div>}
    </div>
  );
}
