import { Routes, Route, Link, useLocation } from "react-router-dom";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { motion } from "framer-motion";
import { ShieldCheck } from "lucide-react";
import Home from "./pages/Home";
import Send from "./pages/Send";
import Claim from "./pages/Claim";
import Dashboard from "./pages/Dashboard";
import Pool from "./pages/Pool";
import Profile from "./pages/Profile";
import CashOut from "./pages/CashOut";
import History from "./pages/History";
import Wallet from "./pages/Wallet";
import Login from "./pages/Login";
import Family from "./pages/Family";

const nav = [
  { to: "/", label: "Overview" },
  { to: "/send", label: "Send" },
  { to: "/dashboard", label: "Dashboard" },
  { to: "/pool", label: "Pool" },
  { to: "/family", label: "Family" },
  { to: "/history", label: "History" },
  { to: "/profile", label: "Profile" },
];

export default function App() {
  const location = useLocation();
  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-30 backdrop-blur-xl bg-charcoal-900/75 border-b border-ivory/10">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-3 group">
            <img
              src="/anchor-remittance-logo.png"
              alt=""
              className="w-12 h-12 object-contain drop-shadow-[0_0_12px_rgba(245,158,11,0.35)]"
            />
            <span className="flex flex-col leading-tight">
              <span className="font-display text-base text-ivory tracking-tight">
                Anchor Remit
              </span>
              <span className="text-[10px] uppercase tracking-[0.22em] text-ivory/45">
                Global · Bitcoin-backed
              </span>
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-0.5 bg-charcoal-800/70 border border-ivory/10 rounded-full p-1">
            {nav.map((n) => {
              const active = location.pathname === n.to;
              return (
                <Link
                  key={n.to}
                  to={n.to}
                  className={`relative px-4 py-1.5 rounded-full text-sm font-medium transition ${
                    active
                      ? "text-charcoal-900"
                      : "text-ivory/65 hover:text-ivory"
                  }`}
                >
                  {active && (
                    <motion.span
                      layoutId="nav-pill"
                      className="absolute inset-0 rounded-full bg-amber-sheen shadow-glow"
                      transition={{ type: "spring", stiffness: 380, damping: 32 }}
                    />
                  )}
                  <span className="relative">{n.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-3">
            <span className="hidden lg:inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.18em] text-forest-300">
              <ShieldCheck className="w-3.5 h-3.5" /> Mezo Matsnet
            </span>
            <ConnectButton chainStatus="icon" accountStatus="avatar" showBalance={false} />
          </div>
        </div>
      </header>

      <main className="flex-1">
        <motion.div
          key={location.pathname}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          className="max-w-6xl mx-auto px-6 py-10"
        >
          <Routes location={location}>
            <Route path="/" element={<Home />} />
            <Route path="/send" element={<Send />} />
            <Route path="/claim/:orderId" element={<Claim />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/pool" element={<Pool />} />
            <Route path="/family" element={<Family />} />
            <Route path="/cashout/:orderId" element={<CashOut />} />
            <Route path="/history" element={<History />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/wallet" element={<Wallet />} />
            <Route path="/login" element={<Login />} />
          </Routes>
        </motion.div>
      </main>

      <footer className="border-t border-ivory/10 py-8 mt-8">
        <div className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-3 text-ivory/50">
            <span className="w-1.5 h-1.5 rounded-full bg-forest animate-pulse" />
            Built on Mezo Matsnet · Bitcoin-backed remittances
          </div>
          <div className="flex items-center gap-4 text-ivory/40 uppercase tracking-[0.2em]">
            <span>Secure transfer</span>
            <span className="w-px h-3 bg-ivory/15" />
            <span>Cross-border</span>
            <span className="w-px h-3 bg-ivory/15" />
            <span>Self-custodial</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
