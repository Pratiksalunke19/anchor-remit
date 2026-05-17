import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import { parseEventLogs, formatEther, keccak256, parseEther, toBytes } from "viem";
import StepIndicator from "../components/StepIndicator";
import PinInput from "../components/PinInput";
import { remittanceVaultAbi, erc20Abi, mezoVaultAbi } from "../abi";
import { contractAddresses } from "../wagmi.config";
import { api } from "../api";
import { motion } from "framer-motion";
import { Copy, ExternalLink, MessageCircle, Users, Droplets } from "lucide-react";
import { usePersistedState } from "../hooks/usePersistedState";
import { useProfile } from "../hooks/useContacts";

const FORM_KEY = "anchor-remit:send-form/v1";
type PersistedForm = {
  step: number;
  musdAmount: string;
  collateralBtc: string;
  recipientPhone: string;
  recipientAddress: string;
  expiryHours: number;
  pin: string;
  orderId: `0x${string}` | null;
  txHash: `0x${string}` | null;
};
const INITIAL_FORM: PersistedForm = {
  step: 0,
  musdAmount: "100",
  collateralBtc: "0.005",
  recipientPhone: "",
  recipientAddress: "",
  expiryHours: 72,
  pin: "",
  orderId: null,
  txHash: null,
};

const STEPS = ["Amount", "PIN", "Approve", "Done"];

