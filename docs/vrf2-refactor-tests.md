# VRF v2 Refactor – Test Plan

This doc tracks what needs to change in the existing unit tests and shared test setup for the VRF‑centric SecureConfirm/WrapKeySeed refactor.

The focus is:
- SecureConfirm ownership moving from signer → VRF.
- WrapKeySeed‑only signer worker (no PRF/`vrf_sk` in payloads).
- Session‑bound WrapKeySeed channel between VRF and signer workers.

---

## 0. Test setup changes

The Playwright setup utilities under `sdk/src/__tests__/setup` need to reflect the new VRF‑centric architecture so tests exercise the correct workers and invariants.

### 0.1 Global test setup (`setupBasicPasskeyTest`, `executeSequentialSetup`)

**Files:**
- `sdk/src/__tests__/setup/index.ts`
- `sdk/src/__tests__/setup/bootstrap.ts`

- [x] Update comments to reflect the VRF‑centric architecture:
  - Note explicitly that:
    - VRF worker owns WebAuthn PRF + SecureConfirm via `awaitSecureConfirmationV2`.
    - Signer worker is now a WrapKeySeed/KEK/NEAR‑signature enclave only.
- [ ] Ensure the cross‑origin worker shim (`forceSameOriginWorkers` and `forceSameOriginSdkBase`) supports both signer and VRF workers:
  - Confirm that the Worker URL patching correctly normalizes `/sdk/workers/web3authn-vrf.worker.js` as well as `/sdk/workers/web3authn-signer.worker.js`.
  - Add a short comment explaining that the shim is required for both workers now that VRF owns SecureConfirm.
- [ ] Keep `executeSequentialSetup` behavior intact (virtual authenticator, import map, dynamic imports, fallbacks); no functional changes needed, just doc comments to align with VRF v2 invariants.

### 0.2 WebAuthn mocks (`webauthn-mocks.ts`)

**File:** `sdk/src/__tests__/setup/webauthn-mocks.ts`

- [ ] Confirm PRF mocks are consistent with VRF flows:
  - Registration:
    - Dual PRF outputs (`first` + `second`) are available for flows that need both AES and Ed25519 derivation.
  - Authentication:
    - PRF results for signing and decrypt/export mimic the extension shape confirmTxFlow expects (`results.first` / `results.second`).
- [x] Add a small VRF‑specific note in comments:
  - Highlight that `createMockPRFOutput` is used to generate deterministic PRF outputs that drive:
    - VRF keypair bootstrap/unlock in tests.
    - WrapKeySeed derivation in VRF worker (through `derive_wrapKeySeed_and_session`).
- [ ] No behavioral code changes required for the refactor itself; this file already returns dual PRF outputs and deterministic userHandle, which VRF v2 relies on.

### 0.3 Test utilities + globals (`test-utils.ts`)

**File:** `sdk/src/__tests__/setup/test-utils.ts`

- [x] Update the `testUtils` surface to expose VRF‑aware helpers/documentation:
  - Add comments that:
    - `passkeyManager.webAuthnManager` now orchestrates VRF‑owned signing sessions via `withSigningSession`.
    - Signer worker no longer initiates SecureConfirm or sees PRF.
  - Optionally expose a small helper on `testUtils` for debugging VRF status:
    - e.g. `testUtils.vrfStatus = () => passkeyManager.webAuthnManager.generateVrfChallenge(...)` (or a simple wrapper that calls `checkVrfStatus` if available).
- [ ] Keep the existing NonceManager patching in place (block‑only fallback + mock `reserveNonces`), but:
  - Add a short comment noting that confirmTxFlow tests rely on this when NonceManager has not yet been initialized with a user.

### 0.4 Types (`types.ts`)

**File:** `sdk/src/__tests__/setup/types.ts`

