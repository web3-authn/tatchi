# Threshold Ed25519 Tests Plan

Goal: high-signal, deterministic browser + relayer integration tests for **threshold Ed25519 (2p FROST)**.

This plan focuses on proving:
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
- [x] FROST signing happy-path (enroll → AddKey(threshold pk) → threshold sign near_tx):
  - `sdk/src/__tests__/e2e/thresholdEd25519.frostSigning.test.ts`
- [x] Digest binding negative tests (tamper `/authorize` body):
  - `sdk/src/__tests__/e2e/thresholdEd25519.digestBinding.test.ts`
    - `intent_digest_mismatch` (mutate `signingPayload`)
    - `signing_digest_mismatch` (mutate `signing_digest_32`)

**Relayer (node-only)**
- [x] Scope semantics (single-use `mpcSessionId`, consumed `signingSessionId`, digest binding sanity):
  - `sdk/src/__tests__/relayer/threshold-ed25519.scope.test.ts`

**Enrollment/rotation (browser integration tests, but mostly mocked relayer)**
- [x] Option B post-registration activation + vault storage:
  - `sdk/src/__tests__/unit/thresholdEd25519.optionB.registration.integration.test.ts`
- [x] Rotation helper: keygen → AddKey new → DeleteKey old:
  - `sdk/src/__tests__/unit/thresholdEd25519.rotation.integration.test.ts`

## Critical e2e tests to add (TODO)

### Phase 1 — Enrollment security (anti key-injection)

- [ ] **Keygen integrity (anti key-injection)**:
  - Intercept `/threshold-ed25519/keygen` response and tamper:
    - `publicKey` (replace with attacker key), and/or
    - `relayerVerifyingShareB64u` (mismatch vs computed group key).
  - Expect: `enrollThresholdEd25519Key()` rejects (group pk mismatch) and does **not** submit `send_tx` AddKey.
  - File: `sdk/src/__tests__/e2e/thresholdEd25519.keygenIntegrity.test.ts`

### Phase 2 — “On-chain activation required” scope

- [ ] **Threshold signing requires threshold key to be an access key**:
  - Omit threshold pk from mocked `view_access_key_list`.
  - Expect: `/threshold-ed25519/authorize` → 401 (`…not an active access key…`), and client returns a hard error.
  - File: `sdk/src/__tests__/e2e/thresholdEd25519.onchainScope.test.ts`

### Phase 3 — Protocol transcript tamper

- [ ] **Tamper `/sign/init` commitments**:
  - Alter `relayerCommitments` or `relayerVerifyingShareB64u`.
  - Expect: client fails in round2/aggregate (no signature).
- [ ] **Tamper `/sign/finalize` signature share**:
  - Flip a byte in `relayerSignatureShareB64u`.
  - Expect: aggregate fails or signature verification fails (and error is surfaced).
  - File: `sdk/src/__tests__/e2e/thresholdEd25519.frostTamper.test.ts`

### Phase 4 — “No silent downgrade” behavior

- [ ] **Relayer outage / 5xx**:
  - Make `/authorize` or `/sign/*` return 5xx (or force network error).
  - Expect: `signerMode: 'threshold-signer'` returns an error and does **not** local-sign.
  - File: `sdk/src/__tests__/e2e/thresholdEd25519.relayerFailure.test.ts`

### Phase 5 — Coverage of all signing surfaces

- [ ] **Threshold NEP-413 happy-path**:
  - Ensure signature verifies under threshold pk.
  - File: `sdk/src/__tests__/e2e/thresholdEd25519.nep413Signing.test.ts`
- [ ] **Threshold delegate (NEP-461) happy-path**:
  - Ensure signature verifies under threshold pk.
  - File: `sdk/src/__tests__/e2e/thresholdEd25519.delegateSigning.test.ts`
- [ ] **Batch threshold signing (2 txs)**:
  - Ensure both signatures verify, and relayer endpoints are called per digest as expected.
  - File: `sdk/src/__tests__/e2e/thresholdEd25519.batchSigning.test.ts`

## Running

- Build SDK + workers (ensures Playwright imports a fresh `dist/`):
  - `pnpm -C sdk build`
- Run only threshold e2e tests:
  - `pnpm -C sdk exec playwright test src/__tests__/e2e/thresholdEd25519.* --reporter=line`
- Run full e2e suite:
  - `pnpm -C sdk test:e2e`
