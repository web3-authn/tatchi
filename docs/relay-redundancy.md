# Relay Redundancy Plan

Goal: keep the wallet usable when a relay endpoint goes down (ideally without needing a TouchID prompt, but at minimum without bricking login/signing).

This doc proposes a simple federated setup using multiple stateless relays (easy to spin-up cloudflare workers) and client-side failover.

## Topology (MVP)

Two relays, same API surface:

- `https://relay1.tatchi.xyz`
- `https://relay2.tatchi.xyz`

Both are deployed as Cloudflare Workers (stateless compute; secrets/config via Wrangler).

## What the relay is used for

Separate concerns; they have different redundancy + trust properties:

1) **Shamir 3-pass VRF auto-unlock** (non-custodial, no funds required)
   - `POST /vrf/apply-server-lock`
   - `POST /vrf/remove-server-lock`
   - `GET /shamir/key-info`

2) **Verification + sessions** (optional; convenience)
   - `POST /verify-authentication-response` (VIEW call to contract)
   - JWT/cookie session issuance (if enabled)

3) **Relaying funded transactions** (custodial funds required)
   - account creation, sponsored actions, delegate relaying, etc.

This plan focuses on (1) first (highest UX impact, lowest operational burden), then (2), then (3).

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

### Phase 0 — Deploy two relays

- [ ] Deploy Cloudflare Worker to both domains.
- [ ] Ensure identical route set is enabled (`/vrf/*`, `/shamir/key-info`, `/verify-authentication-response`, `/healthz`).
- [ ] Configure CORS allowlist for wallet origin(s).
- [ ] Add health checks and basic rate limits (especially on `/vrf/remove-server-lock`).

### Phase 1 — Client failover for Shamir (Approach A or B)

- [ ] Add client-side relay list (two origins).
- [ ] Implement “try primary, then fallback” for Shamir unlock.
- [ ] On TouchID fallback success, refresh envelopes on all relays best-effort.

### Phase 2 — Sessions + funded relaying (optional)

- [ ] Prefer JWT session issuance; only use cookies when sticking to one domain.
- [ ] Decide funded-relayer policy: who pays gas, who is allowed, and how to prevent abuse.

## Test plan

- [ ] Bring down `relay1.tatchi.xyz` and confirm:
  - Shamir auto-unlock succeeds via `relay2.tatchi.xyz` (Approach A: same envelope; Approach B: second envelope).
  - If both Shamir relays are down, TouchID fallback login still works.
- [ ] Rotate Shamir keys on one relay (Approach B) and verify:
  - Old envelope fails with “unknown keyId” until refreshed.
  - Background refresh produces a new envelope and restores no-prompt login.
