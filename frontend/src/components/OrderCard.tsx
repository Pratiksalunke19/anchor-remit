import { Link } from "react-router-dom";
import { formatEther } from "viem";

export type OrderRow = {
  order_id: string;
  recipient: string | null;
  recipient_phone: string | null;
  musd_amount: string;
  collateral_btc: string;
  expiry_ts: number;
  status: string;
};

export default function OrderCard({ o }: { o: OrderRow }) {
  const colors: Record<string, string> = {
    PENDING: "bg-btc/20 text-btc",
    CLAIMED: "bg-ok/20 text-ok",
    CANCELLED: "bg-white/10 text-white/60",
    LIQUIDATED: "bg-danger/20 text-danger",
  };
  const expired = o.expiry_ts * 1000 < Date.now();
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
      <div className="mt-4 flex gap-2">
        <Link to={`/claim/${o.order_id}`} className="btn-ghost py-2 px-4 text-sm">
          View claim page
        </Link>
      </div>
    </div>
  );
}
