# Chrome Extension Security Upgrade (Progressive Hardening)

This doc is a concrete implementation plan to offer users an optional “Upgrade to Chrome Extension” path for the Tatchi wallet runtime.

## 1) Why we’re doing it

Today, sensitive wallet operations (WebAuthn/PRF ceremonies, key derivation, decrypt/sign, and IndexedDB persistence) run on a dedicated wallet origin in an isolated cross‑origin iframe (“wallet‑iframe”).

That model provides strong isolation from a compromised app origin, but it still relies on a *web* origin. In practice:

- If a user installs a malicious Chrome extension with host permissions on the wallet origin, it can inject into the wallet pages and attempt to exfiltrate secrets during ceremonies.
- The wallet origin is still part of the general web threat surface (headers, hosting config, supply chain, etc.).

Moving the wallet runtime into a Chrome extension origin provides an additional hard boundary:

- Other extensions cannot arbitrarily inject into `chrome-extension://<extension_id>` pages (without being the same extension).
- The wallet’s persisted state lives under the extension origin (separate IndexedDB partition), reducing exposure to web‑origin compromise and hostile extensions targeting the wallet host.

This is meant to be “progressive security hardening”: users can start with the normal wallet‑iframe onboarding (lowest friction), then optionally upgrade to the extension for stronger protection.

## 2) What we want to do

### Main goals

- The Chrome extension wallet behaves the same as the current wallet‑iframe wallet (same SDK API surface, same flows, same progress events).
- The only meaningful difference is where the wallet executes: `chrome-extension://…` instead of `https://wallet.example.com`.
- Users are offered an upgrade path after they successfully onboard via the normal wallet‑iframe registration flow.
- Migration creates a *new passkey* scoped to the extension origin (different `rpId`), and can optionally remove the previous wallet‑iframe credential/key material to improve security.
- Signing policy (new requirement):
  - Threshold signing requests: always use the web wallet (`wallet-iframe`) so the signing UI stays embedded in the app.
  - Local signing requests: prefer the extension wallet when (a) the extension is reachable and (b) it has an initialized wallet/account; otherwise fall back to the web wallet local signer.
  - Unauthenticated flows (registration/login/emailRecovery/syncAccount): default to threshold signer (users can’t choose a local signer before they’re logged in).

### User-visible UX (target)

- Default: existing wallet‑iframe flow continues to work (no extension required).
- If extension installed and user opts in: SDK routes wallet operations to the extension wallet.
- If extension not installed: SDK stays on wallet‑iframe and can optionally show a “Get the extension for improved security” CTA.
- Extension UX is minimalistic and embedded:
  - **Threshold signing stays embedded in the app** (same wallet‑iframe overlay/modal UX).
  - **Extension local signing runs in the extension**, and the transaction confirmer UI is shown in an **extension popup** (not the app origin).
  - Clicking the extension icon opens the **Side Panel** (not a popup), but the Side Panel is optional (settings/status only).
  - WebAuthn/PRF ceremonies are executed in a top-level extension surface (popup window) because Chromium does not reliably allow WebAuthn inside embedded `chrome-extension://…` iframes via Permissions-Policy delegation.

### Technical deliverables

1) **Extension wallet runtime**
- A MV3 Chrome extension that hosts the wallet service runtime (equivalent of today’s wallet service iframe host).
- Runs WebAuthn/PRF + workers + encrypted storage under the extension origin.
- Implementation note (current SDK): the wallet-host entrypoint is `sdk/src/core/WalletIframe/host/wallet-iframe-host.ts` (bundled as `wallet-iframe-host.js`), and the service page can be a minimal HTML wrapper that just loads that module (see `sdk/src/core/WalletIframe/client/html.ts:getWalletServiceHtml`).

2) **Routing shim (“auto transport”)**
- SDK today already has a single transport switch: when `iframeWallet.walletOrigin` is set, `TatchiPasskey` routes calls through `WalletIframeRouter` (see `sdk/src/core/TatchiPasskey/index.ts:initWalletIframe`).
- The “auto transport” work for the extension is therefore about *selection policy* (installed? opted in?) and *capability detection*, not about inventing a new wallet-iframe API surface.

