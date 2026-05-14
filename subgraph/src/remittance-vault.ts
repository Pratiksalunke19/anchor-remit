import {
  RemittanceCreated,
  RemittanceClaimed,
  RemittanceCancelled,
  CollateralToppedUp,
  CollateralWarning,
  LiquidationGuardTriggered,
  CollateralUnlocked,
} from "../generated/RemittanceVault/RemittanceVault";
import {
  Remittance,
  ClaimEvent,
  CancelEvent,
  LiquidationEvent,
  CollateralTopUp,
  CollateralWarningEvent,
  CollateralUnlockEvent,
} from "../generated/schema";
import { BigInt } from "@graphprotocol/graph-ts";
import { eventId, getGlobalStats } from "./shared";

export function handleRemittanceCreated(event: RemittanceCreated): void {
  const id = event.params.orderId.toHex();
  let r = new Remittance(id);
  r.orderId = event.params.orderId;
  r.sender = event.params.sender;
  r.recipient = event.params.recipient;
  r.musdAmount = event.params.musdAmount;
  r.collateralBTC = event.params.collateralBTC;
  r.expiryTimestamp = event.params.expiryTimestamp;
  r.status = "PENDING";
  r.createdAt = event.block.timestamp;
  r.createdAtBlock = event.block.number;
  r.createdTxHash = event.transaction.hash;
  r.musdRepaid = BigInt.zero();
  r.btcUnlocked = BigInt.zero();
  r.save();

  const g = getGlobalStats(event.block);
  g.totalRemittances = g.totalRemittances.plus(BigInt.fromI32(1));
  g.totalMusdLocked = g.totalMusdLocked.plus(event.params.musdAmount);
  g.totalCollateralLocked = g.totalCollateralLocked.plus(event.params.collateralBTC);
  g.save();
}

export function handleRemittanceClaimed(event: RemittanceClaimed): void {
  const id = event.params.orderId.toHex();
  let r = Remittance.load(id);
  if (r != null) {
    r.status = "CLAIMED";
    r.claimedAt = event.block.timestamp;
    r.claimedBy = event.params.recipient;
    r.claimedAmount = event.params.amount;
    r.claimTxHash = event.transaction.hash;
    r.save();
  }

  const ce = new ClaimEvent(eventId(event));
  ce.orderId = event.params.orderId;
  ce.remittance = id;
  ce.recipient = event.params.recipient;
  ce.amount = event.params.amount;
  ce.blockNumber = event.block.number;
  ce.timestamp = event.block.timestamp;
  ce.txHash = event.transaction.hash;
  ce.save();

  const g = getGlobalStats(event.block);
  g.totalClaimed = g.totalClaimed.plus(BigInt.fromI32(1));
  g.totalMusdSettled = g.totalMusdSettled.plus(event.params.amount);
  g.save();
}

export function handleRemittanceCancelled(event: RemittanceCancelled): void {
  const id = event.params.orderId.toHex();
  let r = Remittance.load(id);
  if (r != null) {
    r.status = "CANCELLED";
    r.cancelledAt = event.block.timestamp;
    r.cancelRefundBTC = event.params.refundBTC;
    r.cancelTxHash = event.transaction.hash;
    r.save();
  }

  const ev = new CancelEvent(eventId(event));
  ev.orderId = event.params.orderId;
  ev.remittance = id;
  ev.sender = event.params.sender;
  ev.refundBTC = event.params.refundBTC;
  ev.blockNumber = event.block.number;
  ev.timestamp = event.block.timestamp;
  ev.txHash = event.transaction.hash;
  ev.save();

  const g = getGlobalStats(event.block);
  g.totalCancelled = g.totalCancelled.plus(BigInt.fromI32(1));
  g.totalCollateralLocked = g.totalCollateralLocked.minus(event.params.refundBTC);
  g.save();
}

