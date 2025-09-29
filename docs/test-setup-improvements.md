# Test Setup Improvements

This document captures concrete opportunities to:

- Refactor the test setups
- Make test running more robust
- Make it easier to add new tests


## Summary

- Split the 5‑step environment bootstrap from per‑test utilities to reduce coupling.
- Provide Playwright fixtures for PasskeyManager and console capture to simplify tests.
- Centralize mocks/intercepts (RPC bypass, faucet/relay, WebAuthn) with explicit opt‑in flags.
- Tighten logging: print only failures by default; opt‑in verbose via `VERBOSE_TEST_LOGS`.
- Codify reusable flows (register → login → action) as helpers with typed results.


## Current State Highlights

- `setup.ts` implements a robust 5‑step bootstrap (virtual authenticator, import map, stabilization, dynamic import, fallbacks).
- Tests already gate network servers via `USE_RELAY_SERVER` and limit workers to 1 to avoid rate limits.
- There are useful failure mocks (faucet, relay, accessKey lookup) and a shared `handleInfrastructureErrors()`.
- Some tests duplicate event constants and ad‑hoc console capture logic.


## Improvements

### setup-001-split-bootstrap (Area: setup-architecture)

Refactor to separate concerns in `setup.ts`.

- Rationale: `setup.ts` mixes the 5‑step bootstrap sequence with mocks, intercepts, patches, and utilities. Splitting lowers cognitive load and reduces accidental coupling.
- Proposed changes:
  - Extract `executeSequentialSetup` and its 5 steps into `tests/bootstrap.ts`.
  - Move `DEFAULT_TEST_CONFIG` to `tests/config.ts` (reusable and overridable).
  - Keep WebAuthn mocks and `failureMocks` in `tests/mocks.ts`.
- Target files:
  - passkey-sdk/src/__tests__/setup.ts
  - passkey-sdk/src/__tests__/tests/bootstrap.ts (new)
  - passkey-sdk/src/__tests__/tests/config.ts (new)
  - passkey-sdk/src/__tests__/tests/mocks.ts (new)
- Risk: low • Payoff: high


### fixtures-002-playwright-extend (Area: fixtures-and-apis)

Introduce Playwright fixtures for PasskeyManager and console capture.

- Rationale: Repeated `page.evaluate` glue and console wiring can be encapsulated in fixtures, making tests terse and consistent.
- Proposed changes:
  - Create a `test.extend` fixture that exposes `{ passkeyManager, testUtils }` after bootstrap.
  - Add a `consoleCapture` fixture that records messages and only prints on failure unless `VERBOSE_TEST_LOGS=1`.
