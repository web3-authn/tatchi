# Threshold Relayer Server — Deterministic Relayer Share + Minimal State

## Goal
Make the relayer **stateless for long-lived threshold share material** by deterministically deriving the relayer signing share from a relayer master secret plus client-provided (public) binding data.

This does **not** eliminate short-lived FROST protocol state. The relayer still needs **TTL-backed state** for:
- 2-round signing sessions (commitments/nonces),
- threshold auth sessions (JWT/cookie remaining uses + expiry).

## Share modes (implemented)

The relayer supports three modes via `THRESHOLD_ED25519_SHARE_MODE`:
- `auto` (default): use deterministic derivation if `THRESHOLD_ED25519_MASTER_SECRET_B64U` is set, otherwise use KV/in-memory share storage.
- `derived`: **always** derive the relayer signing share on demand (requires `THRESHOLD_ED25519_MASTER_SECRET_B64U`).
- `kv`: **always** require the share to be persisted (Redis/Upstash/in-memory; in-memory is dev-only).

## What state is stored (and why)

### Long-lived secret (required in `derived`)
- `THRESHOLD_ED25519_MASTER_SECRET_B64U` (32 bytes, base64url) shared by all relayer instances in the cluster.

### TTL KV state (recommended for prod; in-memory fallback exists)
- **Threshold auth sessions** (`POST /threshold-ed25519/session`): stores `{ relayerKeyId, userId, rpId, expiresAtMs }` and a separate `remainingUses` counter.
- **FROST signing sessions** (`/threshold-ed25519/sign/*`):
  - `mpcSessionId` record (one-shot, TTL): includes `clientVerifyingShareB64u` so relayer can re-derive in derived mode.
  - `signingSessionId` record (one-shot, TTL): includes `clientVerifyingShareB64u` + `userId` + `rpId` for the same reason.

### Optional KV state (only in `kv` share mode)
- **Relayer signing share store** keyed by `relayerKeyId` (the group public key).

## Deterministic derivation (conceptual)

The relayer signing share is derived from:
- relayer master secret (private),
- `{ nearAccountId/userId, rpId }` (binding),
- `clientVerifyingShareB64u` (public, 32 bytes),
and then converted into an Ed25519 scalar (rejecting zero).

The relayer recomputes `computedGroupPk` and enforces:
- `computedGroupPk == relayerKeyId` (anti key-injection / mismatch protection)
- `relayerKeyId` is an **active access key** on `nearAccountId` (scope hardening)

## API requirements (derived mode)
- `POST /threshold-ed25519/session` must include `clientVerifyingShareB64u` so the relayer can validate/derive.
- `POST /threshold-ed25519/authorize` must include `clientVerifyingShareB64u` (even when using a session token) for the same reason.

## Ops notes

### Generating the master secret
Use a KMS/secret manager in production. For local dev:

```sh
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

### Cluster/serverless requirements
- All instances must share the same `THRESHOLD_ED25519_MASTER_SECRET_B64U`.
- Use Upstash/Redis for **auth session** + **signing session** TTL state (in-memory is not safe across restarts/instances).

### TTL KV configuration
- Upstash REST: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`
- Redis TCP (Node only): `REDIS_URL`
- Optional key prefixes (to avoid collisions in shared Redis):
  - `THRESHOLD_ED25519_AUTH_PREFIX` (threshold auth sessions)
  - `THRESHOLD_ED25519_SESSION_PREFIX` (FROST signing sessions)
  - `THRESHOLD_ED25519_KEYSTORE_PREFIX` (relayer share store; only used in `kv` mode)

## Remaining high-value work
- Add E2E “relayer restart” regression test for `derived` mode.
- Add negative tests:
  - wrong `clientVerifyingShareB64u` → `group_pk_mismatch`
  - `relayerKeyId` not an on-chain access key → reject
  - session exhausted → client falls back to WebAuthn prompt
