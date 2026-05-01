import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import { decodeEventLog, keccak256, parseEther, toBytes } from "viem";
import StepIndicator from "../components/StepIndicator";
import PinInput from "../components/PinInput";
import { remittanceVaultAbi, erc20Abi } from "../abi";
import { contractAddresses } from "../wagmi.config";
import { api } from "../api";
import { motion } from "framer-motion";
import { Copy, ExternalLink } from "lucide-react";

const STEPS = ["Amount", "PIN", "Approve", "Done"];

export default function Send() {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  const [step, setStep] = useState(0);
  const [musdAmount, setMusdAmount] = useState("100");
  const [collateralBtc, setCollateralBtc] = useState("0.005");
  const [recipientPhone, setRecipientPhone] = useState("");
  const [recipientAddress, setRecipientAddress] = useState("");
  const [expiryHours, setExpiryHours] = useState(72);
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<`0x${string}` | null>(null);
  const [txHash, setTxHash] = useState<`0x${string}` | null>(null);

  const canNext0 =
    Number(musdAmount) > 0 &&
    Number(collateralBtc) > 0 &&
    (recipientPhone || recipientAddress);

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

      // 2. createRemittance
      const hash = await walletClient.writeContract({
        address: contractAddresses.remittanceVault,
        abi: remittanceVaultAbi,
        functionName: "createRemittance",
        args: [recipient, musd, collat, claimCodeHash, BigInt(expiryHours * 3600)],
      });
      setTxHash(hash);
      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      // parse orderId from event logs
      let parsedId: `0x${string}` | null = null;
      for (const log of receipt.logs) {
        try {
          const ev = decodeEventLog({
            abi: remittanceVaultAbi,
            data: log.data,
            topics: log.topics,
          });
          if (ev.eventName === "RemittanceCreated") {
            parsedId = (ev.args as any).orderId;
            break;
          }
        } catch {
          // not our event
        }
      }
      if (!parsedId) throw new Error("Could not parse orderId from tx");
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
      setError(e?.shortMessage || e?.message || "failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold mb-2">Send MUSD</h1>
      <p className="text-white/60 mb-8">
        Lock BTC as collateral, mint MUSD, and share a claim link with your recipient.
      </p>

      <StepIndicator steps={STEPS} current={step} />

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
            <p className="text-xs text-white/40 mt-1">
              Aim for ≥ 150% collateralization to stay safe.
            </p>
          </div>
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
                      : "border-white/10 text-white/70 hover:bg-white/5"
                  }`}
                >
                  {h}h
                </button>
              ))}
            </div>
          </div>
          <div className="flex justify-end pt-2">
            <button
              className="btn-primary"
              disabled={!canNext0}
              onClick={() => setStep(1)}
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
            <p className="text-sm text-white/60">
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
          <dl className="text-sm divide-y divide-white/10">
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
            <p className="text-xs text-white/50 text-right">Connect a wallet to continue.</p>
          )}
        </motion.div>
      )}

      {step === 3 && orderId && (
        <motion.div className="card space-y-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-ok/20 text-ok flex items-center justify-center">
              ✓
            </div>
            <div>
              <h3 className="font-semibold text-lg">Remittance created</h3>
              <p className="text-sm text-white/60">Share the claim link below with your recipient.</p>
            </div>
          </div>
          <div className="rounded-lg bg-black/40 p-4 flex items-center justify-between gap-2">
            <code className="text-xs break-all">{claimLink}</code>
            <button
              onClick={() => navigator.clipboard.writeText(claimLink)}
              className="btn-ghost py-1 px-3 text-xs"
            >
              <Copy className="w-3 h-3" /> Copy
            </button>
          </div>
          <div className="flex gap-2">
            <Link to="/dashboard" className="btn-primary">
              Open dashboard
            </Link>
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
      <dt className="text-white/60">{k}</dt>
      <dd className="font-medium">{v}</dd>
    </div>
  );
}
