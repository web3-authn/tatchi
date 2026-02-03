
# Threshold Ed25519 (NEAR)

This document consolidates:
- Threshold Ed25519 reference and API notes (formerly `docs/threshold-ed25519-near-spec.md`)
- Derived-share relayer notes (formerly `docs/threshold-relay-server.md`)
- MPC signing refactor / relayer-fleet t-of-n roadmap (formerly `docs/mpc-signing-refactor.md`)

If you had links to the old docs, they now redirect here.

This document is a reference for the **implemented** 2‑party threshold Ed25519 signing mode in `@tatchi-xyz/sdk`, where:

- The **client** holds one key share (in the WASM signer worker).
- The **relayer** holds the other key share (server-side).
- Neither side can produce a valid NEAR Ed25519 signature alone.
- The resulting signature is a **standard NEAR Ed25519 signature** (no on-chain changes).

It also describes the key architectural constraints (VRF binding, key material storage, and relayer authorization) that keep the signing surfaces consistent across local and threshold modes.

> Status: the repo implements **local** and **threshold (2p FROST) Ed25519 signing** behind `signerMode`.
>
> Implementation summary:
> - VRF input derivation includes a required 32-byte `intent_digest_32` end-to-end (SDK → VRF worker → contract).
> - IndexedDB v3 vault uses a tagged `KeyMaterial` union (`local_near_sk_v3`, `threshold_ed25519_2p_v1`) with no v2 fallback.
> - Signer worker signing handlers route through a backend abstraction and accept `signerMode` for tx/delegate/NEP‑413; threshold backend is implemented (FROST client coordinator) and relayer endpoints (`/threshold-ed25519/keygen`, `/authorize`, `/sign/init`, `/sign/finalize`) exist with **optional Redis/Upstash persistence** (default in-memory; still not production-hardened).
> - Stateless relayer mode is implemented: the relayer signing share can be deterministically derived from `THRESHOLD_ED25519_MASTER_SECRET_B64U` + client-provided public binding data (see “Threshold Relayer Server — Deterministic Relayer Share + Minimal State” below).
> - Threshold enrollment is “activatable” on-chain: the relayer returns threshold enrollment details, and the client submits `AddKey(thresholdPublicKey)` itself. During `registerPasskey(signerMode="threshold-signer")`, the SDK performs this AddKey immediately after registration using the in-memory registration credential (no extra TouchID prompt).
> - Session-style threshold signing is implemented: `loginAndCreateSession()` mints `POST /threshold-ed25519/session` (JWT/cookie), and subsequent threshold signing uses the session token to call `/threshold-ed25519/authorize` without requiring WebAuthn per signature (fallbacks to per-signature WebAuthn when the token is missing/invalid).

> Scope note: this implementation prioritizes a **clean v3 refactor**. Backwards compatibility (old vault entries, old APIs, seamless upgrades) is explicitly **not** a goal; assume a breaking change and **re-registration** (no automatic v2→v3 migration).

---

## Threshold Relayer Server — Deterministic Relayer Share + Minimal State

This section describes the **implemented** threshold Ed25519 relayer setup where the relayer can run with minimal long-lived state by deterministically deriving its signing share.

### Overview
Make the relayer **stateless for long-lived threshold share material** by deterministically deriving the relayer signing share from a relayer master secret plus client-provided (public) binding data.

This does **not** eliminate short-lived FROST protocol state. The relayer still needs **TTL-backed state** for:
- 2-round signing sessions (commitments/nonces),
- threshold auth sessions (JWT/cookie remaining uses + expiry).

### Share modes (implemented)

The relayer supports three modes via `THRESHOLD_ED25519_SHARE_MODE`:
- `auto` (default): use deterministic derivation if `THRESHOLD_ED25519_MASTER_SECRET_B64U` is set, otherwise use KV/in-memory share storage.
- `derived`: **always** derive the relayer signing share on demand (requires `THRESHOLD_ED25519_MASTER_SECRET_B64U`).
- `kv`: **always** require the share to be persisted (Redis/Upstash/in-memory; in-memory is dev-only).

### What state is stored (and why)

#### Long-lived secret (required in `derived`)
- `THRESHOLD_ED25519_MASTER_SECRET_B64U` (32 bytes, base64url) shared by all relayer instances in the cluster.

#### TTL KV state (recommended for prod; in-memory fallback exists)
- **Threshold auth sessions** (`POST /threshold-ed25519/session`): stores `{ relayerKeyId, userId, rpId, expiresAtMs }` and a separate `remainingUses` counter.
- **FROST signing sessions** (`/threshold-ed25519/sign/*`):
  - `mpcSessionId` record (one-shot, TTL): includes `clientVerifyingShareB64u` so relayer can re-derive in derived mode.
  - `signingSessionId` record (one-shot, TTL): includes `clientVerifyingShareB64u` + `userId` + `rpId` for the same reason.

#### Optional KV state (only in `kv` share mode)
- **Relayer signing share store** keyed by `relayerKeyId` (the group public key).

### Deterministic derivation (conceptual)

The relayer signing share is derived from:
- relayer master secret (private),
- `{ nearAccountId/userId, rpId }` (binding),
- `clientVerifyingShareB64u` (public, 32 bytes),
and then converted into an Ed25519 scalar (rejecting zero).

The relayer recomputes `computedGroupPk` and enforces:
- `computedGroupPk == relayerKeyId` (anti key-injection / mismatch protection)
- `relayerKeyId` is an **active access key** on `nearAccountId` (scope hardening)

### API requirements (derived mode)
- `POST /threshold-ed25519/session` must include `clientVerifyingShareB64u` so the relayer can validate/derive.
- `POST /threshold-ed25519/authorize` must include `clientVerifyingShareB64u` (even when using a session token) for the same reason.

### Ops notes

#### Generating the master secret
Use a KMS/secret manager in production. For local dev:

