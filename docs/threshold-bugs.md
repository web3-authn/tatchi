# Threshold Signing Bugs (and Fixes)

This document tracks real-world bugs observed in `threshold-signer` mode and the fixes applied in this repo.

## Bug: `threshold session expired or invalid` after relogin (tx “signed successfully” but never dispatches)

### Symptoms
- Only in `threshold-signer` mode:
  - Login → `executeAction()` sometimes fails immediately with `POST /threshold-ed25519/authorize` returning `unauthorized`.
  - In some UIs, signing appears “stuck” on a toast like “1 transactions signed successfully”, but **no transaction is dispatched**.
- Network shows `POST /threshold-ed25519/authorize` failing:
  ```json
  { "ok": false, "code": "unauthorized", "message": "threshold session expired or invalid" }
  ```

### Diagnosis
This is typically **not** “stale session state”. It is usually one of these:
- **Split state / partial availability:** the threshold auth session was stored as two independent keys:
  - a `:uses` counter key, and
  - a session “record” key (scope/expiry).
  `/authorize` decremented the counter first, then fetched the record. If the record read returned `null` (replica lag, partial write, transient outage, or simply different TTL rounding), the server responded `"threshold session expired or invalid"`.
- **Ephemeral runtime state:** on Cloudflare Workers, any in-process `Map` state can disappear between requests (isolate restart / request routed to a different isolate). Any `in-memory` threshold stores can make cross-request flows fail.
- **JWT TTL mismatch / missing standard claims:** if the threshold-session JWT does not include an `exp` aligned to the threshold session budget, clients can keep sending a token the relayer should treat as expired, which surfaces as `unauthorized`.
- **Host JWT signing overriding `exp`:** `jsonwebtoken` can override payload `exp` when `expiresIn` is passed, unintentionally extending token lifetime beyond the threshold budget.

### Core Fixes
#### Relayer: avoid KV record reads during `/authorize` (JWT-claim scoped sessions)
- The relayer now includes additional scope information directly in the threshold-session JWT claims:
  - `thresholdExpiresAtMs` (server-enforced threshold-session expiry)
  - `participantIds` (signer-set binding)
- `/threshold-ed25519/authorize` (session mode) now:
  - validates scope + expiry using the signed JWT claims, and
  - only decrements the use counter (no record fetch), via a new store method `consumeUseCount(...)`.
- Backwards compatibility: if claims are missing (older tokens), the relayer falls back to the legacy KV-backed validation path.

#### Relayer: make JWT `exp` match the threshold session expiry
- The threshold-session token now includes standard JWT time claims:
  - `exp = floor(thresholdExpiresAtMs / 1000)`
  - `iat = floor(now / 1000)`
- `SessionService.verifyJwt()` now enforces standard `exp`/`nbf` when present (don’t rely on host `verifyToken` implementations to do it).
- Integration note: if you use `jsonwebtoken` and pass `expiresIn`, it will override payload `exp`; ensure your `signToken` respects payload `exp` for these tokens.

#### Deployment: Cloudflare Workers must not use in-memory stores
- Cloudflare Workers isolates are ephemeral; any in-process `Map` state can disappear between requests.
- For threshold signing to work reliably, both of these stores must be backed by shared persistence (Durable Objects or Redis/Upstash):
  - threshold auth sessions (session token “remaining uses” counters)
  - threshold signing/mpc sessions (`mpcSessionId`, `signingSessionId`)

### Notes on TTL “clamping”
The client “requests” `ttlMs` and `remainingUses` by embedding them in the VRF-bound `session_policy_digest_32`.
The server cannot silently change (“clamp”) those values without invalidating the digest.

Current behavior:
- The relayer accepts the **exact** `ttlMs` and `remainingUses` provided by the client, as long as they are positive integers.
- Any “clamping” (if desired for UX/safety) is an application/client choice, not a relayer-enforced cap.

## Fix: Cloudflare Durable Objects (DO) session store

Cloudflare Workers isolates are ephemeral; relying on in-memory threshold session state can break the 2-step flow (`/threshold-ed25519/session` → `/threshold-ed25519/authorize`). Durable Objects (DO) are a good fit for these auth/signing sessions because they provide strong consistency and atomic updates for counters + one-shot session consumption.

### What we implemented
- **Durable Object class** (storage-backed; simple JSON protocol): `sdk/src/server/router/cloudflare/durableObjects/thresholdEd25519Store.ts`
  - ops: `get`, `set` (TTL), `del`, `getdel`, `authConsumeUse`, `authConsumeUseCount`
- **SDK store adapter** (calls the DO): `sdk/src/server/core/ThresholdService/stores/CloudflareDurableObjectStore.ts`
  - backs `ThresholdEd25519AuthSessionStore`, `ThresholdEd25519SessionStore`, and `ThresholdEd25519KeyStore` (only needed for `share_mode=kv`)
- **Config surface**
  - set `thresholdEd25519KeyStore.kind='cloudflare-do'`
  - pass the DO namespace binding as `thresholdEd25519KeyStore.namespace`
  - set `THRESHOLD_PREFIX` to isolate environments (`tatchi:prod:w3a`, `tatchi:staging:w3a`, etc.)

### Example wiring (Cloudflare Worker)
- `examples/relay-cloudflare-worker/wrangler.toml` defines the DO binding + migrations and sets distinct `THRESHOLD_PREFIX` per env.
- `examples/relay-cloudflare-worker/src/worker.ts` wires `thresholdEd25519KeyStore` to the DO binding (`env.THRESHOLD_STORE`).

### GitHub deploy workflows
The deploy workflows already run `wrangler deploy --env production|staging` from `examples/relay-cloudflare-worker`, so the DO bindings and migrations in `wrangler.toml` are applied automatically:
- `.github/workflows/deploy-relay-prod.yml`
- `.github/workflows/deploy-relay-staging.yml`

When changing the DO class, bump the `[[migrations]]` tag in `wrangler.toml` so Cloudflare applies the migration.

Cloudflare Free plan note
- If you deploy on the Free plan, Cloudflare requires SQLite-backed Durable Objects. In `wrangler.toml` this means using a `[[migrations]]` entry with `new_sqlite_classes = ["ThresholdEd25519StoreDurableObject"]` (not `new_classes`).
