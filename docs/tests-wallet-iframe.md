Wallet Iframe: Test Plan

Scope
- Modules under `passkey-sdk/src/core/WalletIframe/*`:
  - Client: `client/IframeTransport.ts`, `client/router.ts`, `client/env.ts`, `client/html.ts`, `client/progress-bus.ts`.
  - Host: `host/wallet-iframe-host.ts`, `host/lit-elem-mounter.ts`, `host/lit-element-registry.ts`, `host/WalletHostElements.ts`.
  - Top-level: `PasskeyManagerIframe.ts`, `sanitization.ts`, `validation.ts`, `index.ts`.

Goals
- Reliability: robust CONNECT → READY handshake, request/response correlation, timeouts, and cancellation.
- UX correctness: overlay show/hide heuristics; sticky overlay flows; theme propagation; UI registry bridging.
- Security: origin handling, iframe sandbox/allow attributes, sanitized asset paths, message shape guards, function stripping.
- Feature correctness: `PM_*` flows (register/login/sign/send/etc.) within a controllable harness.

Test Layers
- Unit (logic utilities, pure modules)
  - `validation.ts`: type guards, assertions, `stripFunctionsShallow`.
  - `sanitization.ts`: `sanitizeSdkBasePath`, `escapeHtmlAttribute`, `isValidSdkBasePath` across edge inputs.
  - `client/html.ts`: generated HTML includes escaped, normalized embedded path.
  - `host/wallet-iframe-host.ts`: `normalizeConfirmationConfig` behavior with mixed types.
  - Runner: `vitest` or `@open-wc/testing` in jsdom.
- Integration (browser page tests, Playwright)
  - IframeTransport handshake
    - Same-origin (srcdoc): connect resolves; attributes set: `sandbox`, `allow` includes WebAuthn/clipboard; waits for `load` before posting.
    - Cross-origin: serve a minimal service page using `getWalletServiceHtml()` and `page.route()`; verify retries until `READY`.
    - Timeout path: set tiny `connectTimeoutMs` and block `READY` → expect handshake error.
  - WalletIframeRouter request lifecycle
    - `init()` idempotent; `onReady()` fires for late subscribers.
    - `post()` correlates `requestId`, handles `PM_RESULT` and `ERROR`; timeouts reject; `onProgress` passes only typed events.
    - Cancel flow: send `PM_CANCEL` with `requestId` → host posts terminal `ERROR` with `CANCELLED` and router cleans pending entry.
  - Overlay behavior (progress-bus)
    - When phases enter `user-confirmation`/`webauthn-authentication`/`authorization`: overlay visible, iframe set to full-screen with `pointer-events:auto` and z-index below modal.
    - On `authentication-complete`, `transaction-signing-*`, etc., overlay hides; verify `aria-hidden` and `tabindex=-1` reapplied.
    - Sticky overlay: calls with `{ options: { sticky: true } }` keep overlay until router manually hides.
  - UI registry mounting (host/lit-elem-mounter)
    - Parent posts `WALLET_UI_REGISTER_TYPES` and `WALLET_UI_MOUNT`; host creates elements for keys like `'w3a-tx-button'` and bridges `onSuccess`/`onCancel` to `TX_BUTTON_RESULT`.
    - `WALLET_UI_UPDATE` applies prop changes; `WALLET_UI_UNMOUNT` removes element.
  - Assets base propagation
    - `PM_SET_CONFIG` with `assetsBaseUrl` sets `window.__W3A_EMBEDDED_BASE__` inside host; child viewer/bootstrap scripts load from `/sdk/embedded/`.

Security Tests
- Iframe attributes
  - Same-origin (srcdoc): `sandbox="allow-scripts allow-same-origin"` present; `allow` includes publickey-credentials-get/create for `'self'` and clipboard.
  - Cross-origin: `allow` delegates publickey credentials to wallet origin; no `sandbox` attribute to avoid port issues.
- Message surface
  - Host ignores window messages other than `{type:'CONNECT'}`; adopts only first provided MessagePort.
  - Router strips functions from options (`stripFunctionsShallow`), and posts only serializable envelopes.
- Sanitization
  - Malicious `sdkBasePath` inputs are normalized/cleaned; `isValidSdkBasePath` blocks dangerous protocols and traversal.

