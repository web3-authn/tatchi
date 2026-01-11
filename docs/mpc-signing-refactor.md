# MPC Signing Refactor Plan (keep 2P; enable relayer-fleet t-of-n, DKG later)

## Goal
Refactor the current **2-party threshold Ed25519 (FROST)** implementation so that moving to **3+ parties (t-of-n)** is a *drop-in* architectural change:
- keep **today’s 2P flow** working (same product behavior),
- make data models, session storage, and protocol orchestration **n-party ready**,
- minimize future surface-area changes when adding relayer-fleet t-of-n and/or a true DKG ceremony.

This is a refactor plan, not an immediate migration to 3+ parties.

## Terminology
- **Party**: an independent trust domain holding a key share (e.g., client + relayer are 2 parties today).
- **Instance**: a horizontally scaled copy of the same relayer party (same trust domain).
- **Relayer fleet**: a set of relayer servers we operate (optionally across multiple clouds/regions).
- **Logical relayer participant**: the *single* external threshold participant representing the relayer fleet (still “the relayer” from the client’s POV).
- **Relayer cosigner**: an internal relayer node holding a *share of the logical relayer participant’s* secret material (t-of-n internally).

Important: “serverless/cluster safe” and “3+ parties” are related but distinct.
- The current “derived relayer share” approach can make the relayer **stateless across instances**, but it does **not** automatically create additional independent parties.
- In our model, the external cryptographic signer set remains **2-party** (client + logical relayer), because the client share must remain deterministically derived from passkey PRF (account recovery requirement).
- “3P+” resilience comes from splitting the **relayer** side internally across the relayer fleet (internal t-of-n cosigning), while the client still talks to a single logical relayer participant.

## Non-goals (for this refactor)
- Implementing 3+ party signing end-to-end right now.
- Implementing a full DKG/proactive-refresh protocol right now.
- Changing the user-facing SDK API semantics (beyond adding optional fields/types needed for future expansion).
- Migration tooling & legacy support (we are aiming for a clean switch to the new system).

## Current state (2P)
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
- Spec: `docs/threshold-ed25519-near-spec.md`
- Stateless relayer plan/notes: `docs/threshold-relay-server.md`
- Signer worker threshold module: `sdk/src/wasm_signer_worker/src/threshold/*`
- Relayer threshold service: `sdk/src/server/core/ThresholdService/*`

## Target architecture (refactor)

### 1) Make “threshold signing” a protocol-agnostic module
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

### 2) Generalize the data model from “one relayer” → “participants”
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
  - per-participant derivation inputs if “derived” mode is used.

This makes it possible to sign with:
- 2-of-2 (today),
- 2-of-3, 3-of-5, etc. (future), without redesigning record shapes.

### 3) Keep the HTTP API stable, but version the internal contract
Short term: keep existing endpoints working for 2P:
- `/threshold-ed25519/keygen`
- `/threshold-ed25519/session`
- `/threshold-ed25519/authorize`
- `/threshold-ed25519/sign/init`
- `/threshold-ed25519/sign/finalize`

Refactor them internally so that the code paths operate on:
- `participants[]` (even if length is 1 for “this relayer instance”),
- a common “sign init/finalize” transcript type keyed by participant id.

Future: when adding multi-relayer signing, keep `/threshold-ed25519/sign/*` stable and introduce an internal coordinator RPC:
- `POST /threshold-ed25519/internal/sign/init`
- `POST /threshold-ed25519/internal/sign/finalize`

### 4) Define the multi-party orchestration strategy (client vs aggregator)
Decision: **Option B (coordinator-relayer fanout, client aggregation)**.

Rationale: we already trust the relayer stack operationally, and Option B keeps the client (and WASM workers) simpler by avoiding relayer fanout and coordinator bookkeeping in the browser. We still keep the code structured so Option A can be added later if we need a more non-custodial trust model.

**Option A (not chosen): Client-coordinated fanout**
- Client coordinator calls `/authorize` once (or uses JWT session),
- then calls `/sign/init` for each relayer participant,
- gathers commitments, computes its share, and calls `/sign/finalize` for each relayer,
- aggregates signature shares locally.

Pros: relayer never sees full transcript; simplest trust model.
Cons: more network calls, more client complexity.

**Option B (chosen): Relayer/aggregator-coordinated**
- Client talks to one **coordinator relayer** which fans out to the other relayers.
- Coordinator returns the transcript maps (`commitmentsById`, `relayerVerifyingSharesById`, `relayerSignatureSharesById`); the client aggregates signature shares locally.

Pros: fewer client calls, easier mobile.
Cons: coordinator is a higher-trust component; larger attack surface.

This refactor should keep the code structured so either option can be implemented without rewriting protocol code.

