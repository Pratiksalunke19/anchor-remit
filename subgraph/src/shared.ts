import { BigInt, ethereum } from "@graphprotocol/graph-ts";
import { GlobalStats } from "../generated/schema";

export const GLOBAL_ID = "global";

export function getGlobalStats(block: ethereum.Block): GlobalStats {
  let g = GlobalStats.load(GLOBAL_ID);
  if (g == null) {
    g = new GlobalStats(GLOBAL_ID);
    g.totalRemittances = BigInt.zero();
    g.totalClaimed = BigInt.zero();
    g.totalCancelled = BigInt.zero();
    g.totalLiquidated = BigInt.zero();
    g.totalSettled = BigInt.zero();
    g.totalMusdLocked = BigInt.zero();
    g.totalMusdSettled = BigInt.zero();
    g.totalCollateralLocked = BigInt.zero();
    g.totalMusdRepaid = BigInt.zero();
    g.totalCollateralUnlocked = BigInt.zero();
    g.totalLpDeposited = BigInt.zero();
    g.totalLpWithdrawn = BigInt.zero();
    g.totalShortfallCovered = BigInt.zero();
    g.totalFeesAccrued = BigInt.zero();
    g.poolReserve = BigInt.zero();
    g.totalShares = BigInt.zero();
    g.lastUpdatedBlock = BigInt.zero();
    g.lastUpdatedTimestamp = BigInt.zero();
  }
  g.lastUpdatedBlock = block.number;
  g.lastUpdatedTimestamp = block.timestamp;
  return g as GlobalStats;
}

export function eventId(event: ethereum.Event): string {
  return event.transaction.hash.toHex() + "-" + event.logIndex.toString();
}