3) **Migration flow**
- A guided in-product flow to “Upgrade to Extension”:
  - Create/register a new credential in the extension origin.
  - Add the new derived public key / authenticator to the existing NEAR account.
  - Optionally remove the old key/authenticator and wipe old wallet origin storage.

## 3) How we can implement this

### Phased TODO list

#### Phase 0 — Feasibility spike

- [x] Confirm WebAuthn does **not** work from an embedded `chrome-extension://…` iframe on Chrome stable
  - Exercise the existing wallet-iframe path (no new protocol): `sdk/src/core/WalletIframe/client/IframeTransport.ts` (iframe + CONNECT/READY) ↔ `sdk/src/core/WalletIframe/host/messaging.ts` (CONNECT adoption + READY).
  - Use a real registration call (`WalletIframeRouter.registerPasskey` in `sdk/src/core/WalletIframe/client/router.ts`, handled by `PM_REGISTER` in `sdk/src/core/WalletIframe/host/wallet-iframe-handlers.ts`).
  - Observed error: `NotAllowedError: The 'publickey-credentials-create' feature is not enabled in this document. Permissions Policy may be used to delegate Web Authentication capabilities to cross-origin child frames.`
- [x] Implement extension top-level WebAuthn/PRF flow via popup window (required for extension local signer)
  - SDK orchestration: `sdk/src/core/WebAuthnManager/WebAuthnFallbacks/safari-fallbacks.ts`
  - Popup host: `sdk/src/core/WalletIframe/host/popup-host.ts` (bundled as `wallet-popup-host.js`)
  - MV3 broker: `examples/chrome-extension/service-worker.js` (request/result registry)
  - Popup wrapper: `examples/chrome-extension/wallet-popup.html` (loads `/sdk/wallet-popup-host.js`)
- [ ] Confirm PRF extension works end-to-end in that context (request → `getClientExtensionResults().prf` shape → deterministic outputs)
  - Validate that `extractPrfFromCredential(...)` succeeds (no “Missing PRF results…” errors) in `sdk/src/core/WebAuthnManager/credentialsHelpers.ts`.
  - Validate we can serialize/clone PRF results across boundaries (`serializeRegistrationCredentialWithPRF(...)` and `normalizeClientExtensionOutputs(...)` in `sdk/src/core/WebAuthnManager/credentialsHelpers.ts`).
- [ ] Confirm Side Panel is viable as an optional settings/status UI (not required for signing):
  - [ ] `chrome.sidePanel` API availability in target Chrome versions
  - [ ] `chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })` works (no popup)
- [ ] Confirm embedding viability for Architecture A:
  - [ ] Extension exposes a wallet service page (e.g. `wallet-service.html`) + its assets via `web_accessible_resources`, restricted to app origins
    - Minimum viable service page can follow `sdk/src/plugins/plugin-utils.ts:buildWalletServiceHtml` (external CSS + `wallet-shims.js` + `wallet-iframe-host.js`).
  - [ ] App can `postMessage` a transferable `MessagePort` and receive `READY` (CONNECT → READY)
    - Client handshake: `sdk/src/core/WalletIframe/client/IframeTransport.ts:handshake`.
    - Host adoption gate: `sdk/src/core/WalletIframe/host/messaging.ts:onWindowMessage` (binds to `window.parent`, stores `parentOrigin` when non-null).
  - [x] Confirm app `Permissions-Policy` does **not** reliably delegate `publickey-credentials-*` to `chrome-extension://<extension_id>`
    - Keep `sdk/src/plugins/headers.ts:buildPermissionsPolicy` + `sdk/src/core/WalletIframe/client/IframeTransport.ts:buildAllowAttr` for the web wallet iframe, but do not depend on it for extension WebAuthn.
    - Extension WebAuthn/PRF must use the popup/top-level ceremony path.
  - [ ] App COEP (`require-corp`) does not break embedding (or document that app must set `coepMode: 'off'`)