```sh
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

#### Cluster/serverless requirements
- All instances must share the same `THRESHOLD_ED25519_MASTER_SECRET_B64U`.
- Use Upstash/Redis for **auth session** + **signing session** TTL state (in-memory is not safe across restarts/instances).

#### TTL KV configuration
- Upstash REST: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`
- Redis TCP (Node only): `REDIS_URL`
- Optional key prefixes (to avoid collisions in shared Redis):
  - `THRESHOLD_ED25519_AUTH_PREFIX` (threshold auth sessions)
  - `THRESHOLD_ED25519_SESSION_PREFIX` (FROST signing sessions)
  - `THRESHOLD_ED25519_KEYSTORE_PREFIX` (relayer share store; only used in `kv` mode)

---

## MPC Signing Refactor Plan (keep 2P; enable relayer-fleet t-of-n, DKG later)

### Goal
Refactor the current **2-party threshold Ed25519 (FROST)** implementation so that moving to **3+ parties (t-of-n)** is a *drop-in* architectural change:
- keep **today’s 2P flow** working (same product behavior),
- make data models, session storage, and protocol orchestration **n-party ready**,
- minimize future surface-area changes when adding relayer-fleet t-of-n and/or a true DKG ceremony.

This is a refactor plan, not an immediate migration to 3+ parties.

### Terminology
- **Party**: an independent trust domain holding a key share (e.g., client + relayer are 2 parties today).
- **Instance**: a horizontally scaled copy of the same relayer party (same trust domain).
- **Relayer fleet**: a set of relayer servers we operate (optionally across multiple clouds/regions).
- **Logical relayer participant**: the *single* external threshold participant representing the relayer fleet (still “the relayer” from the client’s POV).
- **Relayer cosigner**: an internal relayer node holding a *share of the logical relayer participant’s* secret material (t-of-n internally).

Important: “serverless/cluster safe” and “3+ parties” are related but distinct.
- The current “derived relayer share” approach can make the relayer **stateless across instances**, but it does **not** automatically create additional independent parties.
- In our model, the external cryptographic signer set remains **2-party** (client + logical relayer), because the client share must remain deterministically derived from passkey PRF (account recovery requirement).
- “3P+” resilience comes from splitting the **relayer** side internally across the relayer fleet (internal t-of-n cosigning), while the client still talks to a single logical relayer participant.
- Cosigners are an internal implementation detail: running **1 relay** (no downstream cosigners) vs **2+ relays** (coordinator + cosigners) should be seamless for the client as long as the logical relayer share (and therefore the 2-party group public key) stays stable.

### Non-goals (for this refactor)
- Implementing 3+ party signing end-to-end right now.
- Implementing a full DKG/proactive-refresh protocol right now.
- Changing the user-facing SDK API semantics (beyond adding optional fields/types needed for future expansion).
- Migration tooling & legacy support (we are aiming for a clean switch to the new system).

### Current state (2P)
High level:
- Client WASM signer worker holds the client share and coordinates FROST.
- Relayer holds the server share and participates in `/sign/init` + `/sign/finalize`.
- Authorization can be either:
  - per-signature WebAuthn/VRF evidence, or
  - session-style authorization (JWT/cookie) minted at login.
- Relayer share can be:
  - persisted (`kv`), or
  - derived statelessly from a relayer master secret (`derived` / `auto`).

Key references:
- Threshold signing reference: see this document (“Threshold Ed25519 (NEAR) — Consolidated”).
- Derived-share relayer notes: see this document (“Threshold Relayer Server — Deterministic Relayer Share + Minimal State”).
- Signer worker threshold module: `sdk/src/wasm_signer_worker/src/threshold/*`
- Relayer threshold service: `sdk/src/server/core/ThresholdService/*`

### Target architecture (refactor)

#### 1) Make “threshold signing” a protocol-agnostic module
Create a clear separation between:
- **Protocol** (FROST rounds, commitments, signature shares, aggregation),
- **Transport** (HTTP calls to relayers),
- **Authorization** (WebAuthn/VRF vs threshold-session JWT),
- **Key material & persistence** (client share derivation + participant metadata).

Concretely:
- In the WASM signer worker, ensure there is a single “threshold coordinator” entrypoint that can drive:
  - Round 1: commitments for *any number* of remote participants,
  - Round 2: signature shares for the *chosen signer set*,
  - aggregation + output signature bytes.
- Keep the current 2P implementation as the first backend implementation of that interface.

#### 2) Generalize the data model from “one relayer” → “participants”
Introduce a participant-centric model, while keeping the 2P shape as a thin specialization.

**Client-side vault material**
- Replace “single relayer metadata” with a versioned participant list:
  - `groupPublicKey` (the NEAR access key)
  - `participants[]` where each participant includes:
    - `id` (FROST identifier; e.g. 1,2,3…)
    - `role` (`client` | `relayer`)
    - `endpoint`/`relayerUrl` (for relayer participants)
    - `relayerKeyId` (or participant key id; for scope checks)
    - `verifyingShareB64u` (compressed point)
    - `shareDerivation` metadata (e.g. `derived_master_secret_v1` vs `kv_random_v1`)
- Keep 2P stored form as:
  - `participants=[{id:1, role:'client'}, {id:2, role:'relayer', ...}]`.

**Server-side session records**
- Change TTL session store records to store:
  - the signer set used for this signature (participant ids),
  - commitments per participant id,
  - per-participant derivation data needed to re-derive shares in derived mode.

#### 3) Internal “relayer fleet” is separate from external parties
We want 3P+ resilience without breaking account recovery requirements.

Therefore:
- External signer set remains **2-party**: client + logical relayer.
- The relayer participant may be implemented by internal relayer cosigners (t-of-n), invisible to the client.

#### 4) Keygen must be strategy-pluggable
Key material derivation should be expressed as a strategy interface so future upgrades (dealer-split → DKG) are isolated.

#### 5) Session auth is orthogonal: keep it, but make it participant-aware
Threshold session JWT/cookie should bind:
- `nearAccountId`, `rpId`,
- the group key id (`relayerKeyId`/`groupPublicKey`),
- optionally: the signer set or “policy” (limits, max uses, TTL).

