# Playwright Headers – Progress and Plan

This note captures current status and next steps for the cross-origin header work in Playwright-based E2E tests. It focuses on validating and enforcing headers for wallet assets and wallet-service HTML, while minimizing drift with framework plugins.

## What’s Implemented
- Route-level CORS/CORP shim (tests only):
  - For `walletOrigin` `/sdk/*` assets:
    - Adds `Cross-Origin-Resource-Policy: cross-origin`
    - Adds CORS headers (`Access-Control-Allow-Origin` to app origin, `Allow-Methods`, `Allow-Headers`, `Allow-Credentials`)
    - Handles `OPTIONS` preflight with `204`
    - Forces `.wasm` assets to `Content-Type: application/wasm`
  - For `walletOrigin` `/wallet-service` (+ `/`):
    - Adds `Cross-Origin-Embedder-Policy: require-corp`
    - Adds `Cross-Origin-Resource-Policy: cross-origin`
    - Adds `Cross-Origin-Opener-Policy: unsafe-none` (explicit test isolation model)
    - Generates `Permissions-Policy` via `buildPermissionsPolicy(walletOrigin)`
    - Generates `Content-Security-Policy` via `buildWalletCsp({ mode: 'strict' })`
- Centralized header builders:
  - Tests consume `sdk/src/plugins/headers.ts` (`buildPermissionsPolicy`, `buildWalletCsp`) to reduce drift vs plugin implementations.
- Test setup wiring:
  - Shim installed in `sdk/src/__tests__/setup/index.ts` using `installWalletSdkCorsShim(page, { appOrigin })` before navigation, so earliest requests are covered.
  - Worker same-origin patches were removed; headers are now sufficient for cross-origin workers.

## Issues Found
- Header assertions appended outside a test:
  - In `sdk/src/__tests__/e2e/complete_ux_flow.test.ts`, header checks for WASM and wallet-service were added after the `test.describe(...)` block and use `passkey`, resulting in `ReferenceError: passkey is not defined`.
  - These assertions must run within a `test(...)` so fixtures (`passkey`, `page`) are available.
- Timing nuance for shim installation:
  - The shim is installed before navigation to guarantee coverage of first requests.

## Next Steps
1. Fix test scoping error (required):
   - Option A: Move header assertions into the main lifecycle test near the end.
   - Option B (cleaner): Create a dedicated `test('Headers sanity', ...)` that:
     - Uses `page.request.get(...)` to fetch `walletOrigin/wallet-service/` and verify:
       - `Permissions-Policy === buildPermissionsPolicy(walletOrigin)`
       - `cross-origin-embedder-policy === require-corp`
       - `cross-origin-resource-policy === cross-origin`
     - Uses either `page.request.get(...)` or browser-side fetch to verify `.wasm` has `Content-Type: application/wasm`.
2. Consider installing shim before navigation (optional hardening):
   - Move `installWalletSdkCorsShim(...)` to run before `page.goto(...)` for deterministic coverage of earliest requests.
3. Unit tests for header builders (prevents drift):
   - Add lightweight tests for `buildPermissionsPolicy` and `buildWalletCsp` across:
     - Strict vs compatible modes
     - `allowUnsafeEval` toggles
     - Varying `walletOrigin` inputs (valid origin, URL with path, invalid)
4. Optional: Expose headers for browser-context assertions:
   - If we must assert additional headers via `window.fetch`, extend shim with `Access-Control-Expose-Headers` to include the header names under test.
5. Plugin parity/diff checks:
   - Audit `sdk/src/plugins/next.ts` and `sdk/src/plugins/vite.ts` against `sdk/src/plugins/headers.ts`.
   - Ensure both plugins source policy strings from the shared builders.
   - Add a simple snapshot test that builds both policies and compares to expected strings to catch drift.

## Relevant Files
- Shim + mocks
  - `sdk/src/__tests__/setup/cross-origin-headers.ts` (shim)
  - `sdk/src/__tests__/setup/route-mocks.ts` (mocks)
  - `sdk/src/__tests__/setup/bypasses.ts` (contract bypass)
  - `sdk/src/__tests__/setup/index.ts`
- E2E suite with header assertions to fix
  - `sdk/src/__tests__/e2e/complete_ux_flow.test.ts`
- Shared header builders (source of truth)
  - `sdk/src/plugins/headers.ts`
- Framework plugins (should stay in sync with builders)
  - `sdk/src/plugins/next.ts`
  - `sdk/src/plugins/vite.ts`
- Reference docs
  - `docs/header-plugins-general.md`

## Quick Verification Checklist
- `.wasm` served as `application/wasm` from `/sdk/*` (via shim).
- `wallet-service` responses include:
  - `Permissions-Policy` equals `buildPermissionsPolicy(walletOrigin)`
  - `COEP: require-corp`, `CORP: cross-origin`, `COOP: unsafe-none`
- Plugins render policies that match the shared builders.

## Notes
- Using the shared header builders in tests ensures parity with plugin output and reduces configuration drift.
- When adding more header assertions, prefer `page.request` (Node-side) to avoid CORS visibility limits in browser context, unless headers are explicitly exposed.