#### Deployment model (same code everywhere; role via env var)
We can keep a single “relayer” codebase/binary and select behavior via environment configuration:
- `THRESHOLD_NODE_ROLE=participant|coordinator` (default `coordinator`)
  - `participant`: exposes only internal coordinator RPC endpoints (`/threshold-ed25519/internal/sign/*`) for that relayer’s share.
  - `coordinator`: exposes public signing endpoints (`/threshold-ed25519/sign/*`) and performs fanout to peer relayers.
- `THRESHOLD_COORDINATOR_PEERS=...` (only for `coordinator`)
  - a list of participant relayer endpoints + ids the coordinator can fan out to.
  - `THRESHOLD_COORDINATOR_SHARED_SECRET_B64U` must be shared with participant relayers to validate coordinator grants.

Statelessness goals:
- Each relayer participant remains stateless for long-lived key share material by using a derived-share mode (relayer master secret) where possible.
- The coordinator still needs **ephemeral** state: a TTL transcript store keyed by `signingSessionId` (KV preferred; in-memory only for dev).

#### Option B concrete flow (2-round FROST; multi-relayer ready)
Assume participants are:
- client (holds its secret share in WASM signer worker)
- relayer[0..n-1] (each holds its secret share server-side)

**Round 0: Authorization (WebAuthn/VRF or session JWT)**
- Client authenticates once with the coordinator relayer:
  - either by presenting WebAuthn/VRF evidence, or
  - by presenting an existing threshold session JWT/cookie minted at login.
- Coordinator may either:
  - verify once and then call downstream relayers with an internal trust token, or
  - forward the original evidence and let each relayer verify independently (defense-in-depth).

**Round 1: Commitments (`POST /threshold-ed25519/sign/init`)**
- Client → coordinator: `{ mpcSessionId, relayerKeyId, nearAccountId, signingDigestB64u, clientCommitments }`
- Coordinator → each relayer: `POST /threshold-ed25519/internal/sign/init` (coordinatorGrant + clientCommitments)
- Coordinator → client: `{ signingSessionId, commitmentsById, relayerVerifyingSharesById, participantIds }`

**Round 2: Signature shares + aggregation (`POST /threshold-ed25519/sign/finalize`)**
- Client computes its signature share locally using the aggregated commitment transcript.
- Client → coordinator: `{ signingSessionId, clientSignatureShareB64u }`
- Coordinator → each relayer: `POST /threshold-ed25519/internal/sign/finalize` (coordinatorGrant + peerSigningSessionId + clientSignatureShareB64u)
- Coordinator → client: `{ relayerSignatureSharesById }`
- Client aggregates `{ clientShare + relayerShares }` into the final Ed25519 signature (in the signer worker).

Important invariant: for each downstream relayer, coordinator must ensure the relayer’s share is only used for:
- the authorized `{ nearAccountId, rpId, relayerKeyId }` scope, and
- the exact `signing_digest_32` (and any session policy digest) that was authorized.

### 5) Make keygen pluggable (dealer-split vs DKG)
Keep today’s model as the default:
- client share deterministically derived from PRF (`PRF.first`),
- relayer share either persisted or deterministically derived from relayer master secret.

But refactor keygen into a “strategy” interface:
- `KeygenStrategy::keygen(participants_spec, binding_data) -> group_pk + verifying_shares + metadata`

Future strategies:
- **Stateless relayer party (today’s goal)**: derived-share mode using a relayer master secret makes a *single relayer party* stateless across instances.
- **Relayer-fleet t-of-n (preferred 3P+ path)**: keep the *external* signer set as 2-party (client + logical relayer), but split the logical relayer participant internally across multiple relayer cosigners.
  - v1: dealer-split deterministic relayer cosigner shares (restart-robust / “stateless” relayer nodes).
  - v2: replace dealer-split with true DKG between relayer cosigners (no single relayer service can derive all shares).

Note: “each relayer derives its share from its own master secret” is not, by itself, sufficient to create a common FROST group key across parties without some coordination/ceremony. If relayers do not share a common secret/seed or run a DKG, their shares will not correspond to the same group public key.

### 6) Session auth is orthogonal: keep it, but make it participant-aware
Threshold session JWT/cookie should bind:
- `nearAccountId`, `rpId`,
- the group key id (`relayerKeyId`/`groupPublicKey`),
- optionally: the signer set or “policy” (limits, max uses, TTL).

Refactor so that session auth can authorize:
- 2P signing (today),
- multi-party fanout signing (future),
without changing how signing handlers validate “do we have authorization to sign this digest”.

**VRF warm sessions + threshold signing (requirement)**
- The client should be able to perform **one** WebAuthn+VRF ceremony with the **coordinator relayer** (typically at login) to mint a threshold session JWT/cookie.
- Subsequent threshold signing should use this session token to authorize signatures **without additional TouchID/WebAuthn prompts**, including in the future **multi-party coordinator** flow.
- In Option B, only the coordinator needs to validate the client session token; downstream participant relayers should receive a **narrow internal auth grant per signature** (or verify the same session token only when all relayers are within one trust domain and share verification keys).