#### 6) Testing strategy
Refactor tests so they’re written in terms of:
- “participants” and “signer sets”,
- transcript tampering per participant,
- relayer restart behavior per participant,
even if current test fixtures only include one relayer.

### Phased TODO list

#### Phase 1 — Data-model refactor (no behavior change)
- [x] Define common “participant” types in TS + Rust.
- [x] Update client vault `threshold_ed25519_2p_v1` shape to include `participants[]` (breaking; no legacy support).
- [x] Update relayer TTL session record types to include `participantIds[]` + `commitmentsById`.
- [x] Update internal sign/init/finalize code to operate on maps keyed by participant id.

#### Phase 2 — Protocol/transport boundaries (no behavior change)
- [x] Create a protocol-only module (FROST rounds + aggregation) that does not know about HTTP.
- [x] Create a transport-only module that knows how to call “a relayer participant”.
- [x] Convert the existing 2P backend to use these boundaries.

#### Phase 3 — Keygen strategy interface (keep current strategy)
- [x] Extract current keygen into a `KeygenStrategy` interface.
- [x] Keep current `client PRF.first + relayer derived/kv` as `KeygenStrategyV1`.
- [x] Ensure server-side verification always recomputes group PK from claimed inputs (anti key-injection invariant).
- [x] Compute the group public key in the WASM signer worker (avoid JS scalar math).
- [x] Make threshold participant IDs configurable (client + server) with defaults.

#### Phase 4 — Multi-party “stubs” (compile-time ready, feature-flagged)
- [x] Add participant list plumbing end-to-end (SDK → signer worker → relayer service).
- [x] Remove hard `participants.length > 2` rejections (keep current 2-party signing by selecting a 2-party signer set).
- [x] Add skipped tests showing intended flows for 2-of-3.

#### Phase 4B — Aggregator-coordinated signing (Option B)
- [x] Define coordinator-facing endpoints: `/threshold-ed25519/sign/init` and `/threshold-ed25519/sign/finalize`.
- [x] Implement coordinator fanout to internal relayer cosigners (wait for `T`) and aggregate commitments + signature shares.
- [x] Add role-gated routing so the same relayer code can run as:
  - `THRESHOLD_NODE_ROLE=cosigner` (internal relayer-fleet cosigner endpoints only),
  - `THRESHOLD_NODE_ROLE=coordinator` (public `/threshold-ed25519/sign/*` endpoints; may also act as a cosigner).
- [x] Define relayer cosigner discovery/config format (env var or config file):
  - `THRESHOLD_ED25519_RELAYER_COSIGNERS=[{ cosignerId, relayerUrl }, ...]`
  - `THRESHOLD_ED25519_RELAYER_COSIGNER_T=<t>`
- [x] Store per-signature transcript in TTL KV keyed by `signingSessionId`:
  - signer set, digest(s), commitments, and any authorization binding needed for downstream enforcement.
- [x] Decide downstream auth model:
  - coordinator issues a signed internal auth grant to relayers, or
  - coordinator forwards WebAuthn/VRF evidence and relayers verify independently.
- [x] Add unit tests for relayer-fleet cosigning (2-of-3; mocked downstream).

#### Phase 5 — Docs + migration notes
- [x] Document the participant model, signer sets, and how it maps to 2P today.
- [x] Document future 3+ party options (client fanout vs aggregator).
- [x] Document the keygen strategy interface and what changes when moving to DKG.

### Acceptance criteria for this refactor
- No user-visible regressions in the existing 2P threshold signing flows (tx/delegate/NEP-413).
- Email recovery + linkDevice + VRF warm sessions continue to enable threshold signing immediately.
- Code paths for FROST rounds are written against `participants[]` and `commitmentsById`, not hard-coded “client vs one relayer”.
- Adding a second relayer participant should require **adding new implementation**, not rewriting existing modules.

## Relayer Fleet t-of-n (Phased TODO)

This section is intentionally *post-refactor*: it assumes the current participant-aware coordinator architecture is in place, and outlines what’s needed for **3P+ resilience** while keeping the *external* signer set as **2-party** (client + logical relayer).

Key idea: we keep the *outer* FROST signer set as 2-party for product/recovery reasons, but implement **internal t-of-n cosigning inside the relayer fleet** so that the fleet behaves like a single “logical relayer participant”.
- From the client’s POV, it’s still 2P: `participantIds=[clientParticipantId, relayerParticipantId]`.
- Internally, the relayer participant is implemented by `T-of-N` relayer cosigners, which jointly produce the relayer’s outer-protocol commitments + signature share.

### Phase 6 — Relayer Fleet Key Setup (dealer-split first; DKG later)

**Why dealer-split first (vs a true FROST DKG ceremony)?**
- **Deterministic client share (recovery requirement)**: our client signing share must remain a deterministic function of WebAuthn PRF outputs so we can deterministically recover the same key material on new devices. A “true” multi-party DKG across client + relayers would randomize the client share (or require persisting DKG state), breaking that model.
- **Restart-robust relayer fleet**: in v1 we want relayer cosigners to be stateless across restarts. Dealer-split with a KMS-held master secret can deterministically re-derive cosigner shares on demand; a DKG ceremony typically requires durable storage of the resulting shares + metadata.
- **Single-operator reality**: all relayers are run by us. The main value of DKG (“no single dealer can derive all shares”) is less urgent initially than shipping a simple, operable, restart-robust system.
- **Clean upgrade path later**: moving dealer-split → DKG is a key rotation: mint a new relayer secret via DKG, compute a new outer group public key, and rotate the on-chain access key (no migration tooling).

**Phase 6A (v1): dealer-split deterministic cosigner shares (restart-robust)**
- [x] Define fleet topology + identifiers:
  - outer participant ids remain `{ clientParticipantId, relayerParticipantId }` (still 2P),
  - internal `cosignerId`s are separate (e.g. `1..N`) and used only for Shamir/Lagrange interpolation (not exposed to clients).
