import { Router } from "express";
import { z } from "zod";
import { keccak256, toBytes, getAddress, parseEther, encodeFunctionData } from "viem";
import { publicClient, addresses } from "../config";
import { remittanceVaultAbi } from "../abi";
import { orderRepo } from "../db";
import { sendSms } from "../services/smsService";

export const remittanceRouter = Router();

const createSchema = z.object({
  senderAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  recipientAddress: z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/)
    .optional(),
  recipientPhone: z.string().optional(),
  musdAmount: z.string().regex(/^\d+(\.\d+)?$/),
  collateralBtc: z.string().regex(/^\d+(\.\d+)?$/),
  pin: z.string().regex(/^\d{6}$/),
  expiryHours: z.number().int().min(1).max(720).default(72),
});

remittanceRouter.post("/create", (req, res) => {
  const parse = createSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: parse.error.flatten() });
  }
  const body = parse.data;

  // Hash PIN — note: on-chain we re-hash with orderId, so frontend passes this.
  const claimCodeHash = keccak256(toBytes(body.pin));

  const musdAmount = parseEther(body.musdAmount);
  const collateralBtc = parseEther(body.collateralBtc);
  const expirySeconds = BigInt(body.expiryHours * 3600);
  const recipient = body.recipientAddress
    ? getAddress(body.recipientAddress)
    : ("0x0000000000000000000000000000000000000000" as `0x${string}`);

  const calldata = encodeFunctionData({
    abi: remittanceVaultAbi,
    functionName: "createRemittance",
    args: [recipient, musdAmount, collateralBtc, claimCodeHash, expirySeconds],
  });

  res.json({
    to: addresses.remittanceVault,
    data: calldata,
    value: "0",
    meta: {
      claimCodeHash,
      musdAmount: musdAmount.toString(),
      collateralBtc: collateralBtc.toString(),
      expirySeconds: Number(expirySeconds),
    },
  });
});

remittanceRouter.get("/:orderId", async (req, res) => {
  const orderId = req.params.orderId as `0x${string}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(orderId)) {
    return res.status(400).json({ error: "invalid orderId" });
  }
  try {
    const onchain = (await publicClient.readContract({
      address: addresses.remittanceVault,
      abi: remittanceVaultAbi,
      functionName: "getOrder",
      args: [orderId],
    })) as any;

    const statusMap = ["PENDING", "CLAIMED", "CANCELLED", "LIQUIDATED"];
    const local = orderRepo.get(orderId);

    res.json({
      orderId,
      sender: onchain.sender,
      recipient: onchain.recipient,
      musdAmount: onchain.musdAmount.toString(),
      collateralBTC: onchain.collateralBTC.toString(),
      createdAt: Number(onchain.createdAt),
      expiryTimestamp: Number(onchain.expiryTimestamp),
      status: statusMap[Number(onchain.status)],
      local: local
        ? {
            recipientPhone: local.recipient_phone,
            smsSent: !!local.sms_sent,
            txHash: local.tx_hash,
          }
        : null,
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.shortMessage || err?.message || "read failed" });
  }
});

const claimSchema = z.object({
  pin: z.string().regex(/^\d{6}$/),
  recipientAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
});

remittanceRouter.post("/:orderId/claim", (req, res) => {
  const orderId = req.params.orderId as `0x${string}`;
  const parse = claimSchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: parse.error.flatten() });

  const claimCodeHash = keccak256(toBytes(parse.data.pin));
  const calldata = encodeFunctionData({
    abi: remittanceVaultAbi,
    functionName: "claimRemittance",
    args: [orderId, claimCodeHash],
  });

  res.json({
    to: addresses.remittanceVault,
    data: calldata,
    value: "0",
    meta: { claimCodeHash },
  });
});

// metadata registration for a just-broadcast tx (phone + tx hash)
const registerSchema = z.object({
  orderId: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  recipientPhone: z.string().optional(),
  recipient: z.string().regex(/^0x[0-9a-fA-F]{40}$/).optional(),
  sender: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  musdAmount: z.string(),
  collateralBtc: z.string(),
  expiryTs: z.number().int(),
  txHash: z.string().optional(),
});

remittanceRouter.post("/register", async (req, res) => {
  const parse = registerSchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: parse.error.flatten() });
  const d = parse.data;

  orderRepo.upsert({
    order_id: d.orderId,
    sender: d.sender,
    recipient: d.recipient ?? null,
    recipient_phone: d.recipientPhone ?? null,
    musd_amount: d.musdAmount,
    collateral_btc: d.collateralBtc,
    expiry_ts: d.expiryTs,
    status: "PENDING",
    tx_hash: d.txHash ?? null,
  });

  // fire-and-forget SMS
  if (d.recipientPhone) {
    const shortId = d.orderId.slice(0, 10);
    const link = `${req.protocol}://${req.get("host")}/claim/${d.orderId}`;
    await sendSms(
      d.recipientPhone,
      `You've received a MUSD remittance (${shortId}…). Ask the sender for the 6-digit PIN and claim at ${link}`
    );
    orderRepo.upsert({ order_id: d.orderId, sms_sent: 1 });
  }

  res.json({ ok: true });
});

remittanceRouter.get("/sender/:address", (req, res) => {
  const address = req.params.address;
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return res.status(400).json({ error: "invalid address" });
  }
  const rows = orderRepo.listForSender(address);
  res.json({ orders: rows });
});

remittanceRouter.get("/recipient/:address", (req, res) => {
  const address = req.params.address;
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return res.status(400).json({ error: "invalid address" });
  }
  const rows = orderRepo.listForRecipient(address);
  res.json({ orders: rows });
});