- [ ] Add extension presence detection (non-signing-critical):
  - [ ] Prefer “can we CONNECT/READY?” as the primary presence check (reuses existing `IframeTransport.connect()`).
  - [ ] Optional: add an explicit health check RPC (`WalletIframeRouter.ping()` that sends `PING` and expects `PONG`); the host already handles `PING` in `sdk/src/core/WalletIframe/host/wallet-iframe-host.ts`.
  - [x] `externally_connectable` ping/pong for “installed?” + version (only needed for Architecture B)
    - Client: `sdk/src/core/ExtensionWallet/detect.ts:detectTatchiWalletExtension`.
    - Extension: `examples/chrome-extension/manifest.json` (`externally_connectable`) + `examples/chrome-extension/service-worker.js` (`TATCHI_EXT_PING` → `TATCHI_EXT_PONG`).
  - [ ] (Optional) content-script bridge if external messaging is insufficient for some deployments
- [ ] Record final constraints + go/no-go for Architecture A

Phase 0 dev harness (in-repo)
- Extension stub package (MV3): `examples/chrome-extension/`
  - Sync built SDK assets into the extension folder: `node examples/chrome-extension/scripts/sync-sdk.mjs` (copies `sdk/dist/esm/sdk` → `examples/chrome-extension/sdk` and `sdk/dist/workers` → `examples/chrome-extension/sdk/workers`).
- Use `examples/vite` as the host app harness (it already runs HTTPS via Caddy):
  - Run `pnpm -C examples/vite dev` and open `https://example.localhost`
  - Set `VITE_WALLET_ORIGIN=chrome-extension://<extension_id>` so the host app targets the extension wallet origin for embedding (note: this does **not** enable WebAuthn in the embedded extension iframe; WebAuthn uses the extension popup flow)
    - Or (recommended for migration / toggle): set a comma-separated list so the app can delegate to both:
      - `VITE_WALLET_ORIGIN=https://wallet.example.localhost,chrome-extension://<extension_id>`
      - The host app still chooses a **single** `iframeWallet.walletOrigin` at runtime.
  - Set `VITE_WALLET_SERVICE_PATH=/wallet-service.html` (or whatever path the extension exposes)
  - Host app config is already wired to env vars via `examples/vite/vite.config.ts` (headers) and `examples/vite/src/main.tsx` (`iframeWallet.*`).
  - Note: the SDK does **not** alias `/wallet-service` → `/wallet-service.html`; you must set `iframeWallet.walletServicePath` explicitly when using a `.html` page.
  - If embedding fails under app COEP, set `VITE_COEP_MODE=off` for the app pages

#### Phase 1 — Extension wallet runtime

- [x] Create `examples/chrome-extension/` (MV3) with `manifest.json`, build, and dev-load instructions
  - See: `examples/chrome-extension/README.md`
  - Include `web_accessible_resources` for `wallet-service.html` and the bundled SDK assets under `/sdk/*` (see Phase 1 packaging notes below).
  - If Architecture B is pursued, add `externally_connectable` allowlists here (Phase 0/2).
- [x] Implement Side Panel UI (optional; settings/status only):
  - [x] `manifest.json`: set `"side_panel": { "default_path": "sidepanel.html" }`
  - [x] `manifest.json`: omit `"action": { "default_popup": ... }` (icon click should not open a popup)
  - [x] Service worker: call `chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })`
- [x] Implement embedded wallet service page (Architecture A):
  - [x] Add a `wallet-service.html` inside the extension and ensure it boots the wallet host runtime by loading `wallet-iframe-host.js` (CONNECT/READY + `PM_*` handlers)
    - Template: `sdk/src/plugins/plugin-utils.ts:buildWalletServiceHtml` (strict-CSP friendly; no inline script/style).
  - [x] Add `web_accessible_resources` entries for `wallet-service.html` (and any necessary subresources), restricted to an allowlist of app origins
- [x] Package the wallet host runtime into the extension (equivalent of today’s wallet service host + handlers)
  - Use `examples/chrome-extension/scripts/sync-sdk.mjs`:
    - `sdk/dist/esm/sdk/*` → extension `sdk/*` (includes `wallet-iframe-host.js`, CSS, and all imported chunk files).
    - `sdk/dist/workers/*` → extension `sdk/workers/*` (includes `web3authn-*.worker.js` + `wasm_*_bg.wasm`).
- [ ] Ensure workers/WASM load correctly under extension URLs (no remote code, no eval)
- [ ] Implement extension-side persistent storage under extension origin (same encrypted-at-rest guarantees)
  - This should largely “just work” if we run the existing wallet host runtime: it’s already wallet-origin IndexedDB first (`sdk/src/core/WalletIframe/host/context.ts:ensurePasskeyManager` + `configureIndexedDB({ mode: 'wallet' })` inside `TatchiPasskey`).
