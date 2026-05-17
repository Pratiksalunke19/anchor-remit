/**
 * Phone-OTP recipient login.
 *
 * - User enters phone number (E.164).
 * - Backend issues a 6-digit code via Twilio (or returns a devCode in
 *   demo mode if Twilio is not configured).
 * - User enters code; backend recovers / mints embedded wallet bound to
 *   that phone, returns a session token.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Smartphone, ShieldCheck, AlertTriangle } from "lucide-react";
import PinInput from "../components/PinInput";
import { api, recipientSession } from "../api";

type Phase = "phone" | "code";

export default function Login() {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [devCode, setDevCode] = useState<string | null>(null);

  async function requestCode() {
    setError(null);
    setBusy(true);
    try {
      const r = await api.recipientOtpRequest(phone);
      setDevCode(r.devCode || null);
      setPhase("code");
    } catch (e: any) {
      setError(humanize(e?.message));
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    setError(null);
    setBusy(true);
    try {
      const r = await api.recipientOtpVerify(phone, code);
      recipientSession.set(r.session);
      navigate("/wallet");
    } catch (e: any) {
      setError(humanize(e?.message));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-md mx-auto space-y-6">
      <header className="text-center space-y-2">
        <span className="eyebrow text-forest-300 inline-flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5" /> Sign in with your number
        </span>
        <h1 className="font-display text-3xl text-ivory">Welcome back</h1>
        <p className="text-ivory/55 text-sm">
          We'll text you a one-time code. No passwords, no seed phrase.
        </p>
      </header>

      <motion.div className="card space-y-4" layout initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        {phase === "phone" && (
          <>
            <label className="text-xs uppercase tracking-[0.18em] text-ivory/50 flex items-center gap-1.5">
              <Smartphone className="w-3 h-3" /> Phone number
            </label>
            <input
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="+15551234567"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/[^\d+]/g, ""))}
              className="w-full rounded-xl bg-charcoal-900/60 border border-ivory/10 px-4 py-3 text-ivory placeholder:text-ivory/30 focus:border-amber focus:outline-none"
            />
            {error && (
              <p className="text-sm text-danger flex gap-2">
                <AlertTriangle className="w-4 h-4 mt-0.5" /> {error}
              </p>
            )}
            <button
              className="btn-primary w-full"
              disabled={!/^\+?\d{6,16}$/.test(phone) || busy}
              onClick={requestCode}
            >
              {busy ? "Sending…" : "Text me a code"}
            </button>
          </>
        )}

        {phase === "code" && (
          <>
            <p className="text-sm text-ivory/65">
              Enter the 6-digit code we sent to <b>{phone}</b>.
            </p>
            <PinInput value={code} onChange={setCode} autoFocus />
            {devCode && (
              <p className="text-[11px] text-amber-300 text-center">
                Demo mode — your code is <b>{devCode}</b>
              </p>
            )}
            {error && (
              <p className="text-sm text-danger flex gap-2">
                <AlertTriangle className="w-4 h-4 mt-0.5" /> {error}
              </p>
            )}
            <div className="flex gap-2">
              <button className="btn-ghost flex-1" onClick={() => setPhase("phone")} disabled={busy}>
                Change number
              </button>
              <button
                className="btn-primary flex-1"
                disabled={!/^\d{6}$/.test(code) || busy}
                onClick={verify}
              >
                {busy ? "Verifying…" : "Verify"}
              </button>
            </div>
          </>
        )}
      </motion.div>
    </div>
  );
}

function humanize(raw: string): string {
  if (!raw) return "Something went wrong.";
  if (raw.includes("bad-code")) return "That code doesn't match. Try again.";
  if (raw.includes("expired")) return "That code expired. Request a new one.";
  if (raw.includes("too-many")) return "Too many attempts. Wait a few minutes.";
  if (raw.includes("invalid-phone")) return "Please use international format (e.g. +15551234567).";
  if (raw.includes("twilio-not-configured")) return "SMS provider not configured.";
  return raw.replace(/^\d+:\s*/, "");
}
