# Threshold Ed25519 Tests (reference)

Goal: high-signal, deterministic browser + relayer integration tests for **threshold Ed25519 (2p FROST)**.

This test suite focuses on proving:
- Enrollment is non-custodial and cannot be key-injected.
- Signing is truly 2-round FROST end-to-end (client share + relayer share).
- Authorization is tightly scoped (VRF/WebAuthn bound to exact intent + digest).
- Failures are “hard” (no silent fallback to local signing when threshold-signer is requested).

## Test harness (recommended)

Use Playwright “blank page” harness (same-origin) plus an in-process Express relayer router:
- Browser: `sdk/src/__tests__/setup/setupBasicPasskeyTest` with `/__test_blank.html`.
- Relayer: `createRelayRouter(new AuthService(...), { corsOrigins: [frontendOrigin] })` + `startExpressRouter`.
- NEAR RPC: mock JSON-RPC (block, view_access_key, view_access_key_list, call_function, send_tx) with an in-memory:
  - `keysOnChain: Set<publicKey>`
  - `nonceByPublicKey: Map<publicKey, nonce>`

Important: threshold relayer endpoints are called with `credentials: 'include'`, so CORS must:
- Echo `Origin` (not `*`) and
- Set `Access-Control-Allow-Credentials: true`.

Important: `/threshold-ed25519/sign/*` is **coordinator-gated**. Ensure the relayer is running as the coordinator (`THRESHOLD_NODE_ROLE=coordinator`, now the default).

## Current coverage (implemented)

**Browser e2e**
- FROST signing happy-path (enroll → AddKey(threshold pk) → threshold sign near_tx):
  - `sdk/src/__tests__/e2e/thresholdEd25519.frostSigning.test.ts`
- Digest binding negative tests (tamper `/authorize` body):
  - `sdk/src/__tests__/e2e/thresholdEd25519.digestBinding.test.ts`
    - `intent_digest_mismatch` (mutate `signingPayload`)
    - `signing_digest_mismatch` (mutate `signing_digest_32`)

**Relayer (node-only)**
- Scope semantics (single-use `mpcSessionId`, consumed `signingSessionId`, digest binding sanity):
  - `sdk/src/__tests__/relayer/threshold-ed25519.scope.test.ts`

**Enrollment/rotation (browser integration tests, but mostly mocked relayer)**
- Option B post-registration activation + vault storage:
  - `sdk/src/__tests__/unit/thresholdEd25519.optionB.registration.integration.test.ts`
- Rotation helper: keygen → AddKey new → DeleteKey old:
  - `sdk/src/__tests__/unit/thresholdEd25519.rotation.integration.test.ts`

## Running

- Build SDK + workers (ensures Playwright imports a fresh `dist/`):
  - `pnpm -C sdk build`
- Run only threshold e2e tests:
  - `pnpm -C sdk exec playwright test src/__tests__/e2e/thresholdEd25519.* --reporter=line`
- Run full e2e suite:
  - `pnpm -C sdk test:e2e`
