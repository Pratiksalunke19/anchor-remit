import {
  Deposited,
  Withdrawn,
  ShortfallCovered,
  FeeReceived,
} from "../generated/InsurancePool/InsurancePool";
import {
  LpPosition,
  LpDepositEvent,
  LpWithdrawEvent,
  ShortfallEvent,
  FeeEvent,
} from "../generated/schema";
import { BigInt } from "@graphprotocol/graph-ts";
import { eventId, getGlobalStats } from "./shared";

export function handleDeposited(event: Deposited): void {
  const lpHex = event.params.lp.toHex();
  let p = LpPosition.load(lpHex);
  if (p == null) {
    p = new LpPosition(lpHex);
    p.lp = event.params.lp;
    p.shares = BigInt.zero();
    p.totalDeposited = BigInt.zero();
    p.totalWithdrawn = BigInt.zero();
    p.firstDepositAt = event.block.timestamp;
  }
  p.shares = p.shares.plus(event.params.sharesMinted);
  p.totalDeposited = p.totalDeposited.plus(event.params.amount);
  p.lastActionAt = event.block.timestamp;
  p.save();

  const ev = new LpDepositEvent(eventId(event));
  ev.lp = event.params.lp;
  ev.amount = event.params.amount;
  ev.sharesMinted = event.params.sharesMinted;
  ev.blockNumber = event.block.number;
  ev.timestamp = event.block.timestamp;
  ev.txHash = event.transaction.hash;
  ev.save();

  const g = getGlobalStats(event.block);
  g.totalLpDeposited = g.totalLpDeposited.plus(event.params.amount);
  g.poolReserve = g.poolReserve.plus(event.params.amount);
  g.totalShares = g.totalShares.plus(event.params.sharesMinted);
  g.save();
}

export function handleWithdrawn(event: Withdrawn): void {
  const lpHex = event.params.lp.toHex();
  let p = LpPosition.load(lpHex);
  if (p == null) {
    // shouldn't happen, but guard anyway
    p = new LpPosition(lpHex);
    p.lp = event.params.lp;
    p.shares = BigInt.zero();
    p.totalDeposited = BigInt.zero();
    p.totalWithdrawn = BigInt.zero();
    p.firstDepositAt = event.block.timestamp;
  }
  p.shares = p.shares.minus(event.params.sharesBurned);
  p.totalWithdrawn = p.totalWithdrawn.plus(event.params.amount);
  p.lastActionAt = event.block.timestamp;
  p.save();

  const ev = new LpWithdrawEvent(eventId(event));
  ev.lp = event.params.lp;
  ev.amount = event.params.amount;
  ev.sharesBurned = event.params.sharesBurned;
  ev.blockNumber = event.block.number;
  ev.timestamp = event.block.timestamp;
  ev.txHash = event.transaction.hash;
  ev.save();

  const g = getGlobalStats(event.block);
  g.totalLpWithdrawn = g.totalLpWithdrawn.plus(event.params.amount);
  g.poolReserve = g.poolReserve.minus(event.params.amount);
  g.totalShares = g.totalShares.minus(event.params.sharesBurned);
  g.save();
}

export function handleShortfallCovered(event: ShortfallCovered): void {
  const ev = new ShortfallEvent(eventId(event));
  ev.orderId = event.params.orderId;
  ev.amount = event.params.amount;
  ev.blockNumber = event.block.number;
  ev.timestamp = event.block.timestamp;
  ev.txHash = event.transaction.hash;
  ev.save();

  const g = getGlobalStats(event.block);
  g.totalShortfallCovered = g.totalShortfallCovered.plus(event.params.amount);
  g.poolReserve = g.poolReserve.minus(event.params.amount);
  g.save();
}

export function handleFeeReceived(event: FeeReceived): void {
  const ev = new FeeEvent(eventId(event));
  ev.orderId = event.params.orderId;
  ev.amount = event.params.amount;
  ev.blockNumber = event.block.number;
  ev.timestamp = event.block.timestamp;
  ev.txHash = event.transaction.hash;
  ev.save();

  const g = getGlobalStats(event.block);
  g.totalFeesAccrued = g.totalFeesAccrued.plus(event.params.amount);
  g.poolReserve = g.poolReserve.plus(event.params.amount);
  g.save();
}
