# Wallet‑Scoped vs App‑Scoped Credentials (rpId strategy)

This doc explains two deployment patterns for WebAuthn `rpId` and how to choose between them. Your choice affects which passkeys are shown to users and how you integrate across origins.

> **Reference deployment (Tatchi):** app on `https://tatchi.xyz`, wallet iframe on `https://wallet.tatchi.xyz`, `rpId = tatchi.xyz`. Because the app and the wallet share the registrable domain `tatchi.xyz`, this is **app‑scoped (Option B), same‑site**. Related Origin Requests (ROR), the on‑chain allowlist, and the `/.well-known/webauthn` manifest are **not** required for the first‑party app — they only come into play when a third‑party app on a different registrable domain embeds the wallet and calls WebAuthn cross‑site (Option A).

Terms
- `rpId`: Relying Party ID. A registrable domain (no scheme/port). Passkeys are bound to this value.
- Wallet origin: The domain that hosts the wallet iframe/service, e.g. `wallet.tatchi.xyz` or `wallet.example.com`.
- App origin: The domain of the embedding application, e.g. `tatchi.xyz` or `app.example.com`.

Embedded SDK base + workers
- The wallet iframe host announces the absolute SDK base via a global and event:
  - Global: `window.__W3A_WALLET_SDK_BASE__` → absolute `${walletOrigin}${sdkBasePath}/` (for example, `https://wallet.tatchi.xyz/sdk/`).
  - Event: `W3A_WALLET_SDK_BASE_CHANGED` (CustomEvent with `detail` = absolute base URL).
- The SDK resolves embedded assets (Lit bundles, host script) and module workers (signer/VRF) from this base. Workers always load from the wallet origin in production for a clear security boundary.
- In development, the app provider sets this base when `iframeWallet.walletOrigin` is configured, so the app doesn’t need to host `/sdk/*`.

## Option A — Wallet‑Scoped Credentials (cross‑site reuse)
- `rpId = <wallet domain>` (e.g., `wallet.example.com`).
- Behaves like an auth server: a single passkey is reusable across many apps on **unrelated** registrable domains that integrate the wallet.
- Top‑level execution is required for cross‑origin flows; and when the app and wallet live on different registrable sites, Related Origin Requests (ROR) must be enabled so the parent can call WebAuthn using the wallet `rpId`.
- This is the mode a **third‑party** integrator uses when embedding the Tatchi wallet on their own domain (e.g., `some‑app.com` embedding `wallet.tatchi.xyz` with `rpId = tatchi.xyz`).

Pros
- One credential per user, reusable across multiple apps.
- Clear trust boundary on the wallet provider domain.

Cons
- When the wallet is embedded cross‑origin, Safari blocks in‑iframe WebAuthn. The SDK bridges calls to the top‑level; if the top‑level origin differs from the wallet `rpId`, you must enable ROR.
- Firefox currently lacks broad ROR support; plan an app‑scoped fallback or show a developer‑facing guidance message on that browser.
- Migrating to a different `rpId` later won’t show existing credentials.

How to implement (Option A)
1) Choose the wallet domain as your rpId
   - Set `iframeWallet.rpIdOverride = '<wallet-domain>'` (for example, `wallet.example.com`).
   - The SDK passes this rpId to `navigator.credentials.create/get()`.
2) Enable top‑level bridge (already implemented)
   - The wallet iframe attempts WebAuthn in‑iframe; if Safari throws the ancestor/focus errors, it bridges to the parent via `postMessage`. The parent runs WebAuthn at top‑level and returns a serialized credential.
3) Enable ROR when app and wallet are on different registrable sites
   - Implement `GET /.well-known/webauthn` on the relay server (Express or Cloudflare Worker). The endpoint calls the NEAR contract view (e.g. `get_allowed_origins`) and returns `{ origins: [...] }`.
   - Expose this relay route under your `rpId` domain so it is reachable at `https://<rpId>/.well-known/webauthn` (e.g., bind a Worker route on that domain). Example payload:
     {
       "origins": [
         "https://app.example.com",
         "https://another-app.example.com"
       ]
     }
   - With ROR (supported in Chromium/WebKit), the top‑level app can execute WebAuthn using `rp.id = '<rpId>'` even though it runs on a different site. Firefox may not honor this yet.