- [x] Define coordinator/cosigner config (single operator / same trust domain):
  - `THRESHOLD_ED25519_RELAYER_COSIGNERS=[{ cosignerId, relayerUrl }, ...]`
  - `THRESHOLD_ED25519_RELAYER_COSIGNER_T=<t>`
  - each process sets `THRESHOLD_ED25519_RELAYER_COSIGNER_ID=<id>` and `THRESHOLD_NODE_ROLE=coordinator|cosigner`
  - internal auth secret: `THRESHOLD_COORDINATOR_SHARED_SECRET_B64U=<32b base64url>`
- [x] Define deterministic relayer secret split:
  - obtain the logical relayer signing share scalar `s_rel` via the existing relayer keystore mode (`kv` or `derived`),
  - deterministically derive a Shamir polynomial from `s_rel` and `t`, and compute per-cosigner shares `s_i`,
  - cosigner IDs are used only for interpolation and are never exposed to clients.
- [x] Define secure share distribution + caching:
  - coordinator sends only the requesting cosigner’s share `s_i` via `POST /threshold-ed25519/internal/cosign/init` (auth’d by an HMAC grant),
  - cosigners store `s_i` + nonces in the signing session record; on restart they simply re-run `/sign/init`.
- [ ] Define rotation story:
  - explicit `epoch`/rotation input produces a new `s_rel` and therefore a new outer group public key (clean rotate on-chain),
  - operational playbook for compromise response (rotate) and routine rotations.

### Phase 7 — Relayer Fleet Cosigning (internal t-of-n)
- [x] Define internal cosigner endpoints (not public) to support:
  - internal Round 1: cosigner generates nonce commitments + stores nonces (scoped to `signingSessionId`),
  - internal Round 2: cosigner returns a partial contribution that allows the coordinator to produce a single outer relayer signature share.
- [x] Implement coordinator fanout + combination (wait for `T`):
  - Round 1: coordinator requests commitments from multiple cosigners, combines them into one outer relayer commitment pair (Lagrange-weighted), and stores the transcript in the signing session record.
  - Round 2: coordinator requests partials from `T` cosigners that have a matching Round 1 transcript, combines them into one outer relayer signature share, and returns it on the existing `/threshold-ed25519/sign/finalize` API.
- [x] Failure handling + retries:
  - timeouts and health-driven cosigner selection,
  - if a cosigner drops between Round 1 and Round 2, either use a spare cosigner that already produced commitments, or restart the signing flow (`/sign/init`) to get a fresh transcript.
- [x] Tighten internal authorization: cosigners only contribute for scoped grants like `(mpcSessionId, relayerKeyId, signingDigest, expiry, cosignerId)` (and optionally the chosen `T-of-N` set hash).

### Phase 8 — Relayer-side Protocol + Cryptography
- [x] Specify the exact internal math so the fleet outputs **valid outer-protocol** values for the logical relayer participant:
  - combined commitments must match a single nonce pair `(r_hiding, r_binding)` under `s_rel`,
  - combined relayer signature share must match what a single holder of `s_rel` would produce for the outer signing package.
- [x] Nonce safety invariants: nonces are single-use, bound to the outer transcript, and cleaned up (no reuse across retries).
- [ ] Add verification + clear error surfaces:
  - malformed/missing cosigner responses vs internal auth failures vs stale transcript,
  - (optional) coordinator verifies the combined relayer signature share before returning it (defense-in-depth).
- [ ] Define persistence requirements for HA:
  - if we want coordinator failover mid-signature, persist internal transcript + selected cosigner set (and/or cosigner nonce state) in shared KV/Redis,
  - otherwise prefer “retry / restart signing session” semantics.

### Phase 9 — Ops, Hardening, and UX
- [ ] Define deployment topology:
  - coordinator is public-facing (handles `/threshold-ed25519/sign/*`),
  - cosigners are private/internal-only (no public access; reachable only from coordinator).
- [ ] Add relayer cosigner health + discovery UX: deterministic peer list config, health checks, and operator diagnostics.
- [ ] Add rate limits and abuse controls per endpoint (authorize/session/sign/internal-cosign) appropriate for fleet mode.
- [ ] Add a minimal production deployment guide for coordinator + cosigners (secrets, internal auth, cookie/JWT session wiring).

### Phase 10 — Tests + Docs
- [x] Add unit tests for relayer-internal t-of-n cosigning (2-of-3; mocked cosigner downstream).
- [ ] Add unit tests for relayer-internal t-of-n cosigning (3-of-5) with failure-mode suites.
- [x] Add local dev wiring for 3 relays: `pnpm run server:3-relays` + `examples/vite/Caddyfile` routes.
- [ ] Add integration coverage for coordinator + cosigners in local dev (2-of-3 up) and document retry behavior on cosigner restarts.
- [ ] Add e2e coverage for threshold flows (tx/delegate/NEP-413/batch) in relayer-fleet mode.
- [x] Document the relayer-fleet trust model and key setup (dealer-split now; DKG later) and explicitly call out non-goal: migration tooling.

## Refactor

TODO (from reviewing `git diff`):

- [x] **Split `ThresholdSigningService.ts`**: extract config parsing, keygen strategy, session persistence, coordinator fanout, peer endpoints, and key-material resolution into smaller modules.
- [x] **Centralize config/env parsing**: reduce drift for `THRESHOLD_NODE_ROLE`, `THRESHOLD_ED25519_RELAYER_COSIGNERS`, and participant id normalization across server + tests + docs.
- [x] **Remove redundant record fields once stable**: keep only map-shaped transcript fields (`commitmentsById`, `relayerVerifyingSharesById`, `relayerSignatureSharesById`) and drop legacy 2P-only fields.
- [x] **Unify participant-id resolution logic (Rust)**: avoid duplicate/heuristic relayer-id resolution between `signer_backend.rs` and `relayer_http.rs`.
- [x] **Parse/validate once at entry points**: keep strict validation but reduce repeated `toOptionalTrimmedString` noise across service + handlers.
- [ ] **Make errors more uniform across boundaries**: standardize error codes/messages across server ↔ WASM ↔ SDK for threshold flows.
- [x] **Test harness cleanup**: factor coordinator wiring into a single helper.
- [ ] **Test coverage expansion**: expand coverage for delegate/NEP-413/batch (2-of-3 mocked peers is done).

