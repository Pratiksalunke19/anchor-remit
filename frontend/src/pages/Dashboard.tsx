import { useEffect, useState } from "react";
import { useAccount, usePublicClient, useReadContract } from "wagmi";
import { formatEther } from "viem";
import CollateralMeter from "../components/CollateralMeter";
import OrderCard, { OrderRow } from "../components/OrderCard";
import LiveFeed from "../components/LiveFeed";
import { remittanceVaultAbi } from "../abi";
import { contractAddresses } from "../wagmi.config";
import { api } from "../api";

type Tab = "sent" | "received";

export default function Dashboard() {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [received, setReceived] = useState<OrderRow[]>([]);
  const [tab, setTab] = useState<Tab>("sent");

  const { data: cr } = useReadContract({
    address: contractAddresses.remittanceVault,
    abi: remittanceVaultAbi,
    functionName: "vaultCollateralRatio",
    query: { refetchInterval: 10_000 },
  });

  async function fetchOnChainOrders(
    addr: `0x${string}`,
    role: "sender" | "recipient",
  ): Promise<OrderRow[]> {
    if (!publicClient) return [];
    const statusMap = ["PENDING", "CLAIMED", "CANCELLED", "LIQUIDATED", "SETTLED"];
    const logs = await publicClient.getContractEvents({
      address: contractAddresses.remittanceVault,
      abi: remittanceVaultAbi,
      eventName: "RemittanceCreated",
      args: role === "sender" ? { sender: addr } : { recipient: addr },
      fromBlock: 0n,
    });
    const rows: OrderRow[] = [];
    for (const log of logs) {
      const oid = (log.args as any).orderId as string;
      try {
        const o = (await publicClient.readContract({
          address: contractAddresses.remittanceVault,
          abi: remittanceVaultAbi,
          functionName: "getOrder",
          args: [oid as `0x${string}`],
        })) as any;
        rows.push({
          order_id: oid,
          recipient: o.recipient,
          recipient_phone: null,
          musd_amount: o.musdAmount.toString(),
          collateral_btc: o.collateralBTC.toString(),
          musd_repaid: (o.musdRepaid ?? 0n).toString(),
          btc_unlocked: (o.btcUnlocked ?? 0n).toString(),
          expiry_ts: Number(o.expiryTimestamp),
          status: statusMap[Number(o.status)] || "PENDING",
        });
      } catch {
        // skip unreadable orders
      }
    }
    return rows;
  }

  function mergeOrders(a: OrderRow[], b: OrderRow[]): OrderRow[] {
    const map = new Map<string, OrderRow>();
    // Later entries win, so put on-chain (authoritative) last to override
    // stale backend status fields.
    for (const o of a) map.set(o.order_id.toLowerCase(), o);
    for (const o of b) map.set(o.order_id.toLowerCase(), { ...map.get(o.order_id.toLowerCase()), ...o });
    return Array.from(map.values()).sort((x, y) => (y.expiry_ts || 0) - (x.expiry_ts || 0));
  }

  async function fetchOrders(addr: `0x${string}`) {
    // Always pull on-chain events so orders show up even when the backend
    // missed `registerOrder` (e.g. relayer was offline). Merge with backend
    // data (which carries phone, off-chain notes) when available.
    // sent
    let backendSent: OrderRow[] = [];
    try {
      const r = await api.senderOrders(addr);
      backendSent = r.orders;
    } catch {
      backendSent = [];
    }
    const onchainSent = await fetchOnChainOrders(addr, "sender");
    setOrders(mergeOrders(backendSent, onchainSent));

    // received
    let backendRecv: OrderRow[] = [];
    try {
      const r = await api.recipientOrders(addr);
      backendRecv = r.orders;
    } catch {
      backendRecv = [];
    }
    const onchainRecv = await fetchOnChainOrders(addr, "recipient");
    setReceived(mergeOrders(backendRecv, onchainRecv));
  }

  useEffect(() => {
    if (!address) return;
    fetchOrders(address as `0x${string}`);
    const id = setInterval(() => {
      fetchOrders(address as `0x${string}`);
    }, 15_000);
    return () => clearInterval(id);
  }, [address, publicClient]);

  const ratioPct = cr ? Number(formatEther(cr as bigint)) * 100 : 0;

  if (!address) {
    return (
      <div className="space-y-8">
        <LiveFeed />
        <div className="card max-w-xl mx-auto text-center">
          <p className="text-ivory/70">
            Connect a wallet to view your personal dashboard.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <span className="eyebrow">Account overview</span>
          <h1 className="font-display text-4xl text-ivory mt-2">Dashboard</h1>
          <p className="text-ivory/60 mt-1">Track your transfers, vault health, and global activity.</p>
        </div>
        <span className="pill-muted self-start md:self-auto">{address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "Not connected"}</span>
      </div>

      <LiveFeed />

      <div className="grid md:grid-cols-3 gap-6">
        <div className="card md:col-span-1">
          <span className="eyebrow">Vault collateral</span>
          <h2 className="font-display text-xl text-ivory mt-2 mb-4">Health gauge</h2>
          <CollateralMeter ratio={ratioPct} />
        </div>
        <div className="card md:col-span-2">
          <span className="eyebrow">Summary</span>
          <h2 className="font-display text-xl text-ivory mt-2 mb-6">Your activity</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <Stat label="Sent" value={orders.length.toString()} />
            <Stat label="Received" value={received.length.toString()} />
            <Stat
              label="Active sent"
              value={orders.filter((o) => o.status === "PENDING").length.toString()}
            />
            <Stat
              label="BTC locked"
              value={(() => {
                const total = orders
                  .filter((o) => o.status === "CLAIMED")
                  .reduce((acc, o) => {
                    const total = BigInt(o.collateral_btc || "0");
                    const unlocked = BigInt(o.btc_unlocked || "0");
                    return acc + (total > unlocked ? total - unlocked : 0n);
                  }, 0n);
                return Number(formatEther(total)).toFixed(5);
              })()}
            />
          </div>
          <p className="text-xs text-ivory/45 mt-6 leading-relaxed border-t border-ivory/10 pt-4">
            Collateral ratio is pooled across all active orders in the vault.
            Keep it above 150% to stay safe.
          </p>
        </div>
      </div>

      <div>
        <div className="flex items-center gap-2 mb-5">
          <span className="eyebrow">Transfers</span>
          <h2 className="font-display text-2xl text-ivory ml-3">Your remittances</h2>
          <div className="ml-auto flex gap-1 bg-charcoal-700/70 border border-ivory/10 rounded-full p-1">
            <TabBtn active={tab === "sent"} onClick={() => setTab("sent")}>
              Sent ({orders.length})
            </TabBtn>
            <TabBtn active={tab === "received"} onClick={() => setTab("received")}>
              Received ({received.length})
            </TabBtn>
          </div>
        </div>
        {tab === "sent" ? (
          orders.length === 0 ? (
            <div className="card text-ivory/60">No remittances sent yet.</div>
          ) : (
            <div className="grid md:grid-cols-2 gap-4">
              {orders.map((o) => (
                <OrderCard
                  key={o.order_id}
                  o={o}
                  onChanged={() => address && fetchOrders(address as `0x${string}`)}
                />
              ))}
            </div>
          )
        ) : received.length === 0 ? (
          <div className="card text-ivory/60">
            No incoming remittances yet. Once someone sends to your wallet, it
            will appear here.
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-4">
            {received.map((o) => (
              <OrderCard
                key={o.order_id}
                o={o}
                onChanged={() => address && fetchOrders(address as `0x${string}`)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-1.5 rounded-full text-sm font-medium transition ${
        active
          ? "bg-amber-sheen text-charcoal-900 shadow-glow"
          : "text-ivory/65 hover:text-ivory"
      }`}
    >
      {children}
    </button>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="stat-value">{value}</div>
      <div className="stat-label mt-1">{label}</div>
    </div>
  );
}
