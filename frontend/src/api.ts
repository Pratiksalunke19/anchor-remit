import { backendUrl } from "./wagmi.config";

const SESSION_KEY = "anchor-remit:recipient-session";

export const recipientSession = {
  get(): string | null {
    return localStorage.getItem(SESSION_KEY);
  },
  set(token: string) {
    localStorage.setItem(SESSION_KEY, token);
  },
  clear() {
    localStorage.removeItem(SESSION_KEY);
  },
};

async function req<T>(path: string, init?: RequestInit & { auth?: boolean }): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((init?.headers as Record<string, string>) || {}),
  };
  if (init?.auth) {
    const token = recipientSession.get();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }
  const res = await fetch(`${backendUrl}${path}`, { ...init, headers });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

export type RecipientWallet = { address: string; balance: string; phone?: string | null; savings?: string };
export type RecipientTx = {
  id: number;
  wallet: string;
  kind: "claim" | "transfer" | "cashout" | "save";
  amount: string;
  counterparty: string | null;
  tx_hash: string | null;
  note: string | null;
  created_at: number;
};

export const api = {
  registerOrder(body: {
    orderId: string;
    recipientPhone?: string;
    recipient?: string;
    sender: string;
    musdAmount: string;
    collateralBtc: string;
    expiryTs: number;
    txHash?: string;
  }) {
    return req<{ ok: boolean }>(`/api/remittance/register`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  getOrder(orderId: string) {
    return req<{
      orderId: string;
      sender: string;
      recipient: string;
      musdAmount: string;
      collateralBTC: string;
      createdAt: number;
      expiryTimestamp: number;
      status: "PENDING" | "CLAIMED" | "CANCELLED" | "LIQUIDATED";
    }>(`/api/remittance/${orderId}`);
  },
  ratio(orderId: string) {
    return req<{ ratio: number; status: "SAFE" | "WARNING" | "DANGER" }>(
      `/api/collateral/${orderId}/ratio`
    );
  },
  offrampSession(body: { recipientAddress: string; musdAmount: string; country?: string }) {
    return req<{ sessionUrl: string }>(`/api/offramp/session`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  poolStats() {
    return req<{ totalReserve: string; totalShares: string; health: string }>(`/api/pool/stats`);
  },
  senderOrders(address: string) {
    return req<{ orders: any[] }>(`/api/remittance/sender/${address}`);
  },
  recipientOrders(address: string) {
    return req<{ orders: any[] }>(`/api/remittance/recipient/${address}`);
  },

  // ----- wallet-free recipient -----
  recipientClaim(body: { orderId: string; pin: string; phone?: string }) {
    return req<{
      session: string;
      wallet: { address: string; balance: string };
      claimTxHash: string;
      payoutTxHash: string;
      netMusd: string;
    }>(`/api/recipient/claim`, { method: "POST", body: JSON.stringify(body) });
  },
  recipientOtpRequest(phone: string) {
    return req<{ ok: boolean; devCode?: string }>(`/api/recipient/otp/request`, {
      method: "POST",
      body: JSON.stringify({ phone }),
    });
  },
  recipientOtpVerify(phone: string, code: string) {
    return req<{ session: string; wallet: { address: string; balance: string } }>(
      `/api/recipient/otp/verify`,
      { method: "POST", body: JSON.stringify({ phone, code }) }
    );
  },
  recipientMe() {
    return req<{ wallet: RecipientWallet }>(`/api/recipient/me`, { auth: true });
  },
  recipientTransfer(to: string, amount: string) {
    return req<{ ok: boolean; txHash: string }>(`/api/recipient/transfer`, {
      method: "POST",
      auth: true,
      body: JSON.stringify({ to, amount }),
    });
  },
  recipientCashout(amount: string, country?: string) {
    return req<{ sessionUrl: string }>(`/api/recipient/cashout`, {
      method: "POST",
      auth: true,
      body: JSON.stringify({ amount, country }),
    });
  },
  recipientSave(amount: string) {
    return req<{ ok: boolean; savings: string }>(`/api/recipient/save`, {
      method: "POST",
      auth: true,
      body: JSON.stringify({ amount }),
    });
  },
  recipientHistory() {
    return req<{ history: RecipientTx[] }>(`/api/recipient/history`, { auth: true });
  },
};