4) Permissions Policy and iframe `allow`
   - Parent response header should delegate:
     `Permissions-Policy: publickey-credentials-get=(self "<wallet-origin>") , publickey-credentials-create=(self "<wallet-origin>")`
   - Iframe `allow` is set by the SDK; ensure your CSP does not block it.

Config snippet (Option A)
```ts
const passkey = new TatchiPasskey({
  ...PASSKEY_MANAGER_DEFAULT_CONFIGS,
  relayer: { url: '…' },
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

## Option B — App‑Scoped Credentials (same‑site — Tatchi reference)
- `rpId = <app base domain>` (e.g., `tatchi.xyz`, or `example.localhost` in local dev).
- Passkeys are bound to the app’s base domain and work across its subdomains (e.g., `tatchi.xyz`, `wallet.tatchi.xyz`).
- Recommended when the app and wallet share a registrable suffix and you want Chrome/Firefox/Safari to surface credentials regardless of which subdomain is active.
- **This is the Tatchi first‑party deployment:** app `tatchi.xyz` + wallet `wallet.tatchi.xyz` + `rpId = tatchi.xyz`.

Pros
- Works across subdomains of the app’s base domain.
- In Safari, top‑level bridging naturally matches the top‑level app domain, so **ROR is not needed**.
- No on‑chain allowlist or `/.well-known/webauthn` manifest required for the first‑party app.

Cons
- Each distinct registrable site needs its own credential (cannot reuse across unrelated domains like `example.com` and `example.org`). If you also want third‑party apps on other domains to reuse the same passkey, use Option A for those integrators.
- If you previously registered credentials under a different `rpId` (e.g., an old wallet domain), Chrome/Edge won’t show them after switching; users must re‑register.

How to implement (Option B)
1) Choose the app base domain as your rpId
   - Set `iframeWallet.rpIdOverride = '<app-base-domain>'` (e.g., `tatchi.xyz` or `example.localhost`), or set it via `VITE_RP_ID_BASE`.
2) Keep bridge fallback for Safari
   - Set `enableSafariGetWebauthnRegistrationFallback: true` to cover rare focus/ancestor cases in Safari.
3) Permissions Policy and iframe `allow`
   - Same as Option A. The SDK sets the iframe `allow`; ensure your server sends a compatible `Permissions-Policy` delegating WebAuthn to the wallet origin (`wallet.tatchi.xyz`).

Config snippet (Option B)
```ts
const passkey = new TatchiPasskey({
  ...PASSKEY_MANAGER_DEFAULT_CONFIGS,
  relayer: { url: '…' },
  iframeWallet: {
    walletOrigin: 'https://wallet.tatchi.xyz',
    walletServicePath: 'wallet-service',
    rpIdOverride: 'tatchi.xyz', // app base domain (same‑site)
    enableSafariGetWebauthnRegistrationFallback: true,
  },
});
```

Choosing at build/runtime
- Build‑time: hardcode `rpIdOverride` (or set `VITE_RP_ID_BASE`) to the mode you want (wallet or app domain).
- Runtime: ensure env and server headers line up with your choice.

Testing Notes
- Chromium/Edge/Brave: Option B works at top‑level with no ROR; Option A parent‑runs with ROR across unrelated sites.
- Safari (macOS/iOS): For Option B the top‑level bridge matches the app domain (no ROR). For Option A expect frequent bridge to top‑level; verify focus handling.
- Firefox: ROR not broadly shipped; Option B (same‑site) works, Option A needs an app‑scoped fallback or guidance.

## ROR & No‑Popup Policy (Hybrid)

Applies to Option A (cross‑site). Option B same‑site never needs ROR.

- rpId immutability: Credentials created under one `rpId` are not usable under another. Serializing across frames does not rebind `rpId`.
- No popups/redirects: Flows must complete within the current top‑level context. For cross‑site wallet‑scoped, this requires ROR when the top‑level origin’s registrable domain doesn’t match the wallet `rpId`.
- Browser matrix:
  - Chromium/WebKit: ROR supported; parent‑run with `rp.id = <rpId>` when allowlisted by `/.well-known/webauthn`.
  - Firefox: ROR not broadly shipped; default to app‑scoped or present developer guidance.
- Parent‑run decision:
  - If current top‑level origin is allowlisted → run WebAuthn at the parent with `rp.id = <rpId>`.
  - If not allowlisted → do not navigate or open popups; surface a dev error with a link to register the origin (or allow app‑scoped fallback if configured).

FAQ — When is ROR required?
- ROR is only required when the top‑level origin’s registrable domain does not equal or include the `rpId`.
  - Not required: top‑level `https://tatchi.xyz` (or `https://wallet.tatchi.xyz`) with `rpId=tatchi.xyz` — same registrable domain. **This is the Tatchi reference deployment.**
  - Not required: top‑level `https://app.example.com` with `rpId=example.com`.
  - Required: top‑level `https://some-integrator.com` with `rpId=tatchi.xyz` — a third‑party app embedding the Tatchi wallet cross‑site (unrelated domains).
  - Required: top‑level `https://app.example.com` with `rpId=wallet.example.com` (sibling subdomains; `rpId` must be a registrable suffix of the top‑level, which it is not here).