- [x] Implement progress + cancellation plumbing so flows mirror `PROGRESS`/`PM_CANCEL` semantics
  - Protocol + envelopes: `sdk/src/core/WalletIframe/shared/messages.ts`.
  - Cancellation handler: `sdk/src/core/WalletIframe/host/wallet-iframe-host.ts` (`PM_CANCEL` branch).

#### Phase 2 — Routing shim (“auto transport”)

- [ ] Add extension detection + capability handshake (installed? version? PRF supported?)
  - Detection (Architecture A): treat a successful `CONNECT` → `READY` as “installed + reachable” (`sdk/src/core/WalletIframe/client/IframeTransport.ts:connect`).
  - SDK init fallback: when `useExtensionWallet=true` and both wallet targets are configured, attempt extension first but fall back to the web wallet if the extension iframe can’t reach `READY` quickly (implemented in `sdk/src/core/TatchiPasskey/index.ts:initWalletIframe`; uses `WalletIframeRouter.dispose({ removeIframe: true })` on failure).
  - Add an explicit health check RPC:
    - [x] Implement `WalletIframeRouter.ping()` by sending `PING` and expecting `PONG` (implemented in `sdk/src/core/WalletIframe/client/router.ts`; host already supports `PING` in `sdk/src/core/WalletIframe/host/wallet-iframe-host.ts`).
    - Optionally extend `PONG` to include `{ protocolVersion, sdkVersion, build }` by updating `sdk/src/core/WalletIframe/shared/messages.ts` and the host handler.
  - [x] Capability snapshot (optional): add a `PM_GET_CAPABILITIES` message that returns feature flags from the host runtime (implemented in `sdk/src/core/WalletIframe/shared/messages.ts` + `sdk/src/core/WalletIframe/host/wallet-iframe-host.ts`, client helper: `sdk/src/core/WalletIframe/client/router.ts:getCapabilities`).
    - PRF signal is best-effort:
      - `WalletIframeCapabilities.webauthnClientCapabilities`: sanitized booleans from `PublicKeyCredential.getClientCapabilities()` when supported.
      - `WalletIframeCapabilities.hasPrfExtension`: derived from `webauthnClientCapabilities.prf` when present (otherwise `undefined`).
- [x] Allow multi-origin `Permissions-Policy` delegation during migration (web wallet; extension WebAuthn still uses popup)
  - Header builder supports arrays: `sdk/src/plugins/headers.ts:buildPermissionsPolicy(walletOrigin?: string | string[])`.
  - Vite plugin accepts `walletOrigin?: string | string[]` (and comma-separated strings) in `sdk/src/plugins/vite.ts` (`tatchiHeaders`, `tatchiApp`, `tatchiBuildHeaders`).
  - Next helpers accept `walletOrigin: string | string[]` (and comma-separated strings) in `sdk/src/plugins/next.ts`.
  - Note: keep `iframeWallet.walletOrigin` a single origin; use plugin options when you need multiple delegated origins.
- [x] Add user preference gate (“use extension wallet”) with safe default = wallet‑iframe
  - Store as non-sensitive app state (e.g., localStorage) or as a per-user preference:
    - [x] In-repo harness: `examples/vite/src/components/DebugBanner.tsx` stores a dev-only toggle in localStorage (`w3a_use_extension_wallet`) and reloads to apply it before SDK init.
    - [x] Optional: per-user preference persistence (implemented):
      - SDK preference API: `sdk/src/core/WebAuthnManager/userPreferences.ts` (`UserPreferencesManager.getUseExtensionWallet()` / `setUseExtensionWallet(...)`).
      - IndexedDB field: `sdk/src/core/IndexedDBManager/passkeyClientDB.ts` (`UserPreferences.useExtensionWallet?: boolean`).
      - Startup gating cache: localStorage `w3a_use_extension_wallet` (and per-user `w3a_use_extension_wallet:<accountId>`), written by `setUseExtensionWallet(...)`.
      - Note: app-origin storage is the only place this can be read *before* choosing which wallet origin to mount (web vs extension).
  - Ensure the preference is enforced *before* constructing/initializing a router (avoid mounting an extension iframe when not opted-in).
    - For apps configuring both wallets, set `iframeWallet.walletOrigin` (web) + `iframeWallet.extensionWalletOrigin` (extension) and call `tatchi.userPreferences.setUseExtensionWallet(true)` before `initWalletIframe()` (or set localStorage `w3a_use_extension_wallet=1` before boot).