export function handleCollateralToppedUp(event: CollateralToppedUp): void {
  const id = event.params.orderId.toHex();
  let r = Remittance.load(id);
  if (r != null) {
    r.collateralBTC = r.collateralBTC.plus(event.params.addedBTC);
    r.save();
  }

  const ev = new CollateralTopUp(eventId(event));
  ev.orderId = event.params.orderId;
  ev.remittance = id;
  ev.addedBTC = event.params.addedBTC;
  ev.newRatio = event.params.newRatio;
  ev.blockNumber = event.block.number;
  ev.timestamp = event.block.timestamp;
  ev.txHash = event.transaction.hash;
  ev.save();

  const g = getGlobalStats(event.block);
  g.totalCollateralLocked = g.totalCollateralLocked.plus(event.params.addedBTC);
  g.save();
}

export function handleCollateralWarning(event: CollateralWarning): void {
  const id = event.params.orderId.toHex();
  const ev = new CollateralWarningEvent(eventId(event));
  ev.orderId = event.params.orderId;
  ev.remittance = id;
  ev.ratio = event.params.currentRatio;
  ev.blockNumber = event.block.number;
  ev.timestamp = event.block.timestamp;
  ev.txHash = event.transaction.hash;
  ev.save();
}

export function handleCollateralUnlocked(event: CollateralUnlocked): void {
  const id = event.params.orderId.toHex();
  let r = Remittance.load(id);
  if (r != null) {
    r.musdRepaid = r.musdRepaid.plus(event.params.musdRepaid);
    r.btcUnlocked = r.btcUnlocked.plus(event.params.btcOut);
    // Once both remaining counters hit zero, the order is fully settled.
    if (event.params.musdRemaining.equals(BigInt.zero()) && event.params.btcRemaining.equals(BigInt.zero())) {
      r.status = "SETTLED";
      r.settledAt = event.block.timestamp;
      r.settleTxHash = event.transaction.hash;
    }
    r.save();
  }

  const ev = new CollateralUnlockEvent(eventId(event));
  ev.orderId = event.params.orderId;
  ev.remittance = id;
  ev.sender = event.params.sender;
  ev.musdRepaid = event.params.musdRepaid;
  ev.btcOut = event.params.btcOut;
  ev.musdRemaining = event.params.musdRemaining;
  ev.btcRemaining = event.params.btcRemaining;
  ev.blockNumber = event.block.number;
  ev.timestamp = event.block.timestamp;
  ev.txHash = event.transaction.hash;
  ev.save();

  const g = getGlobalStats(event.block);
  g.totalMusdRepaid = g.totalMusdRepaid.plus(event.params.musdRepaid);
  g.totalCollateralUnlocked = g.totalCollateralUnlocked.plus(event.params.btcOut);
  if (event.params.musdRemaining.equals(BigInt.zero()) && event.params.btcRemaining.equals(BigInt.zero())) {
    g.totalSettled = g.totalSettled.plus(BigInt.fromI32(1));
  }
  // BTC has physically left the protocol, so the global "collateral locked"
  // counter decreases by the unlocked amount.
  g.totalCollateralLocked = g.totalCollateralLocked.minus(event.params.btcOut);
  g.save();
}

export function handleLiquidationGuardTriggered(event: LiquidationGuardTriggered): void {
  const id = event.params.orderId.toHex();
  let r = Remittance.load(id);
  if (r != null) {
    r.status = "LIQUIDATED";
    r.liquidatedAt = event.block.timestamp;
    r.liquidationCovered = event.params.covered;
    r.liquidationTxHash = event.transaction.hash;
    r.save();
  }

  const ev = new LiquidationEvent(eventId(event));
  ev.orderId = event.params.orderId;
  ev.remittance = id;
  ev.covered = event.params.covered;
  ev.blockNumber = event.block.number;
  ev.timestamp = event.block.timestamp;
  ev.txHash = event.transaction.hash;
  ev.save();

  const g = getGlobalStats(event.block);
  g.totalLiquidated = g.totalLiquidated.plus(BigInt.fromI32(1));
  g.save();
}
