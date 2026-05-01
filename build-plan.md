# Pre-Build Manual Setup
1. Environment & Tools Installation
bash# Node.js (v20+ required)
nvm install 20 && nvm use 20

# Package managers
npm install -g pnpm

# Foundry (Solidity toolchain)
curl -L https://foundry.paradigm.xyz | bash
foundryup

# Verify installations
node --version    # v20+
pnpm --version
forge --version
cast --version
2. Wallet & Testnet Setup
1. Install MetaMask browser extension
2. Add Mezo Matsnet (testnet) to MetaMask:
   - Network Name: Mezo Matsnet
   - RPC URL: https://rpc.test.mezo.org
   - Chain ID: 31611
   - Currency Symbol: BTC
   - Explorer: https://explorer.test.mezo.org

3. Get testnet BTC faucet tokens:
   - Visit: https://faucet.test.mezo.org
   - Connect wallet and request tBTC

4. Save your deployer private key securely in .env (never commit)
3. API Keys & Services (Register Before Building)
- Alchemy or Infura  → RPC provider (backup)
- The Graph (hosted) → Subgraph indexing (free tier)
- Transak / MoonPay  → Fiat off-ramp widget (sandbox API key)
- Twilio             → SMS delivery notifications (trial)
- Pinata / web3.storage → IPFS for receipts (free tier)
4. Project Scaffold
bashmkdir musd-remit && cd musd-remit
git init

# Smart contracts
mkdir contracts && cd contracts
forge init --no-commit .
cd ..

# Frontend
pnpm create vite frontend --template react-ts
cd frontend && pnpm install
pnpm add wagmi viem @tanstack/react-query \
         @rainbow-me/rainbowkit \
         framer-motion tailwindcss \
         zustand axios
npx tailwindcss init -p
cd ..

# Backend / API
mkdir backend && cd backend
pnpm init
pnpm add express typescript ts-node \
         ethers dotenv cors helmet \
         node-cron axios
cd ..

# Shared types
mkdir packages/shared-types
5. Environment Files
bash# contracts/.env
DEPLOYER_PRIVATE_KEY=0x...
MEZO_TESTNET_RPC=https://rpc.test.mezo.org
ETHERSCAN_API_KEY=...

# backend/.env
PORT=3001
MEZO_RPC=https://rpc.test.mezo.org
MUSD_CONTRACT=0x...         # filled after deploy
REMIT_CONTRACT=0x...        # filled after deploy
TWILIO_SID=...
TWILIO_TOKEN=...
TRANSAK_API_KEY=...

# frontend/.env
VITE_CHAIN_ID=31611
VITE_MEZO_RPC=https://rpc.test.mezo.org
VITE_BACKEND_URL=http://localhost:3001
VITE_TRANSAK_ENV=STAGING

Build Plan
Project: MUSD Remit
Stack:   Solidity (Foundry) · React + TypeScript · Node/Express · Wagmi/Viem
Testnet: Mezo Matsnet (Chain ID 31611)

Stage 1 — Smart Contracts (Days 1–2)
1.1 Core RemittanceVault Contract
File: contracts/src/RemittanceVault.sol
Purpose:
  - Accept BTC collateral from sender
  - Interface with Mezo's borrowing system to mint MUSD
  - Lock a remittance order (recipient address, amount, expiry)
  - Allow recipient to claim MUSD
  - Allow sender to cancel if unclaimed after expiry

Structs:
  RemittanceOrder {
    address sender
    address recipient        // can be empty if phone-based
    uint256 musdAmount
    uint256 collateralBTC
    uint256 createdAt
    uint256 expiryTimestamp  // default 72 hours
    bytes32 claimCode        // keccak256 of secret PIN
    OrderStatus status       // PENDING, CLAIMED, CANCELLED, LIQUIDATED
  }

Key Functions:
  createRemittance(recipient, musdAmount, claimCodeHash, expiry)
    → takes BTC collateral, mints MUSD via Mezo, stores order, returns orderId

  claimRemittance(orderId, plainTextPin)
    → verifies keccak256(pin) == claimCode, transfers MUSD to recipient

  cancelRemittance(orderId)
    → only sender, only after expiry, returns collateral

  topUpCollateral(orderId)
    → lets sender add more BTC if ratio drops

  liquidationGuard(orderId)
    → called by keeper if ratio < 120%, draws from InsurancePool

Events:
  RemittanceCreated(orderId, sender, recipient, amount)
  RemittanceClaimed(orderId, recipient, timestamp)
  RemittanceCancelled(orderId)
  CollateralWarning(orderId, currentRatio)
