import initSqlJs from "sql.js";
import fs from "node:fs";
import path from "node:path";
import { serverConfig } from "./config";

fs.mkdirSync(path.dirname(serverConfig.sqlitePath), { recursive: true });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let SQL: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
let initPromise: Promise<void> | null = null;

async function initDb(): Promise<void> {
  if (db) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    SQL = await initSqlJs();
    try {
      const filebuffer = fs.readFileSync(serverConfig.sqlitePath);
      db = new SQL.Database(filebuffer);
    } catch {
      db = new SQL.Database();
    }

    // Init schema
    db.run(`
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
    `);
    db.run(`
      CREATE TABLE IF NOT EXISTS watcher_state (
        key    TEXT PRIMARY KEY,
        value  TEXT
      );
    `);
    saveDb();
  })();

  return initPromise;
}

function saveDb(): void {
  if (!db) return;
  const data = db.export();
  fs.writeFileSync(serverConfig.sqlitePath, Buffer.from(data));
}

function ensureDb(): unknown {
  if (!db) throw new Error("Database not initialized. Call initDb() first.");
  return db;
}

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

function rowToOrderRow(row: string[]): OrderRow {
  return {
    order_id: row[0],
    sender: row[1],
    recipient: row[2],
    recipient_phone: row[3],
    musd_amount: row[4],
    collateral_btc: row[5],
    expiry_ts: Number(row[6]),
    status: row[7],
    created_at: Number(row[8]),
    sms_sent: Number(row[9]),
    tx_hash: row[10],
  };
}

export { initDb };

export const orderRepo = {
  upsert(row: Partial<OrderRow> & { order_id: string }) {
    const d = ensureDb() as { exec: (sql: string, params: unknown[]) => { length: number; values: { length: number }[] }; run: (sql: string, params: unknown[]) => void };
    const existing = d.exec("SELECT order_id FROM orders WHERE order_id = ?", [row.order_id]);
    if (existing.length > 0 && existing[0].values.length > 0) {
      const fields = Object.keys(row).filter((k) => k !== "order_id");
      if (fields.length === 0) return;
      const set = fields.map((f) => `${f} = ?`).join(", ");
      const values = fields.map((f) => (row as Record<string, unknown>)[f]);
      d.run(`UPDATE orders SET ${set} WHERE order_id = ?`, [...values, row.order_id]);
    } else {
      d.run(
        `INSERT INTO orders (order_id, sender, recipient, recipient_phone, musd_amount, collateral_btc, expiry_ts, status, created_at, sms_sent, tx_hash)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          row.order_id,
          row.sender ?? null,
          row.recipient ?? null,
          row.recipient_phone ?? null,
          row.musd_amount ?? "0",
          row.collateral_btc ?? "0",
          row.expiry_ts ?? 0,
          row.status ?? "PENDING",
          row.created_at ?? Math.floor(Date.now() / 1000),
          row.sms_sent ?? 0,
          row.tx_hash ?? null,
        ]
      );
    }
    saveDb();
  },
  get(orderId: string): OrderRow | undefined {
    const d = ensureDb() as { exec: (sql: string, params: unknown[]) => { length: number; values: unknown[][] }[] };
    const result = d.exec("SELECT * FROM orders WHERE order_id = ?", [orderId]);
    if (result.length === 0 || result[0].values.length === 0) return undefined;
    return rowToOrderRow(result[0].values[0] as string[]);
  },
  listPending(): OrderRow[] {
    const d = ensureDb() as { exec: (sql: string) => { length: number; values: unknown[][] }[] };
    const result = d.exec("SELECT * FROM orders WHERE status = 'PENDING'");
    if (result.length === 0) return [];
    return result[0].values.map((row) => rowToOrderRow(row as string[]));
  },
  listForSender(sender: string): OrderRow[] {
    const d = ensureDb() as { exec: (sql: string, params: unknown[]) => { length: number; values: unknown[][] }[] };
    const result = d.exec("SELECT * FROM orders WHERE lower(sender) = lower(?) ORDER BY created_at DESC", [sender]);
    if (result.length === 0) return [];
    return result[0].values.map((row) => rowToOrderRow(row as string[]));
  },
  listForRecipient(recipient: string): OrderRow[] {
    const d = ensureDb() as { exec: (sql: string, params: unknown[]) => { length: number; values: unknown[][] }[] };
    const result = d.exec(
      "SELECT * FROM orders WHERE lower(recipient) = lower(?) ORDER BY created_at DESC",
      [recipient],
    );
    if (result.length === 0) return [];
    return result[0].values.map((row) => rowToOrderRow(row as string[]));
  },
};

export const watcherState = {
  get(key: string): string | undefined {
    const d = ensureDb() as { exec: (sql: string, params: unknown[]) => { length: number; values: unknown[][] }[] };
    const result = d.exec("SELECT value FROM watcher_state WHERE key = ?", [key]);
    if (result.length === 0 || result[0].values.length === 0) return undefined;
    return result[0].values[0][0] as string;
  },
  set(key: string, value: string) {
    const d = ensureDb() as { run: (sql: string, params: unknown[]) => void };
    d.run(
      `INSERT INTO watcher_state (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [key, value]
    );
    saveDb();
  },
};