## NEAR Contract: ROR Allowlist

Applies to Option A only. Back the `/.well-known/webauthn` manifest with an on‑chain allowlist of top‑level app origins.

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

Applies to Option A only. The manifest endpoint is implemented on the relay server and should be exposed on the `rpId` domain:

- Express relay server
  - Implement `GET /.well-known/webauthn` (and trailing slash) to return `{ origins: [...] }` by reading the contract’s allowlist (e.g., `get_allowed_origins`) and sanitizing. Add `Content-Type: application/json; charset=utf-8` and `Cache-Control: max-age=60, stale-while-revalidate=600`.
- Cloudflare Worker relay
  - Implement the same endpoint with optional env overrides: `ROR_CONTRACT_ID` (defaults to `WEBAUTHN_CONTRACT_ID`) and `ROR_METHOD` (defaults to `get_allowed_origins`). Bind this Worker route under your `rpId` domain so it is reachable at `https://<rpId>/.well-known/webauthn`. Use the same JSON and cache headers; existing CORS behavior applies.
- Dev convenience
  - For local development, the wallet dev server serves the manifest by querying the chain when `VITE_WEBAUTHN_CONTRACT_ID` is set (optionally `VITE_NEAR_RPC_URL`, `VITE_ROR_METHOD`).

## Reference Deployment: wallet.tatchi.xyz + tatchi.xyz (app‑scoped, same‑site)

This is the Tatchi first‑party topology. The app and the wallet share the registrable domain `tatchi.xyz`, so credentials are app‑scoped and no ROR/allowlist is needed.

- Wallet host (iframe + SDK assets)
  - Domain: `wallet.tatchi.xyz` (staging: `wallet-staging.tatchi.xyz`)
  - rpId: `tatchi.xyz` (app‑scoped — the shared base domain)
  - Pages project serves `/wallet-service` and `/sdk` with strict `_headers` (COOP/COEP + WebAuthn `Permissions-Policy`).

- App (integrator/demo)
  - Domain: `tatchi.xyz` (staging: `staging.tatchi.xyz`).
  - Embeds the wallet iframe from `https://wallet.tatchi.xyz` and calls WebAuthn using rpId `tatchi.xyz`.
  - Must send a `Permissions-Policy` header delegating WebAuthn to the wallet origin.

> Third‑party integrators: an app on a **different** registrable domain that embeds `wallet.tatchi.xyz` is cross‑site (Option A). Those origins must be added to the on‑chain allowlist and served via `https://tatchi.xyz/.well-known/webauthn`, and ROR applies. The first‑party `tatchi.xyz` app does not need any of this.

Configuration
- App environment
  - `VITE_WALLET_ORIGIN=https://wallet.tatchi.xyz`
  - `VITE_WALLET_SERVICE_PATH=/wallet-service`
  - `VITE_SDK_BASE_PATH=/sdk`
  - `VITE_RP_ID_BASE=tatchi.xyz` (app‑scoped rpId)
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
    `Permissions-Policy: publickey-credentials-get=(self "https://wallet.tatchi.xyz"), publickey-credentials-create=(self "https://wallet.tatchi.xyz")`
  - You can generate a `_headers` at build time via the SDK’s `tatchiBuildHeaders({ walletOrigins })` helper or write one manually in the dist.

