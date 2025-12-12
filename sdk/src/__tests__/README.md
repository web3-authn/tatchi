# Passkey SDK Test Suite

Playwright tests for the Passkey SDK, covering WebAuthn + PRF flows, wallet iframe behavior, Lit confirm UI, orchestrator logic, and VRF/nonce subsystems.

## Table of Contents

- [Suites & Scope](#suites--scope)
- [Coverage Overview](#coverage-overview)
- [Build & Assets](#build--assets)
- [Setup Architecture](#setup-architecture)
- [Fixtures & Helpers](#fixtures--helpers)
- [Running](#running)
- [Environment](#environment)
- [Suite Quick Reference](#suite-quick-reference)
- [Fixes & Learnings](#fixes--learnings)
- [Troubleshooting](#troubleshooting)
- [Gaps & Next Steps](#gaps--next-steps)

## Suites & Scope

- End‑to‑End: registration, login, actions, recovery, worker wiring
- Unit: orchestrator helpers, progress heuristics, nonce, confirm handler
- Wallet Iframe: handshake, overlay routing, sticky/anchored behavior
- Lit Components: modal/drawer host + iframe confirm UI

Playwright config includes wallet‑iframe and lit‑components suites in `testMatch`.

## Coverage Overview

- VRF + Nonce: strong unit/integration coverage
- Wallet Iframe: CONNECT→READY handshake, intent mapping, timeout hide, anchored pre‑show, sticky lifecycle; progress heuristics partially covered
- Confirm Orchestrator: success and defensive paths; batching and local‑only cancel remain
- Lit Confirm UI: host/iframe modal + drawer behavior covered; theme guardrails pending

Status highlights from recent additions:
- OnEventsProgressBus default heuristics for show/hide/none mapping and cancelled → hide
- Overlay controller CSS/ARIA semantics; sticky prevents hide
- Router behavior for pre‑show, timeout hide, anchored bounds, sticky lifecycle
- awaitSecureConfirmationV2 error handling via signer worker global
- confirmTxFlow success/defensive paths and helpers sanitization/parsing

## Build & Assets

- Build freshness check runs before tests; stale builds trigger `npm run build`
- Dev plugin serves SDK at `/sdk/*` directly from `dist/`
- Assets of interest:
  - `dist/esm/**` ES modules (SDK + embedded bundles)
  - `dist/cjs/**` CommonJS modules
  - `dist/workers/**` Worker bundles and WASM binaries

## Setup Architecture

The test bootstrap is a precise 5‑step sequence to avoid WebAuthn/import‑map races. It’s split for clarity:

- `passkey-sdk/src/__tests__/setup/bootstrap.ts`: `executeSequentialSetup()`
  1) WebAuthn Virtual Authenticator (Chromium CDP)
  2) Import map injection (NEAR + lit deps)
  3) Environment stabilization
  4) Dynamic import from `/sdk/esm/...` and instance wiring
  5) Global fallbacks (e.g., base64UrlEncode)

- `passkey-sdk/src/__tests__/setup/index.ts`:
  - `setupBasicPasskeyTest(page, overrides)` orchestrates the 5 steps
  - `handleInfrastructureErrors()` centralizes CI‑skip for faucet 429
  - `setupRelayServerTest()` / `setupTestnetFaucetTest()` presets

- `passkey-sdk/src/__tests__/setup/route-mocks.ts`: Playwright route mocks (relay/faucet/access-key/send-tx)
- `passkey-sdk/src/__tests__/setup/bypasses.ts`: RPC bypass (verify_authentication_response)
- `passkey-sdk/src/__tests__/setup/logging.ts`: quiet‑by‑default console capture (`VERBOSE_TEST_LOGS`)

## Fixtures & Helpers

- `passkey-sdk/src/__tests__/setup/fixtures.ts` extends Playwright `test` with:
  - `passkey.setup(overrides?)` to run bootstrap lazily
  - `passkey.withTestUtils(cb)` to run in browser with wired `testUtils`
  - `consoleCapture` to collect logs; prints only on failure unless verbose

- Flow helpers in `passkey-sdk/src/__tests__/setup/flows.ts`:
  - `registerPasskey(passkey, opts?)`
  - `loginPasskey(passkey, { accountId })`
  - `executeTransfer(passkey, { accountId, receiverId, amountYocto })`
  - `recoverAccount(passkey, { accountId })`

Example (see `e2e/complete_ux_flow.test.ts`):
```ts
import { test, expect } from '../setup/fixtures';
import { registerPasskey, loginPasskey } from '../setup/flows';

test('register → login', async ({ passkey }) => {
  const reg = await registerPasskey(passkey);
  expect(reg.success).toBe(true);
  const login = await loginPasskey(passkey, { accountId: reg.accountId });
  expect(login.success).toBe(true);
});
```

## Running

- Root scripts:
  - `pnpm test` → `pnpm -C passkey-sdk test`
  - `pnpm test:inline` → line reporter
  - `pnpm test:unit`, `pnpm test:wallet-iframe`, `pnpm test:lit-components`
  - `pnpm show-report` to open Playwright HTML report

- Direct Playwright subset examples:
```bash
pnpm -C passkey-sdk exec playwright test **/e2e/**/*.test.ts
pnpm -C passkey-sdk exec playwright test **/unit/**/*.test.ts
```

Chromium only; `workers=1` to avoid relay/faucet rate limits.

## Environment

- `USE_RELAY_SERVER=1` run with relay (fast path, no .env)
- `RELAY_PROVISION_TTL_MINUTES=720` control relay provision cache TTL
- `FORCE_RELAY_REPROVISION=1` ignore cache and reprovision
- `REUSE_EXISTING_RELAY_ENV=1` keep existing `.env`
- `VERBOSE_TEST_LOGS=1` print captured console logs live

Manual build without tests:
```bash
pnpm -C passkey-sdk build
```

## Suite Quick Reference

- E2E
  - `e2e/complete_ux_flow.test.ts` lifecycle: register → login → action → recovery
  - `e2e/worker_events.test.ts` signer/vrf worker wiring and events
  - `e2e/nonceManager.test.ts` reserved nonce lifecycle in real session
  - `e2e/cancel_overlay_contracts.test.ts` cancel + contract verification bypass
  - `e2e/debug_*` import map and setup diagnostics

- Unit
  - `unit/confirmTxFlow.successPaths.test.ts` register/sign/local‑only success
  - `unit/confirmTxFlow.defensivePaths.test.ts` cancel releases nonces, PRF errors
  - `unit/confirmTxFlow.determineConfirmationConfig.test.ts` override precedence
  - `unit/confirmTxFlow.common.helpers.test.ts` sanitization + summary parsing
  - `unit/awaitSecureConfirmationV2.test.ts` error/abort/timeout/mismatch via worker global
  - `unit/progressBus.defaultPhaseHeuristics.test.ts` phase → visibility mapping
  - `unit/overlayController.test.ts` aria/anchor/sticky behavior
  - `unit/handleSecureConfirmRequest.test.ts` request handler behavior

- Wallet Iframe
  - `wallet-iframe/handshake.test.ts` CONNECT→READY handshake
  - `wallet-iframe/router.behavior.test.ts` pre‑show, timeout hide, anchored overlay
  - `wallet-iframe/router.behavior.sticky.test.ts` sticky lifecycle + cancelAll
  - `wallet-iframe/router.computeOverlayIntent.test.ts` intent mapping

- Lit Components
  - `lit-components/confirm-ui.host-and-iframe.test.ts` modal/drawer confirm/cancel
  - `lit-components/confirm-ui.handle.test.ts` handle.update/close DOM asserts
  - `lit-components/button-with-tooltip.test.ts` behavior + themes

## Fixes & Learnings

- Use signer worker bundle for `awaitSecureConfirmationV2`; read export from global, not `/sdk/esm` direct
- Target the iframe with `allow` containing `publickey-credentials` in tests
- Router hide asserts should check `aria-hidden` and 0×0 with opacity 0
- Registration VRF JIT path may reuse bootstrap challenge in tests
- Multi‑iframe overlay selection: the example app (examples/vite) mounts its own wallet iframe via `PasskeyProvider`, so tests often see two wallet iframes. Naive selection picked the hidden 0×0 iframe and caused false “overlay not visible” failures. Fix:
  - Tag test‑owned iframes by constructing routers with `testOptions: { ownerTag: 'tests' }`.
  - Centralize selection in `captureOverlay()` (harness.ts): prefer `iframe[data-w3a-owner="tests"]`, else choose the interactive candidate (pointer‑enabled, opacity>0, not `aria-hidden`), else fall back to the newest candidate. Inline confirmer host also counts as visible.
  - Router now exposes `getIframeEl()` and `getOverlayState()` to aid diagnostics (test‑only usage).
- Test‑only options: router/transport accept a `testOptions` bag (`routerId`, `ownerTag`, `autoMount`) to aid Playwright without affecting app API.
- Handshake/WebAuthn bridge: replying to the requesting window with `'*'` target after origin validation removes transient `'null'` origin warnings on Safari‑like early navigation without weakening safety.

## Troubleshooting

### Wallet iframe READY timeout under COEP

Chromium enforces COEP. If the initial `CONNECT` is posted with `targetOrigin='*'`, the transferable `MessagePort` is discarded and `READY` never arrives.

To keep iframe tests stable:
- Post initial `CONNECT` to the exact wallet origin (for example `https://wallet.example.localhost`).

## Gaps & Next Steps

- Strengthen lifecycle assertions around sticky flows (handoff and final hide)
- Local‑only cancel flow should release nonce and emit structured error
- Theme regression guardrails for confirm UI (light vs dark tokens)
- Consider gating `data-w3a-router-id` to debug/test builds only (cosmetic)
- Optional: convenience `waitForOverlayShown/Hidden` helpers in harness (wrap `captureOverlay` + `waitFor`)
- Keep the wallet stub aligned with production host: adopt ports, reply to `PM_CANCEL` with `ERROR{ code: 'CANCELLED' }`, emit expected phases (e.g., `user-confirmation`) so overlay assertions have signal

If you update the handshake logic, re-run:

```bash
pnpm exec playwright test src/__tests__/wallet-iframe/playwright/handshake.test.ts --project=chromium
pnpm exec playwright test src/__tests__/e2e/cancel_overlay_contracts.test.ts --project=chromium
```

These cover both the transport handshake and the overlay cancel contract that depends on the simulated progress events.
