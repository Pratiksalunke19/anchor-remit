import { Router } from "express";
import { z } from "zod";
import { sendSms } from "../services/smsService";

export const notifyRouter = Router();

const smsSchema = z.object({
  phone: z.string().min(6),
  body: z.string().min(1).max(320),
});

notifyRouter.post("/sms", async (req, res) => {
  const parse = smsSchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: parse.error.flatten() });
  const result = await sendSms(parse.data.phone, parse.data.body);
  res.status(result.ok ? 200 : 502).json(result);
});
