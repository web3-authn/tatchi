**Summary**
- Goal: Keep the wallet UI + logic inside a cross‑origin iframe while making WebAuthn work on Safari.
- Constraint: No popups or redirects; the wallet must remain embedded.
- Approach: Run WebAuthn in the iframe by default. For Safari’s cross‑origin limitation on creation, fall back to a parent‑performed bridge that executes the WebAuthn call in the top‑level document and postMessages the serialized credential back to the wallet iframe.

**Current Decision**
- Default RP ID: `example.localhost` (the parent/base domain) for wallet‑iframe mode.
- Rationale: Ensures the Safari bridge can execute WebAuthn at the top level without RP ID mismatches, keeping the UI fully cross‑origin in the iframe. This is the most reliable path across engines without popups.
- Tradeoff: Credentials are scoped to the parent/base domain. If you later require wallet‑domain scoping, adopt Related Origin Requests (ROR) or a wallet‑origin top‑level context.

**Browser Behavior**
- Chromium/Firefox: Allow WebAuthn in cross‑origin iframes with proper `Permissions-Policy` and iframe `allow` attributes.
- Safari:
  - Creation (registration) is blocked in cross‑origin iframes with a NotAllowedError about ancestors’ origin.
  - Assertion (authentication/login) can work inside a cross‑origin iframe if the parent delegates permission and it’s triggered by a user gesture. If Safari still throws the ancestor error, use the same parent bridge as a fallback.

**What We Implemented**
- Parent bridge on the host page: Listens for `WALLET_WEBAUTHN_CREATE` and `WALLET_WEBAUTHN_GET`, performs `navigator.credentials.create/get()` at top‑level, serializes, and replies with `WALLET_WEBAUTHN_*_RESULT` to the wallet iframe.
  - File: `passkey-sdk/src/core/WalletIframe/client/IframeTransport.ts:87` (create) and `:106` (get)
  - Security: filters by `event.origin === walletOrigin`; replies with `postMessage(..., walletOrigin)`.
- Wallet fallback inside the iframe:
  - Registration: On Safari’s ancestor error, send `WALLET_WEBAUTHN_CREATE` to the parent and await the result.
    - File: `passkey-sdk/src/core/WebAuthnManager/touchIdPrompt.ts:241`
  - Assertion: Try normally from the iframe. If the ancestor error occurs, send `WALLET_WEBAUTHN_GET` to the parent and await the result.
    - File: `passkey-sdk/src/core/WebAuthnManager/touchIdPrompt.ts:316`
- Serialized‑credential acceptance: When the bridge returns a credential already serialized with PRF outputs, downstream paths detect it and skip re‑serialization.
  - Files: `passkey-sdk/src/core/WebAuthnManager/SignerWorkerManager/confirmTxFlow/flows/registration.ts:120`, `passkey-sdk/src/core/WebAuthnManager/touchIdPrompt.ts:146, 175`

**Runtime Flow**
- Normal path (all browsers):
  1) Iframe calls `navigator.credentials.create/get()` with explicit `rpId` and PRF extension.
  2) Serialize credential with PRF; proceed with the VRF + signing flows.
- Safari fallback:
  1) Iframe call throws ancestor NotAllowedError.
  2) Iframe posts `WALLET_WEBAUTHN_CREATE` (or `...GET`) + `requestId` + options to `window.parent`.
  3) Parent executes WebAuthn at top level, serializes, and returns `WALLET_WEBAUTHN_*_RESULT`.
  4) Iframe resolves the pending promise and proceeds.

**RP ID Strategy**
- Default: The wallet picks an `rpId` via `TouchIdPrompt.getRpId()`
  - If an override is provided and is a registrable suffix of the host, use it; otherwise use the iframe host (wallet) hostname.
  - File: `passkey-sdk/src/core/WebAuthnManager/touchIdPrompt.ts:123`
- Parent bridge behavior: By default the parent bridge sets `rp.id` or `rpId` to the top‑level hostname if it is not provided. If `rp.id`/`rpId` is provided by the wallet, it is preserved (enabling ROR scenarios).
  - Default binds credentials to the parent domain.
  - Current default: Keep `rpId = example.localhost` to align with the parent bridge and avoid mismatches.
  - If you require credentials bound to the wallet domain while still creating them at top level, enable Related Origin Requests (ROR) and pass the wallet RP ID through.

**Related Origin Requests (ROR)**
- ROR lets a top‑level page on Origin A create/assert credentials for RP ID B if B opts‑in.
- Serve `/.well-known/webauthn` on the wallet origin with JSON that lists the parent origin as allowed.
- Example (hosted at `https://wallet-provider.com/.well-known/webauthn`):
```
{
  "origins": [
    "https://www.example.com"
  ]
}
```
- With ROR, the parent can execute `navigator.credentials.create()` using `rp.id = "wallet-provider.com"`, keeping credentials bound to the wallet domain, while still running at top‑level on the parent. Treat as progressive enhancement (Safari 18+).
 - Dev convenience: The Vite plugin serves `/.well-known/webauthn` when `VITE_ROR_ALLOWED_ORIGINS` is set (comma‑separated). In `examples/vite-secure`, this is also wired via the `relatedOrigins` option.