1.2 InsurancePool Contract
File: contracts/src/InsurancePool.sol
Purpose:
  - Community-funded buffer (seeded with test MUSD)
  - Covers under-collateralized positions to guarantee delivery
  - Charges 0.1% fee per remittance, accumulates reserve

Key Functions:
  deposit(amount)     → LP deposits MUSD, receives pool shares
  withdraw(shares)    → LP burns shares, receives MUSD + yield
  coverShortfall(orderId, amount)  → called by vault only
  getPoolHealth()     → returns reserve ratio

Storage:
  totalReserve, totalShares, mapping(address => uint256) shares
1.3 Mezo Interface Adapter
File: contracts/src/interfaces/IMezoVault.sol
Purpose:
  Abstract the actual Mezo borrowing calls so contract
  works on testnet with a mock and mainnet with real addresses.

Interface methods to wrap:
  depositCollateral(uint256 btcAmount)
  mintMUSD(uint256 musdAmount)
  repayAndWithdraw(uint256 orderId)
  getCollateralRatio(address user) → uint256

Also create: contracts/src/mocks/MockMezoVault.sol
  - Simulates minting MUSD at 1:1 ratio for testnet demo
1.4 Foundry Tests
File: contracts/test/RemittanceVault.t.sol
Test cases:
  testCreateRemittance()       → order stored correctly
  testClaimWithCorrectPin()    → MUSD transferred
  testClaimWithWrongPin()      → reverts
  testCancelAfterExpiry()      → collateral returned
  testCancelBeforeExpiry()     → reverts
  testInsurancePoolCover()     → shortfall covered
  testCollateralTopUp()        → ratio improves
  testFullHappyPath()          → end-to-end flow
1.5 Deploy Scripts
File: contracts/script/Deploy.s.sol
Deploy order:
  1. MockMezoVault (testnet only)
  2. InsurancePool
  3. RemittanceVault(mezoVaultAddr, insurancePoolAddr)
  4. Seed InsurancePool with 10,000 test MUSD
  5. Write deployed addresses to ../deployments/matsnet.json

Command:
  forge script script/Deploy.s.sol \
    --rpc-url $MEZO_TESTNET_RPC \
    --private-key $DEPLOYER_PRIVATE_KEY \
    --broadcast
Stage 1 Done when: All tests pass (forge test -vv), contracts deployed, addresses saved.

Stage 2 — Backend API (Days 2–3)
2.1 Project Structure
backend/
  src/
    index.ts              ← Express app entry
    config.ts             ← env vars, contract ABIs, viem client
    routes/
      remittance.ts       ← CRUD for orders
      collateral.ts       ← ratio monitoring
      offramp.ts          ← Transak widget session
      notify.ts           ← SMS triggers
    services/
      chainWatcher.ts     ← event listener, cron jobs
      collateralMonitor.ts← polls ratios, triggers warnings
      smsService.ts       ← Twilio wrapper
      offrampService.ts   ← Transak API wrapper
    types/
      index.ts            ← shared TypeScript types
2.2 Viem Chain Client
File: backend/src/config.ts
typescriptSetup:
  - createPublicClient with Mezo Matsnet chain definition
  - createWalletClient with keeper private key (for liquidation guard calls)
  - Load RemittanceVault and InsurancePool ABI from deployments/matsnet.json
  - Export typed contract instances
2.3 REST Endpoints
POST /api/remittance/create
  Body: { senderAddress, recipientPhone, musdAmount, pin, expiryHours }
  → Validate inputs
  → Hash PIN (keccak256) — never store plaintext
  → Return unsigned transaction calldata for frontend to sign
  → Store order metadata in memory/SQLite with orderId

GET /api/remittance/:orderId
  → Fetch order from chain via readContract
  → Return status, ratio, amounts, timestamps

POST /api/remittance/:orderId/claim
  Body: { pin, recipientAddress }
  → Build claimRemittance calldata
  → Return for recipient to sign (or relay if gasless)

GET /api/collateral/:orderId/ratio
  → Call getCollateralRatio on chain
  → Return { ratio, status: "SAFE"|"WARNING"|"DANGER" }

POST /api/offramp/session
  Body: { recipientAddress, musdAmount, country }
  → Create Transak widget session (staging)
  → Return sessionUrl for frontend embed

POST /api/notify/sms
  Body: { phone, orderId, pinCode }
  → Send SMS via Twilio: "You have received {amount} MUSD.
     Claim at musd-remit.app with code {pin}"
2.4 Chain Watcher Service
File: backend/src/services/chainWatcher.ts
On startup:
  watchContractEvent(RemittanceCreated) →
    → store in local index, send SMS to recipient

  watchContractEvent(CollateralWarning) →
    → log warning, notify sender via SMS/webhook

