# Nonce Scaling — Distributed Nonce/Tx Manager (Redis / Cloudflare Durable Objects)

Today the relayer uses an **in-process** queue (`AuthService.queueTransaction`) to avoid nonce conflicts. This works for a single Node process, but it breaks under:
- multiple Node instances (Kubernetes/PM2/etc.),
- Cloudflare Workers (each request has a fresh isolate; the example constructs a new `AuthService` per request).

This document is a plan for making relayer transaction submission **safe under horizontal scaling** by introducing a distributed nonce/tx manager.

## Requirements
- **Nonce safety**: for a given `(relayerAccountId, relayerPublicKey)` access key, transactions must be **submitted in a single total order**.
- **Idempotency**: client retries must not “double spend” (create/fund twice, duplicate registrations, etc.).
- **Crash safety**: if the process crashes mid-send, the system can recover without bricking the relayer key’s nonce.
- **Multi-runtime support**: Node/Express + Cloudflare Workers.
- **No new trust boundary**: the tx manager must be internal-only; do not expose raw signing as a public endpoint.

## Scope
**In**
- All relayer-signed transactions that use the relayer access key nonce:
  - account creation + atomic registration
  - delegate relaying (outer relayer tx)
  - email recovery relayer txs (if any)

**Out (for this plan)**
- Client-side nonce management for user keys (`sdk/src/core/nonceManager.ts` already exists).
- Threshold signing session state (already handled by threshold keystores/DO/Redis).

## Key constraints (NEAR)
- Nonce is per **access key** (public key) on the relayer account.
- If two servers sign+submit concurrently with the same access key, you will see `InvalidNonce` and/or out-of-order failures.
- Even if NEAR allows “nonce gaps”, **out-of-order submission** is still a footgun: if `nonce=101` lands before `nonce=100`, then `nonce=100` will fail forever.
  - Therefore the problem is not only “unique nonces” — it is **ordering**.

## Design options

### Option A (recommended for Node): Redis-backed per-key FIFO “Tx Manager”
Build a `TxManager` component that enforces FIFO submission per access key.

Two viable Redis shapes:

1) **Distributed lock + nonce cache** (simpler, good enough for many deployments)
- Acquire lock `txlock:{accountId}:{publicKey}` (SET NX PX + token, release via Lua).
- Inside the lock:
  - resolve tx context (nonce + recent block hash),
  - sign,
  - persist an idempotency record,
  - submit to NEAR,
  - commit nonce cache.
- Release lock.

2) **Redis Streams queue** (stronger fairness + observability)
- Enqueue tx request into stream `txq:{accountId}:{publicKey}` with `idempotencyKey`.
- A single consumer per key (or a consumer group with strict single-active-per-key) reads and executes sequentially.
- Workers can be horizontally scaled across keys (shard by key), but each key remains single-threaded.

Pros
- Works for multi-instance Node.
- Redis gives you visibility: queue length, latency, retries.

Cons
- Requires Redis (ops burden).
- Lock-based approach needs careful TTL/renewal to avoid split-brain.

### Option B (recommended for Workers): Cloudflare Durable Object “Tx Manager”
Durable Objects give you a natural single-threaded execution context per key.

- One DO instance per access key: `doId = hash(relayerAccountId + ':' + relayerPublicKey)`.
- DO receives tx intents and executes them sequentially.
- DO maintains:
  - `lastCommittedNonce` (durable storage),
  - `inflight` map keyed by `idempotencyKey` (durable storage),
  - optional `recentBlockHash` cache (in-memory, short TTL).

Pros
- No external Redis needed on Workers.
- Strong ordering: DO event loop is already serialized.

Cons
- DO becomes a critical path; you must shard via multiple access keys for throughput.
- Requires careful internal auth to prevent arbitrary signing.

### Option C (throughput lever, complements A/B): Multiple relayer access keys + sharding
Regardless of Redis/DO, the real scale lever is **multiple relayer access keys**:
- Add N full-access keys to the relayer account.
- Each key has its own nonce, so you can process N txs concurrently (one FIFO per key).
- Assign requests to keys via consistent hashing (e.g., by `new_account_id`, or by `idempotencyKey`).

This can dramatically reduce contention while preserving nonce safety.

## Proposed architecture

### 1) Introduce a server-side `TxManager` abstraction
Add a small interface (conceptually):
- `execute(key, idempotencyKey, buildAndSendFn) -> { txHash, outcome }`

Where `key = { relayerAccountId, relayerPublicKey }` and `buildAndSendFn` is the existing logic that:
- fetches block hash,
- computes nonce,
- signs with relayer key,
- sends via NEAR RPC.