### 7) Testing strategy
Refactor tests so they’re written in terms of:
- “participants” and “signer sets”,
- transcript tampering per participant,
- relayer restart behavior per participant,
even if current test fixtures only include one relayer.

Add a new suite skeleton for future n-party tests (skipped initially):
- 2-of-3 and 3-of-3 simulations with mocked relayer endpoints.

## Phased TODO list

### Phase 1 — Data-model refactor (no behavior change)
- [x] Define common “participant” types in TS + Rust.
- [x] Update client vault `threshold_ed25519_2p_v1` shape to include `participants[]` (breaking; no legacy support).
- [x] Update relayer TTL session record types to include `participantIds[]` + `commitmentsById`.
- [x] Update internal sign/init/finalize code to operate on maps keyed by participant id.

### Phase 2 — Protocol/transport boundaries (no behavior change)
- [x] Create a protocol-only module (FROST rounds + aggregation) that does not know about HTTP.
- [x] Create a transport-only module that knows how to call “a relayer participant”.
- [x] Convert the existing 2P backend to use these boundaries.

### Phase 3 — Keygen strategy interface (keep current strategy)
- [x] Extract current keygen into a `KeygenStrategy` interface.
- [x] Keep current `client PRF.first + relayer derived/kv` as `KeygenStrategyV1`.
- [x] Ensure server-side verification always recomputes group PK from claimed inputs (anti key-injection invariant).
- [x] Compute the group public key in the WASM signer worker (avoid JS scalar math).
- [x] Make threshold participant IDs configurable (client + server) with defaults.

### Phase 4 — Multi-party “stubs” (compile-time ready, feature-flagged)
- [x] Add participant list plumbing end-to-end (SDK → signer worker → relayer service).
- [x] Remove hard `participants.length > 2` rejections (keep current 2-party signing by selecting a 2-party signer set).
- [x] Add skipped tests showing intended flows for 2-of-3.

### Phase 4B — Aggregator-coordinated signing (Option B)
- [x] Define coordinator-facing endpoints: `/threshold-ed25519/sign/init` and `/threshold-ed25519/sign/finalize`.
- [x] Implement coordinator fanout to downstream relayers (2P stub; multi-peer config selects a peer, not concurrent fanout):
  - internal function calls when running as a single service,
  - HTTP fanout when relayers are separate services/parties.
- [x] Add role-gated routing so the same relayer code can run as:
  - `THRESHOLD_NODE_ROLE=participant` (no coordinator endpoints),
  - `THRESHOLD_NODE_ROLE=coordinator` (enables `/threshold-ed25519/sign/*` endpoints).
- [x] Define a peer discovery/config format for coordinator fanout (env var or config file):
  - `THRESHOLD_COORDINATOR_PEERS=[{ id, relayerUrl }, ...]`.
- [x] Store per-signature transcript in TTL KV keyed by `signingSessionId`:
  - signer set, digest(s), commitments, and any authorization binding needed for downstream enforcement.
- [x] Decide downstream auth model:
  - coordinator issues a signed internal auth grant to relayers, or
  - coordinator forwards WebAuthn/VRF evidence and relayers verify independently.
- [x] Add unit tests for coordinator fanout (2P stub; mocked downstream).
- [x] Add unit test asserting multi-peer coordinator config selects a peer (until multiparty implemented).

### Phase 5 — Docs + migration notes
- [x] Document the participant model, signer sets, and how it maps to 2P today.
- [x] Document future 3+ party options (client fanout vs aggregator).
- [x] Document the keygen strategy interface and what changes when moving to DKG.

## Acceptance criteria for this refactor
- No user-visible regressions in the existing 2P threshold signing flows (tx/delegate/NEP-413).
- Email recovery + linkDevice + VRF warm sessions continue to enable threshold signing immediately.
- Code paths for FROST rounds are written against `participants[]` and `commitmentsById`, not hard-coded “client vs one relayer”.
- Adding a second relayer participant should require **adding new implementation**, not rewriting existing modules.

## Relayer Fleet t-of-n (Phased TODO)

This section is intentionally *post-refactor*: it assumes the current participant-aware coordinator architecture is in place, and outlines what’s needed for **3P+ resilience** while keeping the *external* signer set as **2-party** (client + logical relayer).

### Phase 6 — Relayer Cosigner Key Setup (dealer-split first; DKG later)

**Phase 6A (v1): dealer-split deterministic relayer cosigner shares**
- [ ] Define dealer config (single-operator):
  - `THRESHOLD_ED25519_DEALER_MASTER_SECRET_B64U` (32 bytes; stored in KMS/secret manager; ideally only on coordinator/dealer).
  - `relayerKeyId` / “key binding” inputs used to deterministically derive the *same* relayer cosigner shares for a given threshold key.
