# Wallet‑Scoped vs App‑Scoped Credentials (rpId strategy)

This doc explains two deployment patterns for WebAuthn `rpId` and how to choose between them. Your choice affects which passkeys are shown to users and how you integrate across origins.

Terms
- `rpId`: Relying Party ID. A registrable domain (no scheme/port). Passkeys are bound to this value.
- Wallet origin: The domain that hosts the wallet iframe/service, e.g. `wallet.example.com` or `web3authn.org`.
- App origin: The domain of the embedding application, e.g. `app.example.com` or `example.com`.

Embedded SDK base + workers
- The wallet iframe host announces the absolute SDK base via a global and event:
  - Global: `window.__W3A_WALLET_SDK_BASE__` → absolute `${walletOrigin}${sdkBasePath}/` (for example, `https://web3authn.org/sdk/`).
  - Event: `W3A_WALLET_SDK_BASE_CHANGED` (CustomEvent with `detail` = absolute base URL).
- The SDK resolves embedded assets (Lit bundles, host script) and module workers (signer/VRF) from this base. Workers always load from the wallet origin in production for a clear security boundary.
- In development, the app provider sets this base when `iframeWallet.walletOrigin` is configured, so the app doesn’t need to host `/sdk/*`.

Option A — Wallet‑Scoped Credentials
- `rpId = <wallet domain>` (e.g., `web3authn.org` or `wallet.example.com`).
- Behaves like an auth server: a single passkey is reusable across many apps that integrate the wallet.
- Top‑level execution is required for cross‑origin flows; and when the app and wallet live on different registrable sites, Related Origin Requests (ROR) must be enabled so the parent can call WebAuthn using the wallet `rpId`.

Pros
- One credential per user, reusable across multiple apps.
- Clear trust boundary on the wallet provider domain.

Cons
- When the wallet is embedded cross‑origin, Safari blocks in‑iframe WebAuthn. The SDK bridges calls to the top‑level; if the top‑level origin differs from the wallet `rpId`, you must enable ROR.
- Firefox currently lacks broad ROR support; plan an app‑scoped fallback or show a developer‑facing guidance message on that browser.
- Migrating to a different `rpId` later won’t show existing credentials.

How to implement (Option A)
1) Choose the wallet domain as your rpId
   - Set `iframeWallet.rpIdOverride = '<wallet-domain>'` (for example, `web3authn.org`).
   - The SDK passes this rpId to `navigator.credentials.create/get()`.
2) Enable top‑level bridge (already implemented)
   - The wallet iframe attempts WebAuthn in‑iframe; if Safari throws the ancestor/focus errors, it bridges to the parent via `postMessage`. The parent runs WebAuthn at top‑level and returns a serialized credential.
3) Enable ROR when app and wallet are on different registrable sites
   - Implement `GET /.well-known/webauthn` on the relay server (Express or Cloudflare Worker). The endpoint calls the NEAR contract view (e.g. `get_allowed_origins`) and returns `{ origins: [...] }`.
   - Expose this relay route under your wallet domain so it is reachable at `https://<wallet-domain>/.well-known/webauthn` (e.g., bind a Worker route on the wallet domain). Example payload:
     {
       "origins": [
         "https://app.example.com",
         "https://another-app.example.com"
       ]
     }
   - With ROR (supported in Chromium/WebKit), the top‑level app can execute WebAuthn using `rp.id = '<wallet-domain>'` even though it runs on a different site. Firefox may not honor this yet.
4) Permissions Policy and iframe `allow`
   - Parent response header should delegate:
     `Permissions-Policy: publickey-credentials-get=(self "<wallet-origin>") , publickey-credentials-create=(self "<wallet-origin>")`
   - Iframe `allow` is set by the SDK; ensure your CSP does not block it.

Config snippet (Option A)
```ts
const passkey = new TatchiPasskey({
  ...PASSKEY_MANAGER_DEFAULT_CONFIGS,
  relayer: { url: '…', accountId: '…' },
  iframeWallet: {
    walletOrigin: 'https://wallet.example.com',
    walletServicePath: 'wallet-service',
    rpIdOverride: 'wallet.example.com',
    // Optional: allow Safari GET fallback when in an iframe
    enableSafariGetWebauthnRegistrationFallback: true,
  },
});
```