## Goals

- Optimize for a clean refactor (breaking changes acceptable).
- Add a **second signing backend** (threshold/MPC via relayer) with minimal surface-area changes.
- Preserve worker isolation: **no signing secrets in the main thread**.
- In threshold mode, enable **deterministic client-share recovery** from `PRF.first` so wiping local storage does not force on-chain re-keying.
- Continue to support:
  - NEAR `SignedTransaction` signing
  - NEP‑461 `SignedDelegate` signing + relayer broadcasting
  - NEP‑413 message signing
- Make key storage/versioning explicit (v3 is a clean break).

## Non-goals

- Writing a new threshold Ed25519 protocol from scratch. Use a well-reviewed library/protocol.
- General N‑of‑M threshold signing (start with 2‑of‑2: client + relayer).
- Replacing NEAR Chain Signatures (on-chain MPC) for other chains (see `docs/chainsigs-docs.md`).

---

## Terminology

- **Local signer**: current implementation. Client derives a full Ed25519 key and signs locally.
- **Threshold signer**: implemented. Client+relayer jointly produce Ed25519 signatures.
- **Vault entry**: the persistent per-device key material stored in IndexedDB (currently encrypted NEAR private key).
- **Session**: a VRF/WebAuthn-backed short-lived authorization window used to gate signing.
- **Intent digest (`intentDigest` / `intent_digest_32`)**: a 32-byte digest of the *user-approved intent* that is cryptographically bound into the VRF input derivation (and required by the on-chain verifier). In the SDK it is base64url-encoded as `intentDigest`; on-chain it is `Option<Vec<u8>>` (`Some(32 bytes)`).
- **Signing digest (`signing_digest_32`)**: the exact 32-byte hash input that Ed25519 signs (e.g., NEAR tx hash, delegate hash, NEP‑413 hash). This is what the threshold protocol must co-sign.
- **Client share (threshold mode)**: the client-held secret scalar used for threshold signing; in v3 we derive it deterministically from `PRF.first`.
- **Relayer master secret (optional hardening)**: a relayer-wide secret used to deterministically derive the relayer signing share (enables stateless relayer deployments; see “Deterministic relayer share”).

---

## Current architecture (v2, implemented today)

### Components

**VRF Worker (client)**
- Runs WebAuthn flows and VRF challenge generation.
- Derives and delivers ephemeral wrap-key material to the signer worker via `MessagePort`.
- Optional: integrates with relayer “server-lock” endpoints for the VRF keypair (Shamir 3‑pass).

Relevant code:
- `sdk/src/core/WebAuthnManager/VrfWorkerManager`
- `sdk/src/wasm_vrf_worker`

**WASM Signer Worker (client)**
- Derives a deterministic NEAR Ed25519 keypair from `PRF.second` + `nearAccountId`.
- Stores the NEAR private key encrypted at rest using a KEK derived from `WrapKeySeed`.
- Decrypts and uses the NEAR private key only inside the worker to:
  - sign NEAR transactions (`SignedTransaction`)
  - sign NEP‑461 delegate actions (`SignedDelegate`)
  - sign NEP‑413 messages

Relevant code:
- `sdk/src/wasm_signer_worker/src/crypto.rs`
- `sdk/src/wasm_signer_worker/src/handlers/handle_sign_transactions_with_actions.rs`
- `sdk/src/wasm_signer_worker/src/handlers/handle_sign_delegate_action.rs`

**Relayer server (optional)**
- Broadcasts client-signed payloads (e.g., NEP‑461 `SignedDelegate`) using a funded relayer account.
- Can verify VRF+WebAuthn via contract view calls and optionally issue a session (JWT/cookie).

Relevant code:
- `sdk/src/server/router/express-adaptor.ts`
- `sdk/src/server/delegateAction/index.ts`
- `sdk/src/core/rpcCalls.ts` (`verifyAuthenticationResponse`)

### Relayer sessions (already implemented)

Some deployments want the relayer to maintain its own authorization state (e.g., to gate sponsored relays).

- Route (default): `POST /verify-authentication-response`
- Behavior: relayer verifies authentication (typically via contract view) and issues a session credential:
  - JWT (returned in response), or
  - cookie (`Set-Cookie`)

Code:
- `sdk/src/core/rpcCalls.ts` (`verifyAuthenticationResponse`)
- `sdk/src/server/router/express-adaptor.ts` (route wiring)

### Local key derivation

The signer worker derives a deterministic Ed25519 signing key from the passkey PRF output:

- Input: `PRF.second` (base64url), delivered VRF→Signer via `MessagePort`
- Salt (domain-separated, account-scoped):
  - `near_key_salt_for_account(nearAccountId) = "near-key-derivation:<nearAccountId>"`
- KDF:
  - `HKDF-SHA256(salt, ikm = PRF.second).expand(info = "ed25519-signing-key-dual-prf-v1", len = 32)` → `seed`
- NEAR key string formats:
  - private: `ed25519:` + base58(`seed || public_key`) (64 bytes)
  - public: `ed25519:` + base58(`public_key`) (32 bytes)

Implementation:
- `sdk/src/wasm_signer_worker/src/crypto.rs` (`derive_ed25519_key_from_prf_output`)
- `sdk/src/wasm_signer_worker/src/config.rs` (`near_key_salt_for_account`, `ED25519_HKDF_KEY_INFO`)

### Encrypting local private keys at rest

The SDK stores the derived private key encrypted. The KEK is derived inside the signer worker from VRF-derived wrap-key material:

