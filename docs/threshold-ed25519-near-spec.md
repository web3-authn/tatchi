
# Threshold Ed25519 (NEAR) — Design + Refactor Guide

This document is the **implementation-oriented spec** for adding an **optional 2‑party threshold Ed25519 signing mode** to `@tatchi-xyz/sdk`, where:

- The **client** holds one key share (in the WASM signer worker).
- The **relayer** holds the other key share (server-side).
- Neither side can produce a valid NEAR Ed25519 signature alone.
- The resulting signature is a **standard NEAR Ed25519 signature** (no on-chain changes).

It is also a **refactor guide**: it describes how to restructure the current “local deterministic Ed25519 key” implementation so threshold signing can be integrated without rewriting all signing call sites.

> Status: the repo implements **local** and **threshold (2p FROST) Ed25519 signing** behind `signerMode`.
>
> Current refactor progress:
> - VRF input derivation includes a required 32-byte `intent_digest_32` end-to-end (SDK → VRF worker → contract).
> - IndexedDB v3 vault uses a tagged `KeyMaterial` union (`local_near_sk_v3`, `threshold_ed25519_2p_v1`) with no v2 fallback.
> - Signer worker signing handlers route through a backend abstraction and accept `signerMode` for tx/delegate/NEP‑413; threshold backend is implemented (FROST client coordinator) and relayer endpoints (`/threshold-ed25519/keygen`, `/authorize`, `/sign/init`, `/sign/finalize`) exist with **optional Redis/Upstash persistence** (default in-memory; still not production-hardened).
> - Stateless relayer mode is implemented: the relayer signing share can be deterministically derived from `THRESHOLD_ED25519_MASTER_SECRET_B64U` + client-provided public binding data (see `docs/threshold-relay-server.md`).
> - Threshold enrollment is “activatable” on-chain: the relayer returns threshold enrollment details, and the client submits `AddKey(thresholdPublicKey)` itself. During `registerPasskey(signerMode="threshold-signer")`, the SDK performs this AddKey immediately after registration using the in-memory registration credential (no extra TouchID prompt).
> - Session-style threshold signing is implemented: `loginAndCreateSession()` mints `POST /threshold-ed25519/session` (JWT/cookie), and subsequent threshold signing uses the session token to call `/threshold-ed25519/authorize` without requiring WebAuthn per signature (fallbacks to per-signature WebAuthn when the token is missing/invalid).

> Scope note: this plan prioritizes a **clean v3 refactor**. Backwards compatibility (old vault entries, old APIs, seamless upgrades) is explicitly **not** a goal; assume a breaking change and **re-registration** (no automatic v2→v3 migration).

---

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
- **Threshold signer**: planned implementation. Client+relayer jointly produce Ed25519 signatures.
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

## Target architecture (v3, planned): two signing backends

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

## Implementation plan (phased TODOs, v3 breaking)

### Phase 0 — decisions + scaffolding

- [x] Choose library: `frost-ed25519` (default) vs `givre` (only if needed).
- [ ] Decide server integration for the relayer share computation:
  - [ ] Rust-native cosigner service, or
  - [ ] Node relayer calling a Rust module (WASM via wasm-bindgen or native addon).
- [ ] Decide relayer share persistence model:
  - [x] KV persistence (Redis/Upstash) keyed by `relayerKeyId` (works today, but is stateful), or
  - [ ] deterministic derived-share mode using a relayer master secret (stateless; planned; see below).
- [x] Standardize wire encodings for MPC messages (JSON with base64url fields recommended).
- [x] Define canonical `signing_digest_32` for each purpose (`near_tx`, `nep461_delegate`, `nep413`) and make it exactly 32 bytes.
- [x] Add a per-request `signerMode: "local-signer" | "threshold-signer"` in signer-worker request payloads (not in the MessagePort), and reject if the request fields/key material don’t match the selected mode.

### Phase 1 — VRF binding to `intent_digest_32` (contract + SDK)

