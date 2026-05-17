import { Link } from "react-router-dom";
import {
  ArrowRight,
  ShieldCheck,
  Zap,
  Globe2,
  ArrowUpRight,
  Bitcoin,
  CircleDollarSign,
  Banknote,
  ArrowDown,
} from "lucide-react";

export default function Home() {
  return (
    <div className="space-y-20">
      {/* HERO — two-column split */}
      <section className="grid lg:grid-cols-[1.05fr_1fr] gap-10 lg:gap-14 items-center pt-6 md:pt-10">
        {/* Left: pitch */}
        <div>
          <div className="inline-flex items-center gap-3 eyebrow mb-7">
            <span className="inline-block w-6 h-px bg-ivory-300/40" />
            Cross-border · Bitcoin-backed
          </div>
          <h1 className="font-display text-[2.6rem] md:text-[3.6rem] leading-[1.02] tracking-tight text-ivory">
            <span className="text-amber-400">Lock Bitcoin.</span>
            <br />
            Send Dollars.
          </h1>
          <p className="mt-7 text-ivory-300 text-[1.02rem] max-w-md leading-relaxed">
            Collateralise BTC on Mezo, mint MUSD, and deliver instant dollars
            to family or partners — anywhere on the map. You stay in Bitcoin.
            They get cash.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link to="/send" className="btn-primary">
              Send a remittance <ArrowRight className="w-4 h-4" />
            </Link>
            <Link to="/pool" className="btn-ghost">
              Provide liquidity <ArrowUpRight className="w-4 h-4" />
            </Link>
          </div>
        </div>

        {/* Right: BTC → MUSD → Cash flow */}
        <div className="card-elevated p-6 md:p-7">
          <div className="eyebrow mb-5">How it works</div>
          <div className="space-y-3">
            <FlowStep
              icon={<Bitcoin className="w-5 h-5" />}
              title="Lock BTC as collateral"
              sub="Secured on Mezo protocol"
              chip="BTC"
            />
            <FlowArrow />
            <FlowStep
              icon={<CircleDollarSign className="w-5 h-5" />}
              title="Mint MUSD"
              sub="≥150% collateralisation ratio"
              chip="MUSD"
            />
            <FlowArrow />
            <FlowStep
              icon={<Banknote className="w-5 h-5" />}
              title="Recipient claims cash"
              sub="Secure link, instant delivery"
              chip="CASH"
            />
          </div>
        </div>
      </section>

      {/* PILLARS */}
      <section className="grid md:grid-cols-3 gap-5">
        <Feature
          icon={<Zap className="w-4 h-4" />}
          title="Instant settlement"
          body="No 3–5 day banking rails. Claims clear in a single Mezo block, even on weekends."
        />
        <Feature
          icon={<ShieldCheck className="w-4 h-4" />}
          title="Underwritten transfers"
          body="A community Insurance Pool absorbs under-collateralised positions so recipients always get paid."
        />
        <Feature
          icon={<Globe2 className="w-4 h-4" />}
          title="Truly global"
          body="Recipients redeem with a 6-digit PIN and cash out through integrated fiat off-ramps in their currency."
        />
      </section>

      {/* HOW IT WORKS */}
      <section className="grid lg:grid-cols-5 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <span className="eyebrow">The flow</span>
          <h2 className="font-display text-3xl md:text-4xl text-ivory leading-tight">
            A premium rail for sending dollars,
            <span className="italic text-amber-300"> minus the wires</span>.
          </h2>
          <p className="text-ivory/65 leading-relaxed">
            Four steps from your collateral to their cash. Every transfer is
            tied to a unique PIN, expires automatically, and is fully on-chain.
          </p>
        </div>

        <div className="lg:col-span-3 card-elevated divide-hairline">
          <Step
            n="01"
            title="Lock BTC, mint MUSD"
            body="Deposit BTC as collateral on Mezo. The vault mints synthetic dollars (MUSD) at a safe ratio."
          />
          <Step
            n="02"
            title="Generate a claim PIN"
            body="Set a 6-digit PIN. The order is committed on-chain with an expiry, locked to your recipient."
          />
          <Step
            n="03"
            title="Recipient redeems"
            body="They open the link, enter the PIN, sign a tx. MUSD lands in their wallet — no bank required."
          />
          <Step
            n="04"
            title="Cash out, hold, or spend"
            body="Convert to local fiat through the off-ramp, hold on-chain, or spend with on-chain merchants."
          />
        </div>
      </section>
    </div>
  );
}

function Feature({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="card hover:border-amber/30 transition group">
      <div className="w-10 h-10 rounded-xl bg-amber/10 text-amber-300 border border-amber/25 flex items-center justify-center mb-5 group-hover:scale-105 transition">
        {icon}
      </div>
      <h3 className="font-display text-xl text-ivory mb-2">{title}</h3>
      <p className="text-ivory/65 text-sm leading-relaxed">{body}</p>
    </div>
  );
}

function Step({
  n,
  title,
  body,
}: {
  n: string;
  title: string;
  body: string;
}) {
  return (
    <div className="flex gap-5 py-5 first:pt-0 last:pb-0">
      <div className="flex-shrink-0 font-display text-amber-300/70 text-sm tracking-[0.2em] pt-1">
        {n}
      </div>
      <div>
        <div className="font-medium text-ivory">{title}</div>
        <p className="text-sm text-ivory/60 mt-1 leading-relaxed">{body}</p>
      </div>
    </div>
  );
}

function FlowStep({
  icon,
  title,
  sub,
  chip,
}: {
  icon: React.ReactNode;
  title: string;
  sub: string;
  chip: string;
}) {
  return (
    <div className="rounded-xl border border-ivory/10 bg-charcoal-900/60 px-4 py-3.5 flex items-center gap-4">
      <div className="w-10 h-10 rounded-lg bg-amber/10 border border-amber/25 text-amber-400 flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-medium text-ivory text-[15px] leading-tight">{title}</div>
        <div className="text-xs text-ivory-300/70 mt-1">{sub}</div>
      </div>
      <span className="pill-amber">{chip}</span>
    </div>
  );
}

function FlowArrow() {
  return (
    <div className="flex justify-center text-ivory-300/40">
      <ArrowDown className="w-4 h-4" />
    </div>
  );
}
