# Anchor Remit

![Solidity](https://img.shields.io/badge/Solidity-%23363636.svg?style=for-the-badge&logo=solidity&logoColor=white)
![Foundry](https://img.shields.io/badge/Foundry-%23FF4154.svg?style=for-the-badge&logo=forge&logoColor=white)
![Mezo](https://img.shields.io/badge/Mezo-F7931A?style=for-the-badge&logo=bitcoin&logoColor=white)
![MUSD](https://img.shields.io/badge/MUSD-2D9CDB?style=for-the-badge&logo=tether&logoColor=white)
![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)
![wagmi](https://img.shields.io/badge/wagmi-1C1C1C?style=for-the-badge&logo=ethereum&logoColor=white)
![viem](https://img.shields.io/badge/viem-F2A900?style=for-the-badge&logo=ethereum&logoColor=white)
![RainbowKit](https://img.shields.io/badge/RainbowKit-FF4865?style=for-the-badge&logo=rainbow&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![Express.js](https://img.shields.io/badge/Express.js-000000?style=for-the-badge&logo=express&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-07405E?style=for-the-badge&logo=sqlite&logoColor=white)
![Goldsky](https://img.shields.io/badge/Goldsky-7C3AED?style=for-the-badge&logo=graphql&logoColor=white)
![The Graph](https://img.shields.io/badge/Subgraph-1A0C2E?style=for-the-badge&logo=thegraph&logoColor=white)
![Twilio](https://img.shields.io/badge/Twilio-F22F46?style=for-the-badge&logo=twilio&logoColor=white)

> Bitcoin-backed, PIN-gated global remittances powered by Mezo & MUSD.

Anchor Remit lets a BTC holder lock Bitcoin as collateral on Mezo, mint MUSD
against it, and lock that MUSD into a remittance order that a recipient
anywhere in the world can claim with a 6-digit PIN — settling in a single
block and without the sender ever selling their BTC.

---

## ✨ Highlights

- **Bitcoin-backed remittances on Mezo.** Senders never sell BTC — collateral
  is locked, MUSD is minted via Mezo's vault, and the recipient cashes out in
  local fiat. The sender keeps the upside.
- **PIN-gated claims.** Each order is sealed with a 6-digit PIN
  (`keccak256(orderId ‖ keccak256(pin))`). The recipient can be a fixed
  address or "anyone with the PIN", enabling SMS-style hand-offs.
- **Insurance pool with on-chain APY.** LPs deposit MUSD to backstop
  under-collateralised orders. Every claim routes a 0.1% fee to the pool;
  the dashboard computes APY directly from `FeeReceived` events.
- **Automated liquidation guard.** A keeper watches collateral ratios and
  draws from the InsurancePool to make the recipient whole when CR < 110%.
- **Live event indexing via [Goldsky](https://goldsky.com).** A custom
  subgraph (`/subgraph`) streams `RemittanceCreated`, `RemittanceClaimed`,
  `FeeReceived`, and `ShortfallCovered` events into Goldsky's hosted
  service, powering the live activity feed and pool analytics without
  hammering the RPC.
- **Off-ramp + cash-out simulation.** Recipients pick a payout provider
  (UPI, IMPS, Wire, GCash) at the best quoted rate; receipts are persisted
  locally with bank/UPI reference numbers and ETAs.
- **Budget tracker & tax-ready PDF export.** From `/profile`, recipients
  can categorise every cash-out (Family Support, Medical, Education, …),
  set a monthly cap, and export a printable expense report for tax
  filings — all on-device, no servers required.
- **SMS notifications via Twilio.** Backend pings the recipient with a
  claim link the moment a remittance is created on-chain.
- **Recipient contact book.** Persisted recipients (by wallet or phone)
  appear as quick-pick chips on the Send screen.
- **Beautiful, animated UI.** Vite + React + Tailwind + Framer Motion, with
  RainbowKit for wallet UX.

---

## 🧱 Tech stack

| Layer | Stack |
| --- | --- |
| Smart contracts | Solidity, Foundry, OpenZeppelin |
| Chain | Mezo Matsnet (Bitcoin-backed L2) + MUSD |
| Backend | Node.js, Express, TypeScript, SQLite, viem, node-cron, Twilio |
| Frontend | Vite, React 18, TypeScript, TailwindCSS, Framer Motion, wagmi, viem, RainbowKit, Lucide |
| Indexing | Goldsky-hosted subgraph (GraphQL), The Graph schema |
| Off-ramp | Transak (sandbox) + simulated UPI / Wire / GCash providers |

---

## Repository layout

```
anchor-remit/
├── src/                         Solidity contracts (Foundry)
│   ├── RemittanceVault.sol      Core escrow + PIN-gated claim
│   ├── InsurancePool.sol        LP-funded guarantee buffer
│   ├── interfaces/IMezoVault.sol
│   └── mocks/                   MockMezoVault + MockERC20 for testnet
├── test/                        Foundry tests (10 passing)
├── script/                      Deploy + SeedDemo scripts
├── lib/                         Foundry dependencies (git submodules)
├── backend/                     Node/Express API, chain watcher, SMS, SQLite
│   └── src/
│       ├── index.ts, config.ts, abi.ts, db.ts
│       ├── routes/              remittance, collateral, offramp, notify, pool
│       └── services/            chainWatcher, smsService, offrampService
├── frontend/                    Vite + React + wagmi + RainbowKit + Tailwind
│   └── src/
│       ├── pages/               Home, Send, Claim, Dashboard, Pool, Profile, History, …
│       ├── components/          StepIndicator, PinInput, CollateralMeter, OrderCard, LiveFeed
│       ├── lib/                 payouts, budget (expense tracker + PDF export), goldsky
│       └── wagmi.config.ts, abi.ts, api.ts
└── subgraph/                    Goldsky-hosted subgraph (events → GraphQL)
    ├── src/                     remittance-vault.ts, insurance-pool.ts mappings
    ├── abis/                    RemittanceVault.json, InsurancePool.json
    └── subgraph.yaml, schema.graphql
```

---

## Prerequisites

- Node.js v20+ and `pnpm`
- Foundry (`forge`, `cast`) — https://book.getfoundry.sh/getting-started/installation
- A wallet with tBTC on Mezo Matsnet — https://faucet.test.mezo.org

## Quick start

```bash
# 1. Contracts
forge test -vv           # runs the 10 unit tests against the mocks

# set DEPLOYER_PRIVATE_KEY in .env first
forge script script/Deploy.s.sol \
  --rpc-url $MEZO_TESTNET_RPC \
  --private-key $DEPLOYER_PRIVATE_KEY \
  --broadcast
# → writes deployments/matsnet.json

# 2. Backend
cd backend
cp .env.example .env   # fill addresses from deployments/matsnet.json
pnpm install
pnpm dev               # http://localhost:3001

# 3. Frontend
cd ../frontend
cp .env.example .env   # fill the same addresses
pnpm install
pnpm dev               # http://localhost:5173
```

---

## Env files

Each layer has its own `.env.example` with the required variable names.
Fill the values in the corresponding `.env` file (already created for you):

**`/.env`** — Foundry deployer + optional seed-demo inputs
**`backend/.env`** — API server, keeper key, Twilio, Transak, DB path
**`frontend/.env`** — chain + backend URL + contract addresses + WalletConnect project id

Values to obtain yourself:
- `DEPLOYER_PRIVATE_KEY` — any funded Matsnet key
- `KEEPER_PRIVATE_KEY` (optional) — for automated liquidation guard tx
- `TWILIO_SID` / `TWILIO_TOKEN` / `TWILIO_FROM` — Twilio trial account
- `TRANSAK_API_KEY` — Transak sandbox key
- `VITE_WALLETCONNECT_PROJECT_ID` — https://cloud.walletconnect.com

---

## Architecture

```
┌──────────┐  BTC approve + createRemittance ┌────────────────┐
│  Sender  │────────────────────────────────▶│ RemittanceVault│──▶ MockMezoVault (mints MUSD, holds BTC)
└──────────┘                                 └────────────────┘
                                                     │
                                  PIN-locked MUSD held in escrow
                                                     │
┌──────────┐   claim(orderId, pin)                   ▼
│Recipient │────────────────────────────────▶ claimRemittance ──▶ 0.1% fee → InsurancePool
└──────────┘                                                      999% to recipient

                  keeper cron, CR < 110%              Insurance
             ┌───────────────────────────────▶ liquidationGuard ──▶ covers shortfall from Pool
             │
  ┌──────────┴──────────┐
  │ Backend chainWatcher│ (viem watchContractEvent + node-cron)
  └─────────────────────┘
```

### Key flows

- **createRemittance** pulls BTC, deposits into Mezo, mints MUSD, stores an
  order whose `claimCode = keccak256(orderId ‖ keccak256(pin))`.
- **claimRemittance** re-derives that hash from the pin pre-image and
  transfers MUSD (minus a 0.1% pool fee) to the claimer. A non-zero
  `recipient` locks the claim to that address; `address(0)` means any wallet
  with the pin can claim.
- **cancelRemittance** after expiry repays the MUSD debt and releases the
  BTC back to the sender.
- **liquidationGuard** (keeper) triggers when vault CR drops under 110% and
  pulls MUSD from the InsurancePool to make the order whole.

---

## Testing

```bash
forge test -vv
# Ran 10 tests — 10 passed, 0 failed
```

Covers:
- createRemittance, happy-path claim, wrong-pin revert
- cancelAfterExpiry / cancelBeforeExpiry reverts
- topUpCollateral raises CR
- insurance pool covers shortfall when CR crashes
- pool LP deposit + withdraw cycle
- recipient-less claim (anyone-with-pin mode)

## Deployed contracts (Mezo Matsnet)

| Contract | Address |
|---|---|
| RemittanceVault | _set after deploy_ |
| InsurancePool | _set after deploy_ |
| MockMezoVault | _set after deploy_ |
| MUSD (test) | _set after deploy_ |
| tBTC (test) | _set after deploy_ |

(Addresses are also written to `deployments/matsnet.json` automatically.)

---

## Status

- **Stage 1 — Contracts:** ✅ compiled, 10 tests passing, deploy script ready
- **Stage 2 — Backend:** ✅ typechecks, routes + watcher + SMS + off-ramp wired
- **Stage 3 — Frontend:** ✅ builds, full Send / Claim / Dashboard / Pool flows

Pending (hackathon polish):
- Live deploy to Matsnet + real address fill-in
- Demo seed script execution + screencast recording
- KYB / submission paperwork
