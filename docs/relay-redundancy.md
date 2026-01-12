# Relay Redundancy Plan

Goal: keep the wallet usable when a relay endpoint goes down (ideally without needing a TouchID prompt, but at minimum without bricking login/signing).

This doc proposes a simple multi-relay setup with client-side failover for public endpoints, plus a relayer-fleet model for threshold signing.

## Topology (MVP)

Three relays, same API surface:

- `https://relay1.tatchi.xyz`
- `https://relay2.tatchi.xyz`
- `https://relay3.tatchi.xyz`

Shamir/VRF/session endpoints can be deployed as stateless edge compute, but threshold signing endpoints typically require a full relayer service (WASM signer + key/session stores).

## What the relay is used for

Separate concerns; they have different redundancy + trust properties:

1) **Shamir 3-pass VRF auto-unlock** (non-custodial, no funds required)
   - `POST /vrf/apply-server-lock`
   - `POST /vrf/remove-server-lock`
   - `GET /shamir/key-info`

2) **Verification + sessions** (optional; convenience)
   - `POST /verify-authentication-response` (VIEW call to contract)
   - JWT/cookie session issuance (if enabled)

3) **Threshold signing (MPC / FROST)** (non-custodial, but availability-sensitive)
   - `POST /threshold-ed25519/sign/init`
   - `POST /threshold-ed25519/sign/finalize`

4) **Relaying funded transactions** (custodial funds required)
   - account creation, sponsored actions, delegate relaying, etc.

This plan focuses on (1) first (highest UX impact, lowest operational burden), then (2), then (3), then (4).

## Redundancy strategy (Shamir 3-pass)

### Approach A (simplest): shared Shamir keypair across relays

Both relays use the same Shamir key material (`p`, `e_s`, `d_s`) and the same rotation policy.

Pros:
- Client can fail over to the other relay with the same stored envelope.
- No extra client storage or schema changes.

Cons:
- More shared-secret operational risk (key copied to multiple deployments).

### Approach B (recommended for “federated”): independent Shamir keypairs + multiple envelopes

Each relay has its **own** Shamir server keypair. The client stores **2–3 server-encrypted envelopes** for redundancy:

- Envelope is the existing `{ ciphertextVrfB64u, kek_s_b64u, serverKeyId }`
- Add `relayOrigin` per envelope (which relay it belongs to)

Login flow:
- Try Shamir auto-unlock by iterating stored envelopes (prefer last-known-good relay first).
- On failure/timeout, try the next envelope/relay.
- If all Shamir relays fail → fall back to TouchID (PRF) unlock (wallet still works).

Post-login refresh:
- If login succeeded via TouchID fallback (or if envelopes are missing/stale), re-wrap VRF under each relay key **best-effort in the background** and persist refreshed envelopes.

Pros:
- No shared Shamir private material between relays.
- True redundancy: any one relay being up preserves “no prompt” logins.

Cons:
- Requires client support for multiple relays + multiple envelopes.
- More network calls during refresh.

## Redundancy strategy (sessions)

- Prefer **JWT** sessions when using multiple domains. Cookies are per-domain; switching relays breaks cookie continuity.
- Treat sessions as optional: wallet can operate without sessions (direct contract VIEW calls + direct RPC where possible).

## Redundancy strategy (threshold signing)

We are keeping the **external** cryptographic signer set as **2-party**:
- client share is deterministically derived from passkey PRF (recovery requirement),
- the “relayer” is one logical participant from the client’s POV.

To get 3P+ **resilience** without changing the client-facing protocol, the relayer side becomes a fleet with internal `t-of-n` cosigning:

- Run **3 relayer nodes** (same operator):
  - 1 **coordinator** relayer (public; exposes `/threshold-ed25519/sign/*`),
  - 2 **cosigner** relayers (internal-only; expose `/threshold-ed25519/internal/cosign/*`).
- Coordinator uses `T-of-N` relayer cosigners to produce the single “logical relayer” commitment + signature share required by the *outer* 2-party protocol.
  - internal endpoints: `POST /threshold-ed25519/internal/cosign/init` and `POST /threshold-ed25519/internal/cosign/finalize`
  - internal auth: coordinator signs a short-lived grant using `THRESHOLD_COORDINATOR_SHARED_SECRET_B64U` (HMAC)