Backends:
- `InMemoryTxManager` (current behavior; dev-only)
- `RedisTxManager`
- `DurableObjectTxManager`

### 2) Make idempotency a first-class input
For any relayer transaction with side effects, require/provide:
- `idempotencyKey` (string) — stable across client retries

Storage semantics:
- First caller “wins” and executes.
- Subsequent calls with same key return the stored result (tx hash/outcome or “inflight” status).

Recommended sources of idempotency keys:
- Account creation: `create:{new_account_id}:{clientNearPublicKey}` (or a UUID minted client-side and persisted)
- Delegate relaying: `delegate:{hash}` (NEP-461 hash is already stable)
- Email recovery: `recovery:{accountId}:{emailMessageId}` (or deterministic digest)

### 3) Recovery rules (retry safety)
The failure modes that matter:
- **Send succeeded but client didn’t see response** (network drop after submission)
- **Send never happened** (crash before submission)
- **InvalidNonce** (stale nonce / concurrent sender)

Plan rules:
- Persist the “tx attempt” record *before* broadcasting (store `signedTxHash`, `nonce`, and an “inflight” marker).
- On retry:
  - If inflight record exists: poll tx status by hash (do not re-sign with a new nonce blindly).
  - If NEAR returns `InvalidNonce`: refresh on-chain nonce and re-drive from queue (this indicates another tx landed first).

## Data model (suggested)

### Redis (Option A)
- Lock:
  - `txlock:{accountId}:{publicKey} -> token` (TTL, e.g. 10–30s; renew if needed)
- Nonce cache:
  - `txnonce:{accountId}:{publicKey} -> lastCommittedNonce` (integer/string)
- Idempotency:
  - `txidem:{idempotencyKey} -> { status: inflight|done|failed, txHash?, outcome?, updatedAt }` (TTL days)
- Optional queue:
  - `txq:{accountId}:{publicKey}` as Redis Stream

### Durable Object (Option B)
- DO storage keys:
  - `nonce:lastCommitted -> number`
  - `idem:{idempotencyKey} -> { status, txHash, outcome, ... }`

## Integration points (codebase)
- Replace `AuthService.queueTransaction` (in-memory) with `txManager.execute(...)`.
- Ensure Cloudflare Worker doesn’t rely on in-memory queue (it currently re-creates `AuthService` per request).
- Delegate relaying: implement nonce safety + replay protection as part of the same tx manager work.

Key file references:
- `sdk/src/server/core/AuthService.ts` (current in-process queue)
- `sdk/src/server/delegateAction/index.ts` (nonce/replay currently left to integrator)
- `examples/relay-cloudflare-worker/src/worker.ts` (per-request service creation)

## Action items
[ ] Define `TxManager` interface + default in-memory backend (preserve current behavior for single-process dev).
[ ] Add `idempotencyKey` plumbing to all relayer tx entrypoints (account creation, delegate relaying, recovery).
[ ] Implement `RedisTxManager` (lock + nonce cache + idempotency store); document required Redis config and TTLs.
[ ] Implement `DurableObjectTxManager` (serialized execution + durable nonce/idempotency state).
[ ] Add optional “multi access key” sharding strategy (config + key selection) to increase throughput safely.
[ ] Update relay examples (Express + Worker) to use the new manager backend appropriate to runtime.
[ ] Add regression tests:
  - concurrent requests across two “instances” => no `InvalidNonce`
  - crash/retry => idempotency returns same tx hash/outcome
  - worker mode => serialized per key via DO
[ ] Add observability hooks/metrics (queue depth, lock contention, invalid nonce count, mean send latency).

## Testing and validation
- Unit: simulate 50–200 concurrent submissions to the same relayer key and assert single ordered execution.
- Integration: run 2 relay-server processes against the same Redis and ensure account creation does not intermittently fail.
- Cloudflare: load test against DO-backed worker; verify ordering + idempotency.

## Risks and edge cases
- Lock TTL expiry mid-operation (Redis): can cause two workers to submit concurrently unless lock renewal is correct.
- NEAR RPC transient failures: must not cause “re-sign with new nonce” if tx might already be in-flight.
- Throughput: single access key is inherently single-threaded; sharding across multiple access keys is required for high QPS.
- Storage growth: idempotency records need TTL/retention policy and structured logging for audit/debug.

## Open questions
- Do we want the tx manager to **sign+send internally** (strongest ordering) or only allocate nonces (requires stricter client discipline)?
- What is the preferred throughput model for enterprise deployments: “many access keys” vs “one key + queue”?
