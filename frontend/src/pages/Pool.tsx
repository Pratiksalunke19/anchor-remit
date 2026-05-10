import { useEffect, useMemo, useRef, useState } from "react";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import { formatEther, parseEther } from "viem";
import { ArrowDownToLine, ShieldCheck, TrendingUp, Wallet } from "lucide-react";
import { erc20Abi, insurancePoolAbi } from "../abi";
import { contractAddresses } from "../wagmi.config";
import { api } from "../api";

type Stats = { totalReserve: string; totalShares: string; health: string };
type Metrics = {
  totalFeesMusd: number;
  feeCount: number;
  claimsCovered: number;
  totalCoveredMusd: number;
  earliestFeeTs: number | null;
  apyPct: number | null;
};

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
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const depositCardRef = useRef<HTMLDivElement | null>(null);

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

  // Compute on-chain metrics: total fees collected, claims covered, APY.
  async function loadMetrics() {
    if (!publicClient) return;
    try {
      const [feeLogs, coverLogs] = await Promise.all([
        publicClient.getContractEvents({
          address: contractAddresses.insurancePool,
          abi: insurancePoolAbi,
          eventName: "FeeReceived",
          fromBlock: 0n,
        }),
        publicClient.getContractEvents({
          address: contractAddresses.insurancePool,
          abi: insurancePoolAbi,
          eventName: "ShortfallCovered",
          fromBlock: 0n,
        }),
      ]);

      let totalFees = 0n;
      for (const l of feeLogs) totalFees += BigInt((l.args as any).amount ?? 0);
      let totalCovered = 0n;
      for (const l of coverLogs) totalCovered += BigInt((l.args as any).amount ?? 0);

      let earliestFeeTs: number | null = null;
      if (feeLogs.length > 0) {
        const earliest = feeLogs.reduce((min, l) =>
          l.blockNumber! < min.blockNumber! ? l : min
        );
        try {
          const block = await publicClient.getBlock({ blockNumber: earliest.blockNumber! });
          earliestFeeTs = Number(block.timestamp);
        } catch {
          /* skip if RPC can’t fetch old block */
        }
      }

      const totalFeesMusd = Number(formatEther(totalFees));
      const totalCoveredMusd = Number(formatEther(totalCovered));

      let apyPct: number | null = null;
      const tvl = stats ? Number(stats.totalReserve) : 0;
      if (totalFeesMusd > 0 && earliestFeeTs && tvl > 0) {
        const elapsed = Math.max(1, Math.floor(Date.now() / 1000) - earliestFeeTs);
        const yearSecs = 365 * 24 * 3600;
        apyPct = (totalFeesMusd / tvl) * (yearSecs / elapsed) * 100;
      }

      setMetrics({
        totalFeesMusd,
        feeCount: feeLogs.length,
        claimsCovered: coverLogs.length,
        totalCoveredMusd,
        earliestFeeTs,
        apyPct,
      });
    } catch (e) {
      console.warn("[pool] metrics load failed", e);
    }
  }

  useEffect(() => {
    loadMetrics();
    const id = setInterval(loadMetrics, 30_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publicClient, stats?.totalReserve]);

  function scrollToDeposit() {
    depositCardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

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

  const tvl = stats ? Number(stats.totalReserve) : 0;
  const userSharesNum = Number(shares);
  const userValueMusd = useMemo(() => {
    if (!stats || Number(stats.totalShares) === 0) return 0;
    return (userSharesNum * Number(stats.totalReserve)) / Number(stats.totalShares);
  }, [stats, userSharesNum]);

  return (
    <div className="space-y-6">
      {/* Hero / Become LP CTA */}
      <div className="card bg-gradient-to-br from-btc/10 to-white/5 border-btc/30">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-btc text-xs uppercase tracking-wide font-semibold">
              <ShieldCheck className="w-4 h-4" /> Liquidity Provider Pool
            </div>
            <h2 className="text-2xl md:text-3xl font-bold mt-1">
              Earn yield by underwriting Bitcoin remittances
            </h2>
            <p className="text-white/70 text-sm mt-2 max-w-xl">
              Deposit MUSD to backstop under-collateralised orders. Every claim
              routes a 0.1% fee to the pool — LPs share these fees pro-rata.
            </p>
          </div>
          <div className="flex flex-col items-end">
            <div className="text-xs text-white/50 uppercase tracking-wide">Current APY</div>
            <div className="text-4xl font-bold text-ok">
              {metrics?.apyPct != null
                ? `${metrics.apyPct.toFixed(2)}%`
                : "—"}
            </div>
            <button
              className="btn-primary mt-3"
              onClick={scrollToDeposit}
              disabled={!address}
            >
              <Wallet className="w-4 h-4" />
              {address ? "Become an LP" : "Connect to become LP"}
            </button>
          </div>
        </div>
      </div>

      {/* Headline metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard
          icon={<TrendingUp className="w-4 h-4" />}
          label="Total value locked"
          value={tvl ? `${tvl.toLocaleString(undefined, { maximumFractionDigits: 2 })} MUSD` : "—"}
        />
        <MetricCard
          icon={<TrendingUp className="w-4 h-4" />}
          label="Fees earned (lifetime)"
          value={
            metrics
              ? `${metrics.totalFeesMusd.toLocaleString(undefined, { maximumFractionDigits: 4 })} MUSD`
              : "—"
          }
          sub={metrics ? `${metrics.feeCount} fee event${metrics.feeCount === 1 ? "" : "s"}` : undefined}
        />
        <MetricCard
          icon={<ShieldCheck className="w-4 h-4" />}
          label="Claims covered"
          value={metrics ? metrics.claimsCovered.toString() : "—"}
          sub={
            metrics && metrics.totalCoveredMusd > 0
              ? `${metrics.totalCoveredMusd.toLocaleString(undefined, { maximumFractionDigits: 2 })} MUSD paid out`
              : "No shortfalls yet"
          }
        />
        <MetricCard
          icon={<Wallet className="w-4 h-4" />}
          label="Your position"
          value={
            userSharesNum > 0
              ? `${userValueMusd.toLocaleString(undefined, { maximumFractionDigits: 2 })} MUSD`
              : "—"
          }
          sub={userSharesNum > 0 ? `${userSharesNum.toLocaleString()} shares` : "Not yet an LP"}
        />
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <div ref={depositCardRef} className="card md:col-span-2 space-y-6">
          <div>
            <h3 className="font-semibold mb-2 flex items-center gap-2">
              <ArrowDownToLine className="w-4 h-4" /> Deposit MUSD
            </h3>
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
            <div className="flex gap-2 mt-2">
              {["100", "500", "1000"].map((v) => (
                <button
                  key={v}
                  onClick={() => setAmount(v)}
                  className="text-xs px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-white/70"
                >
                  {v} MUSD
                </button>
              ))}
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
            {userSharesNum > 0 && (
              <button
                onClick={() => setWithdrawShares(shares)}
                className="text-xs text-white/50 hover:text-white mt-2"
              >
                Use max ({userSharesNum.toLocaleString()} shares)
              </button>
            )}
          </div>

          {error && <p className="text-danger text-sm">{error}</p>}
        </div>

        <div className="card md:col-span-1 space-y-4">
          <h2 className="font-semibold">Pool details</h2>
          <Stat label="Total shares" value={stats ? Number(stats.totalShares).toLocaleString() : "—"} />
          <Stat label="Your shares" value={userSharesNum.toLocaleString()} />
          <Stat label="Health ratio" value={stats ? Number(stats.health).toFixed(4) : "—"} />
          {metrics?.earliestFeeTs && (
            <Stat
              label="Earning since"
              value={new Date(metrics.earliestFeeTs * 1000).toLocaleDateString()}
            />
          )}
        </div>
      </div>

      <details className="card text-sm text-white/70">
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
            APY is computed from observed fee inflows: <code>(totalFees / TVL) × (year / elapsed)</code>.
            With more usage and longer history, this number stabilises.
          </p>
          <p>Withdrawals burn shares pro-rata against the current reserve.</p>
        </div>
      </details>
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="card">
      <div className="flex items-center gap-2 text-white/50 text-xs uppercase tracking-wide">
        {icon}
        {label}
      </div>
      <div className="text-2xl font-bold mt-2">{value}</div>
      {sub && <div className="text-xs text-white/40 mt-1">{sub}</div>}
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