- [x] No shape changes required, but document that:
  - `PasskeyTestConfig` is used to configure VRF worker behavior via `vrfWorkerConfigs` inside `TatchiPasskey`.
  - VRF2 flows assume `nearRpcUrl` and `contractId` are configured so VRF challenges and VRF‑driven signing can reuse the same NearClient.

---

## 1. awaitSecureConfirmationV2 tests

**File:** `sdk/src/__tests__/unit/awaitSecureConfirmationV2.test.ts`

- [x] Switch the worker bundle under test from the signer worker to the VRF worker:
  - Use `/sdk/workers/web3authn-vrf.worker.js` instead of `/sdk/workers/web3authn-signer.worker.js`.
  - Update comments to reflect that `awaitSecureConfirmationV2` is now owned by the VRF worker.
- [x] Keep the existing error‑handling matrix but exercise the VRF bridge:
  - Invalid JSON / missing required fields → `invalid V2 request JSON` error.
  - Aborted via `AbortController` → `confirmation aborted`.
  - Timeout with no response → `confirmation timed out`.
  - Mismatched `requestId` in `USER_PASSKEY_CONFIRM_RESPONSE` → ignore and eventually time out.
- [x] Add a tiny “happy path” sanity check:
  - Drive a LocalOnly `DECRYPT_PRIVATE_KEY_WITH_PRF` or a minimal `REGISTER_ACCOUNT` request through `awaitSecureConfirmationV2` (using stubs/mocks for the confirmTxFlow handler) and assert the resolved value matches `WorkerConfirmationResponse` shape (no PRF/WrapKeySeed/WrapKeySalt in signing responses).

---

## 2. confirmTxFlow tests

### 2.1 `confirmTxFlow.successPaths.test.ts`

**File:** `sdk/src/__tests__/unit/confirmTxFlow.successPaths.test.ts`

- LocalOnly flow (decrypt):
  - [x] Keep expectation that `DECRYPT_PRIVATE_KEY_WITH_PRF` returns `credential + prfOutput` for LocalOnly export/decrypt flows.
  - [x] Explicitly assert that LocalOnly responses **do not** include `wrapKeySeed` or `wrapKeySalt` fields.
- Registration flow:
  - [x] Confirm current expectations match VRF‑centric behavior:
    - `confirmed === true`.
    - `vrfChallenge` present and derived from VRF bootstrap (bootstrap VRF output is preserved through any JIT refresh).
    - `transactionContext.nextNonce` matches reserved nonces.
  - [x] Add an explicit assertion that `prfOutput` is **absent** from the registration success response (PRF is extracted later in VRF‑owned flows).
- Signing flow:
  - [x] Update expectations to reflect PRF‑free signing responses:
    - `confirmed === true`.
    - `transactionContext` present and uses reserved nonces.
    - `vrfChallenge` present.
    - `intentDigest` echoed back when provided.
  - [x] **Remove** assertions that `resp.prfOutput` exists; instead assert that `prfOutput` is `undefined`.
  - [x] Assert that wrap‑key fields are not present in the response (WrapKeySeed remains confined to VRF↔Signer channel).
- NEP‑413 flow (new):
  - [x] Add a new “success path” test for `SecureConfirmationType.SIGN_NEP413_MESSAGE` using `handlePromptUserConfirmInJsMainThread`:
    - Stub `nonceManager`, `nearClient`, `vrfWorkerManager`, and `touchIdPrompt.getAuthenticationCredentialsInternal` similarly to the signing test.
    - Ensure the response includes:
      - `confirmed === true`.
      - `vrfChallenge` present.
      - `transactionContext` present.
      - No `prfOutput` or wrap‑key fields.
  - [ ] Add a VRF-driven link-device success path (Device2 registration-style confirm) that mirrors signing expectations:
    - `confirmed === true`, `vrfChallenge` present, `transactionContext` set.
    - Assert `prfOutput`, `wrapKeySeed`, and `wrapKeySalt` are absent; signer never receives PRF for link-device signing.
  - [ ] Add a regression that `USER_PASSKEY_CONFIRM_RESPONSE` for all signing/registration/link flows omits `prfOutput`/`wrapKeySeed` and returns only credential + VRF context + transactionContext.

  - [ ] Add Device2-specific storage/broadcast regressions:
    - Post‑swap registration signing uses stored credential (no second TouchID).
    - Deterministic NEAR key and VRF credentials are stored with the correct `wrapKeySalt`/`deviceNumber`.
    - Intent digest for registration uses `{receiverId, actions}` only (no nonce).
    - Nonce reconciliation happens after swap and registration broadcast.