Dev prewarm and logout behavior
- Workers prewarm on the wallet origin (inside the wallet iframe) to avoid cross‑origin Worker construction errors in development.
- App‑side prewarm is only attempted when same‑origin; otherwise it’s skipped (non‑fatal).
- On logout, the app asks the wallet iframe to clear the VRF session. In cross‑origin dev, the app skips local worker initialization to avoid benign SecurityError logs; the wallet iframe clears its own session.

Option B — App‑Scoped Credentials
- `rpId = <app base domain>` (e.g., `example.com` or `example.localhost`).
- Passkeys are bound to the app’s base domain and work across its subdomains (e.g., `app.example.com`, `wallet.example.com`).
- Recommended when the app and wallet share a registrable suffix and you want Chrome/Firefox to surface credentials regardless of which subdomain is active.

Pros
- Works across subdomains of the app’s base domain.
- In Safari, top‑level bridging naturally matches the top‑level app domain, so ROR is not needed.

Cons
- Each distinct site needs its own credential (cannot reuse across unrelated domains like `example.com` and `web3authn.org`).
- If you previously registered credentials under the wallet domain, Chrome/Edge won’t show them after switching the `rpId`; users must re‑register.

How to implement (Option B)
1) Choose the app base domain as your rpId
   - Set `iframeWallet.rpIdOverride = '<app-base-domain>'` (e.g., `example.com` or `example.localhost`).
2) Keep bridge fallback for Safari
   - Set `enableSafariGetWebauthnRegistrationFallback: true` to cover rare focus/ancestor cases in Safari.
3) Permissions Policy and iframe `allow`
   - Same as Option A. The SDK sets the iframe `allow`; ensure your server sends a compatible `Permissions-Policy`.

Config snippet (Option B)
```ts
const passkey = new TatchiPasskey({
  ...PASSKEY_MANAGER_DEFAULT_CONFIGS,
  relayer: { url: '…', accountId: '…' },
  iframeWallet: {
    walletOrigin: 'https://wallet.example.localhost',
    walletServicePath: 'wallet-service',
    rpIdOverride: 'example.localhost', // app base domain
    enableSafariGetWebauthnRegistrationFallback: true,
  },
});
```

Choosing at build/runtime
- Build‑time: hardcode `rpIdOverride` to the mode you want (wallet or app domain).
- Runtime: ensure env and server headers line up with your choice.

Testing Notes
- Chromium/Edge/Brave: Parent‑run with ROR for wallet‑scoped across unrelated sites.
- Safari (macOS/iOS): Expect frequent bridge to top‑level; verify focus handling.
- Firefox: ROR not broadly shipped; validate app‑scoped fallback or guidance.

## ROR & No‑Popup Policy (Hybrid)

- rpId immutability: Credentials created under one `rpId` are not usable under another. Serializing across frames does not rebind `rpId`.
- No popups/redirects: Flows must complete within the current top‑level context. For cross‑site wallet‑scoped, this requires ROR when the top‑level origin’s registrable domain doesn’t match the wallet `rpId`.
- Browser matrix:
  - Chromium/WebKit: ROR supported; parent‑run with `rp.id = <wallet-domain>` when allowlisted by `/.well-known/webauthn`.
  - Firefox: ROR not broadly shipped; default to app‑scoped or present developer guidance.
- Parent‑run decision:
  - If current top‑level origin is allowlisted → run WebAuthn at the parent with `rp.id = <wallet-domain>`.
  - If not allowlisted → do not navigate or open popups; surface a dev error with a link to register the origin (or allow app‑scoped fallback if configured).

FAQ — When is ROR required?
- ROR is only required when the top‑level origin’s registrable domain does not equal or include the `rpId`.
  - Not required: top‑level `https://web3authn.org` with `rpId=web3authn.org`.
  - Not required: top‑level `https://app.example.com` with `rpId=example.com`.
  - Required: top‑level `https://tatchi.xyz` with `rpId=web3authn.org` (unrelated domains).
  - Required: top‑level `https://app.example.com` with `rpId=wallet.example.com` (sibling subdomains; `rpId` must be a registrable suffix of the top‑level, which it is not here).

## NEAR Contract: ROR Allowlist

Back the `/.well-known/webauthn` manifest with an on‑chain allowlist.

