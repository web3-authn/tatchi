# MPC Lite SDK — Plan

Goal: ship a **separate**, **minimal** client SDK that exposes a “simple MPC signer wallet” experience (threshold-only), without the full VRF-WebAuthn + confirmTxFlow + wallet-iframe feature set of `@tatchi-xyz/sdk`.

This doc is intentionally a **plan** (what we’ll do + sequencing), not a full spec.

---

## 0) Scope framing (what “lite” means)

### Keep
- **Threshold Ed25519 signing** (2P FROST client ↔ relayer) for:
  - NEAR transactions
  - NEP-461 delegates (if still desired)
  - NEP-413 message signing (optional)
- **Deterministic client share derivation** from passkey PRF (likely `PRF.first`) inside a single worker (no VRF worker).
- Minimal persistence of **public** / configuration material:
  - `relayerUrl`, `relayerKeyId`, participant ids, threshold public key.

### Drop (relative to full SDK)
- VRF worker (`wasm_vrf_worker`) and all confirmTxFlow/`awaitSecureConfirmation` flows.
- Shamir 3-pass relay wrapping, PRF.second recovery paths, email recovery flows.
- Local signer mode (no `local_near_sk_v3` vault lifecycle, no export UI).
- Wallet iframe UX surfaces + React/Lit components (optional: keep as separate addon package if needed).
- “Serverless-ish / stateless-challenge / contract-verifiable intent binding” guarantees provided by VRF-WebAuthn.

### Core tradeoffs (explicitly documented in the lite README)
- **Availability**: lite becomes **relay-dependent** for threshold signing and (likely) for authorization/session issuance.
- **Security model** shifts:
  - We can still do “WebAuthn user presence” and “intent binding”, but the *verifier* becomes the relay (or a relay-assisted contract call), not a VRF primitive.
  - We lose the strongest “stateless challenge + freshness tied to chain state” story unless we reintroduce comparable machinery (which defeats “lite”).

---

## 1) Decide the auth + session model (before coding)

We need a replacement for VRF-WebAuthn’s role as a session capability primitive.

### Option A (recommended for “lite”): relay-minted signing sessions
- **Authenticate once** with WebAuthn (PRF optional) to the relay.
- Relay returns a **short-lived session token** (JWT in body; cookies optional).
- Subsequent `/threshold-ed25519/authorize` calls use that token until expiry / remaining-uses exhaustion.
- Client worker keeps derived client share in-memory for that session window (no repeated PRF prompts).

What the relay must store (TTL KV; already required for threshold signing sessions):
- session metadata: `{ nearAccountId, rpId, relayerKeyId, expiresAtMs, remainingUses }`
- anti-replay for the WebAuthn login/assertion (e.g., store a `jti` or challenge nonce as “used”).

### Option B: per-signature WebAuthn
- Every signing request requires a fresh WebAuthn assertion.
- Simplest server state, but worst UX and highest latency.

### Option C: “stateless signed challenges” (JWT challenge) without VRF
- Relay signs a challenge payload (JWT) that the client embeds in WebAuthn challenge bytes.
- Still needs *some* state to prevent replay (or accept bounded replay), and still depends on relay key management.
- Usually not worth the complexity if the relay is already stateful for threshold sessions.

Decision checkpoint:
- Pick one default (likely Option A).
- Document the exact token/challenge schema and what is bound (nearAccountId, rpId, intentDigest, expiry, scope).

---

## 2) Define the minimal public API (TS)

### Proposed package(s)
- `@tatchi-xyz/mpc-lite` (or `@tatchi-xyz/threshold-signer`)
- Optional addon: `@tatchi-xyz/mpc-lite-react` (only if we truly need UI later)

### Proposed client API surface
Keep it small and explicit:
- `createMpcLiteClient({ relayerUrl, nearRpcUrl, contractId?, rpId? })`
- `setAccount({ nearAccountId, relayerKeyId, thresholdPublicKey, participantIds? })`
- `connectPasskey({ allowCredentials?, userVerification? })` → warms an auth/session token and in-memory client share
- `signTransactions({ transactions, intent?, sessionPolicy? })`
- Optional:
  - `signDelegateAction(...)`
  - `signNep413Message(...)`
  - `getSessionStatus()` / `disconnect()`

Non-goal for lite v1:
- full account creation / registration orchestration (keep that in the full SDK or a separate “relayed onboarding” service).

---

## 3) Worker + crypto architecture (single-worker model)

### Design goals
- Keep secrets out of app code as much as possible.
- Avoid pulling in VRF WASM and confirmTxFlow scaffolding.