### 2.2 `confirmTxFlow.defensivePaths.test.ts`

**File:** `sdk/src/__tests__/unit/confirmTxFlow.defensivePaths.test.ts`

- Cancel paths:
  - [x] Current tests already assert:
    - Signing cancel releases all reserved nonces.
    - Registration cancel releases all reserved nonces.
    - `SHOW_SECURE_PRIVATE_KEY_UI` keeps the viewer mounted and returns `confirmed: true`.
    - NEP‑413 cancel releases reserved nonces and returns `confirmed: false`.
- Missing PRF tests:
  - [x] Existing tests assert that missing PRF for signing and registration flows throws with `Missing PRF result`.
  - [ ] Confirm these tests still trigger the updated error messages (adjust string matching if messages changed but semantics remain the same).

### 2.3 `confirmTxFlow.common.helpers.test.ts`

**File:** `sdk/src/__tests__/unit/confirmTxFlow.common.helpers.test.ts`

- [ ] Keep current coverage for:
  - `sanitizeForPostMessage` stripping `_confirmHandle` and function properties.
  - `parseTransactionSummary` behavior.
- [ ] Add a small regression that confirms `sanitizeForPostMessage` also strips any future function‑typed fields to avoid accidentally leaking handlers on the main thread.

### 2.4 `confirmTxFlow.determineConfirmationConfig.test.ts`

**File:** `sdk/src/__tests__/unit/confirmTxFlow.determineConfirmationConfig.test.ts`

- [x] Existing tests already cover:
  - Override merging for signing flows.
  - Decrypt defaulting to `uiMode: 'skip'`.
  - Registration/link clamping to `modal + requireClick` inside iframes.
- [x] Add a regression for the `SHOW_SECURE_PRIVATE_KEY_UI` case:
  - Assert it inherits the same theme and uses `drawer` or `modal` appropriately for viewer flows.

### 2.5 `handleSecureConfirmRequest.test.ts`

**File:** `sdk/src/__tests__/unit/handleSecureConfirmRequest.test.ts`

- [x] Existing coverage:
  - Unsupported `type` → structured error envelope with `confirmed: false`.
  - Missing payload → `Invalid secure confirm request`.
- [x] Add a VRF‑specific guard test:
  - Ensure that if a signing request envelope includes `prfOutput` or `wrapKeySeed` in the payload, the handler either:
    - Rejects the request outright, or
    - Drops these fields before passing through to flows.
  - This complements signer‑side guards and ensures main‑thread orchestrator doesn’t reintroduce secrets into envelopes.

---

## 3. Wallet iframe + export routing tests

These tests mostly validate routing/UX; they do not need deep VRF changes, but we should add VRF‑specific checks where useful.

### 3.1 `export_ui.routing.unit.test.ts`

**File:** `sdk/src/__tests__/unit/export_ui.routing.unit.test.ts`

- [x] Already asserts:
  - If `WalletIframeRouter.exportNearKeypairWithUI` fails to post, it falls back to offline export.
- [ ] Add a VRF‑aware regression:
  - Ensure `exportNearKeypairWithUI` still delegates to the worker‑driven export pipeline and does **not** attempt to fetch or return private keys to the dApp (i.e., confirm UI is the only place the key is shown).

### 3.2 Offline export tests

