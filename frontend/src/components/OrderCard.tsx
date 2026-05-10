import { useState } from "react";
import { Link } from "react-router-dom";
import { formatEther } from "viem";
import { Copy, Check, X } from "lucide-react";
import { usePublicClient, useWalletClient } from "wagmi";
import { remittanceVaultAbi } from "../abi";
import { contractAddresses } from "../wagmi.config";

export type OrderRow = {
  order_id: string;
  recipient: string | null;
  recipient_phone: string | null;
  musd_amount: string;
  collateral_btc: string;
  expiry_ts: number;
  status: string;
};

export default function OrderCard({ o, onChanged }: { o: OrderRow; onChanged?: () => void }) {
  const colors: Record<string, string> = {
    PENDING: "bg-btc/20 text-btc",
    CLAIMED: "bg-ok/20 text-ok",
    CANCELLED: "bg-white/10 text-white/60",
    LIQUIDATED: "bg-danger/20 text-danger",
  };
  const expired = o.expiry_ts * 1000 < Date.now();
  const claimLink =
    typeof window !== "undefined"
      ? `${window.location.origin}/claim/${o.order_id}`
      : `/claim/${o.order_id}`;

  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  const [copied, setCopied] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

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
    <div className="card">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-mono text-xs text-white/50">
            {o.order_id.slice(0, 18)}…
          </div>
          <div className="text-2xl font-semibold mt-1">
            {Number(formatEther(BigInt(o.musd_amount))).toLocaleString()} MUSD
          </div>
          <div className="text-white/60 text-sm">
            →{" "}
            {o.recipient_phone ||
              (o.recipient ? `${o.recipient.slice(0, 6)}…${o.recipient.slice(-4)}` : "—")}
          </div>
        </div>
        <span className={`pill ${colors[o.status] || "bg-white/10"}`}>
          {o.status}
        </span>
      </div>
      <div className="mt-4 flex items-center justify-between text-sm text-white/60">
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
            className="btn-ghost py-2 px-4 text-sm text-danger disabled:opacity-50"
            title={canCancel ? "Cancel and reclaim BTC collateral" : "Can only cancel after expiry"}
          >
            <X className="w-3 h-3" />
            {cancelling ? "Cancelling…" : canCancel ? "Cancel remittance" : "Cancel (after expiry)"}
          </button>
        )}
      </div>
      {cancelError && (
        <p className="mt-2 text-xs text-danger">{cancelError}</p>
      )}
    </div>
  );
}
