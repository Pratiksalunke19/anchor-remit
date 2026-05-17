/**
 * Phone-OTP login for recipients. Codes are stored hashed (SHA-256 + pepper),
 * never plaintext, with a TTL and bounded attempts.
 */
import crypto from "node:crypto";
import { otpRepo } from "../db";
import { sendSms } from "./smsService";

const OTP_PEPPER = process.env.OTP_PEPPER || "anchor-remit-otp-pepper";
const OTP_TTL_SECONDS = 5 * 60;
const MAX_ATTEMPTS = 5;

function hashCode(phone: string, code: string): string {
  return crypto.createHash("sha256").update(`${OTP_PEPPER}|${phone}|${code}`).digest("hex");
}

function genCode(): string {
  // 6-digit numeric, no leading zero bias.
  const n = crypto.randomInt(0, 1_000_000);
  return n.toString().padStart(6, "0");
}

export async function requestOtp(phone: string): Promise<{ ok: boolean; devCode?: string; reason?: string }> {
  const code = genCode();
  otpRepo.upsert(phone, hashCode(phone, code), OTP_TTL_SECONDS);
  const sms = await sendSms(phone, `Your Anchor Remit login code is ${code}. Expires in 5 minutes.`);
  // In demo mode (no Twilio creds) we surface the code so the hackathon judge can log in.
  if (!sms.ok && sms.reason === "twilio-not-configured") {
    return { ok: true, devCode: code };
  }
  return sms.ok ? { ok: true } : { ok: false, reason: sms.reason };
}

export function verifyOtp(phone: string, code: string): { ok: boolean; reason?: string } {
  const row = otpRepo.get(phone);
  if (!row) return { ok: false, reason: "no-code" };
  if (Math.floor(Date.now() / 1000) > row.expires_at) {
    otpRepo.clear(phone);
    return { ok: false, reason: "expired" };
  }
  if (row.attempts >= MAX_ATTEMPTS) {
    return { ok: false, reason: "too-many-attempts" };
  }
  const expected = row.code_hash;
  const provided = hashCode(phone, code);
  if (expected.length !== provided.length ||
      !crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(provided, "hex"))) {
    otpRepo.bumpAttempts(phone);
    return { ok: false, reason: "bad-code" };
  }
  otpRepo.clear(phone);
  return { ok: true };
}
