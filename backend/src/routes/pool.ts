import { Router } from "express";
import { formatEther } from "viem";
import { publicClient, addresses } from "../config";
import { insurancePoolAbi } from "../abi";

export const poolRouter = Router();

poolRouter.get("/stats", async (_req, res) => {
  try {
    const [reserve, shares, health] = (await Promise.all([
      publicClient.readContract({
        address: addresses.insurancePool,
        abi: insurancePoolAbi,
        functionName: "totalReserve",
      }),
      publicClient.readContract({
        address: addresses.insurancePool,
        abi: insurancePoolAbi,
        functionName: "totalShares",
      }),
      publicClient.readContract({
        address: addresses.insurancePool,
        abi: insurancePoolAbi,
        functionName: "getPoolHealth",
      }),
    ])) as [bigint, bigint, bigint];

    res.json({
      totalReserve: formatEther(reserve),
      totalShares: formatEther(shares),
      health: formatEther(health),
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.shortMessage || err?.message || "read failed" });
  }
});

poolRouter.get("/shares/:address", async (req, res) => {
  const address = req.params.address as `0x${string}`;
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return res.status(400).json({ error: "invalid address" });
  }
  try {
    const shares = (await publicClient.readContract({
      address: addresses.insurancePool,
      abi: insurancePoolAbi,
      functionName: "sharesOf",
      args: [address],
    })) as bigint;
    res.json({ address, shares: formatEther(shares) });
  } catch (err: any) {
    res.status(500).json({ error: err?.shortMessage || err?.message || "read failed" });
  }
});