- [x] Route all SDK calls through a unified transport interface (wallet‑iframe vs extension) with identical results/events
  - Current switch point is `TatchiPasskey.shouldUseWalletIframe()` / `requireWalletIframeRouter()` in `sdk/src/core/TatchiPasskey/index.ts`.
  - For Architecture A, the extension is “just another wallet origin”: the shim chooses between:
    - Web wallet: `iframeWallet.walletOrigin` + `iframeWallet.walletServicePath`
    - Extension wallet: `iframeWallet.extensionWalletOrigin` + `iframeWallet.extensionWalletServicePath` (defaults to `/wallet-service.html`)
  - Selection is based on `UserPreferencesManager.getUseExtensionWallet()` (backed by app-origin localStorage `w3a_use_extension_wallet`) and is applied before mounting/connecting the iframe router.
    - When the extension wallet target is selected but can’t connect, SDK falls back to the web wallet target for that session (preference remains unchanged).
  - Preserve progress + overlay semantics by continuing to rely on `WalletIframeRouter` + `OnEventsProgressBus` (`sdk/src/core/WalletIframe/client/router.ts`, `sdk/src/core/WalletIframe/client/on-events-progress-bus.ts`).
- [ ] Implement signing policy routing (threshold vs local) and defaults
  - Default unauthenticated flows to threshold signer:
    - `sdk/src/core/TatchiPasskey/registration.ts`
    - `sdk/src/core/TatchiPasskey/login.ts`
    - `sdk/src/core/TatchiPasskey/emailRecovery.ts`
    - `sdk/src/core/TatchiPasskey/syncAccount.ts`
  - For signing entrypoints, select wallet origin by signer kind:
    - Threshold signing always uses the web wallet (`wallet-iframe`) origin (embedded in app).
    - Local signing prefers the extension wallet when it’s reachable and has an initialized account; otherwise fall back to the web wallet local signer.
  - Implementation will likely require keeping both routers available (web + extension) and selecting per-request rather than a single global `iframeWallet.walletOrigin`.
- [x] Define compatibility policy (protocol versioning + forward/backward strategy)
  - Versioning: `WalletProtocolVersion` is semver; major bumps are breaking, minor/patch are additive (new fields/message types must be optional and ignored by older peers).
  - Source of truth: `WALLET_PROTOCOL_VERSION` in `sdk/src/core/WalletIframe/shared/messages.ts`, sent in `READY` and cached by the client (`sdk/src/core/WalletIframe/client/IframeTransport.ts:getProtocolVersion` -> `sdk/src/core/WalletIframe/client/router.ts:getProtocolVersion`).
  - Feature gating: use best-effort probes (`WalletIframeRouter.getCapabilities({ timeoutMs: ... })`, `WalletIframeRouter.ping({ timeoutMs: ... })`) and treat timeouts/errors as "unsupported" to keep older extensions working.
  - Mismatch policy: if the extension major protocol differs from the SDK major, treat the extension as incompatible and fall back to the web wallet origin for that session when configured.

#### Phase 3 — Migration (“Upgrade to Extension”)

- [x] Add SDK migration flow scaffolding (typed events + public API)
  - Types: `sdk/src/core/types/extensionMigration.ts` (steps/status + progress events)
  - Flow scaffold: `sdk/src/core/TatchiPasskey/extensionMigration.ts`
  - Public API: `sdk/src/core/TatchiPasskey/index.ts:startExtensionMigration()` / `cancelExtensionMigration()` / `getExtensionMigrationState()`
  - Prechecks currently verify extension wallet reachability via `WalletIframeRouter.init()` + `ping()`/`getCapabilities()` and surface protocol/capability info in events.
  - Extension-origin registration now uses `WalletIframeRouter.registerPasskey(...)` (PM_REGISTER); note this path currently assumes account creation and will error if the account already exists.
  - React wiring: `sdk/src/react/hooks/useExtensionMigration.ts` + context methods in `sdk/src/react/context/useTatchiContextValue.ts`.
