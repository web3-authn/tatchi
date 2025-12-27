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

### User-visible UX (target)

- Default: existing wallet‑iframe flow continues to work (no extension required).
- If extension installed and user opts in: SDK routes wallet operations to the extension wallet.
- If extension not installed: SDK stays on wallet‑iframe and can optionally show a “Get the extension for improved security” CTA.
- Extension UX is minimalistic and embedded:
  - **Signing and registration stay embedded in the app** (same wallet‑iframe overlay/modal UX).
  - Clicking the extension icon opens the **Side Panel** (not a popup), but the Side Panel is optional (settings/status only).

### Technical deliverables

1) **Extension wallet runtime**
- A MV3 Chrome extension that hosts the wallet service runtime (equivalent of today’s wallet service iframe host).
- Runs WebAuthn/PRF + workers + encrypted storage under the extension origin.

2) **Routing shim (“auto transport”)**
- A shim layer that routes each Tatchi SDK call to either:
  - (i) the extension wallet runtime (if installed + user opted in), or
  - (ii) the existing wallet‑iframe (default).

3) **Migration flow**
- A guided in-product flow to “Upgrade to Extension”:
  - Create/register a new credential in the extension origin.
  - Add the new derived public key / authenticator to the existing NEAR account.
  - Optionally remove the old key/authenticator and wipe old wallet origin storage.

## 3) How we can implement this

### Phased TODO list

#### Phase 0 — Feasibility spike

- [ ] Confirm WebAuthn works from an **embedded `chrome-extension://…` iframe** on Chrome stable
- [ ] Confirm PRF extension works end-to-end in that context (request → `getClientExtensionResults().prf` shape → deterministic outputs)
- [ ] Confirm Side Panel is viable as an optional settings/status UI (not required for signing):
  - [ ] `chrome.sidePanel` API availability in target Chrome versions
  - [ ] `chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })` works (no popup)
- [ ] Confirm embedding viability for Architecture A:
  - [ ] Extension exposes `wallet-service.html` + assets via `web_accessible_resources`, restricted to app origins
  - [ ] App can `postMessage` a transferable `MessagePort` and receive `READY` (CONNECT → READY)
  - [ ] App `Permissions-Policy` can delegate `publickey-credentials-*` to `chrome-extension://<extension_id>`
  - [ ] App COEP (`require-corp`) does not break embedding (or document that app must set `coepMode: 'off'`)
- [ ] Add extension presence detection (non-signing-critical):
  - [ ] `externally_connectable` ping/pong for “installed?” + version
  - [ ] (Optional) content-script bridge if external messaging is insufficient for some deployments
- [ ] Record final constraints + go/no-go for Architecture A

Phase 0 dev harness (in-repo)
- Extension wallet-service stub: `apps/tatchi-wallet-extension/wallet-service.html`
- App embed + MessagePort handshake harness: `examples/vite/public/phase0-extension.html`
  - Run `pnpm -C examples/vite dev` (HTTPS via Caddy) and open `https://example.localhost/phase0-extension.html`
  - Set `VITE_WALLET_ORIGIN=chrome-extension://<extension_id>` so the dev server emits `Permissions-Policy` for the extension origin
  - Extension exposes `wallet-service.html` via `web_accessible_resources`
  - SDK aliases the default `/wallet-service` path to `/wallet-service.html` for `chrome-extension://…` wallet origins
  - If embedding fails under app COEP, set `VITE_COEP_MODE=off` for the app pages

#### Phase 1 — Extension wallet runtime

- [ ] Create `apps/tatchi-wallet-extension/` (MV3) with `manifest.json`, build, and dev-load instructions
- [ ] Implement Side Panel UI (optional; settings/status only):
  - [ ] `manifest.json`: set `"side_panel": { "default_path": "sidepanel.html" }`
  - [ ] `manifest.json`: omit `"action": { "default_popup": ... }` (icon click should not open a popup)
  - [ ] Service worker: call `chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })`
- [ ] Implement embedded wallet service page (Architecture A):
  - [ ] Add a `wallet-service.html` equivalent inside the extension and ensure it boots the wallet host runtime (CONNECT/READY + `PM_*` handlers)
  - [ ] Add `web_accessible_resources` entries for `wallet-service.html` (and any necessary subresources), restricted to an allowlist of app origins
- [ ] Package the wallet host runtime into the extension (equivalent of today’s wallet service host + handlers)
- [ ] Ensure workers/WASM load correctly under extension URLs (no remote code, no eval)
- [ ] Implement extension-side persistent storage under extension origin (same encrypted-at-rest guarantees)
- [ ] Implement progress + cancellation plumbing so flows mirror `PROGRESS`/`PM_CANCEL` semantics

#### Phase 2 — Routing shim (“auto transport”)