export default function Send() {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  const [form, setForm, clearForm] = usePersistedState<PersistedForm>(FORM_KEY, INITIAL_FORM);
  const { step, musdAmount, collateralBtc, recipientPhone, recipientAddress, expiryHours, pin, orderId, txHash } = form;
  const setStep = (v: number) => setForm((f) => ({ ...f, step: v }));
  const setMusdAmount = (v: string) => setForm((f) => ({ ...f, musdAmount: v }));
  const setCollateralBtc = (v: string) => setForm((f) => ({ ...f, collateralBtc: v }));
  const setRecipientPhone = (v: string) => setForm((f) => ({ ...f, recipientPhone: v }));
  const setRecipientAddress = (v: string) => setForm((f) => ({ ...f, recipientAddress: v }));
  const setExpiryHours = (v: number) => setForm((f) => ({ ...f, expiryHours: v }));
  const setPin = (v: string) => setForm((f) => ({ ...f, pin: v }));
  const setOrderId = (v: `0x${string}` | null) => setForm((f) => ({ ...f, orderId: v }));
  const setTxHash = (v: `0x${string}` | null) => setForm((f) => ({ ...f, txHash: v }));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tbtcBalance, setTbtcBalance] = useState<bigint | null>(null);
  const [minting, setMinting] = useState(false);
  const [btcPriceUsd, setBtcPriceUsd] = useState<bigint | null>(null);
  const [vaultCollat, setVaultCollat] = useState<bigint>(0n);
  const [vaultDebt, setVaultDebt] = useState<bigint>(0n);

  const { profile } = useProfile();

  function resetForm() {
    clearForm();
    setForm({ ...INITIAL_FORM });
  }

  // load mezo vault state to compute real-time health factor
  async function fetchVaultState() {
    if (!publicClient) return;
    const mezoAddr = contractAddresses.mezoVault;
    if (!mezoAddr || /^0x0+$/.test(mezoAddr)) return;
    try {
      const [price, collat, debt] = await Promise.all([
        publicClient.readContract({
          address: mezoAddr,
          abi: mezoVaultAbi,
          functionName: "btcPriceUsd",
        }) as Promise<bigint>,
        publicClient.readContract({
          address: mezoAddr,
          abi: mezoVaultAbi,
          functionName: "collateralOf",
          args: [contractAddresses.remittanceVault],
        }) as Promise<bigint>,
        publicClient.readContract({
          address: mezoAddr,
          abi: mezoVaultAbi,
          functionName: "debtOf",
          args: [contractAddresses.remittanceVault],
        }) as Promise<bigint>,
      ]);
      setBtcPriceUsd(price);
      setVaultCollat(collat);
      setVaultDebt(debt);
    } catch (e) {
      console.warn("[send] vault state read failed", e);
    }
  }

  useEffect(() => {
    fetchVaultState();
  }, [publicClient]);

  // Combined CR after this new order = (vaultCollatUsd + newCollatUsd) / (vaultDebt + musd)
  // Required minimum is 150% (1.5e18 in mock).
  const MIN_CR = 1.5;
  const SAFE_CR = 1.75;
  const healthFactor = useMemo(() => {
    if (!btcPriceUsd) return null;
    const m = Number(musdAmount);
    const c = Number(collateralBtc);
    if (!isFinite(m) || !isFinite(c) || m <= 0 || c <= 0) return null;
    try {
      const newCollat = parseEther(collateralBtc);
      const newMusd = parseEther(musdAmount);
      const totalCollatUsd = ((vaultCollat + newCollat) * btcPriceUsd) / 10n ** 18n;
      const totalDebt = vaultDebt + newMusd;
      if (totalDebt === 0n) return null;
      // CR scaled 1e18; convert to float
      const crBig = (totalCollatUsd * 10n ** 18n) / totalDebt;
      return Number(crBig) / 1e18;
    } catch {
      return null;
    }
  }, [musdAmount, collateralBtc, btcPriceUsd, vaultCollat, vaultDebt]);

  const collateralOk = healthFactor === null ? true : healthFactor >= MIN_CR;

  // fetch ERC20 tBTC balance
  async function fetchTbtcBalance() {
    if (!publicClient || !address) return;
    const bal = (await publicClient.readContract({
      address: contractAddresses.btc,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [address],
    })) as bigint;
    setTbtcBalance(bal);
  }

  // mint testnet tBTC from faucet (MockERC20.mint is open)
  async function mintTestBtc() {
    if (!walletClient || !publicClient || !address) return;
    setMinting(true);
    try {
      const hash = await walletClient.writeContract({
        address: contractAddresses.btc,
        abi: erc20Abi,
        functionName: "mint",
        args: [address, parseEther("1")],
      });
      await publicClient.waitForTransactionReceipt({ hash });
      await fetchTbtcBalance();
    } catch (e: any) {
      console.error("[faucet] mint failed", e);
      setError(e?.shortMessage || e?.message || "Faucet mint failed");
    } finally {
      setMinting(false);
    }
  }

  // refresh balance when wallet connects
  useEffect(() => { fetchTbtcBalance(); }, [address, publicClient]);

  const canNext0 =
    Number(musdAmount) > 0 &&
    Number(collateralBtc) > 0 &&
    collateralOk;

  const canNext1 = /^\d{6}$/.test(pin);

  const claimLink = useMemo(
    () => (orderId ? `${window.location.origin}/claim/${orderId}` : ""),
    [orderId]
  );

  async function submit() {
    if (!address || !walletClient || !publicClient) return;
    setError(null);
    setLoading(true);
    try {
      const musd = parseEther(musdAmount);
      const collat = parseEther(collateralBtc);
      const claimCodeHash = keccak256(toBytes(pin));
      const recipient = (recipientAddress ||
        "0x0000000000000000000000000000000000000000") as `0x${string}`;

      // 1. approve BTC to vault
      const currentAllowance = (await publicClient.readContract({
        address: contractAddresses.btc,
        abi: erc20Abi,
        functionName: "allowance",
        args: [address, contractAddresses.remittanceVault],
      })) as bigint;

      if (currentAllowance < collat) {
        const approveTx = await walletClient.writeContract({
          address: contractAddresses.btc,
          abi: erc20Abi,
          functionName: "approve",
          args: [contractAddresses.remittanceVault, collat],
        });
        await publicClient.waitForTransactionReceipt({ hash: approveTx });
      }

      // 2. pre-flight checks
      const btcBalance = (await publicClient.readContract({
        address: contractAddresses.btc,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [address],
      })) as bigint;
      console.log("[send] BTC balance", btcBalance.toString(), "needed", collat.toString());
      if (btcBalance < collat) {
        throw new Error(
          `Insufficient tBTC (ERC20) balance. You have ${formatEther(btcBalance)} tBTC but need ${formatEther(collat)}. Use the faucet on the Amount step to mint testnet tBTC.`
        );
      }

      // simulate to catch revert reason before sending
      try {
        await publicClient.simulateContract({
          address: contractAddresses.remittanceVault,
          abi: remittanceVaultAbi,
          functionName: "createRemittance",
          args: [recipient, musd, collat, claimCodeHash, BigInt(expiryHours * 3600)],
          account: address,
        });
      } catch (simErr: any) {
        console.error("[send] simulation reverted", simErr);
        throw new Error(
          simErr?.shortMessage || simErr?.message || "Transaction would revert — check collateral ratio"
        );
      }

      // 3. createRemittance
      const hash = await walletClient.writeContract({
        address: contractAddresses.remittanceVault,
        abi: remittanceVaultAbi,
        functionName: "createRemittance",
        args: [recipient, musd, collat, claimCodeHash, BigInt(expiryHours * 3600)],
      });
      setTxHash(hash);
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      console.log("[send] tx receipt", receipt.status, receipt.logs.length, "logs");

      if (receipt.status === "reverted") {
        throw new Error("Transaction reverted on-chain");
      }

      // parse orderId from RemittanceCreated event
      const vaultAddr = contractAddresses.remittanceVault.toLowerCase();
      console.log("[send] vault address", vaultAddr, "log addresses", receipt.logs.map((l) => l.address));

      let parsedId: `0x${string}` | null = null;

      // Approach 1: parseEventLogs (handles decoding + filtering by eventName)
      try {
        const parsed = parseEventLogs({
          abi: remittanceVaultAbi,
          eventName: "RemittanceCreated",
          logs: receipt.logs,
          strict: false,
        });
        if (parsed.length > 0) {
          parsedId = (parsed[0].args as any).orderId;
        }
      } catch (parseErr) {
        console.warn("[send] parseEventLogs failed", parseErr);
      }

      // Approach 2: manual fallback — orderId is indexed (topics[1]) on vault logs
      if (!parsedId) {
        const evSig = keccak256(toBytes("RemittanceCreated(bytes32,address,address,uint256,uint256,uint256)"));
        for (const log of receipt.logs) {
          if (
            log.address.toLowerCase() === vaultAddr &&
            log.topics[0] === evSig &&
            log.topics.length >= 2
          ) {
            parsedId = log.topics[1] as `0x${string}`;
            console.log("[send] orderId from manual topic extraction", parsedId);
            break;
          }
        }
      }

      if (!parsedId) {
        console.error("[send] no RemittanceCreated event found in logs", receipt.logs);
        throw new Error("Could not parse orderId from tx");
      }
      setOrderId(parsedId);

      // 3. register in backend → triggers SMS
      const now = Math.floor(Date.now() / 1000);
      await api
        .registerOrder({
          orderId: parsedId,
          sender: address,
          recipient: recipientAddress || undefined,
          recipientPhone: recipientPhone || undefined,
          musdAmount: musd.toString(),
          collateralBtc: collat.toString(),
          expiryTs: now + expiryHours * 3600,
          txHash: hash,
        })
        .catch((e) => console.warn("[send] register failed", e));

      setStep(3);
    } catch (e: any) {
      console.error("[send] submit error", e);
      setError(e?.shortMessage || e?.message || "failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <span className="eyebrow">New transfer</span>
        <h1 className="font-display text-4xl text-ivory mt-2">Send MUSD</h1>
        <p className="text-ivory/60 mt-2 max-w-xl leading-relaxed">
          Lock BTC as collateral, mint MUSD, and share a secure claim link with your recipient.
        </p>
      </div>

      <StepIndicator steps={STEPS} current={step} />

      {step === 0 && address && tbtcBalance !== null && tbtcBalance === 0n && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="card border-btc/30 bg-btc/5 mb-4 flex items-start gap-3"
        >
          <span className="w-10 h-10 shrink-0 rounded-xl bg-btc/15 border border-btc/30 text-btc flex items-center justify-center">
            <Droplets className="w-5 h-5" />
          </span>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-ivory">No tBTC in your wallet</h3>
            <p className="text-sm text-ivory/65 mt-0.5">
              You need testnet tBTC as collateral before you can send MUSD. Mint
              some from the faucet — it's free on Mezo Matsnet.
            </p>
            <button
              className="btn-primary mt-3"
              onClick={mintTestBtc}
              disabled={minting}
            >
              {minting ? "Minting…" : "Mint 1 tBTC from faucet"}
            </button>
            {error && <p className="text-danger text-xs mt-2">{error}</p>}
          </div>
        </motion.div>
      )}

      {step === 0 && (
        <motion.div className="card space-y-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <div>
            <label className="label">MUSD amount</label>
            <input
              className="input"
              type="number"
              value={musdAmount}
              onChange={(e) => setMusdAmount(e.target.value)}
              placeholder="100"
            />
          </div>
          <div>
            <label className="label">BTC collateral</label>
            <input
              className="input"
              type="number"
              step="0.0001"
              value={collateralBtc}
              onChange={(e) => setCollateralBtc(e.target.value)}
              placeholder="0.005"
            />
            <p className="text-xs text-ivory/40 mt-1">
              Aim for ≥ 150% collateralization to stay safe.
            </p>
          </div>
          {/* real-time health factor */}
          <HealthFactor
            cr={healthFactor}
            min={MIN_CR}
            safe={SAFE_CR}
            priceUsd={btcPriceUsd ? Number(formatEther(btcPriceUsd)) : null}
          />
          {profile.contacts.length > 0 && (
            <div>
              <label className="label flex items-center gap-2">
                <Users className="w-3 h-3" /> Saved recipients
              </label>
              <select
                className="input"
                value=""
                onChange={(e) => {
                  const c = profile.contacts.find((x) => x.id === e.target.value);
                  if (!c) return;
                  setRecipientAddress(c.address || "");
                  setRecipientPhone(c.phone || "");
                }}
              >
                <option value="">Select a saved contact…</option>
                {profile.contacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.address ? ` · ${c.address.slice(0, 6)}…${c.address.slice(-4)}` : ""}
                    {c.phone ? ` · ${c.phone}` : ""}
                  </option>
                ))}
              </select>
              <p className="text-xs text-ivory/40 mt-1">
                Manage contacts in your{" "}
                <Link to="/profile" className="text-btc hover:underline">
                  Profile
                </Link>
                .
              </p>
            </div>
          )}
          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <label className="label">Recipient phone (optional)</label>
              <input
                className="input"
                value={recipientPhone}
                onChange={(e) => setRecipientPhone(e.target.value)}
                placeholder="+14155550123"
              />
            </div>
            <div>
              <label className="label">Recipient wallet (optional)</label>
              <input
                className="input"
                value={recipientAddress}
                onChange={(e) => setRecipientAddress(e.target.value)}
                placeholder="0x…"
              />
            </div>
          </div>

          <div>
            <label className="label">Expiry</label>
            <div className="flex gap-2">
              {[24, 48, 72].map((h) => (
                <button
                  key={h}
                  onClick={() => setExpiryHours(h)}
                  className={`flex-1 py-2 rounded-lg border transition ${
                    expiryHours === h
                      ? "border-btc bg-btc/10 text-btc"
                      : "border-ivory/10 text-ivory/70 hover:bg-ivory/5"
                  }`}
                >
                  {h}h
                </button>
              ))}
            </div>
          </div>
          {/* tBTC balance + faucet */}
          <div className="rounded-lg bg-ivory/5 p-3 flex items-center justify-between">
            <div>
              <p className="text-xs text-ivory/50">Your tBTC (ERC20) balance</p>
              <p className="font-medium">
                {tbtcBalance !== null ? formatEther(tbtcBalance) : "—"} tBTC
              </p>
            </div>
            <button
              className="btn-ghost text-xs py-1 px-3"
              onClick={mintTestBtc}
              disabled={minting || !address}
            >
              {minting ? "Minting…" : "Faucet: mint 1 tBTC"}
            </button>
          </div>
          {error && <p className="text-danger text-sm">{error}</p>}
          <div className="flex justify-end pt-2">
            <button
              className="btn-primary"
              disabled={!canNext0}
              onClick={() => { setError(null); fetchTbtcBalance(); setStep(1); }}
            >
              Next
            </button>
          </div>
        </motion.div>
      )}

      {step === 1 && (
        <motion.div className="card space-y-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <div>
            <h3 className="font-semibold mb-1">Set the 6-digit claim PIN</h3>
            <p className="text-sm text-ivory/60">
              Your recipient will need this PIN to claim. Share it over a
              different channel (call / in person), never with the link.
            </p>
          </div>
          <PinInput value={pin} onChange={setPin} autoFocus />
          <div className="flex justify-between">
            <button className="btn-ghost" onClick={() => setStep(0)}>
              Back
            </button>
            <button className="btn-primary" disabled={!canNext1} onClick={() => setStep(2)}>
              Next
            </button>
          </div>
        </motion.div>
      )}

      {step === 2 && (
        <motion.div className="card space-y-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <h3 className="font-semibold">Review & sign</h3>
          <dl className="text-sm divide-y divide-ivory/10">
            <Row k="Amount" v={`${musdAmount} MUSD`} />
            <Row k="Collateral" v={`${collateralBtc} BTC`} />
            <Row k="Recipient" v={recipientAddress || recipientPhone || "—"} />
            <Row k="Expiry" v={`${expiryHours} hours`} />
            <Row k="PIN" v="●●●●●●" />
          </dl>
          {error && <p className="text-danger text-sm">{error}</p>}
          <div className="flex justify-between pt-2">
            <button className="btn-ghost" onClick={() => setStep(1)} disabled={loading}>
              Back
            </button>
            <button className="btn-primary" onClick={submit} disabled={loading || !address}>
              {loading ? "Signing…" : "Lock collateral & send"}
            </button>
          </div>
          {!address && (
            <p className="text-xs text-ivory/50 text-right">Connect a wallet to continue.</p>
          )}
        </motion.div>
      )}

      {step === 3 && orderId && (
        <motion.div className="card space-y-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-forest/15 border border-forest/30 text-forest-300 flex items-center justify-center text-lg">
              ✓
            </div>
            <div>
              <span className="eyebrow">Confirmed on Mezo</span>
              <h3 className="font-display text-2xl text-ivory mt-1">Remittance created</h3>
              <p className="text-sm text-ivory/60">Share the claim link below with your recipient.</p>
            </div>
          </div>
          <div className="rounded-lg bg-charcoal-900/40 p-4 flex items-center justify-between gap-2">
            <code className="text-xs break-all">{claimLink}</code>
            <button
              onClick={() => navigator.clipboard.writeText(claimLink)}
              className="btn-ghost py-1 px-3 text-xs"
            >
              <Copy className="w-3 h-3" /> Copy
            </button>
          </div>
          <div className="rounded-lg bg-ivory/5 p-3">
            <p className="text-xs text-ivory/50 mb-2">Share the PIN over a different channel:</p>
            <div className="flex gap-2 flex-wrap">
              <a
                href={buildWhatsappLink(recipientPhone, claimLink, pin)}
                target="_blank"
                rel="noreferrer"
                className="btn-ghost text-xs py-1 px-3"
              >
                <MessageCircle className="w-3 h-3" /> Send PIN via WhatsApp
              </a>
              <button
                className="btn-ghost text-xs py-1 px-3"
                onClick={() => navigator.clipboard.writeText(pin)}
              >
                <Copy className="w-3 h-3" /> Copy PIN
              </button>
            </div>
          </div>
          <div className="flex gap-2">
            <Link to="/dashboard" className="btn-primary" onClick={resetForm}>
              Open dashboard
            </Link>
            <button className="btn-ghost" onClick={resetForm}>
              Send another
            </button>
            {txHash && (
              <a
                href={`https://explorer.test.mezo.org/tx/${txHash}`}
                target="_blank"
                rel="noreferrer"
                className="btn-ghost"
              >
                View tx <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        </motion.div>
      )}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between py-2">
      <dt className="text-ivory/60">{k}</dt>
      <dd className="font-medium">{v}</dd>
    </div>
  );
}