Coordinator config:
- `THRESHOLD_ED25519_RELAYER_COSIGNERS=[{ cosignerId, relayerUrl }, ...]` (includes itself if the coordinator also acts as a cosigner)
- `THRESHOLD_ED25519_RELAYER_COSIGNER_T=2` (for 2-of-3)
- each process sets `THRESHOLD_NODE_ROLE=coordinator|cosigner` and its own `THRESHOLD_ED25519_RELAYER_COSIGNER_ID`

Resulting availability target:
- Threshold signing requires **at least 2 of the 3 relayers healthy** (coordinator + any 1 cosigner for `T=2`).
- In this 3-relay cosigner topology, if only the coordinator is up, signing fails fast with a clear “not enough relayer cosigners available” error.

Notes:
- This keeps the *client-facing* protocol strictly 2-party (client + logical relayer) while improving relayer fleet availability.
- True “no single relayer can reconstruct the logical relayer secret” hardening can be added later by switching the relayer fleet from dealer-split → DKG (see `docs/dkg.md`).

### Single relay vs relayer fleet (seamless switching)

From the SDK/client’s POV, cosigners are an internal implementation detail: the client still talks to the **coordinator** over the same `/threshold-ed25519/*` API and signs against the same **2-party group public key**.

Practical implications:
- **Single relay deployment** works: coordinator signs directly as the logical relayer participant (equivalent to internal `n=1, t=1`).
- **Multi-relay deployment** works: coordinator fans out to cosigners, aggregates internal commitments + signature contributions, then continues the outer 2-party signing with the client.
- You can switch between **1 relay** and **2+ relays** without client-side changes *as long as the logical relayer key material stays the same* (e.g. `THRESHOLD_ED25519_SHARE_MODE=derived` with a stable `THRESHOLD_ED25519_MASTER_SECRET_B64U`, or a shared persistent keystore in `kv` mode). If the relayer share changes, the group public key changes and accounts must re-enroll.

## Redundancy strategy (funded relaying)

If you want “anyone can host a relay”, split it conceptually:

- **Shamir relays**: easy for third parties to run (no funds, non-custodial).
- **Transaction relayers**: require a funded relayer account and policy controls (rate limits, abuse controls, allowlists).

For redundancy of funded relays:
- Run at least 2 relayers under your control, each funded independently.
- Client uses failover with circuit breaker (timeouts + backoff).
- Consider a stable “front door” domain that can redirect to live relays if you want to keep client config simple.

## Client failover policy (recommended)

- **Sticky primary**: remember the last successful relay (`localStorage` or IndexedDB metadata).
- **Fast timeout**: e.g. 1–3s for Shamir calls; if no response, try the next relay.
- **Circuit breaker**: mark relay as unhealthy for a short TTL after repeated failures to avoid retry storms.
- **Background refresh**: after any successful login, refresh envelopes asynchronously; never block core UX.

## Phased implementation checklist

### Phase 0 — Deploy three relays

- [ ] Deploy relayer services to all three domains.
- [ ] Ensure identical route set is enabled (`/vrf/*`, `/shamir/key-info`, `/verify-authentication-response`, `/threshold-ed25519/*`, `/healthz`).
- [ ] Configure CORS allowlist for wallet origin(s).
- [ ] Add health checks and basic rate limits (especially on `/vrf/remove-server-lock`).

### Phase 1 — Client failover for Shamir (Approach A or B)

- [ ] Add client-side relay list (three origins).
- [ ] Implement “try primary, then fallback” for Shamir unlock.
- [ ] On TouchID fallback success, refresh envelopes on all relays best-effort.

### Phase 2 — Sessions + funded relaying (optional)

- [ ] Prefer JWT session issuance; only use cookies when sticking to one domain.
- [ ] Decide funded-relayer policy: who pays gas, who is allowed, and how to prevent abuse.

## Test plan

- [ ] Bring down `relay1.tatchi.xyz` and confirm:
  - Shamir auto-unlock succeeds via `relay2.tatchi.xyz` or `relay3.tatchi.xyz` (Approach A: same envelope; Approach B: other envelope).
  - If both Shamir relays are down, TouchID fallback login still works.
- [ ] Rotate Shamir keys on one relay (Approach B) and verify:
  - Old envelope fails with “unknown keyId” until refreshed.
  - Background refresh produces a new envelope and restores no-prompt login.
- [ ] Bring down any single relayer and confirm threshold signing still works (2-of-3).
- [ ] Bring down two relayers and confirm threshold signing fails with a clear error.
