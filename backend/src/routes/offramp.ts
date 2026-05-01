import { Router } from "express";
import { z } from "zod";
import { buildOfframpSession } from "../services/offrampService";

export const offrampRouter = Router();

const sessionSchema = z.object({
  recipientAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  musdAmount: z.string().regex(/^\d+(\.\d+)?$/),
  country: z.string().length(2).optional(),
});

offrampRouter.post("/session", (req, res) => {
  const parse = sessionSchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: parse.error.flatten() });
  const session = buildOfframpSession({
    recipientAddress: parse.data.recipientAddress as `0x${string}`,
    musdAmount: parse.data.musdAmount,
    country: parse.data.country,
  });
  res.json(session);
});