- `WrapKeySeed` (base64url): derived in the VRF worker and delivered only via `MessagePort`
- `wrapKeySalt` (base64url): HKDF salt stored alongside the encrypted vault entry
- KEK derivation:
  - `HKDF-SHA256(salt = wrapKeySalt, ikm = WrapKeySeed).expand(info = "near-kek", len = 32)` → `kek`
- Encryption:
  - `ChaCha20Poly1305(kek).encrypt(nonce, plaintext = near_private_key_string)`

Implementation:
- `sdk/src/wasm_signer_worker/src/crypto.rs` (`derive_kek_from_wrap_key_seed`, `encrypt_data_chacha20`, `decrypt_data_chacha20`)

---

## Architecture (v3): two signing backends

### 0) Two signing modes

The SDK should support two mutually exclusive signing modes for NEAR Ed25519:

- **`local-signer` (current)**: signer worker decrypts a locally-stored Ed25519 secret key and signs directly.
- **`threshold-signer` (new)**: signer worker holds the *client key share* and the relayer holds the *server key share*; signatures are produced via a real 2‑party threshold protocol (e.g., FROST‑Ed25519).

Both modes should share the same public API at the SDK level (sign tx / sign delegate / sign NEP‑413).

### 1) Introduce a signing backend abstraction (refactor-first)

Refactor the signer worker so handlers never “reach for an Ed25519 private key” directly. Instead:

- Handlers build the canonical NEAR payload/hash (as they already do).
- Handlers call a backend via a small, auditable interface:

```text
Ed25519Signer.sign(message: bytes) -> signature(64)
Ed25519Signer.public_key() -> ed25519 public key (32)
```

Backends:

- **LocalDerivedEd25519Signer** (existing behavior): decrypts NEAR private key (or derives it) and signs with `ed25519-dalek`.
- **ThresholdEd25519RelayerSigner** (new): uses the client share + relayer share to jointly produce a signature.

This refactor is the main lever that keeps threshold signing from touching every call site.

### 1.5) Bind signing intent into the VRF challenge (required for `threshold-signer`)

In `threshold-signer` mode, the relayer must be able to verify that:

1) the user performed a fresh WebAuthn authentication, and
2) that authentication is **cryptographically bound** to the exact thing we are about to sign.

VRF input is derived from `{ userId, rpId, blockHeight, blockHash, intent_digest_32 }` and (in v4) an optional `session_policy_digest_32`.
To bind “full tx contents”, this SDK binds a fixed-length 32-byte **intent digest** into VRF input derivation.

Notes on digests:
- `intent_digest_32` is the *VRF-bound authorization intent* (stable across nonces/blockhashes).
- `signing_digest_32` is the exact 32-byte hash Ed25519 signs (tx hash, delegate hash, NEP‑413 hash).
- Threshold signing still must co-sign `signing_digest_32`, so the relayer MUST ensure the `signing_digest_32` it participates in corresponds to the VRF-authorized `intent_digest_32` (e.g., by recomputing intent from the unsigned payload).

Wire encodings:
- SDK → VRF worker: `intentDigest: string` (base64url of 32 bytes)
- SDK → VRF worker: `sessionPolicyDigest32?: string` (base64url of 32 bytes; optional, v4 only)
- VRF worker → contract: `intent_digest_32: Option<Vec<u8>>` (must be `Some(32 bytes)` for contract verification)
- VRF worker → contract: `session_policy_digest_32: Option<Vec<u8>>` (optional; when present must be `Some(32 bytes)`)

VRF input construction (contract-aligned):

```text
vrf_input = sha256(
  "web3_authn_challenge_v4" ||
  user_id ||
  lowercase(rp_id) ||
  block_height ||
  block_hash ||
  intent_digest_32 ||
  session_policy_digest_32 (32 bytes, only when present)
)
```

Notes:
- This requires a coordinated update across:
  - `VRFInputData` (TS + Rust types),
  - VRF worker `generate_vrf_challenge_with_keypair(...)` input concatenation, and
  - the on-chain `verify_authentication_response` logic.
- Keep `intent_digest_32` strictly fixed-length (32 bytes) to avoid ambiguous encodings.
- For batch signing, bind a single digest of the batch intent (this SDK currently computes a digest over the `TransactionInputWasm[]` array, preserving tx/action order).

### 2) Make vault entries explicit and backend-owned

Today, the “vault entry” is effectively:

- encrypted private key string + nonce + wrapKeySalt (stored in IndexedDB)

To support multiple backends, the vault entry should become a tagged union (“key material”):

```text
KeyMaterial =
  | { kind: "local_near_sk_v3", encryptedSk, nonceB64u, wrapKeySaltB64u, publicKey }
  | { kind: "threshold_ed25519_2p_v1", publicKey, relayerKeyId, clientShareDerivation: "prf_first_v1" }
```

Notes:
- Store `publicKey` with the entry so “what key am I using?” is never ambiguous.
- `relayerKeyId` is an opaque identifier for the relayer’s share record.
- In v1, the client share is derived deterministically (so it can be recovered after account recovery); optionally cache it encrypted at rest using the existing `WrapKeySeed → KEK → ChaCha20-Poly1305` scheme.

### 2.5) Deterministic client share + account recovery (chosen)

We want the user to be able to:
- recover their passkey via Chrome/iCloud/etc passkey sync, and
- recover the **same** threshold client share (without a server-side backup of client secrets), and
- keep the same on-chain access key (no re-keying) after recovery.

This requires that the threshold client share is derived deterministically from passkey PRF output.

Assumption:
- “Account recovery” restores the **same passkey credential** (same underlying credential secret), so `PRF.first` outputs for the same salts remain stable across devices.

Recommended derivation (conceptual):

```text
client_share = ScalarReduce(
  HKDF-SHA256(
    ikm = PRF.first,
    salt = "tatchi-threshold-ed25519-client-share",
    info = rp_id || near_account_id,
    len = 64
  )
)
```

