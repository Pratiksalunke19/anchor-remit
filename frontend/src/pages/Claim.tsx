import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
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
    api.getOrder(orderId).then(setOrder).catch((e) => setError(e.message));
  }, [orderId]);

  async function submitClaim() {
    if (!orderId || !walletClient || !publicClient) return;
    setError(null);
    setLoading(true);
    try {
      const claimCodeHash = keccak256(toBytes(pin));
      const hash = await walletClient.writeContract({
        address: contractAddresses.remittanceVault,
        abi: remittanceVaultAbi,
        functionName: "claimRemittance",
        args: [orderId as `0x${string}`, claimCodeHash],
      });
      await publicClient.waitForTransactionReceipt({ hash });
      setStep(3);
    } catch (e: any) {
      setError(e?.shortMessage || e?.message || "failed");
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
      <h1 className="text-3xl font-bold mb-2">Claim MUSD</h1>
      <p className="text-white/60 mb-8">Enter the 6-digit PIN shared by the sender.</p>
      <StepIndicator steps={STEPS} current={step} />

      {error && (
        <div className="card bg-danger/10 border-danger/40 mb-4">
          <p className="text-danger text-sm">{error}</p>
        </div>
      )}

      {!order && !error && <div className="card">Loading order…</div>}

      {order && step === 0 && (
        <motion.div className="card space-y-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <dl className="text-sm divide-y divide-white/10">
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
          <p className="text-sm text-white/60">
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
          <h3 className="font-semibold text-lg text-ok">Claimed ✓</h3>
          <p className="text-white/70">
            {formatEther(BigInt(order.musdAmount))} MUSD has been sent to your wallet.
          </p>
          <div className="grid md:grid-cols-2 gap-2">
            <button className="btn-primary" onClick={openOfframp}>
              Spend via off-ramp
            </button>
            <button
              className="btn-ghost"
              onClick={() =>
                address && navigator.clipboard.writeText(address)
              }
            >
              Copy wallet address
            </button>
          </div>
          {offramp && (
            <p className="text-xs text-white/40">
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
      <dt className="text-white/60">{k}</dt>
      <dd className="font-medium">{v}</dd>
    </div>
  );
}