- [x] Extend `VRFInputData` (TS + Rust) to include `intentDigest` (base64url 32 bytes) and plumb it into contract args as `intent_digest_32`.
- [x] Update VRF input derivation to hash `domain_sep || user_id || rp_id || block_height || block_hash || intent_digest_32`.
- [x] Update on-chain `verify_authentication_response` to recompute/accept the new VRF input format and require `intent_digest_32: Some(32 bytes)`.
- [x] Add a regression test vector for VRF input hashing so client/contract stay in lockstep (`sdk/src/wasm_vrf_worker/src/tests.rs`).

### Phase 2 — v3 vault format (no v2 fallback)

- [x] Replace IndexedDB record with a tagged v3 key material union:
  - [x] `local_near_sk_v3` (if keeping local mode)
  - [x] `threshold_ed25519_2p_v1` (threshold metadata + `relayerKeyId` + public key; client share derived from `PRF.first`)
- [x] Remove any implicit “derive key from PRF.second” dependency from the core signing path.
- [x] Require re-registration to populate v3 vault entries.

### Phase 3 — relayer authorization + endpoints

- [x] Add `POST /threshold-ed25519/authorize`:
  - [x] Input: `{ relayerKeyId, purpose, signing_digest_32, signing_payload, vrf_data, webauthn_authentication }`
  - [x] Output: `{ mpcSessionId, expiresAt }` (single-use)
- [x] Add `POST /threshold-ed25519/sign/init` (scaffolding; in-memory):
  - [x] Input: `{ mpcSessionId, relayerKeyId, nearAccountId, signingDigestB64u, clientCommitments }`
  - [x] Output: `{ signingSessionId, relayerCommitments, relayerVerifyingShareB64u }`
- [x] Add `POST /threshold-ed25519/sign/finalize` (scaffolding; in-memory):
  - [x] Input: `{ signingSessionId, clientSignatureShareB64u }`
  - [x] Output: `{ relayerSignatureShareB64u }` (client aggregates)
- [x] Enforce replay protection and scoping:
  - [x] `mpcSessionId` binds `(relayerKeyId, purpose, intent_digest_32, signing_digest_32)` and is consumed after successful `/sign/init`.
  - [x] `signingSessionId` single-use; delete relayer nonce state at the start of `/sign/finalize` (even on errors).
- [ ] Add rate limits/quota per `relayerKeyId`.

### Phase 4 — FROST in the signer worker (client share holder + coordinator)

- [x] Add FROST dependency to `sdk/src/wasm_signer_worker` (or a shared Rust crate used by both workers).
- [x] Implement `ThresholdEd25519RelayerSigner` backend:
  - [x] Derive the client share deterministically from `WrapKeySeed` (derived from `PRF.first`) + `nearAccountId`
  - [x] Round 1: generate nonces + commitments; call `/sign/init`
  - [x] Round 2: compute client signature share; call `/sign/finalize`
  - [x] Aggregate signature shares into standard Ed25519 `(R,s)` signature bytes
- [x] Keep the VRF→Signer `MessagePort` focused on secrets (`WrapKeySeed`, `wrapKeySalt`, optional ephemeral auth tokens). The mode selection itself is not secret and should travel in the normal signer-worker request.
- [x] Add unit tests in Rust:
  - [x] 2-party sign produces a signature that verifies under the group public key.
  - [x] Tampering with commitments/shares fails verification.

### Phase 5 — NEAR integration (tx, delegate, NEP-413)

- [x] Ensure `near_tx` binding uses the exact NEAR transaction hash: `sha256(borsh(Transaction))`.
- [x] Wire `threshold-signer` into:
  - [x] `handle_sign_transactions_with_actions.rs`
  - [x] `handle_sign_delegate_action.rs`
  - [x] `handle_sign_nep413_message.rs`
- [x] Decide where to aggregate for each use case:
  - [x] client aggregates (recommended), relayer remains non-custodial of full sig
  - [ ] or relayer aggregates and returns final signature (acceptable if needed)

### Phase 6 — keygen (how `relayerKeyId` + shares are created)

