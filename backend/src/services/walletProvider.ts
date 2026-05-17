/**
 * Embedded-wallet provider abstraction for wallet-free recipients.
 *
 * Default implementation: `LocalWalletProvider`
 *  - Generates a fresh secp256k1 key per recipient.
 *  - AES-256-GCM encrypts the private key with WALLET_KMS_KEY (32-byte hex).
 *  - Persists ciphertext in SQLite (`recipient_wallets`).
 *  - Signing happens server-side; users never see/manage keys.
 *
 * Swap-in path for production:
 *  - Implement `WalletProvider` against Privy / Dynamic.xyz / Magic / Turnkey
 *    (e.g. their server SDK to mint a wallet bound to phone/email),
 *    keep the same `getOrCreateForOrder` / `getByPhone` shape, return a
 *    `viem` WalletClient compatible with `claim` / `transfer` flows.
 *  - For ERC-4337 / paymaster usage: replace `signAndSend` with a
 *    `sendUserOp` wrapper that submits via a bundler + paymaster sponsor.
 */
import crypto from "node:crypto";
import { createWalletClient, http, Hex, getAddress, WalletClient } from "viem";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { mezoMatsnet } from "../config";
import { recipientWalletRepo, RecipientWalletRow } from "../db";

const KMS_KEY_HEX = process.env.WALLET_KMS_KEY || "";

function kmsKey(): Buffer {
  if (KMS_KEY_HEX && /^[0-9a-fA-F]{64}$/.test(KMS_KEY_HEX)) {
    return Buffer.from(KMS_KEY_HEX, "hex");
  }
  // Demo fallback — derives a stable key from a fixed dev secret.
  // PRODUCTION: set WALLET_KMS_KEY to a random 32-byte hex value.
  console.warn("[walletProvider] WALLET_KMS_KEY not set — using insecure dev key");
  return crypto.createHash("sha256").update("anchor-remit-dev-kms").digest();
}

function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", kmsKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("hex"), tag.toString("hex"), enc.toString("hex")].join(":");
}

function decrypt(blob: string): string {
  const [ivHex, tagHex, encHex] = blob.split(":");
  const decipher = crypto.createDecipheriv("aes-256-gcm", kmsKey(), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  const dec = Buffer.concat([decipher.update(Buffer.from(encHex, "hex")), decipher.final()]);
  return dec.toString("utf8");
}

export interface WalletProvider {
  getOrCreateForOrder(orderId: string, phone?: string | null): Promise<RecipientWalletRow>;
  getByAddress(address: string): RecipientWalletRow | undefined;
  getByPhone(phone: string): RecipientWalletRow | undefined;
  walletClientFor(row: RecipientWalletRow): WalletClient;
}

export const walletProvider: WalletProvider = {
  async getOrCreateForOrder(orderId: string, phone?: string | null) {
    const existing = recipientWalletRepo.getByOrder(orderId);
    if (existing) return existing;

    // Reuse a phone-bound wallet if the recipient already onboarded once.
    if (phone) {
      const byPhone = recipientWalletRepo.getByPhone(phone);
      if (byPhone) return byPhone;
    }

    const pk = generatePrivateKey();
    const account = privateKeyToAccount(pk);
    const row: RecipientWalletRow = {
      address: getAddress(account.address).toLowerCase(),
      phone: phone ?? null,
      order_id: orderId,
      enc_privkey: encrypt(pk),
      provider: "local",
      created_at: Math.floor(Date.now() / 1000),
    };
    recipientWalletRepo.insert(row);
    return row;
  },

  getByAddress(address: string) {
    return recipientWalletRepo.getByAddress(address);
  },

  getByPhone(phone: string) {
    return recipientWalletRepo.getByPhone(phone);
  },

  walletClientFor(row: RecipientWalletRow): WalletClient {
    const pk = decrypt(row.enc_privkey) as Hex;
    const account = privateKeyToAccount(pk);
    return createWalletClient({ chain: mezoMatsnet, transport: http(), account });
  },
};