- [ ] Add in-app CTA + settings entrypoint and a guided migration UI
- [ ] Implement extension-scoped registration to create a new credential + derive new public key
  - Reuse existing registration pipeline:
    - Client call: `TatchiPasskey.registerPasskey(...)` (routes to `WalletIframeRouter.registerPasskey(...)` when `iframeWallet.walletOrigin` is set) in `sdk/src/core/TatchiPasskey/index.ts`.
    - Host handler: `PM_REGISTER` in `sdk/src/core/WalletIframe/host/wallet-iframe-handlers.ts`.
    - User-confirm UI + PRF enforcement: confirmTxFlow registration in `sdk/src/core/WebAuthnManager/VrfWorkerManager/confirmTxFlow/flows/registration.ts`.
  - Source of “new public key” for AddKey: `RegistrationResult.clientNearPublicKey` (`sdk/src/core/types/tatchi.ts`).
- [x] Implement “link new key to existing account” using the wallet‑iframe to authorize `add_key`
  - Uses the existing web wallet to sign the AddKey transaction (new extension-derived key is not on-chain yet).
  - Implemented in `sdk/src/core/TatchiPasskey/extensionMigration.ts:linkExtensionKeyOnChain(...)` via `WalletIframeRouter.executeAction(...)`.
  - Verifies the new key via `WalletIframeRouter.viewAccessKeyList(...)` with retries; best-effort rollback uses `DeleteKey` when verification fails.
- [x] Optional hardening step: remove old key (`delete_key`) and wipe wallet‑iframe origin storage
  - Implemented as best-effort cleanup in `sdk/src/core/TatchiPasskey/extensionMigration.ts` when `options.cleanup` is set.
  - On-chain key removal uses `WalletIframeRouter.executeAction(...DeleteKey)`; optional and skipped when the old key cannot be resolved.
  - Wallet-origin storage wipe uses `WalletIframeRouter.clearUserData(...)` (new `PM_CLEAR_USER_DATA` handler in `sdk/src/core/WalletIframe/host/wallet-iframe-handlers.ts`).
- [x] Persist “migration complete” state and switch routing to extension by default for that user
  - Implemented by setting the `use extension wallet` preference in `sdk/src/core/TatchiPasskey/extensionMigration.ts` after AddKey verification (no separate migration flag yet).

#### Phase 4 — Security review + rollout

- [ ] Minimize extension permissions; document threat model and trust boundaries
  - Prefer a “static host” extension: no host permissions, no content scripts unless Architecture B requires it.
- [ ] Lock down external messaging allowlists and validate all request origins/ids
  - Architecture A: restrict `web_accessible_resources` matches to known app origins.
  - Architecture B: enforce allowlists in `manifest.json` (`externally_connectable`) and re-check `origin`/sender at runtime (mirror the “must be parent window” gate used today in `sdk/src/core/WalletIframe/host/messaging.ts:shouldAcceptConnectEvent`).
- [ ] Add telemetry + error reason reporting (extension unavailable, handshake failed, PRF unsupported, etc.)
  - Connection failure surfaces live in `sdk/src/core/WalletIframe/client/IframeTransport.ts` (READY timeout / postMessage failures) and `sdk/src/core/WalletIframe/client/router.ts` (post errors).
  - Consider adding a structured “connect failure reason” enum at the SDK boundary (timeout vs blocked embed vs WebAuthn blocked-in-iframe vs missing PRF).
- [ ] Ship as opt-in beta, then progressively roll out; define rollback/recovery behavior

### Phase 0 — Feasibility spike (must-do first)

We need to validate browser constraints before committing to an architecture:

- WebAuthn + PRF inside an embedded `chrome-extension://…` iframe page:
  - `navigator.credentials.create/get()` is blocked with a Permissions-Policy NotAllowedError (Chromium platform limitation for `chrome-extension://…` embedded frames).
  - Resolution: perform WebAuthn/PRF in a top-level extension surface (popup window), then return the credential to the embedded flow.