- Storage
  - `allowed_origins: IterableSet<String>` — canonical, lowercase origins.
- View
  - `get_allowed_origins() -> Vec<String>` — returns sorted canonical origins.
- Change (admin-only)
  - `add_allowed_origin(origin: String) -> bool` — normalizes/validates and inserts; returns true when added.
  - `remove_allowed_origin(origin: String) -> bool` — normalizes and removes; returns true when removed.
  - `set_allowed_origins(origins: Vec<String>) -> bool` — bulk replace; normalizes, validates, dedupes; returns true.
- Origin format rules
  - Canonical: `scheme://host[:port]`, lowercase; schemes: `https` (or `http` only for `localhost`/`127.0.0.1`).
  - Not allowed: path, query, fragment, wildcards, spaces, trailing slash.
  - Host charset `[A-Za-z0-9.-]`; no leading/trailing `.` or `-`; port 1–65535 if present.
  - Limits: per‑origin length ≤ 255; max entries ≤ 5000; deduped.

## Serving `/.well-known/webauthn`

The manifest endpoint is implemented on the relay server and should be exposed on the wallet domain:

- Express relay server
  - Implement `GET /.well-known/webauthn` (and trailing slash) to return `{ origins: [...] }` by reading the contract’s allowlist (e.g., `get_allowed_origins`) and sanitizing. Add `Content-Type: application/json; charset=utf-8` and `Cache-Control: max-age=60, stale-while-revalidate=600`.
- Cloudflare Worker relay
  - Implement the same endpoint with optional env overrides: `ROR_CONTRACT_ID` (defaults to `WEBAUTHN_CONTRACT_ID`) and `ROR_METHOD` (defaults to `get_allowed_origins`). Bind this Worker route under your wallet domain so it is reachable at `https://<wallet-domain>/.well-known/webauthn`. Use the same JSON and cache headers; existing CORS behavior applies.
-
- Dev convenience
  - For local development, the Vite dev plugin can serve a static manifest when `VITE_ROR_ALLOWED_ORIGINS` is set.

## Deployment Plan: Wallet Host on web3authn.org

1) Example site
- Use `examples/vite` (with Tatchi Vite plugins):
- `tatchiDev(...)` for dev routing of `/wallet-service` and `/sdk`.
- `tatchiBuildHeaders({ walletOrigin })` to emit `_headers` (COOP/COEP + Permissions‑Policy) and write `wallet-service/index.html` if missing.
- Wallet service page:
  - The SDK Vite build plugin (`tatchiBuildHeaders`) emits `dist/wallet-service/index.html` automatically if your app does not provide one. It loads `${VITE_SDK_BASE_PATH||'/sdk'}/wallet-iframe-host.js`.
  - To customize, add `public/wallet-service/index.html`; the plugin will not overwrite existing files.
- For dev/prod env:
  - `VITE_WALLET_ORIGIN=https://web3authn.org`
  - `VITE_WALLET_SERVICE_PATH=/wallet-service`
  - `VITE_SDK_BASE_PATH=/sdk`
  - `VITE_RP_ID_BASE=web3authn.org`

2) Cloudflare Pages
- Map a Pages project to `web3authn.org` (or a wallet subdomain).
- Configure the env vars above in Pages for consistent asset paths.

3) CI workflows
- `deploy-cloudflare.yml` and/or `deploy-separate-wallet-host.yml` publish the wallet host:
  - Build SDK, then build `examples/vite`.
  - Copy SDK bundles into `dist/sdk`.
  - Optionally emit a static ROR manifest from `ROR_ALLOWED_ORIGINS`, or serve dynamically from the relay.
  - Deploy `dist/` to the wallet Pages project.