function HealthFactor({
  cr,
  min,
  safe,
  priceUsd,
}: {
  cr: number | null;
  min: number;
  safe: number;
  priceUsd: number | null;
}) {
  if (cr === null) {
    return (
      <div className="rounded-lg bg-ivory/5 p-3 text-xs text-ivory/50">
        Enter MUSD amount and BTC collateral to see your health factor.
      </div>
    );
  }
  const status: "danger" | "warn" | "ok" =
    cr < min ? "danger" : cr < safe ? "warn" : "ok";
  const colors = {
    danger: "border-danger/40 bg-danger/10 text-danger",
    warn: "border-btc/40 bg-btc/10 text-btc",
    ok: "border-ok/40 bg-ok/10 text-ok",
  } as const;
  const pct = Math.min(cr / (safe * 1.2), 1) * 100;
  const barColor = {
    danger: "bg-danger",
    warn: "bg-btc",
    ok: "bg-ok",
  } as const;
  return (
    <div className={`rounded-lg border p-3 space-y-2 ${colors[status]}`}>
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">Health factor</span>
        <span className="font-mono">
          {(cr * 100).toFixed(1)}% {status === "danger" ? "✗ too low" : status === "warn" ? "⚠ tight" : "✓ safe"}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-ivory/10 overflow-hidden">
        <div
          className={`h-full ${barColor[status]} transition-all`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-xs opacity-80">
        {status === "danger"
          ? `Collateral too low. Minimum ${(min * 100).toFixed(0)}% required — increase BTC or lower MUSD.`
          : status === "warn"
          ? `Above minimum but tight. Aim for ≥ ${(safe * 100).toFixed(0)}% to absorb price moves.`
          : `Comfortably collateralized.`}
        {priceUsd !== null && (
          <span className="block mt-0.5 text-ivory/40">
            Reference BTC price: ${priceUsd.toLocaleString()}
          </span>
        )}
      </p>
    </div>
  );
}

function buildWhatsappLink(phone: string, claimLink: string, pin: string): string {
  const text = `You've received a MUSD remittance.\n\nClaim link: ${claimLink}\nPIN: ${pin}`;
  const cleaned = phone.replace(/[^\d]/g, "");
  const base = cleaned ? `https://wa.me/${cleaned}` : `https://wa.me/`;
  return `${base}?text=${encodeURIComponent(text)}`;
}