v1 decision: **deterministic client share** (from `PRF.first`) wins over proactive refresh.

Implement:
- [x] Define `clientShareDerivation = "prf_first_v1"` precisely (HKDF salt `"tatchi-threshold-ed25519-client-share:v1"`, info = `nearAccountId`, scalar reduction via `from_bytes_mod_order_wide`).
- [x] `POST /threshold-ed25519/keygen` returning `{ relayerKeyId, publicKey, relayerVerifyingShareB64u }` (requires VRF+WebAuthn binding; persistence is optional via Redis/Upstash, default in-memory).
- [x] Persist relayer share keyed by `relayerKeyId` in an optional KV store (Redis/Upstash) for serverless/cluster safety (default in-memory).
- [ ] Production hardening (option A): move relayer share into HSM/secret manager (encryption at rest, rotation policies).
- [x] Production hardening (option B, preferred for stateless relayer): deterministically derive the relayer signing share from a relayer master secret (`THRESHOLD_ED25519_MASTER_SECRET_B64U`, `THRESHOLD_ED25519_SHARE_MODE=derived|auto`).
- [x] Store threshold key metadata in the v3 vault (no migration): `{ publicKey, relayerKeyId, clientShareDerivation }`.
- [x] Add a post-registration threshold enrollment API: `TatchiPasskey.enrollThresholdEd25519Key(...)` (runs `/keygen`, verifies shares→group PK, submits `AddKey(publicKey)`, then stores `threshold_ed25519_2p_v1`).
- [x] Auto-enroll during `registerPasskey(signerMode="threshold-signer")` after on-chain registration:
  - SDK requests enrollment details from the relayer, verifies `publicKey` matches `(clientVerifyingShare, relayerVerifyingShare)`,
  - then submits `AddKey(thresholdPublicKey)` signed with the local key using the already-collected registration credential (no extra TouchID prompt).

#### Deterministic relayer share (stateless relayer; implemented)

Goal: avoid storing the relayer’s secret signing share in Redis/Upstash/DB by re-deriving it on-demand.

**Core idea**
- Add a relayer-wide master secret (example env var): `THRESHOLD_ED25519_MASTER_SECRET_B64U` (32 random bytes).
- Derive the relayer signing share scalar `s₂` as a function of:
  - relayer master secret (private),
  - client verifying share (public, 32 bytes),
  - and binding data like `{ nearAccountId, rpId, epoch/version }` to avoid cross-account collisions.
- Then compute:
  - relayer verifying share `X₂ = s₂·G`,
  - group public key `X = 2·X₁ − 1·X₂` (for ids `{1,2}` at x=0),
  - and enforce `X == relayerKeyId/publicKey`.

**Wire/API impacts**
- In stateless mode the relayer recomputes `s₂` during `/session` + `/authorize` + signing:
  - `clientVerifyingShareB64u` is required in `POST /threshold-ed25519/session` and `POST /threshold-ed25519/authorize` so the relayer can re-derive and validate `relayerKeyId`.
  - Signing session TTL records include `clientVerifyingShareB64u` so `/sign/finalize` can re-derive without a keystore.
- The relayer must always recompute `publicKey`/`relayerKeyId` from the provided inputs and reject mismatches.

**Security tradeoffs**
- The relayer master secret becomes a high-value secret: compromise allows deriving all relayer shares for enrolled keys.
- Rotation of the relayer master secret requires on-chain key rotation (add new threshold key, delete old).

Implementation detail doc: `docs/threshold-relay-server.md`.

Rotation model:
- [ ] Re-run keygen to produce a new `publicKey` + `relayerKeyId`.
- [ ] Add the new access key to the NEAR account, then delete the old access key once the new key is confirmed working.

### Phase 7 — hardening + ops

- [ ] Add structured logging with correlation ids for `mpcSessionId`/`signingSessionId` (no secrets).
- [ ] Add fuzz/negative tests for malformed inputs on relayer endpoints.
- [ ] Add metrics: authorize failures, sign init/finalize errors, replay rejects, latency p50/p99.
- [ ] Consider nonce precomputation pool (optional) to reduce interactive latency.

