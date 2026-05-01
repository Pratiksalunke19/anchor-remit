import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { serverConfig } from "./config";

fs.mkdirSync(path.dirname(serverConfig.sqlitePath), { recursive: true });

export const db = new Database(serverConfig.sqlitePath);

db.exec(`
CREATE TABLE IF NOT EXISTS orders (
  order_id        TEXT PRIMARY KEY,
  sender          TEXT,
  recipient       TEXT,
  recipient_phone TEXT,
  musd_amount     TEXT,
  collateral_btc  TEXT,
  expiry_ts       INTEGER,
  status          TEXT DEFAULT 'PENDING',
  created_at      INTEGER,
  sms_sent        INTEGER DEFAULT 0,
  tx_hash         TEXT
);

CREATE TABLE IF NOT EXISTS watcher_state (
  key    TEXT PRIMARY KEY,
  value  TEXT
);
`);

export type OrderRow = {
  order_id: string;
  sender: string;
  recipient: string | null;
  recipient_phone: string | null;
  musd_amount: string;
  collateral_btc: string;
  expiry_ts: number;
  status: string;
  created_at: number;
  sms_sent: number;
  tx_hash: string | null;
};

export const orderRepo = {
  upsert(row: Partial<OrderRow> & { order_id: string }) {
    const existing = db
      .prepare<[string]>("SELECT order_id FROM orders WHERE order_id = ?")
      .get(row.order_id);
    if (existing) {
      const fields = Object.keys(row).filter((k) => k !== "order_id");
      if (fields.length === 0) return;
      const set = fields.map((f) => `${f} = @${f}`).join(", ");
      db.prepare(`UPDATE orders SET ${set} WHERE order_id = @order_id`).run(row);
    } else {
      db.prepare(
        `INSERT INTO orders (order_id, sender, recipient, recipient_phone, musd_amount, collateral_btc, expiry_ts, status, created_at, sms_sent, tx_hash)
         VALUES (@order_id, @sender, @recipient, @recipient_phone, @musd_amount, @collateral_btc, @expiry_ts, @status, @created_at, @sms_sent, @tx_hash)`
      ).run({
        order_id: row.order_id,
        sender: row.sender ?? null,
        recipient: row.recipient ?? null,
        recipient_phone: row.recipient_phone ?? null,
        musd_amount: row.musd_amount ?? "0",
        collateral_btc: row.collateral_btc ?? "0",
        expiry_ts: row.expiry_ts ?? 0,
        status: row.status ?? "PENDING",
        created_at: row.created_at ?? Math.floor(Date.now() / 1000),
        sms_sent: row.sms_sent ?? 0,
        tx_hash: row.tx_hash ?? null,
      });
    }
  },
  get(orderId: string): OrderRow | undefined {
    return db
      .prepare<[string]>("SELECT * FROM orders WHERE order_id = ?")
      .get(orderId) as OrderRow | undefined;
  },
  listPending(): OrderRow[] {
    return db
      .prepare("SELECT * FROM orders WHERE status = 'PENDING'")
      .all() as OrderRow[];
  },
  listForSender(sender: string): OrderRow[] {
    return db
      .prepare<[string]>("SELECT * FROM orders WHERE lower(sender) = lower(?) ORDER BY created_at DESC")
      .all(sender) as OrderRow[];
  },
};

export const watcherState = {
  get(key: string): string | undefined {
    const row = db
      .prepare<[string]>("SELECT value FROM watcher_state WHERE key = ?")
      .get(key) as { value: string } | undefined;
    return row?.value;
  },
  set(key: string, value: string) {
    db.prepare(
      `INSERT INTO watcher_state (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    ).run(key, value);
  },
};
