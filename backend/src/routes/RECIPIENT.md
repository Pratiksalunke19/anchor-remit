# Wallet-free recipient experience

Goal: a recipient receiving an SMS link can claim, hold, send, save, and
cash out MUSD **without** MetaMask, a seed phrase, signing transactions,
or holding native gas. The experience is PayPal/CashApp/UPI-grade.

## Flow

```
sender Send.tsx ──▶ creates remittance with claimCode = keccak256(orderId || keccak256(pin))
                    SMS to recipient with /claim/:orderId
                                                  │
                                                  ▼
recipient Claim.tsx ──▶ enters PIN  ──▶  POST /api/recipient/claim
                                                  │
                                                  ▼
                                       backend (relayer.ts)
                       1. publicClient.getOrder(orderId)
                       2. verify keccak256(orderId || keccak256(pin)) == claimCode
                       3. rate-limit per orderId+ip (5 / 10min)
                       4. KEEPER calls claimRemittance       (gas paid by relayer)
                          MUSD lands in keeper account
                       5. walletProvider.getOrCreateForOrder(orderId, phone)
                          AES-256-GCM encrypted privkey persisted in SQLite
                       6. KEEPER ERC20.transfer(MUSD, embeddedWallet, net)
                       7. KEEPER native BTC drip → embeddedWallet (gas)
                       8. signSession(walletAddress, phone) (HMAC token)
                                                  │
                                                  ▼
                                Wallet.tsx loads /api/recipient/me
                       balance · Cash Out · Transfer · Save · History
```

## Files

### Backend
- `services/walletProvider.ts` — pluggable embedded-wallet interface; default
  `LocalWalletProvider` generates a fresh secp256k1 key, AES-256-GCM encrypts
  it with `WALLET_KMS_KEY`, stores ciphertext in SQLite. Swap for Privy /
  Dynamic.xyz / Turnkey by reimplementing the interface.
- `services/relayer.ts` — verifies PIN against on-chain commitment, executes
  the meta-transactions (claim, payout, gas drip, outbound transfer). All
  user-facing actions are sponsored by the keeper — recipient never signs.
- `services/session.ts` — stateless HMAC-signed session tokens (7-day TTL).
  `requireSession` middleware extracts `sub` (wallet address).
- `services/otpService.ts` — phone OTP login via Twilio. Codes stored as
  `sha256(pepper|phone|code)`, never plaintext, with 5-min TTL & attempt cap.
- `services/rateLimit.ts` — in-memory bucket limiter (swap for Redis in prod).
- `routes/recipient.ts` — REST surface: `/claim`, `/otp/{request,verify}`,
  `/me`, `/transfer`, `/cashout`, `/save`, `/history`.

### Frontend
- `pages/Claim.tsx` — wallet-free claim screen. PIN + optional phone.
  Drops the user straight into `/wallet` after success.
- `pages/Wallet.tsx` — PayPal-style dashboard: balance card, Cash Out,
  Transfer, Save, activity feed. No `useAccount`, no signing.
- `pages/Login.tsx` — phone+OTP recovery flow.
- `api.ts` — `recipientSession` localStorage helper + typed client for the
  recipient API.

## Security

- **PIN**: never stored on backend. The on-chain `claimCode = keccak256(orderId || keccak256(pin))`
  is the only commitment; verification recomputes from user input.
- **Embedded keys**: AES-256-GCM (12-byte IV, 16-byte tag) with `WALLET_KMS_KEY`.
  Only the relayer process can decrypt. Replace with KMS / HSM / Turnkey for prod.
- **Session token**: HMAC-SHA256 over `{sub, phone, iat, exp}`. `SESSION_SECRET` required.
- **OTP**: SHA-256 with pepper, 5-attempt cap, 5-min TTL.
- **Rate limiting**: 5 PIN attempts per (orderId, IP) per 10min; 3 OTP requests
  per (phone, IP) per 5min; 6 OTP verifies per (phone, IP) per 10min.
- **Recipient lock**: if a remittance was created with a non-zero `recipient`,
  wallet-free claim is refused (prevents stealing flows that were intended for
  a known self-custody wallet).

## Environment

```
WALLET_KMS_KEY=<openssl rand -hex 32>
SESSION_SECRET=<openssl rand -hex 32>
OTP_PEPPER=<openssl rand -hex 16>
KEEPER_PRIVATE_KEY=0x...   # already used by liquidationGuard cron
RELAYER_GAS_DRIP_BTC=0.00005
TWILIO_SID / TWILIO_TOKEN / TWILIO_FROM   # optional; SMS + OTP fall back to devCode
```

## Production swap-in (ERC-4337 / Privy)

Replace `LocalWalletProvider` with one that calls Privy's server SDK to
mint a smart account bound to phone/email, and replace
`relayer.relayTransferOut` with a `sendUserOp` that submits via a bundler
+ paymaster. The route surface and session model stay identical.