**Files:**
- `sdk/src/__tests__/unit/offline-open.unit.test.ts`
- `sdk/src/__tests__/unit/offline_export_fallback.unit.test.ts`
- `sdk/src/__tests__/unit/router.offline-open.unit.test.ts`

- [x] Already validate query parameter wiring and fallback behavior.
- [ ] Nothing VRF‑specific required; just keep them green after export refactor (update only if function signatures change).

### 3.3 `overlayController.test.ts` and `progressBus.defaultPhaseHeuristics.test.ts`

**Files:**
- `sdk/src/__tests__/unit/overlayController.test.ts`
- `sdk/src/__tests__/unit/progressBus.defaultPhaseHeuristics.test.ts`

- [ ] No VRF‑specific changes needed; ensure they still pass with the new confirm UI lifecycle.
- [ ] Consider adding a simple regression that `TX_CONFIRMER_CANCEL` events used in defensive tests don’t leave the overlay stuck visible.

### 3.4 Export flow regressions

**Files:**
- `sdk/src/__tests__/unit/export_ui.routing.unit.test.ts`
- `sdk/src/__tests__/unit/awaitSecureConfirmationV2.test.ts` (LocalOnly decrypt path)
- `sdk/src/__tests__/unit/overlayController.test.ts` (overlay teardown)

- [ ] Assert `exportNearKeypairWithUI` returns `{ privateKey: '' }` to callers and only the in-iframe viewer renders the plaintext (UI-only surface).
- [ ] Verify export uses a single LocalOnly `DECRYPT_PRIVATE_KEY_WITH_PRF` prompt and gates decrypt on `waitForSeedReady`; no extra TouchID/WebAuthn prompts fire.
- [ ] Confirm `WALLET_UI_CLOSED` is emitted on confirm/cancel so overlays/iframe state are cleaned up and cannot get stuck.

---

## 4. Nonce, headers, Safari fallbacks, and user handle tests

These are largely orthogonal to VRF, but they underpin confirmTxFlow and WebAuthn behavior; keep them aligned with any indirect changes.

### 4.1 `nonceManager.test.ts`

**File:** `sdk/src/__tests__/unit/nonceManager.test.ts`

- [x] Current tests cover:
  - Basic nonce reservation, release, and clear.
  - Batch transaction scenarios.
  - Error handling for missing transaction context.
  - Consecutive transaction simulation.
- [ ] Add a regression focused on VRF‑driven confirm flows:
  - Simulate `reserveNonces` being used for multi‑tx signing and ensure `releaseNonce` is called when confirmTxFlow cancels or fails (mirroring what the confirmTxFlow tests already assert at a higher level).

### 4.2 Header / CSP tests

**Files:**
- `sdk/src/__tests__/unit/headers.unit.test.ts`
- `sdk/src/__tests__/unit/next-headers.unit.test.ts`
- `sdk/src/__tests__/unit/vite-headers.unit.test.ts`

- [ ] No VRF‑specific changes; keep verifying that:
  - `worker-src` and `frame-src` directives still allow loading signer and VRF workers from the wallet origin.
  - Any new worker paths introduced by the refactor continue to satisfy the CSP.

### 4.3 Safari fallbacks

**File:** `sdk/src/__tests__/unit/safari-fallbacks.test.ts`

- [x] Today: tests cancellation vs timeout behavior for WebAuthn get/create with Safari bridge.
- [ ] Confirm that VRF‑driven confirm flows still use the same fallback helper, and adjust tests only if:
  - The bridge message shape changes, or
  - Timeout/cancel messages need to surface more specific errors into confirmTxFlow.

### 4.4 User handle parsing

**File:** `sdk/src/__tests__/unit/userHandle.parse.test.ts`

- [ ] No VRF‑specific changes required; keep tests as is.

---

## 5. WASM module export + guard tests

### 5.1 `wasm-exports.test.ts`

