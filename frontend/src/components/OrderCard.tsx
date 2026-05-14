import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { formatEther, parseEther } from "viem";
import { Copy, Check, X, Unlock } from "lucide-react";
import { usePublicClient, useWalletClient, useAccount } from "wagmi";
import { remittanceVaultAbi, erc20Abi } from "../abi";
import { contractAddresses } from "../wagmi.config";

export type OrderRow = {
  order_id: string;
  recipient: string | null;
  recipient_phone: string | null;
  musd_amount: string;
  collateral_btc: string;
  /** Cumulative MUSD already repaid via repayAndUnlock (string wei). */
  musd_repaid?: string;
  /** Cumulative BTC already released via repayAndUnlock (string wei). */
  btc_unlocked?: string;
  expiry_ts: number;
  status: string;
};

export default function OrderCard({ o, onChanged }: { o: OrderRow; onChanged?: () => void }) {
  const colors: Record<string, string> = {
    PENDING: "bg-amber/10 text-amber-300 border border-amber/25",
    CLAIMED: "bg-forest/15 text-forest-300 border border-forest/30",
    CANCELLED: "bg-ivory/5 text-ivory/55 border border-ivory/10",
    LIQUIDATED: "bg-clay/15 text-clay-400 border border-clay/30",
    SETTLED: "bg-forest/20 text-forest-300 border border-forest/40",
  };
  const expired = o.expiry_ts * 1000 < Date.now();
  const claimLink =
    typeof window !== "undefined"
      ? `${window.location.origin}/claim/${o.order_id}`
      : `/claim/${o.order_id}`;

  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const { address } = useAccount();

  const [copied, setCopied] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [unlockOpen, setUnlockOpen] = useState(false);

  const musdRemainingWei = useMemo(() => {
    const total = BigInt(o.musd_amount || "0");
    const repaid = BigInt(o.musd_repaid || "0");
    return total > repaid ? total - repaid : 0n;
  }, [o.musd_amount, o.musd_repaid]);

  const btcRemainingWei = useMemo(() => {
    const total = BigInt(o.collateral_btc || "0");
    const unlocked = BigInt(o.btc_unlocked || "0");
    return total > unlocked ? total - unlocked : 0n;
  }, [o.collateral_btc, o.btc_unlocked]);

  const canUnlock =
    o.status === "CLAIMED" && musdRemainingWei > 0n && btcRemainingWei > 0n;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(claimLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }

  async function cancel() {
    if (!walletClient || !publicClient) return;
    setCancelError(null);
    setCancelling(true);
    try {
      const hash = await walletClient.writeContract({
        address: contractAddresses.remittanceVault,
        abi: remittanceVaultAbi,
        functionName: "cancelRemittance",
        args: [o.order_id as `0x${string}`],
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") {
        throw new Error("Cancel transaction reverted");
      }
      onChanged?.();
    } catch (e: any) {
      setCancelError(e?.shortMessage || e?.message || "cancel failed");
    } finally {
      setCancelling(false);
    }
  }

  const canCancel = o.status === "PENDING" && expired;

  return (
    <div className="card relative">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-mono text-xs text-ivory/50">
            {o.order_id.slice(0, 18)}…
          </div>
          <div className="text-2xl font-semibold mt-1">
            {Number(formatEther(BigInt(o.musd_amount))).toLocaleString()} MUSD
          </div>
          <div className="text-ivory/60 text-sm">
            →{" "}
            {o.recipient_phone ||
              (o.recipient ? `${o.recipient.slice(0, 6)}…${o.recipient.slice(-4)}` : "—")}
          </div>
        </div>
        <span className={`pill ${colors[o.status] || "bg-ivory/10"}`}>
          {o.status}
        </span>
      </div>
      <div className="mt-4 flex items-center justify-between text-sm text-ivory/60">
        <span>
          Collateral: {Number(formatEther(BigInt(o.collateral_btc))).toFixed(5)} BTC
        </span>
        <span>
          {expired ? "Expired" : `Expires ${new Date(o.expiry_ts * 1000).toLocaleString()}`}
        </span>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link to={`/claim/${o.order_id}`} className="btn-ghost py-2 px-4 text-sm">
          View claim page
        </Link>
        <button onClick={copyLink} className="btn-ghost py-2 px-4 text-sm">
          {copied ? (
            <>
              <Check className="w-3 h-3" /> Copied
            </>
          ) : (
            <>
              <Copy className="w-3 h-3" /> Copy claim link
            </>
          )}
        </button>
        {o.status === "PENDING" && (
          <button
            onClick={cancel}
            disabled={!canCancel || cancelling || !walletClient}
            className="btn-ghost py-2 px-4 text-sm text-clay-400 disabled:opacity-50"
            title={canCancel ? "Cancel and reclaim BTC collateral" : "Can only cancel after expiry"}
          >
            <X className="w-3 h-3" />
            {cancelling ? "Cancelling…" : canCancel ? "Cancel remittance" : "Cancel (after expiry)"}
          </button>
        )}
        {canUnlock && (
          <button
            onClick={() => setUnlockOpen(true)}
            disabled={!walletClient}
            className="btn-ghost py-2 px-4 text-sm text-amber-300 disabled:opacity-50"
            title="Withdraw BTC collateral by repaying MUSD"
          >
            <Unlock className="w-3 h-3" /> Withdraw BTC
          </button>
        )}
      </div>
      {o.status === "CLAIMED" && BigInt(o.musd_repaid || "0") > 0n && (
        <p className="mt-3 text-xs text-ivory/50">
          Settled {Number(formatEther(BigInt(o.musd_repaid || "0"))).toFixed(2)}{" "}
          / {Number(formatEther(BigInt(o.musd_amount || "0"))).toFixed(2)} MUSD
          · unlocked {Number(formatEther(BigInt(o.btc_unlocked || "0"))).toFixed(5)} BTC
        </p>
      )}
      {cancelError && (
        <p className="mt-2 text-xs text-clay-400">{cancelError}</p>
      )}
      {unlockOpen && (
        <UnlockModal
          orderId={o.order_id}
          sender={address}
          musdRemainingWei={musdRemainingWei}
          btcRemainingWei={btcRemainingWei}
          onClose={() => setUnlockOpen(false)}
          onSuccess={() => {
            setUnlockOpen(false);
            onChanged?.();
          }}
        />
      )}
    </div>
  );
}

function UnlockModal({
  orderId,
  sender,
  musdRemainingWei,
  btcRemainingWei,
  onClose,
  onSuccess,
}: {
  orderId: string;
  sender: `0x${string}` | undefined;
  musdRemainingWei: bigint;
  btcRemainingWei: bigint;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  // Primary input: BTC amount the user wants to withdraw.
  const [btcAmount, setBtcAmount] = useState<string>(
    Number(formatEther(btcRemainingWei)).toString(),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Clamp parsed BTC to the locked amount.
  const btcOutWei = useMemo(() => {
    try {
      const v = parseEther((btcAmount || "0").trim());
      if (v <= 0n) return 0n;
      return v > btcRemainingWei ? btcRemainingWei : v;
    } catch {
      return 0n;
    }
  }, [btcAmount, btcRemainingWei]);

  // MUSD required to release `btcOutWei` of collateral. Round up so the
  // repayment is never short of the proportional debt for that BTC slice.
  const repayWei = useMemo(() => {
    if (btcOutWei === 0n || btcRemainingWei === 0n) return 0n;
    if (btcOutWei >= btcRemainingWei) return musdRemainingWei;
    const num = musdRemainingWei * btcOutWei;
    const ceilDiv = num / btcRemainingWei + (num % btcRemainingWei === 0n ? 0n : 1n);
    return ceilDiv > musdRemainingWei ? musdRemainingWei : ceilDiv;
  }, [btcOutWei, btcRemainingWei, musdRemainingWei]);

  const pct =
    btcRemainingWei === 0n
      ? 0
      : Number((btcOutWei * 10000n) / btcRemainingWei) / 100;

  async function submit() {
    if (!walletClient || !publicClient || !sender) return;
    if (repayWei === 0n) {
      setError("Enter an amount greater than zero.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      // 1) ensure allowance
      const allowance = (await publicClient.readContract({
        address: contractAddresses.musd,
        abi: erc20Abi,
        functionName: "allowance",
        args: [sender, contractAddresses.remittanceVault],
      })) as bigint;
      if (allowance < repayWei) {
        const approveHash = await walletClient.writeContract({
          address: contractAddresses.musd,
          abi: erc20Abi,
          functionName: "approve",
          args: [contractAddresses.remittanceVault, repayWei],
        });
        await publicClient.waitForTransactionReceipt({ hash: approveHash });
      }

      // 2) repayAndUnlock
      const hash = await walletClient.writeContract({
        address: contractAddresses.remittanceVault,
        abi: remittanceVaultAbi,
        functionName: "repayAndUnlock",
        args: [orderId as `0x${string}`, repayWei],
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("Unlock reverted");
      onSuccess();
    } catch (e: any) {
      setError(e?.shortMessage || e?.message || "unlock failed");
    } finally {
      setBusy(false);
    }
  }

  function setPercent(p: number) {
    const v = (btcRemainingWei * BigInt(Math.round(p * 100))) / 10000n;
    setBtcAmount(Number(formatEther(v)).toString());
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-charcoal-900/85 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md space-y-5 rounded-2xl border border-ivory/10 bg-charcoal-800 p-6 shadow-card-lg"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <span className="eyebrow">Withdraw collateral</span>
            <h3 className="font-display text-2xl text-ivory mt-1">Withdraw BTC</h3>
            <p className="text-xs text-ivory/55 mt-1">
              Enter the BTC you want back — the MUSD you need to repay updates live.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-ivory/50 hover:text-ivory transition"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="rounded-xl bg-charcoal-900/60 border border-ivory/10 p-4 text-sm space-y-1">
          <Row
            k="Outstanding debt"
            v={`${Number(formatEther(musdRemainingWei)).toLocaleString()} MUSD`}
          />
          <Row
            k="BTC currently locked"
            v={`${Number(formatEther(btcRemainingWei)).toFixed(5)} BTC`}
          />
        </div>

        <div>
          <label className="label">BTC to withdraw</label>
          <input
            className="input"
            type="number"
            min="0"
            step="0.00000001"
            value={btcAmount}
            onChange={(e) => setBtcAmount(e.target.value)}
          />
          <div className="flex gap-2 mt-2">
            {[25, 50, 75, 100].map((p) => (
              <button
                key={p}
                onClick={() => setPercent(p)}
                className="text-xs px-3 py-1 rounded-full bg-ivory/5 hover:bg-ivory/10 text-ivory/70 transition"
              >
                {p}%
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-xl bg-amber/5 border border-amber/20 p-4 text-sm">
          <Row
            k="You receive"
            v={`${Number(formatEther(btcOutWei)).toFixed(8)} BTC`}
            accent
          />
          <Row
            k="MUSD to repay"
            v={`${Number(formatEther(repayWei)).toLocaleString(undefined, { maximumFractionDigits: 6 })} MUSD`}
          />
          <Row k="Share of locked BTC" v={`${pct.toFixed(2)}%`} />
        </div>

        {error && (
          <p className="text-clay-400 text-sm">{error}</p>
        )}

        <div className="flex gap-2">
          <button className="btn-ghost flex-1" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            className="btn-primary flex-1"
            disabled={busy || repayWei === 0n || !walletClient}
            onClick={submit}
          >
            {busy ? "Unlocking…" : "Repay & unlock"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Row({ k, v, accent }: { k: string; v: string; accent?: boolean }) {
  return (
    <div className="flex justify-between py-1">
      <span className="text-ivory/55">{k}</span>
      <span className={accent ? "text-amber-300 font-medium" : "text-ivory"}>
        {v}
      </span>
    </div>
  );
}