Notes:
- Include `rp_id` and `near_account_id` in the KDF context so the same passkey can’t accidentally produce the same share across different apps/accounts.
- To make recovery “stateless”, make `relayerKeyId` recoverable too; simplest: set `relayerKeyId := publicKey` (or `sha256(publicKeyBytes)`), so the relayer can look up its share by the on-chain access key.
- Proactive refresh is explicitly **deferred**; if we want “rotation”, we can re-run keygen and add a new access key on-chain (then delete the old one).

### 3) Relayer becomes a co-signer (optional feature flag)

In threshold mode, the relayer is not just a broadcaster:

- It holds a signing share and participates in MPC/threshold signing.
- It must authenticate requests (via VRF Webauthn, the verify_authentication_response contract call, see verifyAuthenticationResponse() for an example).
- It should enforce policy (allowed receivers/methods/deposits), just like today’s NEP‑461 relayer flow.

### 4) Where relayer RPC runs (design choice)

Threshold signing needs multiple request/response exchanges with the relayer. There are two viable placements:

- **Option A (recommended for minimal refactor): do relayer RPC inside the signer worker**
  - Pros: keeps the client share isolated in the worker; keeps the worker API one-shot.
  - Cons: you must plumb relayer URL + auth into the worker request and ensure CORS/credentials work from Worker `fetch`.
- **Option B: main thread orchestrates relayer RPC; worker only computes MPC responses**
  - Pros: simpler networking/auth in the browser; clearer separation of “crypto” vs “HTTP”.
  - Cons: requires a multi-message worker session (or keeping a worker alive), which is a bigger refactor than the current one-shot worker pipeline.

This doc assumes Option A unless stated otherwise.

---

## Rust libraries (recommended)

### Primary: ZcashFoundation FROST (`frost-ed25519`)

Use `frost-ed25519` from https://github.com/ZcashFoundation/frost.

Why:
- Implements **RFC 9591** (two‑round FROST) and is widely used.
- **NCC-audited** (core + ed25519 + keygen + signing).
- Supports Ed25519 ciphersuite directly.
- License: **MIT OR Apache‑2.0**.

Notes for WASM:
- Enable `frost-ed25519` feature `serialization` so round messages can be encoded/decoded cleanly (wire JSON with base64url fields; avoid `serde_json` in the worker).
- Use `rand_core` + `getrandom` (`js` feature) for nonce generation inside wasm workers.

Example `Cargo.toml` (wasm worker):

```toml
frost-ed25519 = { version = "2.2", default-features = false, features = ["serialization", "std"] }
curve25519-dalek = { version = "=4.1.3", features = ["rand_core"] }
getrandom = { version = "0.2", features = ["js"] }
```

### Alternative: `givre` (FROST-based TSS)

