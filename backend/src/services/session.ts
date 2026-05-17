/**
 * Stateless HMAC-signed session tokens for wallet-free recipients.
 * Format: base64url(payload).base64url(hmac)
 * Payload: { sub: walletAddress, phone?: string, iat, exp }
 */
import crypto from "node:crypto";

const SECRET = process.env.SESSION_SECRET || "anchor-remit-dev-session-secret";
const DEFAULT_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

export type SessionPayload = {
  sub: string;       // recipient wallet address (lowercase)
  phone?: string | null;
  iat: number;
  exp: number;
};

function b64url(buf: Buffer | string): string {
  return Buffer.from(buf).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function b64urlDecode(s: string): Buffer {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  return Buffer.from(s, "base64");
}

export function signSession(sub: string, phone?: string | null, ttlSeconds = DEFAULT_TTL_SECONDS): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = { sub: sub.toLowerCase(), phone: phone ?? null, iat: now, exp: now + ttlSeconds };
  const body = b64url(JSON.stringify(payload));
  const sig = crypto.createHmac("sha256", SECRET).update(body).digest();
  return `${body}.${b64url(sig)}`;
}

export function verifySession(token: string): SessionPayload | null {
  if (!token || !token.includes(".")) return null;
  const [body, sig] = token.split(".");
  const expected = crypto.createHmac("sha256", SECRET).update(body).digest();
  const provided = b64urlDecode(sig);
  if (expected.length !== provided.length || !crypto.timingSafeEqual(expected, provided)) return null;
  try {
    const payload = JSON.parse(b64urlDecode(body).toString("utf8")) as SessionPayload;
    if (Math.floor(Date.now() / 1000) > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

import type { Request, Response, NextFunction } from "express";
export interface AuthedRequest extends Request {
  session?: SessionPayload;
}

export function requireSession(req: AuthedRequest, res: Response, next: NextFunction) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const session = verifySession(token);
  if (!session) return res.status(401).json({ error: "unauthenticated" });
  req.session = session;
  next();
}
