import { useEffect, useState } from "react";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import { formatEther, parseEther } from "viem";
import { erc20Abi, insurancePoolAbi } from "../abi";
import { contractAddresses } from "../wagmi.config";
import { api } from "../api";

type Stats = { totalReserve: string; totalShares: string; health: string };

export default function Pool() {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  const [stats, setStats] = useState<Stats | null>(null);
  const [shares, setShares] = useState("0");
  const [amount, setAmount] = useState("100");
  const [withdrawShares, setWithdrawShares] = useState("");
  const [busy, setBusy] = useState<"deposit" | "withdraw" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    try {
      const s = await api.poolStats();
      setStats(s);
    } catch {
      /* backend might be down */
    }
    if (address && publicClient) {
      const x = (await publicClient.readContract({
        address: contractAddresses.insurancePool,
        abi: insurancePoolAbi,
        functionName: "sharesOf",
        args: [address],
      })) as bigint;
      setShares(formatEther(x));
    }
  }

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 15_000);
    return () => clearInterval(id);
  }, [address]);

  async function deposit() {
    if (!walletClient || !publicClient || !address) return;
    setBusy("deposit");
    setError(null);
    try {
      const amt = parseEther(amount);
      const allowance = (await publicClient.readContract({
        address: contractAddresses.musd,
        abi: erc20Abi,
        functionName: "allowance",
        args: [address, contractAddresses.insurancePool],
      })) as bigint;
      if (allowance < amt) {
        const tx = await walletClient.writeContract({
          address: contractAddresses.musd,
          abi: erc20Abi,
          functionName: "approve",
          args: [contractAddresses.insurancePool, amt],
        });
        await publicClient.waitForTransactionReceipt({ hash: tx });
      }
      const hash = await walletClient.writeContract({
        address: contractAddresses.insurancePool,
        abi: insurancePoolAbi,
        functionName: "deposit",
        args: [amt],
      });
      await publicClient.waitForTransactionReceipt({ hash });
      await refresh();
    } catch (e: any) {
      setError(e?.shortMessage || e?.message);
    } finally {
      setBusy(null);
    }
  }

  async function withdraw() {
    if (!walletClient || !publicClient) return;
    setBusy("withdraw");
    setError(null);
    try {
      const s = parseEther(withdrawShares || "0");
      const hash = await walletClient.writeContract({
        address: contractAddresses.insurancePool,
        abi: insurancePoolAbi,
        functionName: "withdraw",
        args: [s],
      });
      await publicClient.waitForTransactionReceipt({ hash });
      await refresh();
    } catch (e: any) {
      setError(e?.shortMessage || e?.message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid md:grid-cols-3 gap-6">
      <div className="card md:col-span-1 space-y-4">
        <h2 className="font-semibold">Pool stats</h2>
        <Stat label="Total reserve" value={stats ? `${Number(stats.totalReserve).toLocaleString()} MUSD` : "—"} />
        <Stat label="Total shares" value={stats ? Number(stats.totalShares).toLocaleString() : "—"} />
        <Stat label="Your shares" value={Number(shares).toLocaleString()} />
        <Stat label="Health" value={stats ? Number(stats.health).toFixed(4) : "—"} />
      </div>

      <div className="card md:col-span-2 space-y-6">
        <div>
          <h3 className="font-semibold mb-2">Deposit MUSD</h3>
          <div className="flex gap-2">
            <input
              className="input flex-1"
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <button className="btn-primary" disabled={busy !== null || !address} onClick={deposit}>
              {busy === "deposit" ? "…" : "Deposit"}
            </button>
          </div>
        </div>

        <div>
          <h3 className="font-semibold mb-2">Withdraw</h3>
          <div className="flex gap-2">
            <input
              className="input flex-1"
              type="number"
              placeholder="shares"
              value={withdrawShares}
              onChange={(e) => setWithdrawShares(e.target.value)}
            />
            <button className="btn-ghost" disabled={busy !== null || !address} onClick={withdraw}>
              {busy === "withdraw" ? "…" : "Withdraw"}
            </button>
          </div>
        </div>

        {error && <p className="text-danger text-sm">{error}</p>}

        <details className="text-sm text-white/70">
          <summary className="cursor-pointer font-medium text-white">How does the pool work?</summary>
          <div className="mt-2 space-y-2">
            <p>
              LPs deposit MUSD to provide a guarantee buffer. Each remittance
              contributes a 0.1% fee which accumulates in the pool.
            </p>
            <p>
              When a vault position becomes under-collateralized (CR &lt; 110%),
              a keeper triggers <code>liquidationGuard</code>, which draws from
              the pool to make the recipient whole.
            </p>
            <p>
              Withdrawals burn shares pro-rata against the current reserve.
            </p>
          </div>
        </details>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-white/50 uppercase tracking-wide">{label}</div>
      <div className="text-xl font-semibold mt-1">{value}</div>
    </div>
  );
}
