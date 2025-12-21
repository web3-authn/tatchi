# Relayer Server Tests Plan

Goal: add high-signal tests for the server-side SDK in `sdk/src/server`, implemented under `sdk/src/__tests__/relayer`.

These tests should validate the **HTTP surface area** (Express + Cloudflare routers) and the **pure server helpers** (session/cors parsing, ROR origins sanitization, NEAR error parsing) without requiring real NEAR RPC, WASM, or a running relay.

## Scope (what to test)

### P0 — Router correctness (highest impact)

**Express router (`sdk/src/server/router/express-adaptor.ts`)**

- `POST /verify-authentication-response`
  - Rejects missing/invalid body with `400 { code: 'invalid_body' }`.
  - When `AuthService.verifyAuthenticationResponse()` returns `{ success: false }`, responds `400 { code: 'not_verified' }`.
  - Session issuance (when `opts.session` provided and verification succeeds):
    - `sessionKind: 'jwt'` → `200` and response JSON includes `jwt`.
    - `sessionKind: 'cookie'` → `200` and response sets `Set-Cookie`, and body does **not** include `jwt`.
  - “Best-effort sessions”: if `session.signJwt()` throws, still returns `200` with verification payload (no `jwt`, no cookie).

- Session endpoints
  - `GET /session/auth` (or custom `opts.sessionRoutes.auth`)
    - `501` when sessions disabled.
    - `401` when no valid session (adapter returns `{ ok: false }`).
    - `200 { authenticated: true, claims }` when adapter returns `{ ok: true, claims }`.
  - `POST /session/logout` (or custom `opts.sessionRoutes.logout`)
    - Always `200 { success: true }`.
    - When sessions enabled, sets `Set-Cookie` to the clear-cookie value.
  - `POST /session/refresh`
    - `501` when sessions disabled.
    - `401` when adapter returns `{ ok: false, code: 'unauthorized' }`.
    - `400` when adapter returns `{ ok: false, code: 'not_eligible' | ... }`.
    - `200` with:
      - `sessionKind: 'jwt'` → `{ ok: true, jwt }`
      - `sessionKind: 'cookie'` → `{ ok: true }` and `Set-Cookie` for the refreshed token

- Shamir routes (when `service.shamirService` exists)
  - Disabled path: `503 { error: 'shamir_disabled' }` when `hasShamir()` is false.
  - `POST /vrf/apply-server-lock`
    - `400` for missing `kek_c_b64u`.
    - `200` includes returned payload + `keyId`.
  - `POST /vrf/remove-server-lock`
    - `400` for missing `kek_cs_b64u` or `keyId`.
    - `400 { error: 'unknown keyId' }` when `keyId` not current or grace.
    - `200` routes to:
      - `removeServerLock()` when `keyId === currentKeyId`
      - `removeGraceServerLockWithKey()` when `keyId` is a grace key
  - `GET /shamir/key-info` returns `currentKeyId`, `p_b64u`, `graceKeyIds`.

- Health/readiness + ROR
  - `GET /healthz` (when enabled) returns feature hints:
    - `shamir.configured` and `shamir.currentKeyId`
    - `zkEmail.configured` and `zkEmail.proverBaseUrl`
  - `GET /readyz` (when enabled):
    - `200` when all configured dependencies are healthy.
    - `503` when configured Shamir or zk-email prover is unhealthy.
  - `GET /.well-known/webauthn`:
    - `200` with `Cache-Control: max-age=60, stale-while-revalidate=600`
    - Returns `{ origins }` (calls `service.getRorOrigins()`), but never throws (fallback `{ origins: [] }`).

**Cloudflare router (`sdk/src/server/router/cloudflare-adaptor.ts`)**

- CORS behavior (critical for cookie sessions)
  - Preflight: `OPTIONS` returns `204` and includes allow-methods/headers.
  - If `corsOrigins` normalizes to `'*'`:
    - Sets `Access-Control-Allow-Origin: *`
    - Does **not** set `Access-Control-Allow-Credentials: true`
  - If `corsOrigins` is an allowlist and request `Origin` matches:
    - Echoes `Access-Control-Allow-Origin: <origin>`
    - Sets `Vary: Origin`
    - Sets `Access-Control-Allow-Credentials: true`