- [ ] Add extension detection + capability handshake (installed? version? PRF supported?)
- [ ] Add user preference gate (“use extension wallet”) with safe default = wallet‑iframe
- [ ] Route all SDK calls through a unified transport interface (wallet‑iframe vs extension) with identical results/events
- [ ] Define compatibility policy (protocol versioning + forward/backward strategy)

#### Phase 3 — Migration (“Upgrade to Extension”)

- [ ] Add in-app CTA + settings entrypoint and a guided migration UI
- [ ] Implement extension-scoped registration to create a new credential + derive new public key
- [ ] Implement “link new key to existing account” using the wallet‑iframe to authorize `add_key`/authenticator add
- [ ] Optional hardening step: remove old key (`delete_key`) and wipe wallet‑iframe origin storage
- [ ] Persist “migration complete” state and switch routing to extension by default for that user

#### Phase 4 — Security review + rollout

- [ ] Minimize extension permissions; document threat model and trust boundaries
- [ ] Lock down external messaging allowlists and validate all request origins/ids
- [ ] Add telemetry + error reason reporting (extension unavailable, handshake failed, PRF unsupported, etc.)
- [ ] Ship as opt-in beta, then progressively roll out; define rollback/recovery behavior

### Phase 0 — Feasibility spike (must-do first)

We need to validate browser constraints before committing to an architecture:

- WebAuthn + PRF inside an embedded `chrome-extension://…` iframe page:
  - `navigator.credentials.create/get()` is allowed and user-activation behaves as expected.
  - PRF extension results are present and stable (`getClientExtensionResults().prf.results.{first,second}`).
- Embed + handshake viability:
  - Extension page can be embedded via `web_accessible_resources` (tight allowlist).
  - Existing MessageChannel handshake works: parent posts CONNECT with a transferred MessagePort and receives READY.
- Header viability:
  - App can delegate WebAuthn via `Permissions-Policy` to `chrome-extension://<extension_id>`.
  - App COEP (`require-corp`) does not block extension embedding (or must be disabled on app pages).

**Exit criteria**: validate Architecture A feasibility and document the hard constraints (or explicitly fall back to Architecture B).

### Phase 1 — Choose an architecture

#### Architecture A (primary): reuse wallet-iframe router with an extension-hosted “wallet service page”

Goal: keep the existing `WalletIframeRouter` + message protocol unchanged, but swap the wallet service origin from `https://wallet.example.com` to `chrome-extension://<id>`.

- Package the existing wallet host page + bundles (workers/WASM/Lit UI) into the extension.
- Configure `iframeWallet.walletOrigin = "chrome-extension://<extension_id>"` and `walletServicePath` to the extension wallet service page (`/wallet-service.html`).
- Keep the same overlay + progress-bus mechanics for user activation.

Key requirements/risks:

- **`web_accessible_resources`**: the extension must explicitly expose the wallet service page (and its static assets) to be iframe-embedded. Lock this down to an allowlist of app origins.
- **Permissions-Policy**: the app origin must delegate `publickey-credentials-*` to the extension origin so the embedded extension frame can call WebAuthn.
- **COEP on app pages**: if the app uses COEP `require-corp`, it may block embedding extension pages. If so, app pages must set `coepMode: 'off'` (wallet isolation still comes from the extension origin).
- **No Safari fallback**: the Safari “bridge to top-level” path does not apply for an extension-scoped `rpId`.

#### Architecture B (fallback): extension-native transport + extension-controlled UI

Goal: do not rely on embedding the extension in an iframe. Instead, the web app routes requests to the extension via Chrome messaging, and the extension performs user-activation + WebAuthn inside an extension-controlled UI surface.

Recommended building blocks:

- **Web ↔ extension RPC**
  - Use `externally_connectable` if feasible; otherwise use a content-script bridge with a strict origin allowlist.
  - Define a request/response protocol matching today’s `ParentToChildEnvelope` / `ChildToParentEnvelope` (same `requestId`, `PROGRESS`, `PM_RESULT`, `ERROR`).
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

4) Optional hardening cleanup (user choice)
- Remove old on-chain key/authenticator (e.g., `delete_key`) once the new one is confirmed active.
- Wipe wallet‑iframe origin encrypted blobs / metadata (logout + clear DB) so the old origin no longer holds usable material.

5) Post-migration state
- Mark user preference “use extension wallet” and route all subsequent SDK calls to the extension.
- Keep a recovery path to revert to wallet‑iframe if extension becomes unavailable (with clear warning that this reintroduces the weaker security posture).

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

## Open questions (to resolve in Phase 0)

- Does Chromium allow WebAuthn PRF from an embedded `chrome-extension://…` iframe page reliably?
- Does `Permissions-Policy` accept `chrome-extension://<id>` origins for `publickey-credentials-*` delegation across Chrome versions?
- Does app-page COEP `require-corp` block embedding extension pages (and if so, must the app set `coepMode: 'off'`)?
- What is the minimal `web_accessible_resources` surface area we can expose while keeping the embedded UX?
- What is the best embedded user-activation UX that still “feels” like the current wallet-iframe modal?
