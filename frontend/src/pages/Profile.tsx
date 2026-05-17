import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useAccount } from "wagmi";
import {
  Trash2,
  Plus,
  Pencil,
  Check,
  X,
  Wallet,
  PieChart,
  Download,
  Save,
} from "lucide-react";
import { useProfile, Contact } from "../hooks/useContacts";
import {
  BudgetSummary,
  CATEGORY_COLOR,
  EXPENSE_CATEGORIES,
  ExpenseCategory,
  exportExpensePdf,
  loadBudgetConfig,
  loadCategoryMap,
  saveBudgetConfig,
  saveCategoryMap,
  setRecordCategory,
  summarize,
} from "../lib/budget";
import { CashOutRecord, formatFiat, loadHistory } from "../lib/payouts";

export default function Profile() {
  const { address } = useAccount();
  const { profile, setDisplayName, addContact, updateContact, removeContact } = useProfile();

  const [name, setName] = useState("");
  const [recipientAddress, setRecipientAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  function resetForm() {
    setName("");
    setRecipientAddress("");
    setPhone("");
    setError(null);
    setEditingId(null);
  }

  function validate(): string | null {
    if (!name.trim()) return "Name is required";
    if (recipientAddress && !/^0x[0-9a-fA-F]{40}$/.test(recipientAddress.trim())) {
      return "Invalid wallet address";
    }
    if (!recipientAddress && !phone) {
      return "Provide a wallet address or phone";
    }
    return null;
  }

  function submit() {
    const err = validate();
    if (err) return setError(err);
    if (editingId) {
      updateContact(editingId, {
        name: name.trim(),
        address: recipientAddress.trim(),
        phone: phone.trim(),
      });
    } else {
      addContact({
        name: name.trim(),
        address: recipientAddress.trim(),
        phone: phone.trim(),
      });
    }
    resetForm();
  }

  function startEdit(c: Contact) {
    setEditingId(c.id);
    setName(c.name);
    setRecipientAddress(c.address);
    setPhone(c.phone);
    setError(null);
  }

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <div>
        <span className="eyebrow">Account</span>
        <h1 className="font-display text-4xl text-ivory mt-2">Profile</h1>
        <p className="text-ivory/60 mt-2 max-w-xl leading-relaxed">
          Manage your display name and saved recipients. Contacts appear as a
          dropdown when sending a remittance.
        </p>
      </div>

      <motion.div className="card space-y-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <h2 className="font-semibold">Account</h2>
        <div>
          <label className="label">Display name</label>
          <input
            className="input"
            value={profile.displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="e.g. Alice"
          />
        </div>
        <div>
          <label className="label">Wallet</label>
          <p className="font-mono text-sm text-ivory/70">
            {address ?? <span className="text-ivory/40">Not connected</span>}
          </p>
        </div>
      </motion.div>

      <BudgetTracker displayName={profile.displayName} walletAddress={address} />

      <motion.div className="card space-y-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Recipients</h2>
          <span className="text-xs text-ivory/50">{profile.contacts.length} saved</span>
        </div>
        {!address && (
          <p className="text-xs text-amber-300/90 bg-amber/5 border border-amber/20 rounded-lg p-2">
            You're browsing as a guest — contacts you save now won't follow your wallet.
            Connect a wallet to keep recipients tied to your address.
          </p>
        )}

        <div className="grid md:grid-cols-3 gap-3">
          <div>
            <label className="label">Name</label>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Bob"
            />
          </div>
          <div>
            <label className="label">Wallet address</label>
            <input
              className="input"
              value={recipientAddress}
              onChange={(e) => setRecipientAddress(e.target.value)}
              placeholder="0x…"
            />
          </div>
          <div>
            <label className="label">Phone</label>
            <input
              className="input"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+14155550123"
            />
          </div>
        </div>
        {error && <p className="text-danger text-sm">{error}</p>}
        <div className="flex gap-2 justify-end">
          {editingId && (
            <button className="btn-ghost" onClick={resetForm}>
              <X className="w-3 h-3" /> Cancel
            </button>
          )}
          <button className="btn-primary" onClick={submit}>
            {editingId ? (
              <>
                <Check className="w-3 h-3" /> Save
              </>
            ) : (
              <>
                <Plus className="w-3 h-3" /> Add recipient
              </>
            )}
          </button>
        </div>

        {profile.contacts.length === 0 ? (
          <p className="text-ivory/50 text-sm">No saved recipients yet.</p>
        ) : (
          <ul className="divide-y divide-ivory/10">
            {profile.contacts.map((c) => (
              <li key={c.id} className="py-3 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium truncate">{c.name}</div>
                  <div className="text-xs text-ivory/60 truncate">
                    {c.address && (
                      <span className="font-mono">
                        {c.address.slice(0, 6)}…{c.address.slice(-4)}
                      </span>
                    )}
                    {c.address && c.phone && <span> · </span>}
                    {c.phone && <span>{c.phone}</span>}
                  </div>
                </div>
                <div className="flex gap-1">
                  <button
                    className="btn-ghost text-xs py-1 px-2"
                    onClick={() => startEdit(c)}
                  >
                    <Pencil className="w-3 h-3" /> Edit
                  </button>
                  <button
                    className="btn-ghost text-xs py-1 px-2 text-danger"
                    onClick={() => removeContact(c.id)}
                  >
                    <Trash2 className="w-3 h-3" /> Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </motion.div>
    </div>
  );
}

function BudgetTracker({
  displayName,
  walletAddress,
}: {
  displayName: string;
  walletAddress?: string;
}) {
  const [history, setHistory] = useState<CashOutRecord[]>([]);
  const [catMap, setCatMap] = useState<Record<string, ExpenseCategory>>({});
  const [budget, setBudget] = useState(loadBudgetConfig());
  const [budgetInput, setBudgetInput] = useState(String(budget.monthlyMusd));
  const [savedHint, setSavedHint] = useState(false);

  useEffect(() => {
    setHistory(loadHistory());
    setCatMap(loadCategoryMap());
    const onStorage = () => {
      setHistory(loadHistory());
      setCatMap(loadCategoryMap());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const summary: BudgetSummary = useMemo(
    () => summarize(history, catMap, budget.defaultCategory),
    [history, catMap, budget.defaultCategory],
  );

  const monthlyCap = budget.monthlyMusd;
  const monthPct = monthlyCap > 0
    ? Math.min(100, (summary.thisMonthMusd / monthlyCap) * 100)
    : 0;
  const monthOver = monthlyCap > 0 && summary.thisMonthMusd > monthlyCap;

  function persistBudget() {
    const n = Math.max(0, Number(budgetInput) || 0);
    const next = { ...budget, monthlyMusd: n };
    setBudget(next);
    saveBudgetConfig(next);
    setSavedHint(true);
    setTimeout(() => setSavedHint(false), 1600);
  }

  function changeCategory(id: string, cat: ExpenseCategory) {
    setRecordCategory(id, cat);
    setCatMap((m) => ({ ...m, [id]: cat }));
  }

  function clearCategories() {
    if (!confirm("Reset all expense categories?")) return;
    saveCategoryMap({});
    setCatMap({});
  }

  return (
    <motion.div
      className="card space-y-5"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="w-9 h-9 rounded-xl bg-amber/10 border border-amber/25 text-amber-300 flex items-center justify-center">
            <PieChart className="w-4 h-4" />
          </span>
          <div>
            <h2 className="font-semibold leading-tight">Budget tracker</h2>
            <p className="text-xs text-ivory/50">
              Categorise cash-outs and export tax-ready reports.
            </p>
          </div>
        </div>
        <button
          className="btn-soft text-xs"
          onClick={() =>
            exportExpensePdf({ displayName, walletAddress })
          }
          disabled={history.length === 0}
        >
          <Download className="w-3.5 h-3.5" /> Export PDF
        </button>
      </div>

      <div className="grid sm:grid-cols-3 gap-3">
        <SummaryStat
          icon={<Wallet className="w-4 h-4" />}
          label="Total spent"
          value={`${summary.totalMusd.toFixed(2)} MUSD`}
          sub={`${summary.recordCount} transactions`}
        />
        <SummaryStat
          icon={<Wallet className="w-4 h-4" />}
          label="This month"
          value={`${summary.thisMonthMusd.toFixed(2)} MUSD`}
          sub={
            monthlyCap > 0
              ? `Cap ${monthlyCap.toFixed(0)} MUSD`
              : "No cap set"
          }
        />
        <SummaryStat
          icon={<PieChart className="w-4 h-4" />}
          label="Top category"
          value={summary.byCategory[0]?.category ?? "—"}
          sub={
            summary.byCategory[0]
              ? `${summary.byCategory[0].musd.toFixed(2)} MUSD`
              : "Categorise to see breakdown"
          }
        />
      </div>

      <div>
        <label className="label">Monthly budget cap (MUSD)</label>
        <div className="flex gap-2">
          <input
            className="input flex-1"
            type="number"
            min={0}
            value={budgetInput}
            onChange={(e) => setBudgetInput(e.target.value)}
            placeholder="0 = no cap"
          />
          <button className="btn-primary" onClick={persistBudget}>
            <Save className="w-3 h-3" /> Save
          </button>
        </div>
        {savedHint && (
          <p className="text-xs text-forest-300 mt-1">Budget updated.</p>
        )}
        {monthlyCap > 0 && (
          <div className="mt-3">
            <div className="h-2 rounded-full bg-ivory/10 overflow-hidden">
              <div
                className={`h-full ${monthOver ? "bg-danger" : "bg-amber-sheen"}`}
                style={{ width: `${monthPct}%` }}
              />
            </div>
            <p className="text-xs text-ivory/55 mt-1">
              {summary.thisMonthMusd.toFixed(2)} of {monthlyCap.toFixed(0)} MUSD
              ({monthPct.toFixed(0)}%) used this month
              {monthOver && (
                <span className="text-danger"> · over budget</span>
              )}
            </p>
          </div>
        )}
      </div>

      {summary.byCategory.length > 0 && (
        <div>
          <h3 className="text-xs uppercase tracking-wider text-ivory/55 mb-2">
            By category
          </h3>
          <div className="space-y-2">
            {summary.byCategory.map((c) => (
              <div key={c.category} className="text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <span
                      className="w-2.5 h-2.5 rounded-sm"
                      style={{ background: CATEGORY_COLOR[c.category] }}
                    />
                    {c.category}
                  </span>
                  <span className="font-mono text-xs text-ivory/70">
                    {c.musd.toFixed(2)} MUSD · {c.pct.toFixed(0)}%
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-ivory/10 overflow-hidden mt-1">
                  <div
                    className="h-full"
                    style={{
                      width: `${c.pct}%`,
                      background: CATEGORY_COLOR[c.category],
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <div className="flex items-center justify-between gap-2 mb-2">
          <h3 className="text-xs uppercase tracking-wider text-ivory/55">
            Categorise transactions
          </h3>
          {history.length > 0 && (
            <button
              className="btn-ghost text-xs py-1 px-2"
              onClick={clearCategories}
            >
              <Trash2 className="w-3 h-3" /> Reset
            </button>
          )}
        </div>
        {history.length === 0 ? (
          <p className="text-ivory/50 text-sm">
            No cash-outs yet. Convert MUSD to fiat to start tracking expenses.
          </p>
        ) : (
          <ul className="divide-y divide-ivory/10 max-h-72 overflow-y-auto pr-1">
            {history.map((r) => (
              <li
                key={r.id}
                className="py-2 flex items-center gap-3 text-sm"
              >
                <span className="text-lg shrink-0">{r.providerFlag}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate">
                    {r.musdAmount.toFixed(2)} MUSD ·{" "}
                    <span className="text-ivory/55">
                      {formatFiat(r.netFiat, r.currency)}
                    </span>
                  </div>
                  <div className="text-[11px] text-ivory/45 font-mono truncate">
                    {new Date(r.createdAt).toLocaleDateString()} · {r.txnRef}
                  </div>
                </div>
                <select
                  className="input !py-1 !px-2 text-xs max-w-[150px]"
                  value={catMap[r.id] ?? budget.defaultCategory}
                  onChange={(e) =>
                    changeCategory(r.id, e.target.value as ExpenseCategory)
                  }
                >
                  {EXPENSE_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
        )}
      </div>
    </motion.div>
  );
}

function SummaryStat({
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
    <div className="rounded-xl bg-charcoal-900/50 border border-ivory/10 p-3">
      <div className="flex items-center gap-2 stat-label text-ivory/55">
        <span className="text-amber-300">{icon}</span>
        {label}
      </div>
      <div className="font-display text-xl text-ivory mt-1">{value}</div>
      {sub && <div className="text-[11px] text-ivory/45 mt-0.5">{sub}</div>}
    </div>
  );
}