- Route parity with Express for:
  - `/verify-authentication-response` session minting (jwt vs cookie) and error mapping.
  - `/session/auth`, `/session/logout`, `/session/refresh`.
  - `/recover-email` (sync vs async via `ctx.waitUntil`).
  - `/vrf/apply-server-lock`, `/vrf/remove-server-lock`, `/shamir/key-info`.
  - `/healthz` and `/readyz` include `cors.allowedOrigins` for diagnostics.
  - `/.well-known/webauthn` supports env overrides (`ROR_CONTRACT_ID`, `ROR_METHOD`).

### P1 — Pure server helpers (fast, stable)

- `SessionService` (`sdk/src/server/core/SessionService.ts`)
  - `buildSetCookie()` default attributes: `HttpOnly`, `Secure`, `SameSite=Lax`, `Max-Age`, `Expires`.
  - `buildClearCookie()` includes `Max-Age=0` and `Expires=Thu, 01 Jan 1970...`.
  - Token extraction precedence:
    - `Authorization: Bearer ...` wins over cookie.
    - Cookie parsing respects configured cookie name.
  - `refresh()` logic:
    - Returns `unauthorized` for missing/invalid token.
    - Returns `not_eligible` when outside the refresh window.
    - Returns `{ ok: true, jwt }` when eligible and signing is configured.

- CORS origin normalization
  - `parseCsvList()` and `buildCorsOrigins()` normalize/dedupe origins and fall back to `'*'` when empty.

- ROR origin sanitization
  - `AuthService.getRorOrigins()` accepts either `string[]` or `{ origins: string[] }`.
  - Filters invalid origins (non-https, paths, query/hash), allows `http://localhost` for dev.
  - Lowercases host and dedupes.
  - Never throws; returns `[]` on RPC errors.

- NEAR error surfacing
  - `parseContractExecutionError()` maps common receipt failures to stable operator-facing messages (`AccountAlreadyExists`, `AccountDoesNotExist`, etc.).

## Test structure (under `sdk/src/__tests__/relayer`)

Recommended files (keep them Node-only; do not use `page`):

- `sdk/src/__tests__/relayer/express-router.test.ts`
- `sdk/src/__tests__/relayer/cloudflare-router.test.ts`
- `sdk/src/__tests__/relayer/sessionService.test.ts`
- `sdk/src/__tests__/relayer/corsOrigins.test.ts`
- `sdk/src/__tests__/relayer/rorOrigins.test.ts`
- `sdk/src/__tests__/relayer/nearErrors.test.ts`

Recommended helpers inside the folder (or a `helpers.ts`):

- `startExpress(router): { baseUrl, close }` using `app.listen(0)` + global `fetch`.
- `makeFakeAuthService(overrides)` with stubs for:
  - `verifyAuthenticationResponse`, `createAccountAndRegisterUser`, `getRorOrigins`
  - `shamirService` (stubbed `hasShamir/ensureReady/...`)
  - `emailRecovery` (stubbed `requestEmailRecovery`, `checkZkEmailProverHealth`)
- `makeSessionAdapter()` stub for jwt/cookie and refresh scenarios.
- Cloudflare harness: `callCf(router, { method, path, origin, body, headers, env, ctx })`.

## Running (wiring into the repo)

Today `sdk/playwright.config.ts` does not include `relayer/**` in `testMatch`, so one of these should be done:

1) Add `**/relayer/**/*.test.ts` to `testMatch`, or
2) Add a dedicated Playwright config + script, e.g.:
   - `sdk/playwright.relayer.config.ts` (no `webServer`; node-only)
   - `pnpm -C sdk exec playwright test -c playwright.relayer.config.ts`

Implemented: option (2) via `sdk/playwright.relayer.config.ts` and `pnpm -C sdk test:relayer`.

## Implementation order (suggested)