### Proposed architecture
- One module worker: `mpc-signer.worker.js`
  - Derives client threshold signing share from PRF (during `connectPasskey`)
  - Holds the share in memory until session expiry (TTL/uses)
  - Coordinates with relay endpoints for:
    - `/threshold-ed25519/authorize`
    - `/threshold-ed25519/sign/init`
    - `/threshold-ed25519/sign/finalize`
  - Produces signed NEAR artifacts (same output types as today, if possible).

### PRF handling
- Lite can use `navigator.credentials.get` with PRF extension to obtain `PRF.first` (or `PRF.first_auth`).
- The worker should not call WebAuthn APIs directly (browser restriction); pass the PRF output into the worker once per session.
  - Explicitly document this is a security tradeoff vs dual-worker VRF design.
  - Minimize exposure: don’t log, don’t persist, zeroize buffers where possible.

---

## 4) Storage model (minimize persistence)

### Persist
- Threshold key material needed to call the relay and bind the right key:
  - `relayerUrl`, `relayerKeyId`
  - threshold public key
  - participant ids (if required by the relayer API)
- Optional: session token (short-lived) in memory; avoid long-lived storage.

### Do not persist (lite v1)
- Any local NEAR private key.
- Any VRF key material, Shamir envelopes, PRF.second backup data.

---

## 5) Repo layout + build strategy

### Monorepo approach (recommended)
- Add a new workspace package:
  - `mpc-lite/package.json`
  - `mpc-lite/src/...`
  - `mpc-lite/scripts/build*.sh` (or reuse `sdk` scripts if they’re generic enough)
- Ensure the lite package has its **own** `exports`, types output, and worker asset output.

### Code sharing strategy
- Prefer extracting narrowly-scoped shared utilities into internal modules that do not drag heavy deps:
  - threshold protocol types + helpers (participant parsing, request/response types)
  - base58/base64/validation helpers
  - NEAR transaction encoding types (only what lite needs)
- Avoid importing from `sdk/src/core/...` directly if it drags:
  - VRF worker managers
  - React/Lit UI
  - Offline export

### Bundle-size enforcement
- Add a CI check (or local script) that reports:
  - raw/gzip/brotli sizes for:
    - worker JS
    - worker WASM (if any)
    - main entry bundle
- Set a size budget for lite v1 (example targets; to be adjusted):
  - main ESM entry: < ~40KB brotli
  - worker JS: < ~15KB brotli
  - worker WASM: as low as practical (goal: remove local-signer code paths)

---

## 6) Relayer compatibility plan

### Reuse existing relayer endpoints
- Keep the server unchanged initially; lite should be a client-only change.
- Use the existing session-style threshold signing endpoints when available:
  - `POST /threshold-ed25519/session`
  - `POST /threshold-ed25519/authorize`
  - `POST /threshold-ed25519/sign/init`
  - `POST /threshold-ed25519/sign/finalize`

### Add “lite auth” endpoints only if necessary
If the current relayer auth pipeline assumes VRF proof / confirmTxFlow-derived evidence, introduce a parallel, explicit flow:
- `POST /threshold-ed25519/lite/session` (WebAuthn assertion → JWT)
- `POST /threshold-ed25519/lite/authorize` (JWT + intent digest → mpcSessionId)

Keep this isolated so the full SDK remains VRF-first.

---

## 7) Phased implementation checklist

### Phase 1 — spike + API agreement
- [ ] Decide Option A/B/C for auth/session.
- [ ] Write the lite public API and example usage snippets.
- [ ] Confirm which existing relayer endpoints can be reused unchanged.

### Phase 2 — new package skeleton
- [ ] Create workspace package with build + types.
- [ ] Export a minimal ESM entry and a worker entry.
- [ ] Ensure the package can be consumed by Vite/Next without pulling the full SDK.

### Phase 3 — threshold-only signing path
- [ ] Implement `connectPasskey` → derive client share from PRF.first and warm a relay session.
- [ ] Implement `signTransactions` end-to-end against relayer `/authorize` + `/sign/*`.
- [ ] Add unit tests around payload canonicalization + intent digest computation (client-side).

### Phase 4 — size + dependency tightening
- [ ] Remove any accidental imports that pull VRF/WebAuthnManager/UI code.
- [ ] Remove unused crypto dependencies in the lite package.
- [ ] (Optional) build a stripped signer WASM that excludes local-signer code paths.

### Phase 5 — docs + examples
- [ ] Add `mpc-lite` README: security tradeoffs, relay dependency, API examples.
- [ ] Add an `examples/mpc-lite-vite` app to validate integration and measure bundle size.

---

## 8) Open questions (to resolve early)
- Do we want lite to support **onboarding/enrollment** (AddKey / keygen), or assume threshold keys exist?
- Do we need NEP-461 + NEP-413 in lite v1, or just transactions?
- Where do we enforce intent canonicalization and policy: client, relay, or both?
- What is the minimal “good enough” security story without VRF (and how do we state it honestly)?

