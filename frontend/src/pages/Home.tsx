import { Link } from "react-router-dom";
import {
  ArrowRight,
  ShieldCheck,
  Zap,
  Globe2,
  MapPin,
  ArrowUpRight,
  Lock,
} from "lucide-react";
import WorldMap from "../components/WorldMap";

export default function Home() {
  return (
    <div className="space-y-20">
      {/* HERO */}
      <section className="relative overflow-hidden rounded-3xl border border-ivory/10 bg-gradient-to-b from-charcoal-700/70 to-charcoal-900/90 shadow-card-lg">
        <div className="absolute inset-0 opacity-70 pointer-events-none">
          <WorldMap className="w-full h-full" />
        </div>
        <div className="relative px-8 md:px-14 py-16 md:py-24 max-w-3xl">
          <div className="inline-flex items-center gap-2 eyebrow mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-300 animate-pulse" />
            Cross-border · Bitcoin-backed
          </div>
          <h1 className="font-display text-[2.4rem] md:text-6xl leading-[1.05] text-ivory">
            Move dollars across borders.
            <br />
            <span className="italic text-amber-300">Anchor</span> them in Bitcoin.
          </h1>
          <p className="mt-6 text-ivory/70 text-lg max-w-xl leading-relaxed">
            Anchor Remit lets you collateralise BTC on Mezo, mint MUSD, and
            deliver instant dollars to family or partners — anywhere on the
            map. You stay in Bitcoin. They get cash.
          </p>
          <div className="mt-10 flex flex-wrap gap-3">
            <Link to="/send" className="btn-primary">
              Send a remittance <ArrowRight className="w-4 h-4" />
            </Link>
            <Link to="/pool" className="btn-ghost">
              Provide liquidity <ArrowUpRight className="w-4 h-4" />
            </Link>
          </div>

          <div className="mt-12 flex items-center gap-6 text-xs text-ivory/55">
            <div className="flex items-center gap-2">
              <Lock className="w-3.5 h-3.5 text-forest-300" />
              Self-custodial
            </div>
            <div className="w-px h-4 bg-ivory/10" />
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-3.5 h-3.5 text-forest-300" />
              Insurance-backed
            </div>
            <div className="w-px h-4 bg-ivory/10" />
            <div className="flex items-center gap-2">
              <MapPin className="w-3.5 h-3.5 text-amber-300" />
              Settles in seconds
            </div>
          </div>
        </div>

        {/* corridor card pinned to the map */}
        <div className="hidden lg:block absolute right-10 top-12 w-64 surface px-5 py-4 shadow-card-lg">
          <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.22em] text-ivory/50">
            <span>Active corridor</span>
            <span className="text-forest-300">Live</span>
          </div>
          <div className="mt-3 flex items-center justify-between">
            <Endpoint flag="🇺🇸" code="USA" sub="Sender" />
            <div className="flex-1 mx-3 relative h-px bg-ivory/15">
              <span className="absolute inset-0 bg-amber-300/60 animate-[pulse_2s_ease-in-out_infinite]" />
              <ArrowRight className="absolute -right-2 -top-1.5 w-3 h-3 text-amber-300" />
            </div>
            <Endpoint flag="🇵🇭" code="PHL" sub="Recipient" align="right" />
          </div>
          <div className="mt-4 flex items-baseline justify-between">
            <span className="font-display text-2xl text-ivory">$240.00</span>
            <span className="text-[11px] text-ivory/50">in ~7s</span>
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

function Endpoint({
  flag,
  code,
  sub,
  align = "left",
}: {
  flag: string;
  code: string;
  sub: string;
  align?: "left" | "right";
}) {
  return (
    <div className={`flex flex-col ${align === "right" ? "items-end" : ""}`}>
      <span className="text-lg leading-none">{flag}</span>
      <span className="font-medium text-ivory text-xs mt-1">{code}</span>
      <span className="text-[10px] text-ivory/45 uppercase tracking-wider">
        {sub}
      </span>
    </div>
  );
}
