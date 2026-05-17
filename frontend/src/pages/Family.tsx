import { useEffect, useMemo, useState } from "react";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import { formatEther, isAddress, parseEther } from "viem";
import {
  Users,
  ShieldCheck,
  Coins,
  PiggyBank,
  UserPlus,
  ArrowDownToLine,
  ArrowUpFromLine,
  Trash2,
} from "lucide-react";
import { erc20Abi, familyCreditAbi } from "../abi";
import { contractAddresses } from "../wagmi.config";

type FamilySnapshot = {
  exists: boolean;
  collateralBTC: bigint;
  musdMinted: bigint;
  totalBorrowed: bigint;
  available: bigint;
  memberList: `0x${string}`[];
};

type MemberRow = {
  member: `0x${string}`;
  limit: bigint;
  borrowed: bigint;
  active: boolean;
};

const ZERO = "0x0000000000000000000000000000000000000000";

export default function Family() {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  const familyAddr = contractAddresses.familyCredit;
  const configured = familyAddr && familyAddr !== ZERO;

  // ------- shared -------
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // ------- head's own family (if any) -------
  const [own, setOwn] = useState<FamilySnapshot | null>(null);
  const [members, setMembers] = useState<MemberRow[]>([]);

  // ------- create / mint inputs -------
  const [createBtc, setCreateBtc] = useState("0.05");
  const [createMusd, setCreateMusd] = useState("1500");

  const [topupBtc, setTopupBtc] = useState("0");
  const [topupMusd, setTopupMusd] = useState("0");

  const [withdrawMusd, setWithdrawMusd] = useState("");
  const [withdrawBtc, setWithdrawBtc] = useState("");

  // ------- member admin -------
  const [newMember, setNewMember] = useState("");
  const [newLimit, setNewLimit] = useState("100");

  // ------- member-side (borrower) -------
  const [headInput, setHeadInput] = useState("");
  const [activeHead, setActiveHead] = useState<`0x${string}` | null>(null);
  const [headFamily, setHeadFamily] = useState<FamilySnapshot | null>(null);
  const [myMember, setMyMember] = useState<MemberRow | null>(null);
  const [borrowAmt, setBorrowAmt] = useState("50");
  const [repayAmt, setRepayAmt] = useState("50");

  function clearMessages() {
    setError(null);
    setSuccess(null);
  }

  async function loadOwn() {
    if (!publicClient || !address || !configured) return;
    try {
      const r = (await publicClient.readContract({
        address: familyAddr,
        abi: familyCreditAbi,
        functionName: "getFamily",
        args: [address],
      })) as readonly [
        boolean,
        bigint,
        bigint,
        bigint,
        bigint,
        readonly `0x${string}`[]
      ];
      const snap: FamilySnapshot = {
        exists: r[0],
        collateralBTC: r[1],
        musdMinted: r[2],
        totalBorrowed: r[3],
        available: r[4],
        memberList: [...r[5]],
      };
      setOwn(snap);
      if (snap.exists && snap.memberList.length > 0) {
        const rows: MemberRow[] = await Promise.all(
          snap.memberList.map(async (m) => {
            const x = (await publicClient.readContract({
              address: familyAddr,
              abi: familyCreditAbi,
              functionName: "getMember",
              args: [address, m],
            })) as readonly [bigint, bigint, boolean];
            return { member: m, limit: x[0], borrowed: x[1], active: x[2] };
          })
        );
        setMembers(rows);
      } else {
        setMembers([]);
      }
    } catch (e) {
      console.warn("[family] loadOwn", e);
    }
  }

  async function loadHeadView(head: `0x${string}`) {
    if (!publicClient || !address || !configured) return;
    try {
      const r = (await publicClient.readContract({
        address: familyAddr,
        abi: familyCreditAbi,
        functionName: "getFamily",
        args: [head],
      })) as readonly [
        boolean,
        bigint,
        bigint,
        bigint,
        bigint,
        readonly `0x${string}`[]
      ];
      const snap: FamilySnapshot = {
        exists: r[0],
        collateralBTC: r[1],
        musdMinted: r[2],
        totalBorrowed: r[3],
        available: r[4],
        memberList: [...r[5]],
      };
      setHeadFamily(snap);
      const m = (await publicClient.readContract({
        address: familyAddr,
        abi: familyCreditAbi,
        functionName: "getMember",
        args: [head, address],
      })) as readonly [bigint, bigint, boolean];
      setMyMember({
        member: address,
        limit: m[0],
        borrowed: m[1],
        active: m[2],
      });
    } catch (e) {
      console.warn("[family] loadHeadView", e);
    }
  }

  useEffect(() => {
    loadOwn();
    const id = setInterval(loadOwn, 15_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publicClient, address, configured]);

  useEffect(() => {
    if (activeHead) {
      loadHeadView(activeHead);
      const id = setInterval(() => loadHeadView(activeHead), 15_000);
      return () => clearInterval(id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeHead, publicClient, address]);

  async function ensureAllowance(
    token: `0x${string}`,
    spender: `0x${string}`,
    amount: bigint
  ) {
    if (!walletClient || !publicClient || !address) return;
    if (amount === 0n) return;
    const cur = (await publicClient.readContract({
      address: token,
      abi: erc20Abi,
      functionName: "allowance",
      args: [address, spender],
    })) as bigint;
    if (cur >= amount) return;
    const tx = await walletClient.writeContract({
      address: token,
      abi: erc20Abi,
      functionName: "approve",
      args: [spender, amount],
    });
    await publicClient.waitForTransactionReceipt({ hash: tx });
  }

  function err(e: any) {
    setError(e?.shortMessage || e?.message || "Transaction failed");
  }

  // -------------------- head actions --------------------

  async function createFamily() {
    if (!walletClient || !publicClient || !address) return;
    setBusy("create");
    clearMessages();
    try {
      const btcAmt = parseEther(createBtc);
      const musdAmt = parseEther(createMusd);
      await ensureAllowance(contractAddresses.btc, familyAddr, btcAmt);
      const hash = await walletClient.writeContract({
        address: familyAddr,
        abi: familyCreditAbi,
        functionName: "createFamily",
        args: [btcAmt, musdAmt],
      });
      await publicClient.waitForTransactionReceipt({ hash });
      setSuccess(`Family created. ${createMusd} MUSD pool ready.`);
      await loadOwn();
    } catch (e) {
      err(e);
    } finally {
      setBusy(null);
    }
  }

  async function topUp() {
    if (!walletClient || !publicClient || !address) return;
    setBusy("topup");
    clearMessages();
    try {
      const btcAmt = topupBtc ? parseEther(topupBtc) : 0n;
      const musdAmt = topupMusd ? parseEther(topupMusd) : 0n;
      if (btcAmt === 0n && musdAmt === 0n) {
        setError("Specify BTC, MUSD or both.");
        return;
      }
      if (btcAmt > 0n)
        await ensureAllowance(contractAddresses.btc, familyAddr, btcAmt);
      const hash = await walletClient.writeContract({
        address: familyAddr,
        abi: familyCreditAbi,
        functionName: "addCollateralAndMint",
        args: [btcAmt, musdAmt],
      });
      await publicClient.waitForTransactionReceipt({ hash });
      setSuccess("Pool topped up.");
      setTopupBtc("0");
      setTopupMusd("0");
      await loadOwn();
    } catch (e) {
      err(e);
    } finally {
      setBusy(null);
    }
  }

  async function withdraw() {
    if (!walletClient || !publicClient) return;
    setBusy("withdraw");
    clearMessages();
    try {
      const repay = parseEther(withdrawMusd || "0");
      const out = parseEther(withdrawBtc || "0");
      const hash = await walletClient.writeContract({
        address: familyAddr,
        abi: familyCreditAbi,
        functionName: "withdrawCollateral",
        args: [repay, out],
      });
      await publicClient.waitForTransactionReceipt({ hash });
      setSuccess(`Withdrew ${withdrawBtc} BTC, repaid ${withdrawMusd} MUSD.`);
      setWithdrawMusd("");
      setWithdrawBtc("");
      await loadOwn();
    } catch (e) {
      err(e);
    } finally {
      setBusy(null);
    }
  }

  async function setLimit(member: `0x${string}`, limit: string) {
    if (!walletClient || !publicClient) return;
    setBusy(`limit-${member}`);
    clearMessages();
    try {
      const hash = await walletClient.writeContract({
        address: familyAddr,
        abi: familyCreditAbi,
        functionName: "setMemberLimit",
        args: [member, parseEther(limit)],
      });
      await publicClient.waitForTransactionReceipt({ hash });
      setSuccess(`Limit updated for ${short(member)}.`);
      await loadOwn();
    } catch (e) {
      err(e);
    } finally {
      setBusy(null);
    }
  }

  async function addMember() {
    if (!isAddress(newMember)) {
      setError("Invalid member address.");
      return;
    }
    await setLimit(newMember as `0x${string}`, newLimit);
    setNewMember("");
  }

  async function removeMember(member: `0x${string}`) {
    if (!walletClient || !publicClient) return;
    setBusy(`rm-${member}`);
    clearMessages();
    try {
      const hash = await walletClient.writeContract({
        address: familyAddr,
        abi: familyCreditAbi,
        functionName: "removeMember",
        args: [member],
      });
      await publicClient.waitForTransactionReceipt({ hash });
      setSuccess(`Removed ${short(member)}.`);
      await loadOwn();
    } catch (e) {
      err(e);
    } finally {
      setBusy(null);
    }
  }

  // -------------------- member actions --------------------

  async function lookupHead() {
    clearMessages();
    if (!isAddress(headInput)) {
      setError("Invalid head address.");
      return;
    }
    setActiveHead(headInput as `0x${string}`);
  }

  async function borrow() {
    if (!walletClient || !publicClient || !activeHead) return;
    setBusy("borrow");
    clearMessages();
    try {
      const hash = await walletClient.writeContract({
        address: familyAddr,
        abi: familyCreditAbi,
        functionName: "borrow",
        args: [activeHead, parseEther(borrowAmt)],
      });
      await publicClient.waitForTransactionReceipt({ hash });
      setSuccess(`Borrowed ${borrowAmt} MUSD.`);
      await loadHeadView(activeHead);
    } catch (e) {
      err(e);
    } finally {
      setBusy(null);
    }
  }

  async function repay() {
    if (!walletClient || !publicClient || !address || !activeHead) return;
    setBusy("repay");
    clearMessages();
    try {
      const amt = parseEther(repayAmt);
      await ensureAllowance(contractAddresses.musd, familyAddr, amt);
      const hash = await walletClient.writeContract({
        address: familyAddr,
        abi: familyCreditAbi,
        functionName: "repay",
        args: [activeHead, amt],
      });
      await publicClient.waitForTransactionReceipt({ hash });
      setSuccess(`Repaid ${repayAmt} MUSD.`);
      await loadHeadView(activeHead);
    } catch (e) {
      err(e);
    } finally {
      setBusy(null);
    }
  }

  // -------------------- derived --------------------

  const utilisationPct = useMemo(() => {
    if (!own || own.musdMinted === 0n) return 0;
    return Number((own.totalBorrowed * 10000n) / own.musdMinted) / 100;
  }, [own]);

  // -------------------- render --------------------

  if (!configured) {
    return (
      <div className="card">
        <h2 className="font-display text-2xl">Family Credit</h2>
        <p className="text-ivory/60 mt-2">
          Configure <code>VITE_FAMILY_CREDIT</code> in <code>.env</code> after
          deploying <code>FamilyCredit.sol</code> to enable this page.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-3xl border border-ivory/10 bg-gradient-to-br from-charcoal-700/80 via-charcoal-800/80 to-charcoal-900/90 p-8 md:p-10 shadow-card-lg">
        <div className="absolute -top-24 -right-24 w-72 h-72 rounded-full bg-amber/10 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-32 -left-24 w-72 h-72 rounded-full bg-forest/10 blur-3xl pointer-events-none" />
        <div className="relative max-w-2xl">
          <div className="inline-flex items-center gap-2 eyebrow">
            <Users className="w-3.5 h-3.5" /> Credit Delegation
          </div>
          <h2 className="font-display text-3xl md:text-5xl text-ivory mt-3 leading-[1.05]">
            Lock BTC once. Lend MUSD to your family.
          </h2>
          <p className="text-ivory/65 mt-4 max-w-xl leading-relaxed">
            As a family head, deposit BTC collateral and mint a shared MUSD
            pool. Assign per-member credit limits — they borrow without ever
            touching your keys. They repay, your collateral is freed.
          </p>
        </div>
      </div>

      {(error || success) && (
        <div
          className={`rounded-lg border text-sm px-3 py-2 flex items-start justify-between gap-2 ${
            error
              ? "border-danger/40 bg-danger/10 text-danger"
              : "border-forest/40 bg-forest/10 text-forest-300"
          }`}
        >
          <span className="flex-1">{error || success}</span>
          <button
            onClick={clearMessages}
            className="text-xs opacity-70 hover:opacity-100"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Head dashboard */}
      {!own || !own.exists ? (
        <div className="card space-y-4">
          <h3 className="font-display text-2xl flex items-center gap-2">
            <PiggyBank className="w-5 h-5 text-amber-300" /> Open a family pool
          </h3>
          <p className="text-ivory/60 text-sm">
            Deposit BTC collateral and mint MUSD into a delegated credit pool.
            Mezo enforces 150% min collateralisation.
          </p>
          <div className="grid md:grid-cols-2 gap-4">
            <Field
              label="BTC collateral"
              value={createBtc}
              onChange={setCreateBtc}
              suffix="tBTC"
            />
            <Field
              label="MUSD to mint"
              value={createMusd}
              onChange={setCreateMusd}
              suffix="MUSD"
            />
          </div>
          <button
            className="btn-primary"
            disabled={busy !== null || !address}
            onClick={createFamily}
          >
            {busy === "create" ? "…" : "Create family"}
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <MetricCard
              icon={<Coins className="w-4 h-4" />}
              label="Collateral locked"
              value={`${formatEther(own.collateralBTC)} tBTC`}
            />
            <MetricCard
              icon={<PiggyBank className="w-4 h-4" />}
              label="Pool minted"
              value={`${num(own.musdMinted)} MUSD`}
            />
            <MetricCard
              icon={<ArrowUpFromLine className="w-4 h-4" />}
              label="Outstanding"
              value={`${num(own.totalBorrowed)} MUSD`}
              sub={`${utilisationPct.toFixed(1)}% utilised`}
            />
            <MetricCard
              icon={<ShieldCheck className="w-4 h-4" />}
              label="Available"
              value={`${num(own.available)} MUSD`}
              sub={`${members.filter((m) => m.active).length} member${
                members.filter((m) => m.active).length === 1 ? "" : "s"
              }`}
            />
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            <div className="card md:col-span-2 space-y-5">
              <h3 className="font-semibold flex items-center gap-2">
                <UserPlus className="w-4 h-4" /> Members
              </h3>

              <div className="grid md:grid-cols-[1fr_140px_auto] gap-2 items-end">
                <div>
                  <div className="stat-label">New member address</div>
                  <input
                    className="input mt-1"
                    placeholder="0x..."
                    value={newMember}
                    onChange={(e) => setNewMember(e.target.value)}
                  />
                </div>
                <div>
                  <div className="stat-label">Limit (MUSD)</div>
                  <input
                    className="input mt-1"
                    type="number"
                    value={newLimit}
                    onChange={(e) => setNewLimit(e.target.value)}
                  />
                </div>
                <button
                  className="btn-primary"
                  disabled={busy !== null}
                  onClick={addMember}
                >
                  Add / update
                </button>
              </div>

              <div className="divide-y divide-ivory/5">
                {members.length === 0 && (
                  <div className="text-sm text-ivory/50 py-3">
                    No members yet. Add one above.
                  </div>
                )}
                {members.map((m) => (
                  <MemberRowView
                    key={m.member}
                    row={m}
                    busy={busy}
                    onSetLimit={(v) => setLimit(m.member, v)}
                    onRemove={() => removeMember(m.member)}
                  />
                ))}
              </div>
            </div>

            <div className="card space-y-5">
              <h3 className="font-semibold flex items-center gap-2">
                <ArrowDownToLine className="w-4 h-4" /> Top up pool
              </h3>
              <Field
                label="Add BTC"
                value={topupBtc}
                onChange={setTopupBtc}
                suffix="tBTC"
              />
              <Field
                label="Mint extra MUSD"
                value={topupMusd}
                onChange={setTopupMusd}
                suffix="MUSD"
              />
              <button
                className="btn-primary w-full"
                disabled={busy !== null}
                onClick={topUp}
              >
                {busy === "topup" ? "…" : "Top up"}
              </button>

              <div className="border-t border-ivory/10 pt-4">
                <h3 className="font-semibold flex items-center gap-2">
                  <ArrowUpFromLine className="w-4 h-4" /> Withdraw
                </h3>
                <p className="text-xs text-ivory/45 mt-1">
                  Burns MUSD from the available pool; releases BTC.
                </p>
                <Field
                  label="Repay MUSD"
                  value={withdrawMusd}
                  onChange={setWithdrawMusd}
                  suffix="MUSD"
                />
                <Field
                  label="BTC out"
                  value={withdrawBtc}
                  onChange={setWithdrawBtc}
                  suffix="tBTC"
                />
                <button
                  className="btn-ghost w-full mt-2"
                  disabled={busy !== null}
                  onClick={withdraw}
                >
                  {busy === "withdraw" ? "…" : "Withdraw"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Member-side */}
      <div className="card space-y-4">
        <h3 className="font-display text-2xl flex items-center gap-2">
          <Users className="w-5 h-5 text-forest-300" /> Borrow against a family
        </h3>
        <p className="text-ivory/60 text-sm">
          Enter the family head's address to view your credit line.
        </p>
        <div className="grid md:grid-cols-[1fr_auto] gap-2 items-end">
          <div>
            <div className="stat-label">Family head</div>
            <input
              className="input mt-1"
              placeholder="0x..."
              value={headInput}
              onChange={(e) => setHeadInput(e.target.value)}
            />
          </div>
          <button
            className="btn-ghost"
            onClick={lookupHead}
            disabled={!headInput}
          >
            Look up
          </button>
        </div>

        {activeHead && headFamily && (
          <div className="border-t border-ivory/10 pt-4 space-y-4">
            {!headFamily.exists ? (
              <div className="text-sm text-danger">
                No family found at this address.
              </div>
            ) : !myMember?.active ? (
              <div className="text-sm text-ivory/60">
                The head hasn't given you a credit line yet. Ask them to add
                your wallet ({short(address ?? "")}).
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <Stat label="Your limit" value={`${num(myMember.limit)} MUSD`} />
                  <Stat
                    label="Borrowed"
                    value={`${num(myMember.borrowed)} MUSD`}
                  />
                  <Stat
                    label="Available to you"
                    value={`${num(
                      min(
                        myMember.limit - myMember.borrowed,
                        headFamily.available
                      )
                    )} MUSD`}
                  />
                </div>
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <Field
                      label="Borrow"
                      value={borrowAmt}
                      onChange={setBorrowAmt}
                      suffix="MUSD"
                    />
                    <button
                      className="btn-primary w-full mt-2"
                      disabled={busy !== null}
                      onClick={borrow}
                    >
                      {busy === "borrow" ? "…" : "Borrow MUSD"}
                    </button>
                  </div>
                  <div>
                    <Field
                      label="Repay"
                      value={repayAmt}
                      onChange={setRepayAmt}
                      suffix="MUSD"
                    />
                    <button
                      className="btn-ghost w-full mt-2"
                      disabled={busy !== null}
                      onClick={repay}
                    >
                      {busy === "repay" ? "…" : "Repay MUSD"}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function MemberRowView({
  row,
  busy,
  onSetLimit,
  onRemove,
}: {
  row: MemberRow;
  busy: string | null;
  onSetLimit: (v: string) => void;
  onRemove: () => void;
}) {
  const [v, setV] = useState(formatEther(row.limit));
  useEffect(() => setV(formatEther(row.limit)), [row.limit]);
  if (!row.active) return null;
  const utilPct =
    row.limit === 0n
      ? 0
      : Number((row.borrowed * 10000n) / row.limit) / 100;
  return (
    <div className="grid grid-cols-1 md:grid-cols-[1fr_120px_140px_auto] items-center gap-3 py-3 text-sm">
      <div>
        <div className="font-mono text-ivory">{short(row.member)}</div>
        <div className="text-xs text-ivory/45">
          {num(row.borrowed)} / {num(row.limit)} MUSD ({utilPct.toFixed(0)}%)
        </div>
      </div>
      <input
        className="input"
        type="number"
        value={v}
        onChange={(e) => setV(e.target.value)}
      />
      <button
        className="btn-ghost"
        disabled={busy !== null}
        onClick={() => onSetLimit(v)}
      >
        Update
      </button>
      <button
        className="text-danger/80 hover:text-danger disabled:opacity-30"
        disabled={busy !== null || row.borrowed > 0n}
        onClick={onRemove}
        title={row.borrowed > 0n ? "Member must repay first" : "Remove member"}
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  suffix,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  suffix?: string;
}) {
  return (
    <div>
      <div className="stat-label">{label}</div>
      <div className="flex items-center gap-2 mt-1">
        <input
          className="input flex-1"
          type="number"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        {suffix && (
          <span className="text-xs text-ivory/45 uppercase tracking-wider">
            {suffix}
          </span>
        )}
      </div>
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
    <div className="card hover:border-amber/20 transition">
      <div className="flex items-center gap-2 stat-label text-ivory/55">
        <span className="text-amber-300">{icon}</span>
        {label}
      </div>
      <div className="font-display text-2xl text-ivory mt-3">{value}</div>
      {sub && <div className="text-xs text-ivory/45 mt-1">{sub}</div>}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="stat-label">{label}</div>
      <div className="font-display text-xl text-ivory mt-1">{value}</div>
    </div>
  );
}

function short(a: string) {
  if (!a) return "";
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function num(v: bigint) {
  return Number(formatEther(v)).toLocaleString(undefined, {
    maximumFractionDigits: 2,
  });
}

function min(a: bigint, b: bigint) {
  return a < b ? a : b;
}