`givre` (https://github.com/LFDT-Lockness/givre) is a viable alternative:
- Explicitly targets **wasm/no_std** and supports `ciphersuite-ed25519`.
- Offers an opinionated DKG option via `cggmp21-keygen` (UC-secure), and an interactive `round_based` flow (`full-signing`).

Tradeoffs vs ZF FROST:
- Tracks an IETF draft and (per README) does not yet support identifiable abort.
- Less deployment history and no published audit noted in the README.

Recommendation: start with **ZF FROST** unless we have a specific need for `givre`’s CGGMP21/DKG integration or no_std footprint.

Example `Cargo.toml` (wasm worker):

```toml
givre = { version = "0.2", default-features = false, features = ["ciphersuite-ed25519", "serde"] }
rand_core = "0.6"
getrandom = { version = "0.2", features = ["js"] }
```

---

## Session-style threshold signing (JWT/Cookie)

This mode makes **`threshold-signer` session-capable** (similar to local signing), so the user can sign multiple transactions after a single WebAuthn prompt.

### Why this is needed

- **VRF warm sessions** (“`warmSession`” in confirmTxFlow) dispense `WrapKeySeed` to the signer worker without a new WebAuthn ceremony.
- Threshold signing currently requires `/threshold-ed25519/authorize` to provide **fresh `vrf_data` + `webauthn_authentication`** so the relayer can call `verify_authentication_response` on-chain.
- Warm sessions intentionally omit those fields, so per-request WebAuthn authorization is incompatible with warm sessions.

The fix is to add a second authorization mechanism: a **relayer-issued threshold auth session**.

### What changes (and what doesn’t)

- Still **2-round FROST per signature** (`commitments → signature shares`). A “session” does not change the threshold protocol.
- What becomes sessionized is **relayer authorization**: after one verified WebAuthn+VRF, the relayer issues a short-lived token that can authorize multiple signatures.

### Session policy binding (recommended: `session_policy_digest_32`)

We bind the session scope/limits into the WebAuthn+VRF ceremony by hashing a canonical “session policy”
into a **separate 32‑byte field**: `session_policy_digest_32`.

Example policy (canonical JSON → SHA-256 → 32 bytes):

```text
policy = {
  version: "threshold_session_v1",
  nearAccountId,
  rpId,
  relayerKeyId,
  sessionId,
  ttlMs,
  remainingUses,
}
session_policy_digest_32 = sha256(canonical_json(policy))
```

For the session-mint ceremony, keep `intent_digest_32` reserved for transaction intent by setting it to a
stable **session-mint** digest (constant or stable canonical JSON), for example:

```text
intent_digest_32 = sha256("threshold_session_mint_v1")
```

Notes:
- `intent_digest_32` stays required; for session minting we set it to a stable non-tx digest so tx intent semantics stay reserved.
- The relayer should clamp `ttlMs`/`remainingUses` to server maximums and must reflect the final values back in the token/response.

### Relayer-side threshold auth session

Relayer behavior:

- Client calls `POST /threshold-ed25519/session` with:
  - `vrf_data` + `webauthn_authentication`
  - `relayerKeyId`
  - `sessionPolicy` (or its canonical JSON string)
- Relayer verifies on-chain (`verify_authentication_response`) and checks that:
  - `nearAccountId == vrf_data.user_id`
  - `rpId == vrf_data.rp_id`
  - `session_policy_digest_32 == sha256(canonical_json(sessionPolicy))`
  - `intent_digest_32 == sha256("threshold_session_mint_v1")` (or whatever constant is chosen)
- Relayer persists `{ sessionId, relayerKeyId, nearAccountId, rpId, expiresAtMs, remainingUses }` in TTL KV.
- Relayer issues an auth token:
  - **JWT bearer** (simpler in workers/WASM fetch), or
  - **HttpOnly cookie** (better XSS posture, but more CORS complexity)

Then for each signature:
- Client uses confirmTxFlow in `warmSession` mode to dispense `WrapKeySeed` (no TouchID) and still show confirmation UI.
- Signer worker performs the FROST flow and includes the **JWT/cookie** on relayer requests.
- Relayer recomputes `intent_digest_32` + `signing_digest_32` server-side from `signingPayload` and rejects mismatches.
- Relayer decrements `remainingUses` (server-side) and rejects when exhausted/expired.

### Contract changes (v4)

Threshold sessions require contract v4 support.

- Keep `intent_digest_32` reserved for NEAR tx/delegate/NEP‑413 intent.
- Add a second VRF‑bound field: `session_policy_digest_32` (optional, 32 bytes).
- Bump VRF input derivation version (new domain separator) so the contract can bind both digests.

Even with contract changes, TTL/uses are still enforced by the relayer (KV + token). The contract cannot enforce session usage at signature time because signatures are produced off‑chain; the value of `session_policy_digest_32` is that the relayer’s session policy is cryptographically bound to the user’s WebAuthn ceremony without overloading `intent_digest_32`.

### Contract v4 behavior (`session_policy_digest_32`)

- `VRFVerificationData` includes `session_policy_digest_32: Option<Vec<u8>>` (when present: exactly 32 bytes) and accepts both `sessionPolicyDigest32` (camelCase) and `session_policy_digest_32` (snake_case).
- VRF input derivation uses a v4 domain separator and appends `session_policy_digest_32` when present:

```text
vrf_input_data = sha256(
  "web3_authn_challenge_v4" ||
  user_id ||
  lowercase(rp_id) ||
  block_height(u64 LE) ||
  block_hash(32 bytes) ||
  intent_digest_32(32 bytes) ||
  session_policy_digest_32(32 bytes if present)
)
```

- The SDK/VRF worker plumbs `sessionPolicyDigest32?: string` (base64url 32 bytes) into the contract call for session minting; per-tx flows omit it.

---

## Relayer API

This is an intentionally minimal HTTP shape for a 2‑round signing protocol.

### Key enrollment (per device)

`POST /threshold-ed25519/keygen`

Request:
- `nearAccountId`
- `clientVerifyingShareB64u`
- `vrf_data` + `webauthn_authentication` (VRF/WebAuthn verification required; `intent_digest_32` binds `{ nearAccountId, rpId, clientVerifyingShareB64u }`)

Response:
- `relayerKeyId`
- `publicKey` (ed25519 base58 with `ed25519:` prefix)
- `relayerVerifyingShareB64u`

Client follow-up:
- verify `publicKey == f(clientVerifyingShare, relayerVerifyingShare)` (2-of-2 Lagrange at x=0)
- submit `AddKey(publicKey)` on-chain (client-signed) to activate threshold signing

### Signing

`POST /threshold-ed25519/authorize` (recommended)

Before participating in threshold signing, the relayer should verify VRF+WebAuthn and bind it to the message it is being asked to co-sign.

Use the existing session route as the base (`/verify-authentication-response`) or add a dedicated endpoint:

Request:
- `relayerKeyId`
- `clientVerifyingShareB64u` (required for stateless relayer / derived-share mode)
- `purpose`
- `signing_digest_32` (32 bytes; base64url or hex)
- `signing_payload` (purpose-specific; enough to recompute `signing_digest_32` and `intent_digest_32` server-side for policy + binding checks)
- `vrf_data` + `webauthn_authentication` (same shapes as existing verification; `vrf_data` includes `intent_digest_32`)

Response:
- `mpcSessionId` (short-lived, single-use)
- optional: `jwt` or `Set-Cookie` for subsequent signing requests

Signing endpoints (`/sign/init`, `/sign/finalize`) should then require `mpcSessionId` (or an auth session) and reject if `message`/`purpose` do not match the authorized context.

`POST /threshold-ed25519/sign/init`

Request:
- `mpcSessionId`
- `clientCommitments` (FROST round 1 commitments; JSON + base64url)

Response:
- `signingSessionId`
- `relayerCommitments` (FROST round 1 commitments; JSON + base64url)

`POST /threshold-ed25519/sign/finalize`

Request:
- `signingSessionId`
- `clientSignatureShare` (FROST round 2 share; JSON + base64url)

Response (either acceptable):
- `relayerSignatureShare` (client aggregates), or
- `signature` (relayer aggregates)

Notes:
- Enforce single-use `signingSessionId` to avoid replay.
- Tie `signingSessionId` to the authorized `mpcSessionId` scope.

---

## Security considerations (what changes in threshold mode)

- The relayer gains new sensitive material (a signing share). It is still **not full custody**, but it is a stronger trust relationship than pure client-only signing.
- A compromised relayer should not be able to sign without the client share, but it can:
  - deny service,
  - attempt to coerce signatures (mitigated by wallet-owned confirmation UX),
  - leak metadata (what was signed, timing, etc.).
- Keep the client share in workers and encrypt at rest with the existing `WrapKeySeed → KEK` construction.
- Require an authenticated session on the relayer for any signing-share participation (JWT/cookie).
- Add rate limiting and per-key quotas to the relayer to reduce abuse.

---

## Compatibility requirements

- NEAR signature bytes must be valid Ed25519 and verify under the on-chain access key public key.
- `handle_sign_transactions_with_actions.rs` must still sign `tx_hash = sha256(borsh(Transaction))`.
- `handle_sign_delegate_action.rs` must still sign the NEP‑461 delegate hash (`hash_delegate_action`).
- `PasskeyNearKeysDB` must be able to store both key kinds without ambiguity.

---
