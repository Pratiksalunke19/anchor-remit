/**
 * Wallet-free recipient API.
 *
 * Routes:
 *   POST /api/recipient/claim            { orderId, pin, phone? }     → session + wallet
 *   POST /api/recipient/otp/request      { phone }                    → SMS code (or devCode)
 *   POST /api/recipient/otp/verify       { phone, code }              → session for existing wallet
 *   GET  /api/recipient/me               (auth)                       → wallet + balance
 *   POST /api/recipient/transfer         (auth) { to, amount }
 *   POST /api/recipient/cashout          (auth) { amount, country? }  → off-ramp session URL
 *   POST /api/recipient/save             (auth) { amount }            → demo savings allocation
 *   GET  /api/recipient/history          (auth)                       → tx log
 */
import { Router, Response } from "express";
import { z } from "zod";
import { formatEther, getAddress, parseEther } from "viem";
import { recipientWalletRepo, recipientTxRepo } from "../db";
import { walletProvider } from "../services/walletProvider";
import { relayClaim, getMusdBalance, relayTransferOut } from "../services/relayer";
import { signSession, requireSession, AuthedRequest } from "../services/session";
import { requestOtp, verifyOtp } from "../services/otpService";
import { check as checkLimit } from "../services/rateLimit";
import { buildOfframpSession } from "../services/offrampService";

export const recipientRouter = Router();

// in-memory savings allocations (demo only). Real implementation stakes into InsurancePool.
const savings = new Map<string, bigint>();

const claimSchema = z.object({
  orderId: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  pin: z.string().regex(/^\d{6}$/),
  phone: z.string().min(6).optional(),
});

recipientRouter.post("/claim", async (req, res) => {
  const parse = claimSchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: parse.error.flatten() });
  const { orderId, pin, phone } = parse.data;

  // Rate-limit PIN attempts per orderId + ip (5 attempts per 10 min).
  const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.ip || "unknown";
  const limit = checkLimit(`claim:${orderId}:${ip}`, 5, 10 * 60);
  if (!limit.ok) {
    return res.status(429).json({ error: "too-many-attempts", retryAfterSec: limit.retryAfterSec });
  }

  try {
    const result = await relayClaim(orderId as `0x${string}`, pin, phone);
    const balance = await getMusdBalance(result.walletAddress);
    const session = signSession(result.walletAddress, phone ?? null);
    res.json({
      session,
      wallet: { address: result.walletAddress, balance: balance.toString() },
      claimTxHash: result.claimTxHash,
      payoutTxHash: result.payoutTxHash,
      netMusd: result.netMusd,
    });
  } catch (err: any) {
    const msg = err?.shortMessage || err?.message || "claim-failed";
    const status = /bad-pin|locked-to-other-recipient|order-not-pending|order-expired/.test(msg) ? 400 : 500;
    res.status(status).json({ error: msg });
  }
});

recipientRouter.post("/otp/request", async (req, res) => {
  const phone = String(req.body?.phone || "");
  if (!/^\+?\d{6,16}$/.test(phone)) return res.status(400).json({ error: "invalid-phone" });
  const ip = req.ip || "unknown";
  const limit = checkLimit(`otp-req:${phone}:${ip}`, 3, 5 * 60);
  if (!limit.ok) return res.status(429).json({ error: "too-many-requests", retryAfterSec: limit.retryAfterSec });
  const r = await requestOtp(phone);
  if (!r.ok) return res.status(502).json({ error: r.reason || "otp-send-failed" });
  res.json({ ok: true, devCode: r.devCode });
});

recipientRouter.post("/otp/verify", async (req, res) => {
  const phone = String(req.body?.phone || "");
  const code = String(req.body?.code || "");
  if (!/^\+?\d{6,16}$/.test(phone) || !/^\d{6}$/.test(code)) {
    return res.status(400).json({ error: "invalid-input" });
  }
  const ip = req.ip || "unknown";
  const limit = checkLimit(`otp-verify:${phone}:${ip}`, 6, 10 * 60);
  if (!limit.ok) return res.status(429).json({ error: "too-many-attempts", retryAfterSec: limit.retryAfterSec });
  const r = verifyOtp(phone, code);
  if (!r.ok) return res.status(401).json({ error: r.reason });

  // Find a wallet bound to this phone, or mint a fresh one (so the user
  // can onboard via OTP even before any remittance arrives).
  let wallet = recipientWalletRepo.getByPhone(phone);
  if (!wallet) {
    wallet = await walletProvider.getOrCreateForOrder(`otp-${Date.now()}-${phone}`, phone);
    recipientWalletRepo.attachPhone(wallet.address, phone);
  } else if (!wallet.phone) {
    recipientWalletRepo.attachPhone(wallet.address, phone);
  }
  const balance = await getMusdBalance(getAddress(wallet.address));
  const session = signSession(wallet.address, phone);
  res.json({ session, wallet: { address: getAddress(wallet.address), balance: balance.toString() } });
});

