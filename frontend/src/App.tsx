import { Routes, Route, Link, useLocation } from "react-router-dom";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { motion, AnimatePresence } from "framer-motion";
import Home from "./pages/Home";
import Send from "./pages/Send";
import Claim from "./pages/Claim";
import Dashboard from "./pages/Dashboard";
import Pool from "./pages/Pool";

const nav = [
  { to: "/", label: "Home" },
  { to: "/send", label: "Send" },
  { to: "/dashboard", label: "Dashboard" },
  { to: "/pool", label: "Pool" },
];

export default function App() {
  const location = useLocation();
  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-30 backdrop-blur-lg bg-ink/70 border-b border-white/10">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 font-bold text-lg">
            <span className="w-7 h-7 rounded-md bg-btc flex items-center justify-center text-ink">
              ₿
            </span>
            Anchor Remit
          </Link>
          <nav className="hidden md:flex items-center gap-1">
            {nav.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition ${
                  location.pathname === n.to
                    ? "bg-white/10 text-white"
                    : "text-white/60 hover:text-white"
                }`}
              >
                {n.label}
              </Link>
            ))}
          </nav>
          <ConnectButton chainStatus="icon" accountStatus="avatar" showBalance={false} />
        </div>
      </header>

      <main className="flex-1">
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="max-w-6xl mx-auto px-6 py-8"
          >
            <Routes location={location}>
              <Route path="/" element={<Home />} />
              <Route path="/send" element={<Send />} />
              <Route path="/claim/:orderId" element={<Claim />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/pool" element={<Pool />} />
            </Routes>
          </motion.div>
        </AnimatePresence>
      </main>

      <footer className="border-t border-white/10 py-6 text-center text-white/40 text-sm">
        Built on Mezo Matsnet · Bitcoin-backed remittances
      </footer>
    </div>
  );
}
