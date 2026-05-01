import { Link } from "react-router-dom";
import { ArrowRight, Shield, Zap, Globe } from "lucide-react";

export default function Home() {
  return (
    <div className="space-y-16">
      <section className="text-center py-16">
        <p className="text-btc uppercase tracking-[0.25em] text-xs font-semibold mb-4">
          Bitcoin-backed remittances
        </p>
        <h1 className="text-4xl md:text-6xl font-bold leading-tight max-w-3xl mx-auto">
          Send dollars anywhere, keep your{" "}
          <span className="text-btc">Bitcoin</span>.
        </h1>
        <p className="mt-6 text-white/70 max-w-2xl mx-auto text-lg">
          Lock BTC on Mezo, mint MUSD, and deliver it globally in minutes.
          Your recipient gets instant dollars; you never sell your BTC.
        </p>
        <div className="mt-10 flex gap-3 justify-center">
          <Link to="/send" className="btn-primary">
            Send MUSD <ArrowRight className="w-4 h-4" />
          </Link>
          <Link to="/pool" className="btn-ghost">
            Become an LP
          </Link>
        </div>
      </section>

      <section className="grid md:grid-cols-3 gap-6">
        <Feature
          icon={<Zap className="w-5 h-5" />}
          title="Instant"
          body="No 3–5 day banking rails. Claims settle in a single block on Mezo."
        />
        <Feature
          icon={<Shield className="w-5 h-5" />}
          title="Guaranteed"
          body="Community Insurance Pool covers under-collateralized positions so recipients always get paid."
        />
        <Feature
          icon={<Globe className="w-5 h-5" />}
          title="Global"
          body="Recipients claim with a 6-digit PIN and cash out via integrated fiat off-ramps."
        />
      </section>

      <section className="card">
        <h2 className="text-xl font-semibold mb-4">How it works</h2>
        <ol className="space-y-3 text-white/80">
          <li>
            <b className="text-btc">1.</b> Sender locks BTC as collateral → mints MUSD.
          </li>
          <li>
            <b className="text-btc">2.</b> Order is locked under a 6-digit PIN and shared with the recipient.
          </li>
          <li>
            <b className="text-btc">3.</b> Recipient opens the claim link, enters the PIN, signs a tx — MUSD lands in their wallet.
          </li>
          <li>
            <b className="text-btc">4.</b> Recipient can hold MUSD, spend on-chain, or off-ramp to local fiat.
          </li>
        </ol>
      </section>
    </div>
  );
}

function Feature({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="card">
      <div className="w-10 h-10 rounded-lg bg-btc/20 text-btc flex items-center justify-center mb-4">
        {icon}
      </div>
      <h3 className="font-semibold text-lg mb-2">{title}</h3>
      <p className="text-white/70 text-sm leading-relaxed">{body}</p>
    </div>
  );
}