---

## Optional: Session-style threshold signing (JWT/Cookie)

This is an optional extension to make **`threshold-signer` session-capable** (similar to local signing),
so the user can sign multiple transactions after a single WebAuthn prompt.

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

Proposed relayer behavior:

1) Client calls `POST /threshold-ed25519/session` with:
   - `vrf_data` + `webauthn_authentication`
   - `relayerKeyId`
   - `sessionPolicy` (or its canonical JSON string)
2) Relayer verifies on-chain (`verify_authentication_response`) and checks that:
   - `nearAccountId == vrf_data.user_id`
   - `rpId == vrf_data.rp_id`
   - `session_policy_digest_32 == sha256(canonical_json(sessionPolicy))`
   - `intent_digest_32 == sha256("threshold_session_mint_v1")` (or whatever constant is chosen)
3) Relayer persists `{ sessionId, relayerKeyId, nearAccountId, rpId, expiresAtMs, remainingUses }` in TTL KV.
4) Relayer issues an auth token:
   - **JWT bearer** (simpler in workers/WASM fetch), or
   - **HttpOnly cookie** (better XSS posture, but more CORS complexity)

Then for each signature:
- Client uses confirmTxFlow in `warmSession` mode to dispense `WrapKeySeed` (no TouchID) and still show confirmation UI.
- Signer worker performs the FROST flow and includes the **JWT/cookie** on relayer requests.
- Relayer recomputes `intent_digest_32` + `signing_digest_32` server-side from `signingPayload` and rejects mismatches.
- Relayer decrements `remainingUses` (server-side) and rejects when exhausted/expired.

### Contract changes?

Decision: **yes, contract changes** (v4).

- Keep `intent_digest_32` reserved for NEAR tx/delegate/NEP‑413 intent.
- Add a second VRF‑bound field: `session_policy_digest_32` (optional, 32 bytes).
- Bump VRF input derivation version (new domain separator) so the contract can bind both digests.

Even with contract changes, TTL/uses are still enforced by the relayer (KV + token). The contract cannot enforce session usage at signature time because signatures are produced off‑chain; the value of `session_policy_digest_32` is that the relayer’s session policy is cryptographically bound to the user’s WebAuthn ceremony without overloading `intent_digest_32`.

### Contract update instructions (chosen: `session_policy_digest_32`, v4)

Contract goal:
- keep `intent_digest_32` semantics (tx/delegate/NEP‑413 intent), and
- add a second, optional VRF‑bound 32‑byte digest for session policy.

Steps:

1) **Extend `VRFVerificationData`**
   - Add:
     - `session_policy_digest_32: Option<Vec<u8>>`
   - Keep JSON aliases consistent with existing patterns:
     - accept `sessionPolicyDigest32` (camelCase) and `session_policy_digest_32` (snake_case)
   - Enforce: when present, it must be exactly 32 bytes.

2) **Bump the VRF domain separator (version)**
   - Introduce a new constant, e.g. `web3_authn_challenge_v4`.
   - Update derivation to:

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

   Notes:
   - `intent_digest_32` stays required (as in v3).
   - `session_policy_digest_32` is optional so existing per‑tx flows can omit it.
   - If you do not need backwards compatibility, remove v3 support entirely and only accept v4.

3) **Update `verify_authentication_response`**
   - Parse `session_policy_digest_32` from `VRFVerificationData`.
   - When present, validate length == 32.
   - Recompute `vrf_input_data` using the v4 domain separator and the new concatenation rule.
   - Reject mismatches with a distinct error/log (e.g. `VrfInputDataMismatchV4`).

4) **Update SDK + VRF worker types**
   - Add `sessionPolicyDigest32?: string` (base64url 32 bytes) to the SDK→VRF input types and to the contract RPC args.
   - Ensure the VRF worker lowercases `rp_id` the same way the contract does before hashing.