Cron (every 5 min):
  → Fetch all PENDING orders from local index
  → Call getCollateralRatio for each
  → If ratio < 125%: call topUpCollateral alert to sender
  → If ratio < 110%: trigger liquidationGuard keeper tx
2.5 SQLite Schema (lightweight, demo-appropriate)
sqlCREATE TABLE orders (
  order_id    TEXT PRIMARY KEY,   -- on-chain bytes32
  sender      TEXT,
  recipient_phone TEXT,
  musd_amount TEXT,
  status      TEXT DEFAULT 'PENDING',
  created_at  INTEGER,
  sms_sent    INTEGER DEFAULT 0
);
Stage 2 Done when: API runs locally, all endpoints return correct data from testnet, SMS sends successfully.

Stage 3 — Frontend (Days 3–4)
3.1 Project Structure
frontend/src/
  main.tsx
  App.tsx
  wagmi.config.ts          ← chain config, connectors
  stores/
    remittanceStore.ts     ← Zustand global state
  pages/
    Home.tsx               ← Landing / value prop
    Send.tsx               ← Sender flow
    Claim.tsx              ← Recipient claim flow
    Dashboard.tsx          ← Active orders, ratios
    Pool.tsx               ← Insurance pool LP page
  components/
    WalletConnect.tsx
    CollateralMeter.tsx    ← Live ratio gauge
    OrderCard.tsx
    OfframpWidget.tsx      ← Transak embed
    PinInput.tsx           ← Secure 6-digit PIN UI
    StepIndicator.tsx
  hooks/
    useRemittanceVault.ts  ← wagmi contract hooks
    useCollateralRatio.ts  ← polling hook
    useOrderStatus.ts
  abi/
    RemittanceVault.json
    InsurancePool.json
3.2 Wagmi Configuration
File: frontend/src/wagmi.config.ts
typescriptDefine:
  mezoMatsnet chain object (id: 31611, rpc, explorer, nativeCurrency: BTC)

Connectors:
  RainbowKit default (MetaMask, WalletConnect)

Providers:
  WagmiProvider + QueryClientProvider + RainbowKitProvider wrapping App
3.3 Sender Flow — Send.tsx
Step 1 — Amount & Recipient
  Input: MUSD amount to send
  Input: Recipient phone number (international format)
  Input: Expiry (24h / 48h / 72h selector)
  Show: "You need ~X BTC collateral at current price"
  Show: "Borrowing cost: 1% annual = $Y"

Step 2 — Set Claim PIN
  PinInput component (6 digits, shown once)
  Warning: "Share this PIN with recipient separately"
  Confirm PIN entry

Step 3 — Approve & Send
  Show transaction summary card
  Button: "Lock Collateral & Send"
    → calls createRemittance on contract via wagmi writeContract
    → on success: show orderId + shareable claim link
    → backend called to send SMS to recipient

Step 4 — Confirmation
  Order ID displayed with copy button
  Deep link: musd-remit.app/claim/{orderId}
  CollateralMeter showing current ratio
  "Share with recipient" button (WhatsApp / SMS deep link)
3.4 Recipient Flow — Claim.tsx
Route: /claim/:orderId

Step 1 — Order Preview
  Fetch order details from /api/remittance/:orderId
  Show: sender (masked), amount, expiry countdown
  No wallet required at this step

Step 2 — Enter PIN
  PinInput component
  "Enter the 6-digit PIN shared by sender"

Step 3 — Connect Wallet & Claim
  RainbowKit connect button
  Button: "Claim {amount} MUSD"
    → calls claimRemittance
    → on success: MUSD appears in wallet

Step 4 — What's Next?
  Option A: "Hold MUSD" (done, show balance)
  Option B: "Spend via Off-Ramp" → opens OfframpWidget (Transak)
  Option C: "Copy wallet address" to use elsewhere
3.5 Dashboard.tsx
For connected senders:
  List of their active RemittanceOrders (from chain events)
  Each OrderCard shows:
    - Recipient (masked phone), amount, status badge
    - CollateralMeter (live ratio, color-coded: green/yellow/red)
    - "Top Up Collateral" button if ratio < 130%
    - "Cancel" button if expired

CollateralMeter component:
  - SVG arc gauge, 0–200% range
  - Green: >150%, Yellow: 120–150%, Red: <120%
  - Animated transition on value change
  - Threshold markers at 110% and 150%
3.6 Insurance Pool Page — Pool.tsx
Show:
  Total pool reserve (MUSD)
  Pool health ratio
  Your share / deposited amount
  APY estimate (from fees collected)

Actions:
  "Deposit MUSD" → calls InsurancePool.deposit()
  "Withdraw"     → calls InsurancePool.withdraw()

