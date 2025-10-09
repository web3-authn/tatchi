# Wallet‑Scoped vs App‑Scoped Credentials (rpId strategy)

This doc explains two deployment patterns for WebAuthn `rpId` and how to choose between them. Your choice affects which passkeys are shown to users and how you integrate across origins.

Terms
- `rpId`: Relying Party ID. A registrable domain (no scheme/port). Passkeys are bound to this value.
- Wallet origin: The domain that hosts the wallet iframe/service, e.g. `wallet.example.com` or `web3authn.org`.
- App origin: The domain of the embedding application, e.g. `app.example.com` or `example.com`.

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
   - Host `/.well-known/webauthn` on the wallet origin (it can be a dynamic route) with JSON listing allowed top‑level app origins:
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
const passkey = new PasskeyManager({
  ...PASSKEY_MANAGER_DEFAULT_CONFIGS,
  relayer: { url: '…', accountId: '…' },
  iframeWallet: {
    walletOrigin: 'https://wallet.example.com',
    walletServicePath: '/service',
    rpIdOverride: 'wallet.example.com',
    // Optional: allow Safari GET fallback when in an iframe
    enableSafariGetWebauthnRegistrationFallback: true,
  },
});
```

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
const passkey = new PasskeyManager({
  ...PASSKEY_MANAGER_DEFAULT_CONFIGS,
  relayer: { url: '…', accountId: '…' },
  iframeWallet: {
    walletOrigin: 'https://wallet.example.localhost',
    walletServicePath: '/service',
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

You can serve the manifest dynamically from either the relay server or the wallet host:

- Express relay server
  - `GET /.well-known/webauthn` (and trailing slash) returns `{ origins: [...] }` by reading the contract view and sanitizing. Adds `Content-Type: application/json; charset=utf-8` and `Cache-Control: max-age=60, stale-while-revalidate=600`.
- Cloudflare Worker relay
  - Same endpoint with env overrides: `ROR_CONTRACT_ID` (defaults to `WEBAUTHN_CONTRACT_ID`), `ROR_METHOD` (defaults to `get_allowed_origins`).
  - Same JSON shape and cache headers; existing CORS behavior applies.

## Deployment Plan: Wallet Host on web3authn.org

1) Example site
- Create `examples/wallet-scoped-credentials` (uses Web3Authn Vite plugins):
  - `web3authnDev(...)` for dev routing of `/wallet-service` and `/sdk`.
  - `web3authnBuildHeaders({ walletOrigin })` to emit `_headers` (COOP/COEP + Permissions‑Policy).
- Add `public/wallet-service/index.html` that loads `/sdk/wallet-iframe-host.js`.
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
  - Build SDK, then build `examples/wallet-scoped-credentials`.
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

You can serve the manifest dynamically from either the relay server or the wallet host:

- Express relay server
  - `GET /.well-known/webauthn` (and with trailing slash) now returns `{ origins: [...] }` by reading the contract’s `get_allowed_origins` and sanitizing. Headers include `Content-Type: application/json; charset=utf-8` and `Cache-Control: max-age=60, stale-while-revalidate=600`.
- Cloudflare Worker relay
  - Same endpoint implemented with optional overrides: `ROR_CONTRACT_ID` (defaults to `WEBAUTHN_CONTRACT_ID`) and `ROR_METHOD` (defaults to `get_allowed_origins`). Returns the same JSON and cache headers. Existing CORS behavior applies.