- [ ] Define deterministic relayer secret splitting:
  - deterministically derive a relayer secret scalar `s_rel` from dealer secret + binding data,
  - deterministically derive per-cosigner shares whose recombination yields `s_rel` (t-of-n),
  - compute the relayer verifying share `P_rel = G * s_rel` (and therefore the external group public key when combined with the PRF-derived client verifying share).
- [ ] Define secure share distribution to relayer cosigners:
  - internal endpoint returns **only** the requesting cosigner’s share (auth’d by internal grant / mTLS),
  - cosigners keep the share in memory; on restart they re-fetch (no per-cosigner persistence required).
- [ ] Define the on-chain rotation story (still required): new external group public key becomes an access key (clean rotate).
- [ ] Define cosigner lifecycle: compromise response (rotate), backups (optional), and operational playbooks.
- [ ] Define cosigner id assignment policy and config wiring (stable ids, ordering, env/config).

**Phase 6B (future): true DKG between relayer cosigners**
- [ ] Implement relayer cosigner DKG ceremony (see `docs/dkg.md`).
- [ ] Replace dealer-split with DKG between relayer cosigners (no single relayer service can derive all shares).
- [ ] Define restart robustness (encrypted share persistence vs re-fetchable encrypted blobs).
- [ ] Define upgrade path from dealer-split keys to DKG keys (clean rotate; no migration tooling).

### Phase 7 — Relayer Cosigner Orchestration (internal t-of-n)
- [ ] Define internal cosigner protocol so the relayer fleet can behave like a single “logical relayer participant”:
  - internal Round 1: cosigners produce nonce commitments; coordinator combines into one relayer commitment transcript for the client.
  - internal Round 2: cosigners produce partial signature-share contributions; coordinator combines into one relayer signature share for the client.
- [ ] Implement cosigner selection + timeouts (t-of-n): health-driven selection, partial failure handling, retry semantics.
- [ ] Tighten internal authorization: ensure cosigners only contribute for `(mpcSessionId, relayerKeyId, signerSet, signingDigest, expiry)` scoped grants.

### Phase 8 — Relayer-side Protocol + Cryptography
- [ ] Specify the exact internal math so the relayer fleet outputs **valid outer-protocol** values for the logical relayer participant:
  - commitments and signature share must match what a single holder of `s_rel` would produce.
- [ ] Add verification and clear error surfaces per cosigner (bad share vs missing share vs stale transcript).
- [ ] Add transcript binding checks (internal commitments, binding factors, nonce reuse prevention).

### Phase 9 — Ops, Hardening, and UX
- [ ] Add relayer cosigner health + discovery UX: deterministic peer list config, health checks, and operator diagnostics.
- [ ] Add rate limits and abuse controls per endpoint (authorize/session/sign/internal-cosign) appropriate for fleet mode.
- [ ] Add a minimal production deployment guide for coordinator + cosigners (secrets, internal auth, cookie/JWT session wiring).

### Phase 10 — Tests + Docs
- [ ] Add unit tests for relayer-internal t-of-n cosigning (2-of-3, 3-of-5) with failure-mode suites.
- [ ] Add e2e coverage for threshold flows (tx/delegate/NEP-413/batch) in relayer-fleet mode.
- [ ] Document the relayer-fleet trust model and key setup (dealer-split now; DKG later) and explicitly call out non-goal: migration tooling.

## Refactor

TODO (from reviewing `git diff`):

- [x] **Split `ThresholdEd25519Service.ts`**: extract config parsing, keygen strategy, session persistence, coordinator fanout, peer endpoints, and key-material resolution into smaller modules.
- [x] **Centralize config/env parsing**: reduce drift for `THRESHOLD_NODE_ROLE`, `THRESHOLD_COORDINATOR_PEERS`, and participant id normalization across server + tests + docs.
- [x] **Remove redundant record fields once stable**: keep only map-shaped transcript fields (`commitmentsById`, `relayerVerifyingSharesById`, `relayerSignatureSharesById`) and drop legacy 2P-only fields.
- [x] **Unify participant-id resolution logic (Rust)**: avoid duplicate/heuristic relayer-id resolution between `signer_backend.rs` and `relayer_http.rs`.
- [x] **Parse/validate once at entry points**: keep strict validation but reduce repeated `toOptionalTrimmedString` noise across service + handlers.
- [ ] **Make errors more uniform across boundaries**: standardize error codes/messages across server ↔ WASM ↔ SDK for threshold flows.
- [x] **Test harness cleanup**: factor coordinator wiring into a single helper.
- [ ] **Test coverage expansion**: expand coverage for delegate/NEP-413/batch + 2-of-3 mocked peers.
