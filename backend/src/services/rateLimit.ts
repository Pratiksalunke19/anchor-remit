/**
 * Lightweight in-memory rate limiter for PIN attempts and OTP requests.
 * Demo-grade: single-process, resets on restart. For prod, swap to Redis.
 */
type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

export type LimitResult = { ok: true; remaining: number } | { ok: false; retryAfterSec: number };

export function check(key: string, maxAttempts: number, windowSeconds: number): LimitResult {
  const now = Math.floor(Date.now() / 1000);
  const b = buckets.get(key);
  if (!b || now >= b.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowSeconds });
    return { ok: true, remaining: maxAttempts - 1 };
  }
  if (b.count >= maxAttempts) {
    return { ok: false, retryAfterSec: b.resetAt - now };
  }
  b.count += 1;
  return { ok: true, remaining: maxAttempts - b.count };
}

export function reset(key: string) {
  buckets.delete(key);
}
