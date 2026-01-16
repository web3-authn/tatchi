# Neobank / Stablecoin App (Discussion Doc)

This document captures an end-to-end discussion of using the **Tatchi / Web3Authn SDK** as the basis for a passkey-first wallet experience for a Wise-like stablecoin app:

- Deposit stablecoins (initially **USDC/USDT**, later potentially **EUR/JPY** stablecoins)
- Swap across currencies
- Spend via a **Visa card**

It also outlines how **StableFlow (NEAR Intents)** can be used for cross-chain bridging, pricing, and routing, and what’s required for Visa issuance + settlement + KYC/AML.

---

## 1) What Tatchi Gives You (and What It Doesn’t)

### What you get “out of the box”

- **Passkey-first, embedded wallet UX**: a cross-origin wallet iframe mounted by your app.
- **Key derivation from passkeys**: deterministic wallet keys derived from WebAuthn + PRF outputs; no seed phrases.
- **On-chain verification**: WebAuthn authentications verified by an on-chain Web3Authn contract (no auth server required for the cryptographic verification path).
- **Isolated signing runtime**: sensitive flows run in the wallet origin and in workers; your app origin cannot directly read wallet storage/secrets.
- **Replay resistance / freshness**: VRF-backed challenges bind WebAuthn to fresh chain state.
- **Session UX improvements**: VRF sessions can allow limited “warm signing” without prompting every transaction (within TTL/usage caps).
- **Nonce safety**: nonce manager prevents nonce races when sending multiple NEAR transactions.
- **Optional policy hardening**: threshold co-signing can introduce an additional signing party (relayer) for policy / risk controls (at the cost of availability + complexity).

### What you still need to build (even with a “serverless wallet”)

For a Wise-like neobank, the “wallet” is just one subsystem. You still need:

- **Bridging + off-chain integrations** (StableFlow covers much of bridging/routing, but you still integrate it).
- **Compliance and risk controls**: KYC/AML, sanctions screening, transaction monitoring, fraud, chargebacks.
- **Fiat settlement rails**: card settlement is in fiat; you need treasury + prefunding + reconciliation.
- **Customer support + disputes**: chargebacks, refunds, disputes, card replacement.
- **Product ledgering**: balances, holds, FX, fees, audit logs, accounting.
- **Distribution + platform ops**: monitoring, incident response, key management for services you operate.

---

## 2) High-Level System Architecture

### Actors / components

- **App origin**: your web app (product UI).
- **Wallet origin (iframe)**: the embedded Tatchi wallet runtime (isolated origin) handling WebAuthn, VRF, and signing.
- **NEAR blockchain**: accounts, access keys, token contracts, DEXs, and Web3Authn contract verification.
- **Relay (optional, non-custodial)**: used for the primary Shamir 3-pass unlock path (2-of-2 “device + relay” for session unlock).
- **Relayer (optional, co-signer)**: threshold signing coordinator/cosigner for “2-of-2 client+relayer” signatures.
- **StableFlow**: bridging/routing provider (OneClick / NEAR Intents, plus CCTP and USDT0 for some chains).
- **Neobank backend**: the off-chain services you still need (compliance, ledger, card program integration, etc).

### Key “trust boundary” principle

- Assume the **app origin may be compromised** (XSS, malicious deps): the wallet origin isolates secrets and confirmation UI.
- You still depend on integrity of:
  - the **wallet origin** (its deployment + supply chain),
  - the **browser/OS endpoint**,
  - any optional relay/relayer services you use.

---

## 3) StableFlow (NEAR Intents) Integration

StableFlow provides:

- **Quote aggregation** across bridge services (`getAllQuote`)
- **Execution** (`send`)
- **Status tracking** (`getStatus`)
- **Developer fees** via `appFees` routed on-chain

### 3.1 Auth + deployment stance

StableFlow requires a **JWT token** (`OpenAPI.TOKEN`).

Recommended production stance:

- Keep the StableFlow JWT **server-side** (do not embed in a public web app bundle).
- Expose a minimal backend proxy:
  - `POST /bridge/quote` → calls StableFlow quoting
  - `GET /bridge/status` → calls StableFlow status
  - Optionally `POST /bridge/execute` → if you ever support non-NEAR wallets you control on server (usually you won’t)

This also lets you:
- rate limit
- add allowlists / abuse prevention
- attach your own business logic for fees, risk checks, KYT

### 3.2 Token + route constraints (important)

StableFlow’s published token configs are currently **USDC + USDT** across supported chains, with bridging services:

- **OneClick** (StableFlow’s NEAR Intents route)
- **CCTP** (USDC only, where supported)
- **USDT0** (USDT only, where supported)

If “EUR stablecoins” and “JPY stablecoins” are requirements:
- confirm whether StableFlow supports them (or can add them), or
- plan a second bridging + liquidity provider for those assets.

### 3.3 Quote + routing flow

1. User chooses:
   - `fromChain/fromToken`, `toChain/toToken`
   - amount
   - destination recipient address/account
2. Backend (or client in dev) calls `getAllQuote`.
3. Your app ranks routes by:
   - `totalFeesUsd` (primary)
   - `estimateTime` (secondary)
   - `outputAmount` (secondary)
4. Present user:
   - best route (“recommended”)
   - alternative routes (if available)
5. If `needApprove` is true for EVM-like routes, approval must happen prior to sending (not applicable to NEAR ft_transfer_call in the same way).

### 3.4 Executing OneClick from a Tatchi NEAR wallet

If the user’s wallet is a **NEAR account controlled by Tatchi**, execution should be done by signing NEAR transactions from the wallet iframe.

