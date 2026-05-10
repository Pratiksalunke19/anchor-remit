# Anchor Remit Subgraph

Indexes `RemittanceVault` and `InsurancePool` events on Mezo Matsnet for the
live dashboard (real-time collateral ratio, claim history, LP TVL, global
remittance feed).

## Layout

- `subgraph.yaml` — manifest with both contracts and event handlers
- `schema.graphql` — entities (`Remittance`, `ClaimEvent`, `LpPosition`, `GlobalStats`, …)
- `src/remittance-vault.ts` — vault event mappings
- `src/insurance-pool.ts` — pool event mappings
- `abis/` — exported from `out/*.sol/*.json`

## Setup

```bash
pnpm install            # or npm/yarn
pnpm codegen            # generates ./generated from schema.graphql + ABIs
pnpm build              # compiles AssemblyScript → wasm
```

## Deploy to Goldsky

```bash
goldsky login
pnpm codegen && pnpm build
goldsky subgraph deploy anchor-remit/0.1.0 --path .
```

After deploy, copy the GraphQL endpoint into the frontend env:

```
VITE_GOLDSKY_SUBGRAPH_URL=https://api.goldsky.com/api/public/<project>/subgraphs/anchor-remit/0.1.0/gn
```

## Refreshing ABIs

After redeploying contracts, regenerate the ABIs from the Foundry artifacts:

```bash
python3 -c 'import json; json.dump(json.load(open("../out/RemittanceVault.sol/RemittanceVault.json"))["abi"], open("abis/RemittanceVault.json","w"), indent=2)'
python3 -c 'import json; json.dump(json.load(open("../out/InsurancePool.sol/InsurancePool.json"))["abi"], open("abis/InsurancePool.json","w"), indent=2)'
```

## Querying

Example: latest 25 settled remittances for the live feed.

```graphql
{
  claimEvents(first: 25, orderBy: timestamp, orderDirection: desc) {
    id
    orderId
    recipient
    amount
    timestamp
    txHash
    remittance { sender musdAmount collateralBTC }
  }
  globalStats(id: "global") {
    totalRemittances
    totalClaimed
    totalMusdSettled
    poolReserve
    totalShares
  }
}
```