Troubleshooting
- Module script “text/html” (strict MIME)
  - Symptom: `Failed to load module script: The server responded with a non-JavaScript MIME type of "text/html"` when loading `/sdk/*` or `/sdk/workers/*`.
  - Fix:
    - Ensure the wallet host deploys `/sdk/*` and `/sdk/workers/*` (copy SDK dist assets to the wallet site in CI).
    - Ensure wallet `_headers` allow CORS for `/sdk/*` and `/sdk/workers/*` and `.wasm` is served with `Content-Type: application/wasm`.
    - Confirm `window.__W3A_WALLET_SDK_BASE__` points to the wallet origin (e.g., `https://wallet.tatchi.xyz/sdk/`).
- Cross‑origin dev SecurityError on Worker
  - Symptom: `Failed to construct 'Worker': … cannot be accessed from origin …` during prewarm or logout.
  - Explanation: Browsers restrict constructing cross‑origin workers in many dev setups even with CORS.
  - Fix:
    - Workers prewarm inside the wallet iframe (wallet origin). App‑side prewarm is skipped in cross‑origin dev.
    - Logout asks the wallet iframe to clear the VRF session; the app skips local worker init.
- Relay preflight CORS
  - Ensure Cloudflare Worker (relay) sets:
    - `EXPECTED_ORIGIN = https://tatchi.xyz, https://staging.tatchi.xyz`
    - `EXPECTED_WALLET_ORIGIN = https://wallet.tatchi.xyz, https://wallet-staging.tatchi.xyz`
  - Preflight should include `Access-Control-Allow-Origin` matching the requesting Origin.

Verification checklist
- Wallet host
  - `curl -I https://wallet.tatchi.xyz/sdk/wallet-iframe-host.js` → 200 application/javascript
  - `curl -I https://wallet.tatchi.xyz/sdk/workers/web3authn-signer.worker.js` → 200 application/javascript
  - `curl -I https://wallet.tatchi.xyz/sdk/workers/wasm_signer_worker_bg.wasm` → 200 application/wasm
- App
  - Console: `window.__W3A_WALLET_SDK_BASE__` returns absolute base URL.
  - Network: worker requests point to the wallet origin.
  - A freshly registered passkey shows `rpId = tatchi.xyz`.
- Relay
  - OPTIONS preflight returns `Access-Control-Allow-Origin` for app and wallet origins.

Cross‑site third‑party reuse (optional, Option A)
- Bind your Cloudflare Worker (relay) to the `rpId` domain route: `tatchi.xyz/.well-known/webauthn*`.
- Ensure the NEAR contract allowlist includes each third‑party app origin:
  - Add `https://some-integrator.com` to `get_allowed_origins` data.
  - The Worker handler resolves and normalizes origins; ports and `localhost` rules apply as documented above.
- With this in place, Chromium/WebKit allow a third‑party top‑level app to execute WebAuthn with `rp.id = 'tatchi.xyz'` while running on its own domain.

GitHub Actions and Cloudflare Pages
- Wallet host (Pages):
  - Use `deploy-wallet-iframe-staging.yml` (dev) and `deploy-wallet-iframe-prod.yml` (main) to publish the wallet example `dist/` to the Pages projects:
    - `w3a-wallet-iframe-staging` (wallet-staging.tatchi.xyz)
    - `w3a-wallet-iframe-prod` (wallet.tatchi.xyz)
  - Required secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.
  - No CI heredocs are needed: the Vite plugin emits `wallet-service/index.html` and `_headers` on build if missing.

- GitHub Environments (recommended)
  - Define environments: `staging`, `production`. Put public `VITE_*` in each environment’s `vars`:
    - `VITE_WALLET_ORIGIN`, `VITE_WALLET_SERVICE_PATH`, `VITE_SDK_BASE_PATH`, `VITE_RP_ID_BASE`, `VITE_RELAYER_URL`, `VITE_RELAYER_ACCOUNT_ID`, and optional `VITE_NEAR_*`.
  - In workflows, set `environment: staging` for staging jobs and `environment: production` for prod jobs; read values via `${{ vars.VITE_* }}`.
  - Keep credentials (API tokens, keys) in `secrets`.

Browser compatibility
- Chromium/WebKit/Firefox: App‑scoped (Option B, same‑site) works at top‑level with no ROR.
- Chromium/WebKit: Wallet‑scoped (Option A) works at top‑level with ROR.
- Firefox: ROR not broadly shipped; for cross‑site reuse provide an app‑scoped fallback or developer guidance.