- Required secrets:
  - `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `CF_PAGES_PROJECT_WALLET`.
  - `VITE_RELAYER_URL`, `VITE_RELAYER_ACCOUNT_ID`, and NEAR network vars.


## NEAR Contract: ROR Allowlist

Use an on‑chain allowlist of top‑level app origins to drive `/.well-known/webauthn`.

- Storage
  - `allowed_origins: IterableSet<String>` — canonical, lowercase origins.
- View
  - `get_allowed_origins() -> Vec<String>` — returns sorted canonical origins.
- Change (admin-only)
  - `add_allowed_origin(origin: String) -> bool` — normalizes/validates and inserts; returns true when added.
  - `remove_allowed_origin(origin: String) -> bool` — normalizes and removes; returns true when removed.
  - `set_allowed_origins(origins: Vec<String>) -> bool` — bulk replace; normalizes, validates, dedupes; returns true.
- Origin format rules
  - Canonical: `scheme://host[:port]`, lowercase; schemes: `https` (or `http` only for `localhost`/`127.0.0.1`).
  - Not allowed: path, query, fragment, wildcards, spaces, trailing slash.
  - Host charset `[A-Za-z0-9.-]`; no leading/trailing `.` or `-`; port 1–65535 if present.
  - Limits: per‑origin length ≤ 255; max entries ≤ 5000; deduped.

## Serving `/.well-known/webauthn`

The canonical production endpoint lives on the relay server and is exposed on the wallet domain:

- Express relay server
  - `GET /.well-known/webauthn` (and trailing slash) returns `{ origins: [...] }` after reading the contract’s `get_allowed_origins`. Include `Content-Type: application/json; charset=utf-8` and `Cache-Control: max-age=60, stale-while-revalidate=600`.
- Cloudflare Worker relay
  - Same endpoint with env overrides (`ROR_CONTRACT_ID`, `ROR_METHOD`), bound as a route on the wallet domain so it is reachable at `https://<wallet-domain>/.well-known/webauthn`. Use identical JSON and cache headers; existing CORS behavior applies.
-
- Dev convenience
  - In dev, the Vite plugin can serve a static manifest when `VITE_ROR_ALLOWED_ORIGINS` is provided.

## Reference Deployment: web3authn.org + hosted.tatchi.xyz

This topology demonstrates wallet‑scoped credentials across registrable domains without affecting existing `tatchi.xyz` properties.

- Wallet host (iframe + SDK assets)
  - Domain: `web3authn.org`
  - rpId: `web3authn.org` (wallet‑scoped)
  - Pages project serves `/wallet-service` and `/sdk` with strict `_headers` (COOP/COEP + WebAuthn `Permissions-Policy`).
  - Relay Worker bound on the same domain for `/.well-known/webauthn` (ROR manifest).

- App (integrator/demo)
  - Domain: `hosted.tatchi.xyz` (alternative names: `managed.tatchi.xyz`, `integrate.tatchi.xyz`).
  - Embeds the wallet iframe from `https://web3authn.org` and calls WebAuthn using rpId `web3authn.org`.
  - Must send a `Permissions-Policy` header delegating WebAuthn to the wallet origin.

Configuration
- App environment
  - `VITE_WALLET_ORIGIN=https://web3authn.org`
  - `VITE_WALLET_SERVICE_PATH=/wallet-service`
  - `VITE_SDK_BASE_PATH=/sdk`
  - `VITE_RP_ID_BASE=web3authn.org` (wallet‑scoped rpId)
  - Keep Safari fallback on: `enableSafariGetWebauthnRegistrationFallback: true` in `iframeWallet` config

- Wallet host environment (Pages)
  - Same as above for `WALLET_*` and `SDK_*` to ensure correct paths.
  - `_headers` are emitted by the plugin with:
    - `Cross-Origin-Opener-Policy: same-origin` (overridden to `unsafe-none` under `/wallet-service`)
    - `Cross-Origin-Embedder-Policy: require-corp`
    - `Cross-Origin-Resource-Policy: cross-origin`
    - `Permissions-Policy` delegating WebAuthn to the wallet origin
    - `Access-Control-Allow-Origin: *` for `/sdk/*` and `/sdk/workers/*`

- App response headers (Pages)
  - Delegate WebAuthn to the wallet origin:
    `Permissions-Policy: publickey-credentials-get=(self "https://web3authn.org"), publickey-credentials-create=(self "https://web3authn.org")`
  - You can generate a `_headers` at build time via the SDK’s `tatchiBuildHeaders({ walletOrigin })` helper or write one manually in the dist.

