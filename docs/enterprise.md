# Enterprise Readiness Plan (NEAR-only)

This document is a roadmap for making `@tatchi-xyz/sdk` and the relayer components “enterprise-ready” for NEAR-only deployments (no Ethereum/Solana support goals).

The focus areas are:
- **Safety + sellability**: relayer protection, abuse controls, clear operational posture
- **Reliability**: horizontal scaling without nonce conflicts, idempotency, deterministic retries
- **Security hardening**: replay protection, KMS/HSM signing, wallet embedding allowlists
- **Ops**: logs/metrics/tracing + runbooks
- **Product surface**: multi-tenant control plane concepts + LTS/versioning story

---

## Definitions / target properties

### What “enterprise-ready” means here
- A relay can be safely exposed on the public Internet without gas-drain or abuse surprises.
- A relay can scale horizontally without `InvalidNonce` races.
- Replay protection defaults exist for all relayed operations (especially delegate relaying).
- Secrets can be held in a KMS/HSM (no raw private keys in app memory required).
- Operators have visibility (structured logs, metrics, traces) and runbooks for incidents.

### Components in scope
- **Client SDK**: `sdk/src/core/*` (relay calls, config surfaces, wallet iframe)
- **Server SDK**: `sdk/src/server/*` (AuthService, routers)
- **Relay examples**: `examples/relay-server/*`, `examples/relay-cloudflare-worker/*`
- **Wallet hosting headers/plugins**: `sdk/src/plugins/*`

---

## P0 — Safety + sellability (relay protection)

### Goals
- First-class request authentication for relay endpoints.
- Built-in rate limits + quotas (per tenant / per IP / per route).
- Clear “gas-drain” mitigations and recommended WAF posture.
- Client-side support for providing relay auth headers and/or cookie credentials.

### Server work (SDK + examples)
- Add a relay auth abstraction to router options (Express + Cloudflare):
  - `RelayRouterOptions.auth` (or similar) with:
    - API key auth (e.g., `Authorization: Bearer <token>` or `X-API-Key`)
    - optional JWT verification hook
    - “custom hook” escape hatch: `(req) => { ok, tenantId, scopes }`
- Ensure auth is enforced on all state-changing endpoints:
  - `/create_account_and_register_user`
  - `/signed-delegate`
  - recovery endpoints if they trigger relayer txs
- Add a rate-limit/quota layer that is runtime-pluggable:
  - Node: Redis/Upstash-backed counters recommended
  - Workers: Durable Object or KV-backed counters
- Add **budgeting controls**:
  - per-tenant daily “max accounts created”, “max gas burn”, “max deposit”
  - global circuit breaker: disable account creation when relayer balance < threshold
- Add server-side **preflight checks** to reduce paid failures:
  - validate payload shape + accountId policy (e.g., allowed suffix/prefix)
  - perform contract VIEW verification (where possible) before sending paid tx

### Client SDK work
- Extend `TatchiConfigsInput.relayer` to support:
  - `headers?: Record<string,string>` and/or `getHeaders?: () => Promise<Record<string,string>>`
  - cookie-mode toggles where applicable (`credentials: 'include'`)
- Thread relay auth through all SDK relay calls:
  - account creation (`/create_account_and_register_user`)
  - delegate relay (`/signed-delegate`)
  - any session endpoints if used cross-origin

### Docs deliverables
- WAF recommendations (Cloudflare-first):
  - allowlist origins is not security; require auth + rate limits
  - bot protection / managed challenge for high-risk endpoints
  - request size limits (large email payloads)
- Gas-drain mitigations:
  - strict per-tenant quotas + balance circuit breaker
  - preflight VIEW verification where feasible
  - explicit limits for `accountInitialBalance` and gas settings

### Acceptance criteria
- The example relays can be configured with API key auth + rate limiting without custom middleware.
- The SDK can call a protected relay by providing headers/cookies via config.

---

## P0 — Reliability (nonce safety + idempotency)

### Goals
- Relaying is safe under horizontal scaling (multi-instance Node, Workers).
- Idempotency for account creation to make retries safe.

### Work items
- Implement a distributed nonce/tx manager for the relayer key(s).
  - Plan lives in `docs/nonce-scaling.md`.
  - Preferred backends:
    - Node: Redis-backed `TxManager` (lock/queue + nonce cache + idempotency store)
    - Workers: Durable Object `TxManager` (serialized execution + durable nonce state)
  - Throughput lever: support multiple relayer access keys + sharding.
- Add idempotency semantics to `/create_account_and_register_user`:
  - accept `Idempotency-Key` header (or deterministic key derived from payload)
  - return prior `{ txHash, status }` on retries
  - add a “tx status by hash” helper path if needed for clients/operators

### Acceptance criteria
- Concurrency tests: N parallel requests never produce `InvalidNonce` and always settle deterministically.
- Retry tests: repeated account creation requests with the same idempotency key return the same tx hash/outcome.

---