Visual and a11y (lightweight)
- Visual: snapshot overlay visible vs hidden states (deterministic viewport and styles).
- a11y: when overlay is visible, ensure it’s not focusable itself; the actual modal/dialog a11y is covered by LitComponents tests running inside the host.

Organization
- Unit tests: `passkey-sdk/src/__tests__/wallet-iframe/unit/*`.
- Playwright integration: `passkey-sdk/src/__tests__/wallet-iframe/e2e/*` with projects for same-origin and cross-origin.

Playwright Harness Notes
- Shared setup (recommended)
  - Import helpers from `passkey-sdk/src/__tests__/setup.ts` in your Playwright tests and call in `beforeEach`:
    - `import { setupBasicPasskeyTest, handleInfrastructureErrors } from '../../__tests__/setup'`
    - `await setupBasicPasskeyTest(page)`
  - This configures WebAuthn Virtual Authenticator + PRF mocks, injects import map, loads SDK from `/sdk/esm/index.js`, and exposes `window.testUtils` for browser-side utilities.
  - Optional: enable verbose logs for overlay/phase routing by setting `window.__W3A_DEBUG__ = true` before flows.
- Same-origin service
  - Use the default `IframeTransport` srcdoc path; inject the router on the page via `page.addInitScript` or an inline script fixture.
- Cross-origin service
  - `page.route('https://wallet.test/service', (route) => route.fulfill({ contentType: 'text/html', body: getWalletServiceHtml('/sdk') }))`.
  - Construct router with `{ walletOrigin: 'https://wallet.test', servicePath: '/service' }`.

Available `window.testUtils` (browser context)
- `passkeyManager`: call wallet flows that exercise the router+host path (register/login/sign/send).
- `webAuthnUtils.simulateSuccessfulPasskeyInput(fn)` / `simulateFailedPasskeyInput(fn)`: wrap operations that trigger WebAuthn to avoid flakiness.
- `generateTestAccountId()`, `registrationFlowUtils.*`, `failureMocks.*`, and `failureMocks.restore()` for targeted scenarios.

Sample Scenarios (to implement)
- Handshake success
  - Create router with default options; `await router.init()` resolves; `router.isReady()` true.
- Handshake timeout
  - Stub host to never post `READY`; set `connectTimeoutMs=200`; expect `Wallet iframe READY timeout`.
- Request timeout
  - Post a `PM_*` and do not respond; `requestTimeoutMs` triggers rejection; pending map cleared.
- Cancel request
  - Issue a long-running request; `router.cancel()` posts `PM_CANCEL` with `requestId`; host emits `ERROR` and `PROGRESS` cancel events; overlay hides.
- Overlay heuristics
  - Simulate sequence of `PROGRESS` events; assert `iframe.style.pointerEvents` and `opacity` values toggle at expected phases.
- UI registry bridge
  - Register a tiny test element in the registry; mount it; simulate custom event; expect parent to receive bridged result message.
 - Registration flow (faucet/relay)
   - Use `window.testUtils.passkeyManager.registerPasskey(accountId, { onEvent })` wrapped with `webAuthnUtils.simulateSuccessfulPasskeyInput`.
   - If hitting live faucet, call `handleInfrastructureErrors(result)` to skip gracefully on 429.

CI and Running
- Build is automatic via `npm test` (runs `build:check:fresh` → `build` → Playwright). To build manually: `pnpm -w --filter @web3authn/passkey build`.
- Run only wallet-iframe tests: `pnpm -w --filter @web3authn/passkey test -- -g "wallet-iframe"` or per-directory CLI flags.
- Consider splitting Playwright projects: `same-origin`, `cross-origin`, `visual`.

Edge Cases
- Iframe contentWindow null after detach: router guards; test idempotent behavior.
- Concurrent `init()` calls deduplicated; only one CONNECT loop runs.
- Host `SERVICE_HOST_BOOTED` hint reduces handshake spam; test that router tolerates absence/presence.

References
- `passkey-sdk/src/core/WalletIframe/IframeTransport.ts:1`
- `passkey-sdk/src/core/WalletIframe/client/router.ts:1`
- `passkey-sdk/src/core/WalletIframe/host/wallet-iframe-host.ts:1`
- `passkey-sdk/src/core/WalletIframe/sanitization.ts:1`
- `passkey-sdk/src/core/WalletIframe/README.md:1`
- Example Playwright test using shared setup: `passkey-sdk/src/__tests__/e2e/_template.test.ts:1`
