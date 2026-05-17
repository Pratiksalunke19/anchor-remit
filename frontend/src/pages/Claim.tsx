/**
 * Wallet-free claim flow.
 *
 * Recipient lands here from an SMS link (`/claim/:orderId`), enters their
 * 6-digit PIN, and the backend:
 *   1. verifies the PIN against the on-chain commitment,
 *   2. mints (or reuses) a server-custodied embedded wallet,
 *   3. relays the on-chain claim,
 *   4. ERC20-transfers MUSD into the embedded wallet,
 *   5. returns a session token + wallet address.
 *
 * No MetaMask, no seed phrase, no signing, no native gas.
 */
import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ShieldCheck, Sparkles, Smartphone, AlertTriangle, CheckCircle2, Wallet } from "lucide-react";
import { formatEther, keccak256, toBytes } from "viem";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import PinInput from "../components/PinInput";
import { api, recipientSession } from "../api";
import { remittanceVaultAbi } from "../abi";
import { contractAddresses } from "../wagmi.config";

const ZERO_ADDR = "0x0000000000000000000000000000000000000000";

type Phase = "intro" | "pin" | "relaying" | "done" | "error";

export default function Claim() {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();

  const [phase, setPhase] = useState<Phase>("intro");
  const [pin, setPin] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [order, setOrder] = useState<{ status: string; musdAmount: string; recipient: string } | null>(null);
  const [success, setSuccess] = useState<{
    walletAddress: string;
    netMusd: string;
    payoutTxHash: string;
  } | null>(null);

  const { address: connectedAddress } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  useEffect(() => {
    if (!orderId) return;
    api.getOrder(orderId).then(
      (o) => setOrder({ status: o.status, musdAmount: o.musdAmount, recipient: o.recipient }),
      () => undefined,
    );
  }, [orderId]);

  const isLocked = !!order && order.recipient && order.recipient.toLowerCase() !== ZERO_ADDR;
  const lockedToConnected =
    !!isLocked &&
    !!connectedAddress &&
    order!.recipient.toLowerCase() === connectedAddress.toLowerCase();
  // Self-custody claim path: order is locked to a specific recipient.
  // Walletless relayer cannot claim it; the connected wallet must call
  // `claimRemittance` directly on-chain.
  const useSelfCustody = !!isLocked;

  const amountLabel = useMemo(() => {
    if (!order) return "—";
    try {
      return `${Number(formatEther(BigInt(order.musdAmount))).toLocaleString(undefined, {
        maximumFractionDigits: 2,
      })} MUSD`;
    } catch {
      return "—";
    }
  }, [order]);

  async function submit() {
    if (!orderId || !/^\d{6}$/.test(pin)) return;
    setError(null);
    setPhase("relaying");
    try {
      if (useSelfCustody) {
        if (!walletClient || !publicClient || !connectedAddress) {
          throw new Error("wallet-not-connected");
        }
        if (!lockedToConnected) {
          throw new Error("locked-to-other-recipient");
        }
        const claimCodeHash = keccak256(toBytes(pin));
        // simulate first to surface revert reason (bad pin, expired, etc.)
        try {
          await publicClient.simulateContract({
            address: contractAddresses.remittanceVault,
            abi: remittanceVaultAbi,
            functionName: "claimRemittance",
            args: [orderId as `0x${string}`, claimCodeHash],
            account: connectedAddress,
          });
        } catch (simErr: any) {
          const msg = String(simErr?.shortMessage || simErr?.message || "").toLowerCase();
          if (msg.includes("bad pin")) throw new Error("bad-pin");
          if (msg.includes("not pending")) throw new Error("order-not-pending");
          if (msg.includes("expired")) throw new Error("order-expired");
          if (msg.includes("not recipient")) throw new Error("locked-to-other-recipient");
          throw simErr;
        }
        const hash = await walletClient.writeContract({
          address: contractAddresses.remittanceVault,
          abi: remittanceVaultAbi,
          functionName: "claimRemittance",
          args: [orderId as `0x${string}`, claimCodeHash],
        });
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        if (receipt.status !== "success") throw new Error("claim-tx-reverted");
        setSuccess({
          walletAddress: connectedAddress,
          netMusd: order!.musdAmount, // gross; fee is small (10 bps default)
          payoutTxHash: hash,
        });
        setPhase("done");
        return;
      }

      const r = await api.recipientClaim({
        orderId,
        pin,
        phone: phone || undefined,
      });
      recipientSession.set(r.session);
      setSuccess({
        walletAddress: r.wallet.address,
        netMusd: r.netMusd,
        payoutTxHash: r.payoutTxHash,
      });
      setPhase("done");
    } catch (err: any) {
      const raw = String(err?.message || err?.shortMessage || err);
      setError(humanizeError(raw));
      setPhase("error");
    }
  }

  if (phase === "done" && success) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md mx-auto card text-center space-y-6 py-10"
      >
        <div className="w-16 h-16 mx-auto rounded-full bg-forest/15 border border-forest/30 flex items-center justify-center">
          <CheckCircle2 className="w-8 h-8 text-forest-300" />
        </div>
        <div>
          <h2 className="font-display text-3xl text-ivory mb-1">You got money!</h2>
          <p className="text-ivory/60 text-sm">
            {Number(formatEther(BigInt(success.netMusd))).toLocaleString(undefined, {
              maximumFractionDigits: 2,
            })}{" "}
            MUSD has landed in your Anchor account.
          </p>
        </div>
        <button
          className="btn-primary w-full"
          onClick={() => navigate(useSelfCustody ? "/dashboard" : "/wallet")}
        >
          {useSelfCustody ? "Open dashboard" : "Open my wallet"}
        </button>
        <p className="text-[11px] text-ivory/40">
          No app, no seed phrase. Save this device or sign in later with your phone number.
        </p>
      </motion.div>
    );
  }

  return (
    <div className="max-w-md mx-auto space-y-6">
      <header className="text-center space-y-2">
        <span className="eyebrow text-forest-300 inline-flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5" /> Secured by Mezo · Bitcoin-backed
        </span>
        <h1 className="font-display text-3xl text-ivory">Claim your money</h1>
        <p className="text-ivory/55 text-sm">
          Someone sent you {amountLabel}. Enter the 6-digit PIN they shared with you.
        </p>
      </header>

      {order?.status && order.status !== "PENDING" && (
        <div className="card border-amber/30 bg-amber/5 text-amber-200 text-sm flex gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5" />
          <div>
            This remittance is no longer pending — current status: <b>{order.status}</b>.
            Ask the sender to issue a new one.
          </div>
        </div>
      )}

      {useSelfCustody && (
        <div className="card border-amber/30 bg-amber/5 text-amber-200 text-sm flex gap-2">
          <Wallet className="w-4 h-4 mt-0.5" />
          <div className="space-y-1">
            <div>
              This remittance is locked to a specific wallet. Connect{" "}
              <span className="font-mono">
                {order!.recipient.slice(0, 6)}…{order!.recipient.slice(-4)}
              </span>{" "}
              to claim it.
            </div>
            {connectedAddress && !lockedToConnected && (
              <div className="text-amber-200/80">
                Connected wallet ({connectedAddress.slice(0, 6)}…{connectedAddress.slice(-4)}) doesn’t match.
              </div>
            )}
            {!connectedAddress && (
              <div className="text-amber-200/80">No wallet connected.</div>
            )}
          </div>
        </div>
      )}

      <motion.div
        layout
        className="card space-y-5"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        <div>
          <label className="text-xs uppercase tracking-[0.18em] text-ivory/50">
            6-digit PIN
          </label>
          <div className="mt-3">
            <PinInput value={pin} onChange={setPin} autoFocus />
          </div>
        </div>

        {!useSelfCustody && (
        <div>
          <label className="text-xs uppercase tracking-[0.18em] text-ivory/50 flex items-center gap-1.5">
            <Smartphone className="w-3 h-3" /> Phone (optional, for recovery)
          </label>
          <input
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="+15551234567"
            value={phone}
            onChange={(e) => setPhone(e.target.value.replace(/[^\d+]/g, ""))}
            className="mt-2 w-full rounded-xl bg-charcoal-900/60 border border-ivory/10 px-4 py-3 text-ivory placeholder:text-ivory/30 focus:border-amber focus:ring-2 focus:ring-amber/20 focus:outline-none"
          />
          <p className="text-[11px] text-ivory/40 mt-1.5">
            Bind your wallet to a phone number so you can sign back in from any
            device with an SMS code.
          </p>
        </div>
        )}

        {error && (
          <div className="text-sm text-danger flex gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5" /> {error}
          </div>
        )}

        <button
          className="btn-primary w-full"
          disabled={
            !/^\d{6}$/.test(pin) ||
            phase === "relaying" ||
            (useSelfCustody && !lockedToConnected)
          }
          onClick={submit}
        >
          {phase === "relaying" ? (
            <span className="inline-flex items-center gap-2">
              <Sparkles className="w-4 h-4 animate-pulse" /> Claiming on-chain…
            </span>
          ) : useSelfCustody ? (
            "Claim with my wallet"
          ) : (
            "Receive money"
          )}
        </button>

        <p className="text-[11px] text-ivory/35 text-center">
          {useSelfCustody
            ? "You'll sign a single on-chain transaction from your connected wallet. MUSD lands directly in that wallet."
            : "We pay the gas. We never see your PIN. Your wallet is created automatically and can later be exported if you want self-custody."}
        </p>
      </motion.div>

      <div className="text-center text-xs text-ivory/40">
        Already used Anchor on this phone?{" "}
        <Link to="/login" className="text-amber-300 hover:underline">
          Sign in with your number
        </Link>
      </div>
    </div>
  );
}

function humanizeError(raw: string): string {
  if (raw.includes("bad-pin")) return "That PIN doesn't match. Please double-check with the sender.";
  if (raw.includes("order-not-pending")) return "This remittance has already been claimed or cancelled.";
  if (raw.includes("order-expired")) return "This claim link has expired. Ask the sender to resend.";
  if (raw.includes("locked-to-other-recipient"))
    return "This remittance is locked to a specific wallet address. Use that wallet's app to claim.";
  if (raw.includes("too-many-attempts")) return "Too many failed attempts. Please try again in a few minutes.";
  if (raw.includes("relayer-not-configured")) return "Demo relayer is offline. Contact the sender.";
  if (raw.includes("wallet-not-connected"))
    return "Connect the recipient wallet first, then try again.";
  if (raw.includes("claim-tx-reverted")) return "The claim transaction was reverted on-chain.";
  return "Something went wrong. Please try again.";
}