- Target files:
  - passkey-sdk/src/__tests__/fixtures.ts (new)
  - passkey-sdk/src/__tests__/e2e/*.test.ts
- Risk: low • Payoff: high


### mocks-003-centralize (Area: mocks-and-intercepts)

Centralize RPC/contract/faucet/relay intercepts.

- Rationale: `installContractVerificationBypass` and `failureMocks` are effective but scattered. Centralizing reduces duplication and clarifies opt‑in usage per test.
- Proposed changes:
  - Create `tests/intercepts.ts` exporting helpers: `bypassContractVerification(page)`, `mockFaucet(page)`, `mockRelay(page)`, `mockAccessKeyLookup(page)`.
  - Provide enable/disable toggles via env or explicit test call.
- Target files:
  - passkey-sdk/src/__tests__/intercepts.ts (new)
  - passkey-sdk/src/__tests__/e2e/*.test.ts
- Risk: low • Payoff: medium


### logging-004-quiet-by-default (Area: logging-and-reporting)

Quiet logs by default, verbose on demand.

- Rationale: Large, noisy logs mask relevant failures. We already gated one suite; extend across tests and add a small helper to standardize behavior.
- Proposed changes:
  - Add `tests/logging.ts` with `withConsoleCapture(page, fn, { verboseEnvVar: "VERBOSE_TEST_LOGS" })`.
  - Replace ad‑hoc `page.on('console', ...)` in tests with the helper.
- Target files:
  - passkey-sdk/src/__tests__/e2e/complete_ux_flow.test.ts
  - passkey-sdk/src/__tests__/e2e/worker_events.test.ts
  - passkey-sdk/src/__tests__/wallet-iframe/playwright/handshake.test.ts
  - passkey-sdk/src/__tests__/e2e/cancel_overlay_contracts.test.ts
- Risk: low • Payoff: medium


### stability-005-infra-skipper (Area: stability-and-retries)

Broaden infrastructure error skipper.

- Rationale: `handleInfrastructureErrors` only handles faucet 429. Typical flaky errors (RPC 5xx/“Server error”) should gracefully skip in CI runs.
- Proposed changes:
  - Expand matcher in `handleInfrastructureErrors` to include `/Server error|5\d\d|timeout|ECONNRESET|fetch failed/i`.
  - Optionally add an env guard (`STRICT_TESTS=1`) to disable skipping when needed.
- Target files:
  - passkey-sdk/src/__tests__/setup.ts
- Risk: low • Payoff: medium


### fixtures-006-flow-helpers (Area: fixtures-and-apis)

Add high‑level flow helpers.

- Rationale: Most tests use the same flows (register → login → executeAction). Helpers returning normalized results reduce boilerplate and mistakes.
- Proposed changes:
  - Export helpers: `registerPasskey(page, opts)`, `loginPasskey(page, opts)`, `executeTransfer(page, opts)`.
  - Return a normalized `{ success, error?, events, details }` shape.
- Target files:
  - passkey-sdk/src/__tests__/flows.ts (new)
- Risk: low • Payoff: high


### structure-007-templates (Area: structure-and-templates)

Provide test templates and assertions.

- Rationale: Offering a “new test” template and common assertions speeds onboarding and keeps suite consistency.
- Proposed changes:
  - Add `tests/templates/new-e2e.test.ts.template` with fixture usage and console capture.
  - Add `tests/assertions.ts` for `expectActionPhases()`, `expectLoggedInState()`.
- Target files:
  - passkey-sdk/src/__tests__/templates/new-e2e.test.ts.template (new)
  - passkey-sdk/src/__tests__/assertions.ts (new)
- Risk: low • Payoff: medium


### scripts-008-playwright-workflows (Area: scripts-and-config)

Streamline scripts and CI toggles.

- Rationale: Make it trivial to switch reporters, open reports, and run a focused subset.
- Proposed changes:
  - Keep existing root scripts (test, test:inline, show-report).
  - Optionally add `test:e2e` and `test:unit` forwarding to passkey-sdk.
  - Document `VERBOSE_TEST_LOGS`, `USE_RELAY_SERVER`, `STRICT_TESTS` in README.
- Target files:
  - package.json
  - passkey-sdk/README.md
  - passkey-sdk/src/__tests__/README.md
- Risk: low • Payoff: low


## Quick Wins

- Apply console capture helper across all tests (1 file change per suite).
- Broaden `handleInfrastructureErrors` to skip known flaky RPC failures in CI.
- Introduce flow helpers and use them in the longest e2e test.


## Suggested Scripts

```json
{
  "test": "pnpm -C passkey-sdk test",
  "test:inline": "pnpm -C passkey-sdk test:inline",
  "test:e2e": "pnpm -C passkey-sdk exec playwright test **/e2e/**/*.test.ts",
  "test:unit": "pnpm -C passkey-sdk exec playwright test **/unit/**/*.test.ts",
  "show-report": "pnpm -C passkey-sdk exec playwright show-report"
}
```


## Adoption Notes

- Keep `workers=1` while relay/faucet traffic is real; consider adding a “mocked network” project to enable parallelism for non‑network tests.
- Prefer small, incremental PRs: start with fixtures + logging helper, then refactor one suite at a time.
- Ensure any changes to `setup.ts` maintain the precise bootstrap ordering to avoid WebAuthn/import map races.

