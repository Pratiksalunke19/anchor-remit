import { useEffect, useState } from "react";
import { useAccount, useReadContract } from "wagmi";
import { formatEther } from "viem";
import CollateralMeter from "../components/CollateralMeter";
import OrderCard, { OrderRow } from "../components/OrderCard";
import { remittanceVaultAbi } from "../abi";
import { contractAddresses } from "../wagmi.config";
import { api } from "../api";

export default function Dashboard() {
  const { address } = useAccount();
  const [orders, setOrders] = useState<OrderRow[]>([]);

  const { data: cr } = useReadContract({
    address: contractAddresses.remittanceVault,
    abi: remittanceVaultAbi,
    functionName: "vaultCollateralRatio",
    query: { refetchInterval: 10_000 },
  });

  useEffect(() => {
    if (!address) return;
    api
      .senderOrders(address)
      .then((r) => setOrders(r.orders))
      .catch(() => setOrders([]));
    const id = setInterval(() => {
      api.senderOrders(address).then((r) => setOrders(r.orders)).catch(() => {});
    }, 10_000);
    return () => clearInterval(id);
  }, [address]);

  const ratioPct = cr ? Number(formatEther(cr as bigint)) * 100 : 0;

  if (!address) {
    return (
      <div className="card max-w-xl mx-auto text-center">
        <p className="text-white/70">Connect a wallet to view your dashboard.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="grid md:grid-cols-3 gap-6">
        <div className="card md:col-span-1">
          <h2 className="font-semibold mb-4">Vault collateral</h2>
          <CollateralMeter ratio={ratioPct} />
        </div>
        <div className="card md:col-span-2">
          <h2 className="font-semibold mb-4">Summary</h2>
          <div className="grid grid-cols-3 gap-4">
            <Stat label="Your orders" value={orders.length.toString()} />
            <Stat
              label="Active"
              value={orders.filter((o) => o.status === "PENDING").length.toString()}
            />
            <Stat
              label="Claimed"
              value={orders.filter((o) => o.status === "CLAIMED").length.toString()}
            />
          </div>
          <p className="text-xs text-white/40 mt-6">
            Collateral ratio is pooled across all active orders in the vault.
            Keep it above 150% to stay safe.
          </p>
        </div>
      </div>

      <div>
        <h2 className="text-xl font-semibold mb-4">Your remittances</h2>
        {orders.length === 0 ? (
          <div className="card text-white/60">No remittances yet. Send one to get started.</div>
        ) : (
          <div className="grid md:grid-cols-2 gap-4">
            {orders.map((o) => (
              <OrderCard key={o.order_id} o={o} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-3xl font-bold">{value}</div>
      <div className="text-xs text-white/50 uppercase tracking-wide">{label}</div>
    </div>
  );
}