Info panel:
  How the pool works (accordion FAQ)
  Historical coverage events (from chain events)
3.7 UI Design Tokens
Color palette:
  Primary:   #F7931A  (Bitcoin orange)
  Secondary: #1A1A2E  (deep navy)
  Accent:    #00D4AA  (MUSD teal)
  Danger:    #FF4757
  Warning:   #FFA502
  Success:   #2ED573

Typography: Inter (system fallback)
Border radius: 12px cards, 8px inputs
Shadows: subtle, dark-mode first
Animations: Framer Motion page transitions, staggered list entries
Stage 3 Done when: Full sender → recipient flow works on testnet, wallet connects, transactions sign and confirm.

Stage 4 — Integration & Polish (Day 5)
4.1 End-to-End Integration Test
Manual test checklist:
  [ ] Connect MetaMask on Mezo Matsnet
  [ ] Send flow: input → PIN → sign tx → SMS received
  [ ] Claim flow: open link → enter PIN → connect wallet → claim
  [ ] Dashboard: collateral meter updates in real time
  [ ] Top-up collateral: ratio improves on meter
  [ ] Off-ramp: Transak widget opens in staging, mock conversion
  [ ] Insurance pool: deposit and withdraw cycle
  [ ] Cancel expired order: collateral returned
4.2 Error States to Handle
- Insufficient BTC balance (pre-check before tx)
- Wrong network (prompt to switch to Matsnet)
- Wrong PIN (show attempt counter, lock after 5 wrong)
- Expired order (show countdown, explain cancel option)
- RPC timeout (retry with backoff, show status indicator)
- Collateral ratio drop during pending claim (show warning banner)
4.3 Mobile Responsiveness
Priority screens for mobile:
  - Claim page (recipients likely on phone)
  - PIN input (large touch targets, native numpad)
  - Order status (clear, readable in SMS link context)

Test on: 375px (iPhone SE), 390px (iPhone 14), 414px (Android)
4.4 Demo Environment Seeding
bash# Script: contracts/script/SeedDemo.s.sol
Steps:
  1. Mint 100,000 test MUSD to deployer
  2. Seed InsurancePool with 50,000 MUSD
  3. Create 3 sample orders in various states:
     - Order A: PENDING (good ratio 180%)
     - Order B: PENDING (warning ratio 125%)
     - Order C: CLAIMED (completed)
  4. Output demo credentials to console (order IDs + PINs)

Stage 5 — Presentation & Submission (Day 6)
5.1 Demo Script (5 minutes)
00:00 – 00:30  Problem slide: "$800B remittance market, 8% avg fee, 3-5 days"
00:30 – 01:00  Solution: "Bitcoin holders send value globally, keep BTC exposure"
01:00 – 02:30  Live demo:
               → Sender locks BTC, mints MUSD, sends with PIN (30s)
               → Recipient opens SMS link, enters PIN, claims MUSD (30s)
               → Show Dashboard with live collateral meter
               → Recipient clicks off-ramp (Transak staging)
02:30 – 03:30  Killer feature: Insurance Pool guarantees delivery
               → Show ratio drop simulation → pool auto-covers
03:30 – 04:30  Business case: fee model, TAM, roadmap
04:30 – 05:00  Ask / close
5.2 Submission Checklist
[ ] Contracts verified on Mezo Matsnet explorer
[ ] GitHub repo public with clear README
[ ] README includes: setup steps, contract addresses, demo video link
[ ] .env.example committed (no real keys)
[ ] Deployed frontend URL (Vercel / Netlify)
[ ] Deployed backend URL (Railway / Render free tier)
[ ] Demo video recorded (Loom, max 5 min)
[ ] Deck: 8–10 slides (problem, solution, demo, tech, team, roadmap)
[ ] KYB documents prepared for prize distribution
5.3 README Structure
markdown# MUSD Remit

> Bitcoin-backed instant global remittances powered by Mezo

## Testnet Contracts (Mezo Matsnet)
| Contract | Address |
|---|---|
| RemittanceVault | 0x... |
| InsurancePool | 0x... |
| MockMezoVault | 0x... |

## Quick Start
## Architecture Diagram
## How It Works
## Running Locally
## Team

Dependency & Timeline Summary
DayFocusMilestone1Contracts — Vault + interfaces + mockForge tests green2Contracts deploy + Backend scaffold + chain watcherContracts live on Matsnet3Backend API complete + SMS workingAll endpoints functional4Frontend — Send + Claim flowsFull flow on testnet5Dashboard + Pool + integration testing + mobileEnd-to-end demo ready6Polish + seed demo data + record video + submitSubmitted ✓