/**
 * Wallet-free recipient dashboard.
 *
 * PayPal/CashApp-style home for someone who claimed via SMS+PIN. Talks
 * exclusively to /api/recipient/* with the bearer session token. No
 * wagmi, no MetaMask, no signing — every action is relayer-executed.
 */
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Wallet as WalletIcon,
  ArrowDownToLine,
  Send,
  PiggyBank,
  History as HistoryIcon,
  LogOut,
  RefreshCw,
  Copy,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { formatEther, parseEther } from "viem";
import { api, recipientSession, type RecipientWallet, type RecipientTx } from "../api";

type ActionTab = null | "transfer" | "cashout" | "save";

export default function Wallet() {
  const navigate = useNavigate();
  const [wallet, setWallet] = useState<RecipientWallet | null>(null);
  const [history, setHistory] = useState<RecipientTx[]>([]);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState<ActionTab>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setError(null);
    try {
      const [me, h] = await Promise.all([api.recipientMe(), api.recipientHistory()]);
      setWallet(me.wallet);
      setHistory(h.history);
    } catch (e: any) {
      const msg = String(e?.message || e);
      if (msg.startsWith("401")) {
        recipientSession.clear();
        navigate("/login");
        return;
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!recipientSession.get()) {
      navigate("/login");
      return;
    }
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function logout() {
    recipientSession.clear();
    navigate("/");
  }

  const balance = wallet ? Number(formatEther(BigInt(wallet.balance))) : 0;
  const savings = wallet?.savings ? Number(formatEther(BigInt(wallet.savings))) : 0;

  if (loading) {
    return (
      <div className="max-w-md mx-auto card text-center py-16 text-ivory/60">
        Loading your wallet…
      </div>
    );
  }

  if (!wallet) {
    return (
      <div className="max-w-md mx-auto card text-center py-12 space-y-4">
        <p className="text-ivory/70">We couldn't load your wallet.</p>
        <button className="btn-primary" onClick={() => navigate("/login")}>
          Sign in
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto space-y-6">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-amber-sheen text-charcoal-900 flex items-center justify-center">
            <WalletIcon className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-ivory/45">Your account</p>
            <p className="font-mono text-xs text-ivory/70">
              {wallet.address.slice(0, 6)}…{wallet.address.slice(-4)}
              <button
                onClick={async () => {
                  await navigator.clipboard.writeText(wallet.address);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1200);
                }}
                className="ml-2 text-ivory/45 hover:text-ivory inline-flex items-center align-middle"
                title="Copy address"
              >
                {copied ? <CheckCircle2 className="w-3 h-3 text-forest-300" /> : <Copy className="w-3 h-3" />}
              </button>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={refresh} className="btn-ghost py-2 px-2.5" title="Refresh">
            <RefreshCw className="w-4 h-4" />
          </button>
          <button onClick={logout} className="btn-ghost py-2 px-2.5" title="Sign out">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="card bg-gradient-to-br from-charcoal-800/80 via-charcoal-900/60 to-charcoal-900 text-center space-y-2 py-8"
      >
        <p className="eyebrow text-amber-300">Available balance</p>
        <p className="font-display text-5xl text-ivory tracking-tight">
          {balance.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          <span className="ml-2 text-base text-ivory/45 align-middle">MUSD</span>
        </p>
        {savings > 0 && (
          <p className="text-xs text-forest-300">
            + {savings.toLocaleString(undefined, { maximumFractionDigits: 2 })} MUSD saved
          </p>
        )}
        {wallet.phone && (
          <p className="text-[11px] text-ivory/45">Linked to {wallet.phone}</p>
        )}
      </motion.div>

      {error && (
        <div className="card border-danger/30 bg-danger/5 text-danger text-sm flex gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5" /> {error}
        </div>
      )}

      <div className="grid grid-cols-3 gap-3">
        <ActionTile icon={<ArrowDownToLine className="w-5 h-5" />} label="Cash Out" onClick={() => setAction("cashout")} active={action === "cashout"} />
        <ActionTile icon={<Send className="w-5 h-5" />} label="Transfer" onClick={() => setAction("transfer")} active={action === "transfer"} />
        <ActionTile icon={<PiggyBank className="w-5 h-5" />} label="Save" onClick={() => setAction("save")} active={action === "save"} />
      </div>

      {action === "transfer" && (
        <TransferForm
          maxBalance={balance}
          onDone={() => {
            setAction(null);
            refresh();
          }}
        />
      )}
      {action === "cashout" && (
        <CashoutForm
          maxBalance={balance}
          onDone={() => setAction(null)}
        />
      )}
      {action === "save" && (
        <SaveForm
          maxBalance={balance}
          onDone={() => {
            setAction(null);
            refresh();
          }}
        />
      )}

      <section className="card space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-ivory inline-flex items-center gap-2">
            <HistoryIcon className="w-4 h-4 text-amber-300" /> Activity
          </h3>
          <Link to="/wallet" className="text-[11px] text-ivory/40 hover:text-ivory">
            {history.length} entries
          </Link>
        </div>
        {history.length === 0 ? (
          <p className="text-xs text-ivory/45">Nothing yet. Once you receive money, it'll show here.</p>
        ) : (
          <ul className="divide-y divide-ivory/10">
            {history.map((t) => (
              <li key={t.id} className="py-2.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm text-ivory capitalize">{t.kind}</p>
                  <p className="text-[11px] text-ivory/45 truncate">
                    {t.note || (t.counterparty ? `→ ${shorten(t.counterparty)}` : "—")}
                  </p>
                </div>
                <div className="text-right">
                  <p className={`text-sm font-mono ${t.kind === "claim" ? "text-forest-300" : "text-ivory"}`}>
                    {t.kind === "claim" ? "+" : "-"}
                    {Number(formatEther(BigInt(t.amount))).toLocaleString(undefined, {
                      maximumFractionDigits: 2,
                    })}
                  </p>
                  <p className="text-[10px] text-ivory/40">
                    {new Date(t.created_at * 1000).toLocaleString()}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function ActionTile({
  icon,
  label,
  onClick,
  active,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`card flex flex-col items-center justify-center gap-2 py-5 transition ${
        active ? "border-amber/60 bg-amber/5" : "hover:border-ivory/25"
      }`}
    >
      <span className={`w-10 h-10 rounded-xl flex items-center justify-center ${
        active ? "bg-amber-sheen text-charcoal-900" : "bg-ivory/5 text-ivory/80"
      }`}>
        {icon}
      </span>
      <span className="text-xs uppercase tracking-[0.16em] text-ivory/70">{label}</span>
    </button>
  );
}

function TransferForm({ maxBalance, onDone }: { maxBalance: number; onDone: () => void }) {
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tx, setTx] = useState<string | null>(null);

  const valid = /^0x[0-9a-fA-F]{40}$/.test(to) && Number(amount) > 0 && Number(amount) <= maxBalance;

  async function go() {
    setError(null);
    setBusy(true);
    try {
      const r = await api.recipientTransfer(to, amount);
      setTx(r.txHash);
    } catch (e: any) {
      setError(humanize(e?.message));
    } finally {
      setBusy(false);
    }
  }

  if (tx) {
    return (
      <div className="card space-y-3 text-center">
        <CheckCircle2 className="w-10 h-10 text-forest-300 mx-auto" />
        <p className="text-ivory">Sent {amount} MUSD</p>
        <p className="text-[11px] font-mono text-ivory/45 break-all">{tx}</p>
        <button className="btn-primary w-full" onClick={onDone}>Done</button>
      </div>
    );
  }

  return (
    <div className="card space-y-4">
      <h3 className="font-semibold text-ivory">Transfer MUSD</h3>
      <input
        placeholder="0x recipient address"
        value={to}
        onChange={(e) => setTo(e.target.value.trim())}
        className="w-full rounded-xl bg-charcoal-900/60 border border-ivory/10 px-4 py-3 text-ivory placeholder:text-ivory/30 focus:border-amber focus:outline-none font-mono text-xs"
      />
      <div className="flex items-center gap-2">
        <input
          type="number"
          step="0.01"
          placeholder="Amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="flex-1 rounded-xl bg-charcoal-900/60 border border-ivory/10 px-4 py-3 text-ivory placeholder:text-ivory/30 focus:border-amber focus:outline-none"
        />
        <button
          type="button"
          onClick={() => setAmount(String(maxBalance))}
          className="btn-ghost text-xs"
        >
          Max
        </button>
      </div>
      {error && <p className="text-danger text-sm">{error}</p>}
      <div className="flex gap-2">
        <button className="btn-ghost flex-1" onClick={onDone} disabled={busy}>Cancel</button>
        <button className="btn-primary flex-1" disabled={!valid || busy} onClick={go}>
          {busy ? "Sending…" : "Send"}
        </button>
      </div>
      <p className="text-[11px] text-ivory/40 text-center">
        Gas is sponsored by the relayer. You won't be asked to sign anything.
      </p>
    </div>
  );
}

function CashoutForm({ maxBalance, onDone }: { maxBalance: number; onDone: () => void }) {
  const [amount, setAmount] = useState("");
  const [country, setCountry] = useState("US");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid = Number(amount) > 0 && Number(amount) <= maxBalance;

  async function go() {
    setError(null);
    setBusy(true);
    try {
      const r = await api.recipientCashout(amount, country);
      window.open(r.sessionUrl, "_blank", "noopener,noreferrer");
      onDone();
    } catch (e: any) {
      setError(humanize(e?.message));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card space-y-4">
      <h3 className="font-semibold text-ivory">Cash out to bank / mobile money</h3>
      <div className="flex items-center gap-2">
        <input
          type="number"
          step="0.01"
          placeholder="Amount in MUSD"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="flex-1 rounded-xl bg-charcoal-900/60 border border-ivory/10 px-4 py-3 text-ivory placeholder:text-ivory/30 focus:border-amber focus:outline-none"
        />
        <button type="button" onClick={() => setAmount(String(maxBalance))} className="btn-ghost text-xs">
          Max
        </button>
      </div>
      <select
        value={country}
        onChange={(e) => setCountry(e.target.value)}
        className="w-full rounded-xl bg-charcoal-900/60 border border-ivory/10 px-4 py-3 text-ivory focus:border-amber focus:outline-none"
      >
        <option value="US">United States (USD)</option>
        <option value="NG">Nigeria (NGN)</option>
        <option value="KE">Kenya (KES)</option>
        <option value="GH">Ghana (GHS)</option>
        <option value="IN">India (INR)</option>
        <option value="PH">Philippines (PHP)</option>
        <option value="MX">Mexico (MXN)</option>
        <option value="BR">Brazil (BRL)</option>
      </select>
      {error && <p className="text-danger text-sm">{error}</p>}
      <div className="flex gap-2">
        <button className="btn-ghost flex-1" onClick={onDone} disabled={busy}>Cancel</button>
        <button className="btn-primary flex-1" disabled={!valid || busy} onClick={go}>
          {busy ? "Opening…" : "Continue to off-ramp"}
        </button>
      </div>
      <p className="text-[11px] text-ivory/40 text-center">
        Off-ramp opens via Transak in a new tab.
      </p>
    </div>
  );
}

function SaveForm({ maxBalance, onDone }: { maxBalance: number; onDone: () => void }) {
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = Number(amount) > 0 && Number(amount) <= maxBalance;

  async function go() {
    setError(null);
    setBusy(true);
    try {
      // pre-flight to surface bad amounts before posting
      parseEther(amount);
      await api.recipientSave(amount);
      onDone();
    } catch (e: any) {
      setError(humanize(e?.message));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card space-y-4">
      <h3 className="font-semibold text-ivory">Move to savings</h3>
      <p className="text-xs text-ivory/55">
        Set MUSD aside in your savings bucket. (Demo allocation — production version stakes
        into the Anchor Insurance Pool to earn protocol yield.)
      </p>
      <div className="flex items-center gap-2">
        <input
          type="number"
          step="0.01"
          placeholder="Amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="flex-1 rounded-xl bg-charcoal-900/60 border border-ivory/10 px-4 py-3 text-ivory placeholder:text-ivory/30 focus:border-amber focus:outline-none"
        />
        <button type="button" onClick={() => setAmount(String(maxBalance))} className="btn-ghost text-xs">
          Max
        </button>
      </div>
      {error && <p className="text-danger text-sm">{error}</p>}
      <div className="flex gap-2">
        <button className="btn-ghost flex-1" onClick={onDone} disabled={busy}>Cancel</button>
        <button className="btn-primary flex-1" disabled={!valid || busy} onClick={go}>
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}

function shorten(s: string): string {
  return s.length > 14 ? `${s.slice(0, 6)}…${s.slice(-4)}` : s;
}

function humanize(raw: string): string {
  if (!raw) return "Something went wrong.";
  if (raw.includes("insufficient-balance")) return "You don't have enough MUSD for that.";
  if (raw.includes("unauthenticated")) return "Session expired — sign in again.";
  return raw.replace(/^\d+:\s*/, "");
}
