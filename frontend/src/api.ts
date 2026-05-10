import { backendUrl } from "./wagmi.config";

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${backendUrl}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

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
};