recipientRouter.get("/me", requireSession, async (req: AuthedRequest, res: Response) => {
  const sub = req.session!.sub;
  const w = recipientWalletRepo.getByAddress(sub);
  if (!w) return res.status(404).json({ error: "wallet-not-found" });
  const balance = await getMusdBalance(getAddress(w.address));
  const saved = savings.get(w.address) ?? 0n;
  res.json({
    wallet: {
      address: getAddress(w.address),
      phone: w.phone,
      balance: balance.toString(),
      savings: saved.toString(),
    },
  });
});

const transferSchema = z.object({
  to: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  amount: z.string().regex(/^\d+(\.\d+)?$/),
});

recipientRouter.post("/transfer", requireSession, async (req: AuthedRequest, res: Response) => {
  const parse = transferSchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: parse.error.flatten() });
  const sub = req.session!.sub;
  const w = recipientWalletRepo.getByAddress(sub);
  if (!w) return res.status(404).json({ error: "wallet-not-found" });

  const amountWei = parseEther(parse.data.amount);
  const balance = await getMusdBalance(getAddress(w.address));
  if (balance < amountWei) return res.status(400).json({ error: "insufficient-balance" });

  try {
    const txHash = await relayTransferOut(w, getAddress(parse.data.to), amountWei);
    res.json({ ok: true, txHash });
  } catch (err: any) {
    res.status(500).json({ error: err?.shortMessage || err?.message || "transfer-failed" });
  }
});

recipientRouter.post("/cashout", requireSession, async (req: AuthedRequest, res: Response) => {
  const sub = req.session!.sub;
  const amount = String(req.body?.amount || "");
  const country = req.body?.country as string | undefined;
  if (!/^\d+(\.\d+)?$/.test(amount)) return res.status(400).json({ error: "invalid-amount" });
  const w = recipientWalletRepo.getByAddress(sub);
  if (!w) return res.status(404).json({ error: "wallet-not-found" });

  const session = buildOfframpSession({
    recipientAddress: getAddress(w.address),
    musdAmount: amount,
    country,
  });
  recipientTxRepo.insert({
    wallet: w.address,
    kind: "cashout",
    amount: parseEther(amount).toString(),
    counterparty: country ?? "off-ramp",
    tx_hash: null,
    note: `Cash-out session opened (${country ?? "—"})`,
  });
  res.json({ sessionUrl: session.sessionUrl });
});

recipientRouter.post("/save", requireSession, async (req: AuthedRequest, res: Response) => {
  const sub = req.session!.sub;
  const amount = String(req.body?.amount || "");
  if (!/^\d+(\.\d+)?$/.test(amount)) return res.status(400).json({ error: "invalid-amount" });
  const w = recipientWalletRepo.getByAddress(sub);
  if (!w) return res.status(404).json({ error: "wallet-not-found" });

  const wei = parseEther(amount);
  const balance = await getMusdBalance(getAddress(w.address));
  const cur = savings.get(w.address) ?? 0n;
  if (balance < wei) return res.status(400).json({ error: "insufficient-balance" });
  savings.set(w.address, cur + wei);

  recipientTxRepo.insert({
    wallet: w.address,
    kind: "save",
    amount: wei.toString(),
    counterparty: "savings",
    tx_hash: null,
    note: `Saved ${formatEther(wei)} MUSD (demo)`,
  });
  res.json({ ok: true, savings: (cur + wei).toString() });
});

recipientRouter.get("/history", requireSession, async (req: AuthedRequest, res: Response) => {
  const sub = req.session!.sub;
  const rows = recipientTxRepo.list(sub, 100);
  res.json({ history: rows });
});
