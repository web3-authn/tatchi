Lit Components: Test Plan

Scope
- Web components under `passkey-sdk/src/core/WebAuthnManager/LitComponents` including iframe-hosted UI, embedded controls, and shared utilities.
- Key targets: `IframeButtonWithTooltipConfirmer/*`, `IframeModalConfirmer/*`, `Drawer/*`, `TxTree/*`, `ExportPrivateKey/*`, `PasskeyHaloLoading/*`, `HaloBorder/*`, utilities (`confirm-ui.ts`, `confirm-ui-types.ts`, `LitElementWithProps.ts`, `base-styles.ts`, `common/*`, `tags.ts`).

Goals
- Behavior: props/state → DOM updates; open/close; loading and confirmation flows.
- Messaging: iframe bootstrap ↔ host message handling is correct and typed.
- Theming: theme objects and CSS variables applied consistently across components.
- Accessibility: keyboard/focus traps, roles, ARIA, ESC to close, tab order.
- Visual: stable layout and appearance across light/dark and variants.
- Security: only expected postMessage types; no DOM/style injection via props.

Test Layers
- Unit (Lit): fast tests of components and utilities in isolation.
  - Tooling: `@open-wc/testing` (Mocha/Chai) or `vitest` + `@testing-library/dom` for Lit.
  - Validate: rendering, attributes/props → DOM, events emitted, methods (`close`, `update*`) work.
- Integration (Iframe): host element ↔ child iframe bootstrap handshake and geometry.
  - Tooling: Playwright page tests. Load a minimal HTML and the compiled embedded bundles, assert postMessage flow.
  - Validate: READY → HS1_INIT → geometry updates; props updates reflected; confirm/cancel events bridged.
- Visual regression: pixel snapshots for major states.
  - Tooling: Playwright `toHaveScreenshot` with golden images per theme and state.
  - Validate: button idle/hover, tooltip visible, modal/drawer open, TxTree expanded.
- Accessibility (a11y): automated checks.
  - Tooling: `@axe-core/playwright` (or `axe-core` via open-wc for unit DOM).
  - Validate: color contrast, roles, labels, focus order, no keyboard traps.
- Security hardening: postMessage/type guards and style escaping.
  - Validate: ignore unexpected message types; sanitized style inputs; no HTML injection.

Harness and Helpers (reuse existing e2e setup)
- Prefer the shared Playwright setup in `passkey-sdk/src/__tests__/setup.ts`:
  - `setupBasicPasskeyTest(page, opts)`: navigates to `https://example.localhost`, configures WebAuthn Virtual Authenticator + PRF mocks, injects the import map, dynamically loads the SDK from `/sdk/esm/index.js`, and exposes `window.testUtils`.
  - Variants: `setupRelayServerTest(page, opts)` and `setupTestnetFaucetTest(page, opts)` for atomic vs faucet flows.
  - `handleInfrastructureErrors(result)`: skip tests on faucet rate limits instead of failing.

Available `window.testUtils` (browser context)
- `passkeyManager`: configured instance when a PasskeyManager-backed flow is needed.
- `generateTestAccountId()`: deterministic `e2etest<ts>.testnet` IDs.
- `webAuthnUtils.simulateSuccessfulPasskeyInput(fn)` / `simulateFailedPasskeyInput(fn)`: wrap operations that trigger WebAuthn.
- `registrationFlowUtils.setupRelayServerMock(success?)` / `setupTestnetFaucetMock(success?)`: mock network.
- `failureMocks.*` and `failureMocks.restore()`: inject/clear failure modes.

Architecture Targets (files)
- Iframe button (embedded):
  - Host wrapper: `passkey-sdk/src/core/WebAuthnManager/LitComponents/IframeButtonWithTooltipConfirmer/iframe-host.ts`
  - Bootstrap: `passkey-sdk/src/core/WebAuthnManager/LitComponents/IframeButtonWithTooltipConfirmer/iframe-bootstrap-script.ts`
  - Element: `passkey-sdk/src/core/WebAuthnManager/LitComponents/IframeButtonWithTooltipConfirmer/ButtonWithTooltip.ts`
  - Themes: `passkey-sdk/src/core/WebAuthnManager/LitComponents/IframeButtonWithTooltipConfirmer/button-with-tooltip-themes.ts`
- Modal/drawer confirmer:
  - Bootstrap: `passkey-sdk/src/core/WebAuthnManager/LitComponents/IframeModalConfirmer/iframe-modal-bootstrap-script.ts`
  - Host: `passkey-sdk/src/core/WebAuthnManager/LitComponents/IframeModalConfirmer/iframe-host.ts`
  - Viewer (modal): `passkey-sdk/src/core/WebAuthnManager/LitComponents/IframeModalConfirmer/viewer-modal.ts`
  - Viewer (drawer): `passkey-sdk/src/core/WebAuthnManager/LitComponents/IframeModalConfirmer/viewer-drawer.ts`
  - Themes: `passkey-sdk/src/core/WebAuthnManager/LitComponents/IframeModalConfirmer/modal-confirmer-themes.ts`
- TxTree: `passkey-sdk/src/core/WebAuthnManager/LitComponents/TxTree/index.ts`
- Export private key: `passkey-sdk/src/core/WebAuthnManager/LitComponents/ExportPrivateKey/*`
- Utilities: `LitElementWithProps.ts`, `base-styles.ts`, `confirm-ui.ts`, `confirm-ui-types.ts`, `common/*`, `tags.ts`.