1) Cloudflare CORS + `/verify-authentication-response` session minting parity (most regressions show up here first).
2) Express router `/verify-authentication-response` + session endpoints.
3) Healthz/readyz + well-known manifest.
4) Shamir handler routing logic (`currentKeyId` vs grace keys).
5) SessionService refresh window logic + cookie header construction.
6) `getRorOrigins` sanitization and `parseContractExecutionError` mapping.

## Phased TODO (concrete)

### Phase 0 — Harness + wiring

- [x] Decide runner strategy: extend `sdk/playwright.config.ts` `testMatch` vs add `sdk/playwright.relayer.config.ts` (node-only, no `webServer`).
- [x] Add `sdk/src/__tests__/relayer/helpers.ts` with:
  - `startExpress(router)` helper (`listen(0)` + `close()`), and `fetchJson()`.
  - `callCf(handler, req)` helper (Request/Response wrapper) with optional `env`/`ctx`.
  - Minimal stubs: `makeFakeAuthService()`, `makeSessionAdapter()`, `makeShamirServiceStub()`.

### Phase 1 — Cloudflare router P0

- [x] `sdk/src/__tests__/relayer/cloudflare-router.test.ts`: CORS preflight + credentials rules (`'*'` vs allowlist echo).
- [x] `sdk/src/__tests__/relayer/cloudflare-router.test.ts`: `/verify-authentication-response`:
  - invalid body → `400 { code: 'invalid_body' }`
  - not verified → `400 { code: 'not_verified' }`
  - verified + `sessionKind=jwt` → body includes `jwt`
  - verified + `sessionKind=cookie` → `Set-Cookie` set, body does not include `jwt`
- [x] `sdk/src/__tests__/relayer/cloudflare-router.test.ts`: session routes (`/session/auth`, `/session/logout`, `/session/refresh`) including `401` vs `400` mapping.

### Phase 2 — Express router P0

- [x] `sdk/src/__tests__/relayer/express-router.test.ts`: `/verify-authentication-response` parity with Cloudflare (including best-effort session issuance when `signJwt()` throws).
- [x] `sdk/src/__tests__/relayer/express-router.test.ts`: session routes parity (including custom `sessionRoutes` overrides).

### Phase 3 — Health/ready + well-known

- [x] Express: `GET /healthz` and `GET /readyz` fields and status mapping (when enabled via router opts).
- [x] Cloudflare: `GET /healthz` and `GET /readyz` include `cors.allowedOrigins`; env overrides for `/.well-known/webauthn`.
- [x] Both: `GET /.well-known/webauthn` sets `Cache-Control` and never throws (fallback `{ origins: [] }`).

### Phase 4 — Shamir endpoints (routing + error mapping)

- [x] Express: `/vrf/apply-server-lock`, `/vrf/remove-server-lock`, `/shamir/key-info`:
  - `503 shamir_disabled` when `hasShamir()` false
  - remove-server-lock dispatches by `keyId` (current vs grace vs unknown)
- [x] Cloudflare: parity for Shamir endpoints (including `ensureReady()` gating).

### Phase 5 — Pure helper unit tests (P1)

- [x] `sdk/src/__tests__/relayer/sessionService.test.ts`: cookie header defaults, extraction precedence, refresh window behavior.
- [x] `sdk/src/__tests__/relayer/corsOrigins.test.ts`: `parseCsvList()` + `buildCorsOrigins()` normalization/dedupe and `'*'` fallback.
- [x] `sdk/src/__tests__/relayer/rorOrigins.test.ts`: `getRorOrigins()` sanitization + shape support (`string[]` vs `{ origins }`) + error returns `[]`.
- [x] `sdk/src/__tests__/relayer/nearErrors.test.ts`: `parseContractExecutionError()` message mapping for common failures.

### Phase 6 — Stabilization

- [x] Ensure tests are deterministic: no network, no real WASM init, no NEAR RPC calls (all dependencies stubbed).
- [x] Add a short `docs/relayer-tests.md` note on how to run only relayer tests once wiring is chosen (one command).

## Non-goals (for this test suite)

- End-to-end NEAR RPC integration (already covered elsewhere; too flaky for unit suite).
- WASM signer/VRF correctness (covered by Rust `cargo test` and browser e2e).
- Full email recovery flows (there are existing unit tests + the zk-email smoke script).
