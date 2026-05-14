import cron from "node-cron";
import { publicClient, walletClient, addresses, keeperAccount } from "../config";
import { remittanceVaultAbi } from "../abi";
import { orderRepo, watcherState } from "../db";
import { sendSms } from "./smsService";
import { formatEther } from "viem";

const LAST_BLOCK_KEY = "last_scanned_block";

export async function startChainWatcher() {
  if (!addresses.remittanceVault) {
    console.warn("[watcher] REMITTANCE_VAULT not set — skipping chain watcher");
    return;
  }

  console.log("[watcher] starting…");

  // 1. Live subscription to RemittanceCreated / RemittanceClaimed / CollateralWarning
  try {
    publicClient.watchContractEvent({
      address: addresses.remittanceVault,
      abi: remittanceVaultAbi,
      eventName: "RemittanceCreated",
      onLogs: async (logs) => {
        for (const log of logs) {
          const { orderId, sender, recipient, musdAmount, collateralBTC, expiryTimestamp } = log.args as any;
          orderRepo.upsert({
            order_id: orderId,
            sender,
            recipient,
            musd_amount: musdAmount?.toString() ?? "0",
            collateral_btc: collateralBTC?.toString() ?? "0",
            expiry_ts: Number(expiryTimestamp ?? 0),
            status: "PENDING",
            tx_hash: log.transactionHash ?? null,
          });
          console.log(`[watcher] RemittanceCreated ${orderId} → ${recipient}`);
        }
      },
    });

    publicClient.watchContractEvent({
      address: addresses.remittanceVault,
      abi: remittanceVaultAbi,
      eventName: "RemittanceClaimed",
      onLogs: async (logs) => {
        for (const log of logs) {
          const { orderId } = log.args as any;
          orderRepo.upsert({ order_id: orderId, status: "CLAIMED" });
          console.log(`[watcher] RemittanceClaimed ${orderId}`);
        }
      },
    });

    publicClient.watchContractEvent({
      address: addresses.remittanceVault,
      abi: remittanceVaultAbi,
      eventName: "CollateralUnlocked",
      onLogs: async (logs) => {
        for (const log of logs) {
          const { orderId, musdRepaid, btcOut, musdRemaining, btcRemaining } = log.args as any;
          const prev = orderRepo.get(orderId);
          const prevRepaid = BigInt(prev?.musd_repaid ?? "0");
          const prevUnlocked = BigInt(prev?.btc_unlocked ?? "0");
          const fullySettled =
            (musdRemaining as bigint) === 0n && (btcRemaining as bigint) === 0n;
          orderRepo.upsert({
            order_id: orderId,
            musd_repaid: (prevRepaid + (musdRepaid as bigint)).toString(),
            btc_unlocked: (prevUnlocked + (btcOut as bigint)).toString(),
            status: fullySettled ? "SETTLED" : prev?.status ?? "CLAIMED",
          });
          console.log(
            `[watcher] CollateralUnlocked ${orderId} repaid=${musdRepaid} btc=${btcOut} settled=${fullySettled}`,
          );
        }
      },
    });

    publicClient.watchContractEvent({
      address: addresses.remittanceVault,
      abi: remittanceVaultAbi,
      eventName: "CollateralWarning",
      onLogs: async (logs) => {
        for (const log of logs) {
          const { orderId, currentRatio } = log.args as any;
          const cr = Number(formatEther(currentRatio)) * 100;
          console.warn(`[watcher] CollateralWarning ${orderId} → ${cr.toFixed(2)}%`);
          const o = orderRepo.get(orderId);
          if (o?.recipient_phone) {
            await sendSms(
              o.recipient_phone,
              `Anchor Remit warning: collateral ratio ${cr.toFixed(1)}% on order ${orderId.slice(0, 10)}…`
            );
          }
        }
      },
    });
  } catch (err) {
    console.error("[watcher] subscription error", err);
  }

  // 2. Cron every 5 min → scan PENDING orders, trigger keeper if CR low
  cron.schedule("*/5 * * * *", async () => {
    try {
      const pending = orderRepo.listPending();
      if (pending.length === 0) return;

      const cr = (await publicClient.readContract({
        address: addresses.remittanceVault,
        abi: remittanceVaultAbi,
        functionName: "vaultCollateralRatio",
      })) as bigint;

      const pct = Number(formatEther(cr)) * 100;
      console.log(`[watcher] vault CR = ${pct.toFixed(2)}% (orders=${pending.length})`);

      if (pct < 110 && walletClient && keeperAccount) {
        for (const o of pending) {
          try {
            const hash = await walletClient.writeContract({
              address: addresses.remittanceVault,
              abi: remittanceVaultAbi,
              functionName: "liquidationGuard",
              args: [o.order_id as `0x${string}`],
              account: keeperAccount,
              chain: publicClient.chain,
            });
            console.log(`[watcher] keeper liquidationGuard ${o.order_id} → ${hash}`);
          } catch (err: any) {
            console.error(`[watcher] keeper tx failed for ${o.order_id}:`, err?.shortMessage || err?.message);
          }
        }
      }
    } catch (err) {
      console.error("[watcher] cron error", err);
    }
  });

  // touch last block so we know watcher is alive
  const blockNum = await publicClient.getBlockNumber();
  watcherState.set(LAST_BLOCK_KEY, blockNum.toString());
  console.log(`[watcher] live at block ${blockNum}`);
}