**File:** `sdk/src/__tests__/unit/wasm-exports.test.ts`

- [x] Currently covers:
  - `wasm_signer_worker` exports (`init_worker`, `init_wasm_signer_worker`, `handle_signer_message`, enums).
- [x] Extend coverage to VRF module:
  - Add a test that imports `../../wasm_vrf_worker/pkg/wasm_vrf_worker.js` and asserts:
    - Core VRF entrypoints (`handle_message`, `attach_wrap_key_seed_port`) are exported.
    - `WorkerRequestType` / `WorkerResponseType` enums are present.
    - Shamir config helpers (`configure_shamir_p`, `configure_shamir_server_urls`) are exported.
- [ ] Add a regression that signer exports do **not** expose `awaitSecureConfirmationV2` or confirmation hooks anymore (VRF-only); assert absence in signer module exports.

### 5.2 Signer guard tests (Rust + JS)

**Files:**
- `sdk/src/wasm_signer_worker/src/tests/guard_tests.rs` (Rust)
- `sdk/src/core/web3authn-signer.worker.ts` (JS, covered via a dedicated guard test)

- [x] Rust tests already assert that:
  - PRF‑bearing payloads are rejected.
  - `vrf_sk` in payloads is rejected with the “Forbidden secret field” error.
- [x] Add a JS‑level unit test:
  - Load the signer worker bundle, send a message event with a payload containing `prfOutput` or `vrf_sk`, and assert:
    - The worker responds with an error containing “Forbidden secret field”.
    - Or the message handler throws, consistent with `assertNoPrfOrVrfSecrets` in `web3authn-signer.worker.ts`.
  - [ ] Add a quick smoke test that sending `SecureConfirmMessageType` traffic to signer is rejected (no SecureConfirm bridge present).

---

## 6. New tests around session orchestration

The VRF2 refactor introduced `withSigningSession` and explicit session binding between VRF and signer workers.

### 6.1 `withSigningSession` orchestration

**File:** (no dedicated test yet; to add)
- New unit test file under `sdk/src/__tests__/unit/webAuthnManager.withSigningSession.test.ts` (or similar).

- [ ] Add tests that:
  - Call `WebAuthnManager.withSigningSession` with a stub handler that:
    - Succeeds: verify that `SignerWorkerManager.reserveSigningSession` was called exactly once and `releaseSigningSession` is called after the handler resolves.
    - Throws: verify that `releaseSigningSession` is still called.
  - Assert that:
    - A `sessionId` is generated and passed consistently to:
      - `VrfWorkerManager.createSigningSessionChannel`.
      - `SignerWorkerManager.reserveSigningSession`.
      - Downstream signer calls (`signTransactionsWithActions`, `signNep413Message`, export, recovery).

### 6.2 Session binding for tx/NEP‑413/export/recovery

**Files:** (can be either new tests or extensions of existing ones)
- `confirmTxFlow` tests (signing + NEP‑413).
- New focused unit tests for:
  - `signTransactionsWithActions` handler.
  - `signNep413Message` handler.
  - `exportNearKeypairWithUIWorkerDriven`.
  - `recoverKeypairFromPasskey`.

- [ ] For each of these flows, verify:
  - A `sessionId` is present and is passed through from WebAuthnManager → SignerWorkerManager → signer worker payload.
  - Failure paths (timeout/error from signer worker) result in session cleanup (no lingering reserved workers/ports).
  - [ ] Include a timeout regression: when `waitForSeedReady` or signer response times out, `releaseSigningSession` frees the reserved worker and closes the MessagePort.

---

## 7. Summary

Once the above items are implemented:
- All SecureConfirm tests will be VRF‑centric (no signer‑owned confirmation).
- Signer worker will be fully PRF‑free at both TS and Rust levels, with tests guaranteeing that.
- The WrapKeySeed session/channel semantics will have explicit test coverage, including session creation, usage, and teardown.
