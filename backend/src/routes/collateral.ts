import { Router } from "express";
import { formatEther } from "viem";
import { publicClient, addresses } from "../config";
import { remittanceVaultAbi } from "../abi";

export const collateralRouter = Router();

collateralRouter.get("/:orderId/ratio", async (_req, res) => {
  try {
    const cr = (await publicClient.readContract({
      address: addresses.remittanceVault,
      abi: remittanceVaultAbi,
      functionName: "vaultCollateralRatio",
    })) as bigint;

    const pct = Number(formatEther(cr)) * 100;
    let status: "SAFE" | "WARNING" | "DANGER" = "SAFE";
    if (pct < 110) status = "DANGER";
    else if (pct < 125) status = "WARNING";

    res.json({ ratio: pct, raw: cr.toString(), status });
  } catch (err: any) {
    res.status(500).json({ error: err?.shortMessage || err?.message || "read failed" });
  }
});