## P1 — Security hardening

### 1) Built-in delegate replay protection
Problem: delegate relaying currently requires integrators to implement nonce/replay protection.

Plan:
- Add a default replay protection module with adapters:
  - Redis/Upstash (Node)
  - Durable Object / KV (Workers)
- Enforce “at most once” relaying for a given `(publicKey, receiverId, nonce)` (and/or delegate hash):
  - store as “used” before submitting the relayer transaction
  - honor `maxBlockHeight` expiry windows (prune/TTL keys)
- Ship safe defaults (on by default when storage is configured; explicit opt-out for dev).

### 2) Pluggable relayer signer (KMS/HSM)
Problem: enterprises often require KMS/HSM; avoid raw `RELAYER_PRIVATE_KEY` in app memory.

Plan:
- Define a `RelayerSigner` interface used by `AuthService` for signing:
  - `getPublicKey()`
  - `signTransaction({ receiverId, nonce, blockHash, actions }) -> SignedTransaction`
- Provide implementations:
  - current WASM signer (local secret) as default
  - “remote signer” interface (HTTP signing service)
  - reference integrations (AWS KMS / GCP KMS) as examples (optional, separate package)

### 3) Wallet embedding allowlists (`frame-ancestors`)
Problem: wallet origins benefit from restricting which app origins may embed the wallet iframe.

Plan:
- Extend CSP/header helpers to support `frame-ancestors` allowlists for wallet HTML routes:
  - update `sdk/src/plugins/headers.ts` (and Vite/Next helpers) to emit an optional `frame-ancestors` directive.
- Document deployment patterns:
  - single-tenant wallet origin (strict allowlist)
  - multi-tenant wallet origin (tenant-configured allowlist)

### Acceptance criteria
- Delegate replay is blocked by default when a store is configured.
- Relayer can run without storing a raw private key (KMS/HSM path).
- Wallet origin can be configured to refuse embedding by unknown origins.

---

## P1 — Ops (observability + runbooks)

### Goals
- Structured logs with request IDs across SDK server routes.
- Metrics/tracing (OpenTelemetry for Node; Cloudflare-compatible tracing/log correlation).
- Dashboards/alerts and runbooks for incident response.

### Work items
- Standardize request IDs:
  - Express: middleware sets `req.id`; include in all logs + response header
  - Cloudflare: derive from `cf-ray` or `crypto.randomUUID()`
- Logging:
  - define structured log shape for server SDK (`logger` already pluggable)
  - ensure sensitive fields are redacted (private keys, email contents, etc.)
- Metrics:
  - counters: account creations, auth failures, rate-limit hits, invalid nonce, delegate replays blocked
  - gauges: relayer balance (periodic), queue depth, p95 latency
- Tracing:
  - Node: OpenTelemetry instrumentation hooks around route handlers + NEAR RPC calls
  - Workers: correlate logs with request IDs; optional third-party APM integration
- Runbooks:
  - “gas drain / attack” response (tighten WAF, rotate keys, pause endpoints)
  - “InvalidNonce storm” response (tx manager health, key sharding, nonce reset guidance)
  - relayer balance replenishment + alerting
  - key rotation procedures (relayer key, Shamir keys, threshold secrets)

### Acceptance criteria
- Operators can answer: “who is using gas”, “why are requests failing”, “what changed”, and “how to stop the bleed” in minutes.

---

## P2 — Enterprise product surface

### 1) Multi-tenant control plane concepts
Goal: support multiple apps/tenants safely on shared infrastructure.

Plan:
- Introduce a tenant model (conceptual; implementation can be incremental):
  - tenant API keys / auth identities
  - per-tenant config (allowed origins, wallet origins, rpId policies)
  - per-tenant quotas/budgets
  - per-tenant policy engine:
    - allowed receivers/methods for delegate relaying
    - max attached deposit/spend limits
- Add audit logs:
  - append-only records for relayed transactions, auth events, policy denies, key rotations
  - retention policy and export path

### 2) Versioning / deprecation / LTS
Plan:
- Define compatibility guarantees for:
  - SDK JS API surface
  - server router request/response shapes (currently “SDK-internal”; decide what becomes stable)
  - wallet iframe protocol versioning (`protocolVersion` already exists)
- Add a documented deprecation policy and recommended upgrade cadence.
- Introduce an LTS branch strategy for enterprise deployments (e.g., “quarterly LTS”).

### Acceptance criteria
- A single relay deployment can safely serve multiple tenants with isolation, quotas, and auditability.
- Enterprises have a clear maintenance story (LTS, patch cadence, breaking change windows).

---

## Dependencies / sequencing notes
- P0 safety (auth/rate limits) should land before promoting public relay endpoints.
- P0 nonce safety (distributed tx manager) is a prerequisite for horizontal scaling.
- P1 replay protection should ship with the tx manager since both require shared state.

## Links
- Distributed nonce/tx manager plan: `docs/nonce-scaling.md`