Unit Tests (examples to implement)
- ButtonWithTooltip
  - Renders minimal DOM, sets button text via `buttonTextElement`.
  - Hover/focus shows tooltip; `aria-expanded` toggles; keyboard Enter/Space triggers click.
  - Applies `buttonStyle`, `buttonHoverStyle`, `tooltipPosition` correctly; snapshot minimal DOM class map.
  - Emits `onSuccess`/`onCancel` callbacks when wired; ensure externalConfirm invoked with args.
- Viewer (modal/drawer)
  - Accepts `summary`, `txSigningRequests`, `loading` and toggles states.
  - Close button fires `w3a:tx-confirmer-cancel`; ESC closes when not loading.
  - Theme variables from `modal-confirmer-themes.ts` applied; verify selected CSS vars on the root.
- TxTree
  - Renders actions and arguments; expand/collapse interaction; highlights differences.
  - Formatting via `common/formatters.ts` used for NEAR values.
- Utilities
  - `LitElementWithProps.applyStyles` maps key/value to `--w3a-*` CSS vars; ignores undefined.
  - `confirm-ui.ts` mount/await handles `uiMode: 'skip' | 'modal' | 'drawer'` with stubbed elements.
  - `common/tx-digest.ts` produces stable digest for identical inputs.

Integration Tests (Playwright page tests)
- Iframe button handshake
  - Load a page embedding the host wrapper; expect child to post READY; parent posts HS1_INIT; geometry round‑trip.
  - Update props (theme, tooltipPosition); verify button/tooltip repaint and geometry update.
  - Simulate click → ensure `externalConfirm` is called (mock) and `onSuccess` posts `TX_BUTTON_RESULT`.
  - When driving end‑to‑end flows, use `window.testUtils.passkeyManager.signAndSendTransactions(...)` and wrap with `webAuthnUtils.simulateSuccessfulPasskeyInput` to auto‑accept WebAuthn.
- Modal/drawer confirmer flow
  - Trigger open; ensure overlay visible; run `w3a:tx-confirmer-cancel` → host receives CANCEL and overlay hides.
  - Confirm path: click confirm; expect `confirmed: true` posted to parent.
- Export private key (embedded viewer)
  - Bootstrap loads viewer from `/sdk/embedded/*`; viewer posts READY; parent sets data; viewer renders key safely (no text selection if disabled).

Visual Regression Coverage
- States: idle, hover tooltip open, loading, modal open, drawer open (top/bottom if supported), TxTree expanded and collapsed.
- Themes: dark/light (and any variants defined in theme modules).
- Strategy: Playwright `expect(locator).toHaveScreenshot('name.png', { maxDiffPixelRatio: 0.01 })` with fixed viewport and deterministic fonts.

Accessibility Coverage
- Use `@axe-core/playwright` on pages with each component mounted.
- Keyboard: Tab/Shift+Tab cycle inside modal/drawer; ESC closes when allowed; focus returns to invoker.
- ARIA: roles (`dialog`), `aria-modal`, labels for buttons, status messages announce via `aria-live` where applicable.

Security Checks
- Message filtering: child bootstraps ignore unknown `type`; host only accepts expected shapes.
- Style/HTML sanitization: ensure style objects are restricted to CSS properties; no innerHTML from props.

Test Organization
- Recommended locations:
  - Unit: `passkey-sdk/src/__tests__/lit-components/unit/*`
  - Integration/Visual/A11y (Playwright): `passkey-sdk/src/__tests__/lit-components/e2e/*`
- Group Playwright projects by theme to parallelize (dark/light) if runtime allows.

- Local:
  - Build is automatic via `npm test` (runs `build:check:fresh` → `build` → Playwright). To build manually: `pnpm -w --filter @web3authn/passkey build`.
  - In Playwright tests, import and call the shared setup in `beforeEach`:
    - `import { setupBasicPasskeyTest } from '../../__tests__/setup'`
    - `await setupBasicPasskeyTest(page)`
  - Run only LitComponents e2e via grep or per-directory filter.
- CI:
  - Gate PRs on unit + Playwright page tests.
  - Visual snapshots stored in repo; update via `PLAYWRIGHT_UPDATE_SNAPSHOTS=1` when intentional changes.

Fixtures and Helpers
- Define typed message fixtures mirroring `iframe-messages.ts` for HS1_INIT, SET_STYLE, SET_TX_DATA, etc.
- Provide a mini mock for `externalConfirm()` used by button/drawer tests.
- Add theme factory helpers to render all theme variants.

Risks & Edge Cases
- Element upgrade race inside iframe: ensure tests wait for custom element to upgrade before measuring.
- Cross-origin quirks disabled in tests: prefer same-origin `srcdoc` with embedded bundles.
- Layout jitter: freeze time, animations disabled, deterministic fonts for visuals.

References
- `passkey-sdk/src/core/WebAuthnManager/LitComponents/README.md:1`
- `passkey-sdk/src/core/WebAuthnManager/LitComponents/IframeButtonWithTooltipConfirmer/iframe-button-bootstrap-script.ts:1`
- `passkey-sdk/src/core/WebAuthnManager/LitComponents/IframeModalConfirmer/iframe-modal-bootstrap-script.ts:1`
- `passkey-sdk/src/core/WebAuthnManager/LitComponents/TxTree/index.ts:1`
- Example Playwright test using shared setup: `passkey-sdk/src/__tests__/e2e/_template.test.ts:1`