Troubleshooting
- Module script “text/html” (strict MIME)
  - Symptom: `Failed to load module script: The server responded with a non-JavaScript MIME type of "text/html"` when loading `/sdk/*` or `/sdk/workers/*`.
  - Fix:
    - Ensure the wallet host deploys `/sdk/*` and `/sdk/workers/*` (copy SDK dist assets to the wallet site in CI).
    - Ensure wallet `_headers` allow CORS for `/sdk/*` and `/sdk/workers/*` and `.wasm` is served with `Content-Type: application/wasm`.
    - Confirm `window.__W3A_WALLET_SDK_BASE__` points to the wallet origin (e.g., `https://web3authn.org/sdk/`).
- Cross‑origin dev SecurityError on Worker
  - Symptom: `Failed to construct 'Worker': … cannot be accessed from origin …` during prewarm or logout.
  - Explanation: Browsers restrict constructing cross‑origin workers in many dev setups even with CORS.
  - Fix:
    - Workers prewarm inside the wallet iframe (wallet origin). App‑side prewarm is skipped in cross‑origin dev.
    - Logout asks the wallet iframe to clear the VRF session; the app skips local worker init.
- Relay preflight CORS
  - Ensure Cloudflare Worker (relay) sets:
    - `EXPECTED_ORIGIN = https://hosted.tatchi.xyz, https://tatchi.xyz`
    - `EXPECTED_WALLET_ORIGIN = https://web3authn.org, https://wallet.tatchi.xyz`
  - Preflight should include `Access-Control-Allow-Origin` matching the requesting Origin.

Verification checklist
- Wallet host
  - `curl -I https://<wallet-origin>/sdk/wallet-iframe-host.js` → 200 application/javascript
  - `curl -I https://<wallet-origin>/sdk/workers/web3authn-signer.worker.js` → 200 application/javascript
  - `curl -I https://<wallet-origin>/sdk/workers/wasm_signer_worker_bg.wasm` → 200 application/wasm
- App
  - Console: `window.__W3A_WALLET_SDK_BASE__` returns absolute base URL.
  - Network: worker requests point to the wallet origin.
- Relay
  - OPTIONS preflight returns `Access-Control-Allow-Origin` for app and wallet origins.

ROR manifest and NEAR allowlist
- Bind your Cloudflare Worker (relay) to the wallet domain route: `web3authn.org/.well-known/webauthn*`.
- Ensure the NEAR contract allowlist includes the app origin:
  - Add `https://hosted.tatchi.xyz` to `get_allowed_origins` data.
  - The Worker handler resolves and normalizes origins; ports and `localhost` rules apply as documented above.
- With this in place, Chromium/WebKit allow the top‑level app to execute WebAuthn with `rp.id = 'web3authn.org'` while running on `hosted.tatchi.xyz`.

GitHub Actions and Cloudflare Pages
- Wallet host (Pages):
  - Use the existing `deploy-cloudflare.yml` wallet job, or the dedicated `deploy-separate-wallet-host.yml` workflow, to publish the wallet example `dist/` to the Pages project (e.g., `web3authn.org`).
  - Required secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `CF_PAGES_PROJECT_WALLET` (e.g., `web3authn`).
  - No CI heredocs are needed: the Vite plugin emits `wallet-service/index.html` and `_headers` on build if missing.

- App (Pages):
  - Add a job to build your app (e.g., `examples/vite`) with the env vars above and deploy to a second Pages project (custom domain `hosted.tatchi.xyz`).
  - Required secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `CF_PAGES_PROJECT_HOSTED` (e.g., `hosted-tatchi`).
  - Ensure the app’s build emits `_headers` with the `Permissions-Policy` delegating to `https://web3authn.org`.

- GitHub Environments (recommended)
  - Define environments: `web3authn`, `hosted`, `production`. Put public `VITE_*` in each environment’s `vars`:
    - `VITE_WALLET_ORIGIN`, `VITE_WALLET_SERVICE_PATH`, `VITE_SDK_BASE_PATH`, `VITE_RP_ID_BASE`, `VITE_RELAYER_URL`, `VITE_RELAYER_ACCOUNT_ID`, and optional `VITE_NEAR_*`.
  - In workflows, set `environment: web3authn` for the wallet host job and `environment: hosted` for the hosted app job; read values via `${{ vars.VITE_* }}`.
  - Keep credentials (API tokens, keys) in `secrets`.

Browser compatibility
- Chromium/WebKit: Wallet‑scoped with ROR works at top‑level.
- Firefox: ROR not broadly shipped; provide app‑scoped fallback or developer guidance.