- Embed + handshake viability:
  - Extension page can be embedded via `web_accessible_resources` (tight allowlist).
  - Existing MessageChannel handshake works: parent posts CONNECT with a transferred MessagePort and receives READY.
- Header viability:
  - Do not depend on app `Permissions-Policy` delegation for WebAuthn capabilities to `chrome-extension://…` origins.
  - App COEP (`require-corp`) does not block extension embedding (or must be disabled on app pages).

**Exit criteria**: validate Architecture A feasibility and document the hard constraints (or explicitly fall back to Architecture B).

### Phase 1 — Choose an architecture

#### Architecture A (primary): reuse wallet-iframe router with an extension-hosted “wallet service page”

Goal: keep the existing `WalletIframeRouter` + message protocol unchanged, but swap the wallet service origin from `https://wallet.example.com` to `chrome-extension://<id>`.

- Package the existing wallet host page + bundles (workers/WASM/Lit UI) into the extension.
- Configure `iframeWallet.walletOrigin = "chrome-extension://<extension_id>"` and `iframeWallet.walletServicePath` to the extension wallet service page (e.g. `/wallet-service.html`).
- Keep the same overlay + progress-bus mechanics for user activation.

Key requirements/risks:

- **`web_accessible_resources`**: the extension must explicitly expose the wallet service page (and its static assets) to be iframe-embedded. Lock this down to an allowlist of app origins.
- **Popup ceremony**: embedded extension frames can’t reliably call WebAuthn; use the extension popup ceremony path for `navigator.credentials.create/get`.
- **COEP on app pages**: if the app uses COEP `require-corp`, it may block embedding extension pages. If so, app pages must set `coepMode: 'off'` (wallet isolation still comes from the extension origin).
- **No Safari fallback**: the Safari “bridge to top-level” path does not apply for an extension-scoped `rpId`.

#### Architecture B (fallback): extension-native transport + extension-controlled UI

Goal: do not rely on embedding the extension in an iframe. Instead, the web app routes requests to the extension via Chrome messaging, and the extension performs user-activation + WebAuthn inside an extension-controlled UI surface.

Recommended building blocks:

- **Web ↔ extension RPC**
  - Use `externally_connectable` if feasible; otherwise use a content-script bridge with a strict origin allowlist.
  - Define a request/response protocol matching today’s `ParentToChildEnvelope` / `ChildToParentEnvelope` in `sdk/src/core/WalletIframe/shared/messages.ts` (same `requestId`, `PROGRESS`, `PM_RESULT`, `ERROR`).
- **Extension wallet UI**
  - Use an extension page (tab or window) to host the wallet runtime + UI components.
  - For operations requiring user activation, ensure the user action occurs inside the extension page (click within extension UI).
- **Runtime placement**
  - Keep the existing wallet-host execution model (same handler map) but replace MessagePort transport with `chrome.runtime.Port`.

Tradeoff: UX may look slightly different (extension-controlled surface vs in-page iframe modal), but it avoids Permissions-Policy coupling to the web app.

### Phase 2 — Implement the routing shim (“auto transport”)

Add a routing layer that makes transport selection explicit and deterministic:

- Detection:
  - Detect extension presence (handshake + version check).
  - Cache capability flags (PRF available, supported UI surface, etc.).
- Selection policy:
  - Default to wallet‑iframe.
  - Route to extension only when:
    - extension is installed and healthy, and
    - user has opted into “use extension wallet”.
- API compatibility:
  - Keep the public SDK API identical; the shim chooses transport internally.
  - Ensure progress events and cancel semantics remain the same (`PROGRESS`, `PM_CANCEL` behavior).

### Phase 3 — Implement migration (“Upgrade to Extension”)

Because the extension origin implies a different `rpId`, migration is not a “move the same credential”; it is “add a new credential/key and optionally remove the old one”.

Plan:

1) Preconditions / UX entry
- User has a working wallet‑iframe account (logged in or can log in).
- App shows an “Upgrade to Extension” CTA after onboarding, or in settings.

2) Create extension-scoped credential + keys
- In extension wallet, run a registration ceremony under the extension `rpId`.
- Derive the new NEAR public key (or equivalent on-chain authenticator material) from the new PRF output.
- Persist encrypted key material under the extension origin.