The key idea (based on StableFlow’s own NearWallet implementation) is:

- Create NEAR transactions that ultimately call:
  - `ft_transfer_call` on the NEP-141 token contract
  - with `receiver_id = stbflow.near`
  - with `msg = <depositAddress returned by StableFlow quote>`

Plus:
- optionally call `storage_deposit` to register:
  - the `depositAddress` account
  - `stbflow.near`
  on the token contract if needed.

**Why this matters:** on NEAR, the “deposit address” is used as a message payload to StableFlow’s contract, not simply “send tokens to that address”.

Implementation approach:

- Implement a small “StableFlow wallet adapter” that satisfies StableFlow’s `WalletConfig` interface, but routes `send()` into the Tatchi wallet signing flow (NEAR tx actions).
- You do not need to use StableFlow’s packaged NearWallet; it assumes a NEAR selector wallet.

### 3.5 Status tracking + UX

StableFlow supports:
- OneClick: status by `depositAddress`
- CCTP / USDT0: status by tx hash

Recommended UX:
- Show a single “bridge timeline” with:
  - submitted (NEAR tx hash)
  - pending (StableFlow status polling)
  - completed (destination chain tx hash when available)
  - failed/refunded (and what the user should do next)

Plan for:
- exponential backoff polling
- idempotent status checks
- storing bridge history (local + backend for customer support)

---

## 4) Pricing / Routing

For cross-chain bridging:
- StableFlow already provides routing options and fees across services via `getAllQuote`.
- This reduces the need for a separate pricing engine *for bridging*.

You may still need separate routing for **intra-chain swaps**:
- On NEAR: a DEX/aggregator integration (not covered by StableFlow’s bridge SDK).
- For a Wise-like “multi-currency account”, you’ll likely maintain a product-level FX quote model, spreads, and hedging/treasury logic (off-chain), even if swaps are executed on-chain.

---

## 5) Visa Issuance, Settlement, and KYC/AML (Discussion)

### 5.1 You usually don’t “integrate with Visa” directly

Most startups ship a Visa card program by partnering with:

1. **Issuer bank / BIN sponsor** (a Visa member)  
2. **Issuer processor / program manager** (APIs for issuing, auth, clearing, disputes, card lifecycle)  
3. Optional: **KYC provider(s)**, fraud tooling, transaction monitoring, AML/KYT systems

The partner stack will determine:
- where you can issue (regions)
- product type (prepaid vs debit vs credit)
- compliance requirements and timelines
- how authorization + settlement events are delivered (webhooks)

### 5.2 Settlement reality: cards settle in fiat

Even if the user “spends stablecoins”, the card network settles in fiat:

- authorizations create **holds**
- clearing/settlement finalizes amounts
- chargebacks/disputes require reversals and represent credit risk

This typically implies you need a **fiat ledger balance** per user (or an omnibus structure) to:
- prefund settlement
- manage holds
- cover disputes/chargebacks

### 5.3 Custody model decision (critical)

A pure self-custody wallet does not map cleanly onto card settlement requirements.

Common pattern:

- User has a self-custody on-chain wallet (Tatchi/NEAR).
- To “spend via Visa”, user moves funds into a **custodial spend balance** (or a regulated partner’s account structure).
- Your backend (or partner stack) controls authorization rules, limits, and settlement prefunding.

Hybrid hardening options:
- Use **threshold signing** for specific high-risk actions (e.g., large transfers, changing payout destinations, disabling protections), where a relayer co-signs only if policy checks pass.

### 5.4 KYC/AML considerations

Given your Cayman fund background: the operational processes will feel familiar (KYB/KYC, sanctions, monitoring), but consumer payments typically adds:

- ongoing screening + transaction monitoring expectations
- product-specific risk controls (velocity limits, MCC blocks)
- dispute workflows + regulatory complaints handling

### 5.5 What “Visa integration” work looks like in practice

Typical milestones:

1. Define program scope:
   - regions (US vs EEA/UK vs APAC)
   - consumer vs business
   - prepaid vs debit
   - physical vs virtual
2. Select program partners:
   - issuer/BIN sponsor
   - processor/program manager
   - KYC/KYB and fraud/AML vendors
3. Build your neobank backend:
   - user onboarding + compliance workflow
   - ledger + holds + reconciliation
   - funding flows (stablecoin → fiat)
   - support + disputes
4. Integrate issuing + auth webhooks:
   - auth decisions (approve/decline)
   - balance checks / holds
   - settlement + refunds
5. Launch controls:
   - limits, risk policies, monitoring, audit trails

---

## 6) Open Questions (to resolve before committing to an implementation path)

### Card program
- Target issuance regions (US? EEA/UK? both?)
- Consumer vs business cards
- Prepaid vs debit
- Virtual-only vs physical+virtual
- Custodial spend balance acceptable, or must remain pure self-custody?

### Assets and FX
- Are EUR/JPY “stablecoins” required on-chain, or is “EUR/JPY balances” an off-chain ledger representation funded by stablecoins?
- Required chains for deposits (EVM, Solana, etc) vs NEAR-only?

### Risk + security posture
- Whether to require explicit confirm UI for every spend/transfer vs allow warm sessions
- Whether to introduce threshold signing for spend-policy enforcement

---

## 7) Updated Implementation Plan (from this discussion)

1. **Review StableFlow developer docs** (done)
2. **Design StableFlow quote/execute backend** (done)
3. **Implement Tatchi StableFlow wallet adapter** (next)
4. **Build bridging UX and status polling**
5. **Scope Visa issuing partners and regions**
6. **Define KYC/AML and settlement flows**

