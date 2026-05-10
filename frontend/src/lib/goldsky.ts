// Lightweight GraphQL fetcher for the Goldsky-hosted subgraph.
// No extra deps — just fetch + JSON.

export const GOLDSKY_URL: string =
  (import.meta.env.VITE_GOLDSKY_SUBGRAPH_URL as string | undefined) ?? "";

export const goldskyEnabled = GOLDSKY_URL.length > 0;

export type GqlError = { message: string };

export async function gql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  if (!goldskyEnabled) {
    throw new Error("VITE_GOLDSKY_SUBGRAPH_URL is not set");
  }
  const res = await fetch(GOLDSKY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) {
    throw new Error(`Subgraph HTTP ${res.status}`);
  }
  const json = (await res.json()) as { data?: T; errors?: GqlError[] };
  if (json.errors && json.errors.length > 0) {
    throw new Error(json.errors.map((e) => e.message).join("; "));
  }
  if (!json.data) throw new Error("Empty subgraph response");
  return json.data;
}

// ----------- typed queries -----------

export type GlobalStats = {
  id: string;
  totalRemittances: string;
  totalClaimed: string;
  totalCancelled: string;
  totalLiquidated: string;
  totalMusdLocked: string;
  totalMusdSettled: string;
  totalCollateralLocked: string;
  totalLpDeposited: string;
  totalLpWithdrawn: string;
  totalShortfallCovered: string;
  totalFeesAccrued: string;
  poolReserve: string;
  totalShares: string;
  lastUpdatedTimestamp: string;
};

export type ClaimEventRow = {
  id: string;
  orderId: string;
  recipient: string;
  amount: string;
  timestamp: string;
  txHash: string;
  remittance: {
    sender: string;
    musdAmount: string;
    collateralBTC: string;
  };
};

export type RemittanceCreatedRow = {
  id: string;
  orderId: string;
  sender: string;
  recipient: string;
  musdAmount: string;
  collateralBTC: string;
  status: string;
  createdAt: string;
  createdTxHash: string;
};

export type LpPositionRow = {
  id: string;
  lp: string;
  shares: string;
  totalDeposited: string;
  totalWithdrawn: string;
  lastActionAt: string;
};

export async function fetchLiveDashboard(limit = 20): Promise<{
  globalStats: GlobalStats | null;
  claimEvents: ClaimEventRow[];
  recentRemittances: RemittanceCreatedRow[];
  topLps: LpPositionRow[];
}> {
  const data = await gql<{
    globalStats: GlobalStats | null;
    claimEvents: ClaimEventRow[];
    remittances: RemittanceCreatedRow[];
    lpPositions: LpPositionRow[];
  }>(
    `query LiveDashboard($limit: Int!) {
      globalStats(id: "global") {
        id
        totalRemittances totalClaimed totalCancelled totalLiquidated
        totalMusdLocked totalMusdSettled totalCollateralLocked
        totalLpDeposited totalLpWithdrawn totalShortfallCovered totalFeesAccrued
        poolReserve totalShares lastUpdatedTimestamp
      }
      claimEvents(first: $limit, orderBy: timestamp, orderDirection: desc) {
        id orderId recipient amount timestamp txHash
        remittance { sender musdAmount collateralBTC }
      }
      remittances(first: $limit, orderBy: createdAt, orderDirection: desc) {
        id orderId sender recipient musdAmount collateralBTC status createdAt createdTxHash
      }
      lpPositions(first: 5, orderBy: shares, orderDirection: desc, where: { shares_gt: "0" }) {
        id lp shares totalDeposited totalWithdrawn lastActionAt
      }
    }`,
    { limit },
  );
  return {
    globalStats: data.globalStats,
    claimEvents: data.claimEvents,
    recentRemittances: data.remittances,
    topLps: data.lpPositions,
  };
}