**Permissions Policy + Iframe Allow**
- Parent response header should delegate:
  - `Permissions-Policy: publickey-credentials-get=(self "https://wallet.example.localhost"), publickey-credentials-create=(self "https://wallet.example.localhost")`
- Iframe element `allow` attribute:
  - Safari fallback (permissive): `publickey-credentials-get *; publickey-credentials-create *; clipboard-read; clipboard-write`
  - Other engines: `publickey-credentials-get 'self' https://wallet.example.localhost; publickey-credentials-create 'self' https://wallet.example.localhost; clipboard-read; clipboard-write`
  - File: `passkey-sdk/src/core/WalletIframe/client/IframeTransport.ts:131`

**Security Considerations**
- Parent bridge implies the parent can observe and mediate WebAuthn calls executed at the top level.
- Always:
  - Validate `event.origin === walletOrigin` in the parent bridge.
  - Use correlation `requestId` and timeouts.
  - Target replies to the wallet origin, not `*`.
  - Consider ROR if you must bind credentials to the wallet domain but execute at the parent.
- If the threat model forbids parent‑executed WebAuthn, the only alternative is a wallet‑origin top‑level context (popup/redirect), which this project avoids by design.

**When To Bridge**
- Creation (registration): Always bridge on Safari when the ancestor error is thrown. If Safari reports “The document is not focused”, the iframe first attempts a quick refocus+retry, then bridges if still blocked.
- Assertion (authorization/login): Attempt in the iframe with proper delegation and user gesture. If Safari throws either the ancestor error or “The document is not focused”, perform a quick refocus+retry and then bridge to the parent as a fallback.

**Testing Checklist (Safari)**
- Observe initial iframe attempt and ancestor NotAllowedError for create().
- Confirm parent bridge receives `WALLET_WEBAUTHN_CREATE` and returns `..._RESULT`.
- Ensure serialized credential contains PRF results and flows continue.
- For get(), validate it works inside the iframe with proper delegation; if not, confirm the fallback.
- Verify `rpId` logs from the iframe and ensure they match your policy (parent domain vs wallet domain with ROR).

**Key File Touchpoints**
- Iframe → parent bridge invocation and fallbacks
  - `passkey-sdk/src/core/WebAuthnManager/touchIdPrompt.ts:241` (create fallback)
  - `passkey-sdk/src/core/WebAuthnManager/touchIdPrompt.ts:316` (get fallback)
- Parent bridge handlers and iframe permissions
  - `passkey-sdk/src/core/WalletIframe/client/IframeTransport.ts:87` (create handler)
  - `passkey-sdk/src/core/WalletIframe/client/IframeTransport.ts:106` (get handler)
  - `passkey-sdk/src/core/WalletIframe/client/IframeTransport.ts:131` (iframe allow)
- Serialized credential handling with PRF
  - `passkey-sdk/src/core/WebAuthnManager/credentialsHelpers.ts:1`
  - `passkey-sdk/src/core/WebAuthnManager/SignerWorkerManager/confirmTxFlow/flows/registration.ts:120`

**Operational Notes**
- The bridge is only used when the iframe attempt fails with the Safari ancestor error; other browsers stay on the direct path.
- If you need to forbid parent‑scoped credentials, implement ROR and avoid overriding `rp.id` inside the parent bridge.

**Implementation Plan**
- Scope: Only apply the parent bridge for WebAuthn creation (registration + link‑device flows). Keep assertions in‑iframe with delegation; use bridge only on ancestor error.
- Parent Bridge (top‑level): Handle `WALLET_WEBAUTHN_CREATE` and perform `navigator.credentials.create()`; serialize with PRF; `postMessage` result to wallet iframe origin. Preserve `rp.id` if provided to support ROR.
- Iframe Fallback (wallet): On NotAllowedError “origin … not the same as its ancestors”, post `WALLET_WEBAUTHN_CREATE` with options and await `WALLET_WEBAUTHN_CREATE_RESULT`.
- Security: Validate `event.origin`, correlate with `requestId`, and time out listeners.
- RP ID: Default to base domain (`example.localhost`) for broad compatibility. Optionally supply wallet RP ID with ROR enabled.

**TODO Checklist**
- [x] Parent bridge: create handler with origin checks and serialization.
- [x] Iframe fallback: registration create() → parent bridge on ancestor error.
- [x] Preserve `rp.id`/`rpId` when provided (enable ROR scenarios).
- [x] Dev support: Serve `/.well-known/webauthn` via Vite (`relatedOrigins` or `VITE_ROR_ALLOWED_ORIGINS`).
- [x] Docs: Permissions‑Policy + iframe `allow` guidance.
- [x] Config: Optional flag to disable assertion (get) fallback by default (keep it as emergency path only). Field: `iframeWallet.enableSafariGetWebauthnRegistrationFallback`.
- [ ] Tests: Unit/integration to simulate ancestor error and verify bridge round‑trip and serialization.
- [ ] Prod docs: Short guide to host `/.well-known/webauthn` and verify headers (Cache‑Control, content type) on wallet origin.