5) **Relayer session-mint policy**
   - For `POST /threshold-ed25519/session`:
     - require `session_policy_digest_32: Some(32 bytes)`
     - recommend enforcing a stable session-mint `intent_digest_32` (e.g. `sha256("threshold_session_mint_v1")`)
   - For per‑tx threshold signing (per‑signature WebAuthn):
     - set `session_policy_digest_32: None` (or omit), and keep `intent_digest_32 = tx_intent_digest_32`.

### Implementation plan (phased TODOs)

**Phase S0 — contract v4 + policy spec**
- [x] Implement contract v4: add `session_policy_digest_32` and update VRF input derivation (see instructions above).
- [x] Add a regression test vector for v4 `vrf_input_data` derivation to prevent drift.
- [x] Define `threshold_session_v1` canonical JSON schema and its `session_policy_digest_32` computation (versioned).
- [x] Decide the session-mint intent binding (constant or stable login digest; keep tx semantics reserved).
- [x] Implement token type: bearer JWT (default) and optional HttpOnly cookie.
- [x] Define relayer-enforced clamps: `maxTtlMs`, `maxRemainingUses`, and per-account rate limits.

**Phase S1 — relayer endpoints (session mint + scoped authorize)**
- [x] Add `POST /threshold-ed25519/session` to mint a threshold auth session:
  - [x] verify on-chain, recompute policy digest, persist session record in TTL KV, issue JWT/cookie.
- [x] Update `/threshold-ed25519/authorize` to accept either:
  - [x] WebAuthn+VRF (per-signature), or
  - [x] relayer auth session token (session-style), and mint `mpcSessionId` per signature.
- [x] Add replay protection / idempotency for session-minting (replay does not reset remainingUses/expiry).

**Phase S2 — SDK plumbing**
- [x] Build `threshold_session_v1` policy and compute `session_policy_digest_32` client-side.
- [x] Mint the threshold auth session during `loginAndCreateSession()` (one WebAuthn+VRF prompt).
- [x] Cache the session token in memory keyed by `{ nearAccountId, rpId, relayerUrl, relayerKeyId }` with TTL.
- [x] Keep signing APIs unchanged: signing handlers only *consume* the cached token and fall back to per-signature WebAuthn when missing/invalid.

**Phase S3 — signer worker behavior**
- [x] When a relayer session token is present, allow confirmTxFlow `warmSession` and authorize via `/threshold-ed25519/authorize` using the token (no vrf_data/webauthn in body).
- [x] When missing/invalid, force per-signature WebAuthn+VRF (no warm-session reuse without a token).
- [x] Keep the token non-persistent (JWT in-memory or HttpOnly cookie; no IndexedDB).

**Phase S4 — tests**
- [x] E2E: mint threshold session once (via login), then threshold-sign 2 transactions with no additional WebAuthn prompt.
- [x] Negative: intent/signing digest mismatch tests for `/authorize` payloads.
- [x] Relayer: remainingUses decrements exactly once per signature; mint replay does not reset the budget.

---

## Relayer API (proposed)

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

## Compatibility checklist (for implementation)

- NEAR signature bytes must be valid Ed25519 and verify under the on-chain access key public key.
- `handle_sign_transactions_with_actions.rs` must still sign `tx_hash = sha256(borsh(Transaction))`.
- `handle_sign_delegate_action.rs` must still sign the NEP‑461 delegate hash (`hash_delegate_action`).
- `PasskeyNearKeysDB` must be able to store both key kinds without ambiguity.

---

## Open questions / decisions to make before implementing

- Do we require threshold mode only when `relayer.url` is configured, or allow a separate co-signer URL?
- Do we want a nonce/commitment precomputation pool to reduce RTT for signing?
- Do we support any migration path, or require re-registration only (assumed by this doc)?
- Should the relayer’s share be stored in an HSM/secret manager, or in an app DB encrypted at rest?
- Do we want to standardize `relayerKeyId := publicKey` to make account recovery fully stateless?