3) Link the new key/authenticator to the existing on-chain account
- Use the existing wallet‑iframe to authorize the account change (it already controls the current access key):
  - Extension sends **only** the new public key (never secrets) to the web app.
  - Wallet‑iframe signs an `add_key` / “add authenticator” transaction to attach the new credential-derived key to the same account.

4) Post-migration state
- Mark user preference “use extension wallet” and route local signing to the extension by default.
- Keep the prior (web wallet) key material in place for recovery; do not `delete_key` as part of migration.

5) Recovery
- If the extension becomes unavailable, fall back to the web wallet for local signing with a clear warning that this is a weaker security posture.

### Phase 4 — Safety, rollout, and maintenance

- Security review:
  - Extension CSP, permissions minimization, strict origin allowlist for external messaging.
  - No secret material ever crosses from extension to web app (only public keys, tx hashes, and non-sensitive status).
- Rollout:
  - Start with an opt-in beta flag + small cohort.
  - Add telemetry hooks (success/failure reasons, “extension unavailable” fallback rate).
- Operational:
  - Pin a stable extension id for production (migration is tied to `rpId` = extension host).
- Versioned protocol between web SDK and extension for backward compatibility.

### Phase 5 — Extension signer UX improvements (post-migration)

- [ ] Show the Tx confirmer UI inside the extension popup for extension-local signing
  - Never mount/show the confirmer UI in the app origin for extension-local signing.
  - Implementation: add a confirm-popup broker in `examples/chrome-extension/service-worker.js`, render the Lit `w3a-tx-confirmer` inside a new `wallet-confirm.html` popup, and have confirmTxFlow’s UI adapter (`sdk/src/core/WebAuthnManager/VrfWorkerManager/confirmTxFlow/adapters/ui.ts`) route confirms through that popup in `chrome-extension://` contexts.
- [ ] Skip per-transaction TouchID for extension-local signing
  - Use warm sessions (`signingAuthMode: 'warmSession'`) for extension-local signing.
  - Lock/unlock the extension signer on login/logout (warm session minted on login; cleared on logout).
  - Make “extension signer locked” a clear, actionable error (e.g., “Open the extension side panel and log in to unlock signing.”).
- [ ] Add the `AccountMenuButton` UI to the Chrome extension Side Panel
  - Render `sdk/src/react/components/AccountMenuButton` inside `examples/chrome-extension/sidepanel.html`.
  - Side panel should show account + TransactionSettings and drive login/logout to lock/unlock the extension signer.

## Open questions (to resolve in Phase 0)

- Does Chromium allow WebAuthn PRF from an embedded `chrome-extension://…` iframe page reliably?
  - No (blocked); use the extension popup/top-level ceremony path.
- Does `Permissions-Policy` accept `chrome-extension://<id>` origins for `publickey-credentials-*` delegation across Chrome versions?
  - Not reliably; do not depend on this for extension WebAuthn.
- Does app-page COEP `require-corp` block embedding extension pages (and if so, must the app set `coepMode: 'off'`)?
- What is the minimal `web_accessible_resources` surface area we can expose while keeping the embedded UX?
- What is the best embedded user-activation UX that still “feels” like the current wallet-iframe modal?

## Next steps (from here)

- Implement the signing policy routing:
  - Force threshold signer for unauthenticated flows: `sdk/src/core/TatchiPasskey/registration.ts`, `sdk/src/core/TatchiPasskey/login.ts`, `sdk/src/core/TatchiPasskey/emailRecovery.ts`, `sdk/src/core/TatchiPasskey/syncAccount.ts`.
  - For signing entrypoints (`sdk/src/core/TatchiPasskey/actions.ts`, `sdk/src/core/TatchiPasskey/delegateAction.ts`, `sdk/src/core/TatchiPasskey/signNEP413.ts`), route:
    - threshold-signing → web wallet (`wallet-iframe`) always
    - local-signing → extension wallet if “extension ready”, else web wallet local signer
  - Implement a single “extension ready” check using `WalletIframeRouter.ping()` + `WalletIframeRouter.getLoginSession()` (reachable + has an initialized account).
- Add tests:
  - Unit tests that cover the routing matrix (threshold vs local, extension-ready vs not-ready) and validate preference flips/rollback behavior.
