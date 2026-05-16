import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useAccount, usePublicClient } from "wagmi";
import { formatEther } from "viem";
import {
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  Copy,
  Loader2,
  Zap,
  Banknote,
  Gauge,
  ShieldCheck,
  Receipt,
  Sparkles,
} from "lucide-react";
import StepIndicator from "../components/StepIndicator";
import { remittanceVaultAbi } from "../abi";
import { contractAddresses } from "../wagmi.config";
import { api } from "../api";
import {
  PAYOUT_PROVIDERS,
  PayoutProvider,
  appendHistory,
  fakeBankRef,
  fakeTxnRef,
  formatFiat,
  formatLiquidity,
  quote,
  settlementEta,
  CashOutRecord,
} from "../lib/payouts";

const STEPS = ["Provider", "Review", "Processing", "Settled"];

type LoadedOrder = {
  orderId: string;
  sender: string;
  recipient: string;
  musdAmount: string; // wei string
  status: string;
};

export default function CashOut() {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const { address } = useAccount();
  const publicClient = usePublicClient();

  const [order, setOrder] = useState<LoadedOrder | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [providerId, setProviderId] = useState<string>(PAYOUT_PROVIDERS[0].id);
  const [processPct, setProcessPct] = useState(0);
  const [record, setRecord] = useState<CashOutRecord | null>(null);
  const [copied, setCopied] = useState(false);

  const provider = useMemo(
    () => PAYOUT_PROVIDERS.find((p) => p.id === providerId)!,
    [providerId],
  );

  const musd = order ? Number(formatEther(BigInt(order.musdAmount))) : 0;
  const q = useMemo(() => quote(provider, musd), [provider, musd]);

  // Load order (from API, fallback to chain)
  useEffect(() => {
    if (!orderId) return;
    let cancelled = false;
    api
      .getOrder(orderId)
      .then((o) => {
        if (cancelled) return;
        setOrder({
          orderId: o.orderId,
          sender: o.sender,
          recipient: o.recipient,
          musdAmount: o.musdAmount,
          status: o.status,
        });
      })
      .catch(async () => {
        if (!publicClient) return setError("Could not load order.");
        try {
          const onchain = (await publicClient.readContract({
            address: contractAddresses.remittanceVault,
            abi: remittanceVaultAbi,
            functionName: "getOrder",
            args: [orderId as `0x${string}`],
          })) as any;
          if (cancelled) return;
          const statusMap = ["PENDING", "CLAIMED", "CANCELLED", "LIQUIDATED"];
          setOrder({
            orderId,
            sender: onchain.sender,
            recipient: onchain.recipient,
            musdAmount: onchain.musdAmount.toString(),
            status: statusMap[Number(onchain.status)],
          });
        } catch {
          setError("Could not load order.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [orderId, publicClient]);

  function startProcessing() {
    if (!order || !address) return;
    setStep(2);
    setProcessPct(0);

    const totalMs = provider.rail === "UPI" || provider.rail === "GCash" ? 3500 : 5500;
    const stepMs = 60;
    const ticks = totalMs / stepMs;
    let i = 0;
    const t = setInterval(() => {
      i += 1;
      setProcessPct(Math.min(100, Math.round((i / ticks) * 100)));
      if (i >= ticks) {
        clearInterval(t);
        finalize();
      }
    }, stepMs);
  }

  function finalize() {
    if (!order || !address) return;
    const rec: CashOutRecord = {
      id: crypto.randomUUID(),
      txnRef: fakeTxnRef(),
      bankRef: fakeBankRef(provider),
      orderId: order.orderId,
      walletAddress: address,
      musdAmount: musd,
      providerId: provider.id,
      providerName: provider.name,
      providerFlag: provider.flag,
      rail: provider.rail,
      currency: provider.currency,
      rate: provider.rate,
      feePct: provider.feePct,
      grossFiat: q.gross,
      feeFiat: q.fee,
      netFiat: q.net,
      createdAt: Date.now(),
      settlementEta: settlementEta(provider),
      status: "PROCESSING",
    };
    appendHistory(rec);
    setRecord(rec);
    setStep(3);
    // After a short delay flip to SETTLED in history (visual only on this page)
    setTimeout(() => {
      const updated = { ...rec, status: "SETTLED" as const };
      // mutate stored history entry
      try {
        const raw = window.localStorage.getItem("anchor-remit:cashout-history:v1");
        if (raw) {
          const arr = JSON.parse(raw) as CashOutRecord[];
          const idx = arr.findIndex((r) => r.id === rec.id);
          if (idx >= 0) {
            arr[idx] = updated;
            window.localStorage.setItem(
              "anchor-remit:cashout-history:v1",
              JSON.stringify(arr),
            );
          }
        }
      } catch {
        /* ignore */
      }
      setRecord(updated);
    }, 4000);
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <span className="eyebrow">Recipient cash-out</span>
        <h1 className="font-display text-4xl text-ivory mt-2">Cash out to fiat</h1>
        <p className="text-ivory/60 mt-2">
          Convert your claimed MUSD into local currency through Anchor Remit's
          partner payout network. Settlement is simulated for this demo.
        </p>
      </div>

      <StepIndicator steps={STEPS} current={step} />

      {error && (
        <div className="rounded-2xl bg-clay/10 border border-clay/30 px-5 py-4 mb-4">
          <p className="text-clay-400 text-sm">{error}</p>
        </div>
      )}

      {!order && !error && <div className="card">Loading order…</div>}

      {order && (
        <AnimatePresence mode="wait">
          {step === 0 && (
            <motion.div
              key="select"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="space-y-4"
            >
              <div className="card flex items-center justify-between gap-4">
                <div>
                  <span className="stat-label">Available to cash out</span>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="font-display text-3xl text-ivory">
                      {musd.toLocaleString("en-US", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </span>
                    <span className="text-amber-300 text-sm">MUSD</span>
                  </div>
                </div>
                <span className="pill-amber">
                  <Sparkles className="w-3 h-3" /> Demo network
                </span>
              </div>

              <div className="space-y-3">
                {PAYOUT_PROVIDERS.map((p) => (
                  <ProviderCard
                    key={p.id}
                    provider={p}
                    musd={musd}
                    selected={p.id === providerId}
                    onSelect={() => setProviderId(p.id)}
                  />
                ))}
              </div>

              <div className="flex justify-between pt-2">
                <button
                  className="btn-ghost"
                  onClick={() => navigate(`/claim/${orderId}`)}
                >
                  <ArrowLeft className="w-4 h-4" /> Back to claim
                </button>
                <button className="btn-primary" onClick={() => setStep(1)}>
                  Continue <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          )}

          {step === 1 && (
            <motion.div
              key="review"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="card space-y-5"
            >
              <div className="flex items-center justify-between">
                <h3 className="font-semibold flex items-center gap-2">
                  <Receipt className="w-4 h-4 text-amber-300" /> Review payout
                </h3>
                <span className="pill-muted">{provider.rail}</span>
              </div>

              <div className="rounded-2xl bg-charcoal-900/60 border border-ivory/10 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{provider.flag}</span>
                    <div>
                      <div className="font-medium">{provider.name}</div>
                      <div className="text-xs text-ivory/55">{provider.region}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-ivory/55">Rate</div>
                    <div className="font-mono text-amber-300">
                      1 MUSD = {provider.rate.toFixed(provider.currency === "USD" ? 4 : 2)}{" "}
                      {provider.currency}
                    </div>
                  </div>
                </div>
              </div>

              <dl className="text-sm divide-y divide-ivory/10">
                <Row k="You send" v={`${musd.toFixed(2)} MUSD`} />
                <Row
                  k="Gross conversion"
                  v={`${formatFiat(q.gross, provider.currency)}`}
                />
                <Row
                  k={`Network fee (${(provider.feePct * 100).toFixed(2)}%)`}
                  v={`− ${formatFiat(q.fee, provider.currency)}`}
                />
                <Row
                  k="Recipient receives"
                  v={
                    <span className="font-display text-xl text-amber-300">
                      {formatFiat(q.net, provider.currency)}
                    </span>
                  }
                />
                <Row k="Settlement window" v={provider.settlement} />
                <Row k="Rail" v={provider.rail} />
              </dl>

              <div className="text-[11px] text-ivory/45 leading-relaxed flex gap-2">
                <ShieldCheck className="w-3.5 h-3.5 mt-0.5 text-forest-300 shrink-0" />
                Funds move from your wallet's MUSD balance to the partner's
                escrow, then payout is initiated on the local rail. No banking
                credentials are stored.
              </div>

              <div className="flex justify-between">
                <button className="btn-ghost" onClick={() => setStep(0)}>
                  <ArrowLeft className="w-4 h-4" /> Back
                </button>
                <button className="btn-primary" onClick={startProcessing}>
                  Confirm cash-out <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div
              key="processing"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="card space-y-6"
            >
              <div className="flex items-center gap-4">
                <span className="relative inline-flex w-12 h-12 rounded-2xl bg-amber/10 border border-amber/30 items-center justify-center">
                  <Loader2 className="w-5 h-5 text-amber-300 animate-spin" />
                </span>
                <div>
                  <span className="eyebrow">Processing</span>
                  <h3 className="font-display text-2xl text-ivory mt-1">
                    Settling via {provider.name}
                  </h3>
                </div>
              </div>

              <div className="space-y-2">
                <div className="h-2 rounded-full bg-charcoal-900 overflow-hidden">
                  <motion.div
                    className="h-full bg-amber-sheen"
                    animate={{ width: `${processPct}%` }}
                    transition={{ ease: "linear", duration: 0.06 }}
                  />
                </div>
                <div className="flex justify-between text-xs text-ivory/55">
                  <span>{processPct}%</span>
                  <span>{provider.settlement}</span>
                </div>
              </div>

              <ul className="space-y-2 text-sm">
                <Stage label="Locking MUSD on Mezo" done={processPct > 15} />
                <Stage
                  label={`Routing to ${provider.region}`}
                  done={processPct > 40}
                />
                <Stage
                  label={`Initiating ${provider.rail} payout`}
                  done={processPct > 70}
                />
                <Stage label="Awaiting settlement confirmation" done={processPct >= 100} />
              </ul>
            </motion.div>
          )}

          {step === 3 && record && (
            <motion.div
              key="done"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="card space-y-6"
            >
              <div className="flex items-center gap-4">
                <motion.span
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 240, damping: 16 }}
                  className="inline-flex w-12 h-12 rounded-2xl bg-forest/15 border border-forest/30 items-center justify-center"
                >
                  <CheckCircle2 className="w-6 h-6 text-forest-300" />
                </motion.span>
                <div>
                  <span className="eyebrow text-forest-300">
                    {record.rail === "UPI"
                      ? "UPI Transfer Successful"
                      : record.rail === "GCash"
                        ? "GCash Transfer Successful"
                        : record.rail === "Wire"
                          ? "Wire Initiated"
                          : "Bank Transfer Successful"}
                  </span>
                  <h3 className="font-display text-2xl text-ivory mt-1">
                    {formatFiat(record.netFiat, record.currency)} sent
                  </h3>
                </div>
              </div>

              <div className="rounded-2xl bg-charcoal-900/60 border border-ivory/10 p-4 space-y-3">
                <KV k="Transaction ref" v={record.txnRef} mono copyable onCopy={() => {
                  navigator.clipboard.writeText(record.txnRef);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1200);
                }} copied={copied} />
                <KV k={`${record.rail} reference`} v={record.bankRef} mono />
                <KV k="Provider" v={`${record.providerFlag} ${record.providerName}`} />
                <KV
                  k="Amount converted"
                  v={`${record.musdAmount.toFixed(2)} MUSD → ${formatFiat(record.netFiat, record.currency)}`}
                />
                <KV
                  k="Bank settlement ETA"
                  v={record.settlementEta}
                />
                <KV
                  k="Status"
                  v={
                    <span
                      className={
                        record.status === "SETTLED"
                          ? "pill-forest"
                          : "pill-amber"
                      }
                    >
                      {record.status === "SETTLED" ? "Settled" : "Processing"}
                    </span>
                  }
                />
              </div>

              <div className="grid sm:grid-cols-2 gap-2">
                <Link to="/history" className="btn-primary">
                  View transaction history
                </Link>
                <Link to="/" className="btn-ghost">
                  Back to overview
                </Link>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </div>
  );
}

function ProviderCard({
  provider,
  musd,
  selected,
  onSelect,
}: {
  provider: PayoutProvider;
  musd: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const q = quote(provider, musd);
  const badgeMap = {
    fastest: { label: "Fastest", icon: <Zap className="w-3 h-3" /> },
    "best-rate": { label: "Best rate", icon: <Gauge className="w-3 h-3" /> },
    "high-liquidity": {
      label: "High liquidity",
      icon: <Banknote className="w-3 h-3" />,
    },
  } as const;
  const badge = provider.badge ? badgeMap[provider.badge] : null;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full text-left rounded-2xl border p-4 transition relative
        ${
          selected
            ? "border-amber/60 bg-amber/5 shadow-glow"
            : "border-ivory/10 bg-charcoal-800/60 hover:border-ivory/25"
        }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <span className="text-2xl">{provider.flag}</span>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium">{provider.name}</span>
              {badge && (
                <span className="pill-amber">
                  {badge.icon} {badge.label}
                </span>
              )}
            </div>
            <div className="text-xs text-ivory/55 mt-0.5">
              {provider.region} · {provider.rail}
            </div>
            <div className="text-xs text-ivory/50 mt-1.5 leading-relaxed">
              {provider.blurb}
            </div>
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="font-display text-lg text-amber-300">
            {formatFiat(q.net, provider.currency)}
          </div>
          <div className="text-[11px] text-ivory/50">recipient gets</div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 mt-4 text-[11px]">
        <Mini k="Rate" v={`${provider.rate.toFixed(provider.currency === "USD" ? 4 : 2)} ${provider.currency}`} />
        <Mini k="Fee" v={`${(provider.feePct * 100).toFixed(2)}%`} />
        <Mini k="Settles" v={provider.settlement} />
      </div>
      <div className="grid grid-cols-2 gap-2 mt-2 text-[11px]">
        <Mini
          k="Liquidity"
          v={formatLiquidity(provider.liquidity, provider.currency)}
        />
        <Mini
          k="Gross"
          v={formatFiat(q.gross, provider.currency)}
        />
      </div>

      {selected && (
        <span className="absolute top-3 right-3 text-amber-300">
          <CheckCircle2 className="w-5 h-5" />
        </span>
      )}
    </button>
  );
}

function Mini({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-lg bg-charcoal-900/60 border border-ivory/5 px-2 py-1.5">
      <div className="text-ivory/45 uppercase tracking-wider text-[9px]">{k}</div>
      <div className="text-ivory/85 truncate">{v}</div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between py-2.5 gap-4">
      <dt className="text-ivory/60">{k}</dt>
      <dd className="font-medium text-right">{v}</dd>
    </div>
  );
}

function Stage({ label, done }: { label: string; done: boolean }) {
  return (
    <li className="flex items-center gap-3">
      <span
        className={`w-5 h-5 rounded-full border flex items-center justify-center text-[10px]
          ${
            done
              ? "bg-forest/20 border-forest/40 text-forest-300"
              : "bg-charcoal-900 border-ivory/15 text-ivory/40"
          }`}
      >
        {done ? "✓" : "·"}
      </span>
      <span className={done ? "text-ivory/85" : "text-ivory/50"}>{label}</span>
    </li>
  );
}

function KV({
  k,
  v,
  mono,
  copyable,
  onCopy,
  copied,
}: {
  k: string;
  v: React.ReactNode;
  mono?: boolean;
  copyable?: boolean;
  onCopy?: () => void;
  copied?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs uppercase tracking-wider text-ivory/45">{k}</span>
      <div className="flex items-center gap-2 min-w-0">
        <span className={`truncate ${mono ? "font-mono text-sm" : ""}`}>{v}</span>
        {copyable && (
          <button
            onClick={onCopy}
            className="text-ivory/40 hover:text-amber-300 transition"
            title="Copy"
          >
            {copied ? (
              <CheckCircle2 className="w-4 h-4 text-forest-300" />
            ) : (
              <Copy className="w-4 h-4" />
            )}
          </button>
        )}
      </div>
    </div>
  );
}
