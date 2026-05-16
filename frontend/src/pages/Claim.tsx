import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import { formatEther, keccak256, toBytes } from "viem";
import StepIndicator from "../components/StepIndicator";
import PinInput from "../components/PinInput";
import { remittanceVaultAbi } from "../abi";
import { contractAddresses } from "../wagmi.config";
import { api } from "../api";
import { motion } from "framer-motion";

const STEPS = ["Preview", "PIN", "Claim", "Done"];

export default function Claim() {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  const [step, setStep] = useState(0);
  const [order, setOrder] = useState<Awaited<ReturnType<typeof api.getOrder>> | null>(null);
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offramp, setOfframp] = useState<string | null>(null);

  useEffect(() => {
    if (!orderId) return;
    api
      .getOrder(orderId)
      .then(setOrder)
      .catch(async () => {
        // backend down — read directly from the smart contract
        if (!publicClient) {
          setError("Backend unavailable and no RPC client");
          return;
        }
        try {
          const onchain = (await publicClient.readContract({
            address: contractAddresses.remittanceVault,
            abi: remittanceVaultAbi,
            functionName: "getOrder",
            args: [orderId as `0x${string}`],
          })) as any;
          const statusMap = ["PENDING", "CLAIMED", "CANCELLED", "LIQUIDATED"];
          setOrder({
            orderId,
            sender: onchain.sender,
            recipient: onchain.recipient,
            musdAmount: onchain.musdAmount.toString(),
            collateralBTC: onchain.collateralBTC.toString(),
            createdAt: Number(onchain.createdAt),
            expiryTimestamp: Number(onchain.expiryTimestamp),
            status: statusMap[Number(onchain.status)] as any,
          });
        } catch (rpcErr: any) {
          console.error("[claim] on-chain fallback failed", rpcErr);
          setError("Failed to fetch order from backend and chain");
        }
      });
  }, [orderId, publicClient]);

  async function submitClaim() {
    if (!orderId || !walletClient || !publicClient || !address) return;
    setError(null);
    setLoading(true);
    try {
      const claimCodeHash = keccak256(toBytes(pin));

      // Pre-simulate to catch wrong PIN / wrong recipient / expired before signing.
      try {
        await publicClient.simulateContract({
          address: contractAddresses.remittanceVault,
          abi: remittanceVaultAbi,
          functionName: "claimRemittance",
          args: [orderId as `0x${string}`, claimCodeHash],
          account: address,
        });
      } catch (simErr: any) {
        const reason = simErr?.shortMessage || simErr?.message || "";
        if (/bad pin/i.test(reason)) {
          throw new Error("Incorrect PIN. Please re-check the 6 digits with the sender.");
        }
        if (/not recipient/i.test(reason)) {
          throw new Error("This order is locked to a different recipient wallet.");
        }
        if (/not pending/i.test(reason)) {
          throw new Error("This remittance is no longer claimable (already claimed, cancelled, or liquidated).");
        }
        if (/expired/i.test(reason)) {
          throw new Error("This remittance has expired and can no longer be claimed.");
        }
        throw new Error(reason || "Claim simulation reverted");
      }

      const hash = await walletClient.writeContract({
        address: contractAddresses.remittanceVault,
        abi: remittanceVaultAbi,
        functionName: "claimRemittance",
        args: [orderId as `0x${string}`, claimCodeHash],
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") {
        throw new Error("Claim transaction reverted on-chain. The PIN may be incorrect.");
      }
      setStep(3);
    } catch (e: any) {
      const msg = e?.shortMessage || e?.message || "failed";
      setError(msg);
      if (/incorrect pin|bad pin/i.test(msg)) {
        setPin("");
        setStep(1);
      }
    } finally {
      setLoading(false);
    }
  }

  async function openOfframp() {
    if (!address || !order) return;
    const amount = formatEther(BigInt(order.musdAmount));
    const session = await api.offrampSession({
      recipientAddress: address,
      musdAmount: amount,
    });
    setOfframp(session.sessionUrl);
    window.open(session.sessionUrl, "_blank");
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <span className="eyebrow">Incoming transfer</span>
        <h1 className="font-display text-4xl text-ivory mt-2">Claim MUSD</h1>
        <p className="text-ivory/60 mt-2">Enter the 6-digit PIN shared by the sender.</p>
      </div>
      <StepIndicator steps={STEPS} current={step} />

      {error && (
        <div className="rounded-2xl bg-clay/10 border border-clay/30 px-5 py-4 mb-4">
          <p className="text-clay-400 text-sm">{error}</p>
        </div>
      )}

      {!order && !error && <div className="card">Loading order…</div>}

      {order && step === 0 && (
        <motion.div className="card space-y-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <dl className="text-sm divide-y divide-ivory/10">
            <Row k="Order" v={`${orderId?.slice(0, 12)}…${orderId?.slice(-6)}`} />
            <Row k="From" v={`${order.sender.slice(0, 6)}…${order.sender.slice(-4)}`} />
            <Row k="Amount" v={`${formatEther(BigInt(order.musdAmount))} MUSD`} />
            <Row k="Status" v={order.status} />
            <Row
              k="Expires"
              v={new Date(order.expiryTimestamp * 1000).toLocaleString()}
            />
          </dl>
          <button
            className="btn-primary w-full"
            disabled={order.status !== "PENDING"}
            onClick={() => setStep(1)}
          >
            {order.status === "PENDING" ? "Continue" : `Cannot claim (${order.status})`}
          </button>
        </motion.div>
      )}

      {step === 1 && (
        <motion.div className="card space-y-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <h3 className="font-semibold">Enter PIN</h3>
          <PinInput value={pin} onChange={setPin} autoFocus />
          <div className="flex justify-between">
            <button className="btn-ghost" onClick={() => setStep(0)}>
              Back
            </button>
            <button
              className="btn-primary"
              disabled={!/^\d{6}$/.test(pin)}
              onClick={() => setStep(2)}
            >
              Next
            </button>
          </div>
        </motion.div>
      )}

      {step === 2 && (
        <motion.div className="card space-y-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <h3 className="font-semibold">Connect wallet & claim</h3>
          <p className="text-sm text-ivory/60">
            The claimed MUSD will be sent to the wallet you connect here.
          </p>
          <ConnectButton showBalance={false} />
          <button
            className="btn-primary w-full"
            disabled={!address || loading}
            onClick={submitClaim}
          >
            {loading ? "Claiming…" : "Claim now"}
          </button>
        </motion.div>
      )}

      {step === 3 && order && (
        <motion.div className="card space-y-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-forest/15 border border-forest/30 text-forest-300 flex items-center justify-center text-lg">
              ✓
            </div>
            <div>
              <span className="eyebrow">Settled on Mezo</span>
              <h3 className="font-display text-2xl text-ivory mt-1">Claim received</h3>
            </div>
          </div>
          <p className="text-ivory/70">
            <span className="font-display text-2xl text-amber-300">{formatEther(BigInt(order.musdAmount))}</span>{" "}
            MUSD has been sent to your wallet.
          </p>
          <div className="grid md:grid-cols-2 gap-2">
            <button
              className="btn-primary"
              onClick={() => navigate(`/cashout/${orderId}`)}
            >
              Cash out to bank / UPI →
            </button>
            <button className="btn-ghost" onClick={openOfframp}>
              Spend via off-ramp
            </button>
            <button
              className="btn-ghost md:col-span-2"
              onClick={() =>
                address && navigator.clipboard.writeText(address)
              }
            >
              Copy wallet address
            </button>
          </div>
          <p className="text-[11px] text-ivory/45">
            Cash-out routes MUSD through the partner payout network
            (UPI / bank / GCash). Simulated for this demo.
          </p>
          {offramp && (
            <p className="text-xs text-ivory/40">
              Off-ramp session opened in a new tab.
            </p>
          )}
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
