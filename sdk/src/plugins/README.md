# Tatchi SDK Headers – Dev and Build

This folder contains header builders and small plugins for Vite and Next. They provide security headers needed for the wallet iframe, workers and WASM.

Takeaways:
- Strict CSP is applied only to wallet HTML routes (`/wallet-service`, `/export-viewer`), not to your app pages.
- Dev servers always set COEP/CORP so workers/WASM load cross‑origin reliably.
- Permissions‑Policy delegates WebAuthn + clipboard to your configured wallet origin.
- CORS is echoed dynamically for SDK assets during dev; production CORS is opt‑in.

## Pieces

- `headers.ts`
  - `buildPermissionsPolicy(walletOrigin?)`: Generates policy in structured header form:
    - `publickey-credentials-get=(self "<wallet>")`
    - `publickey-credentials-create=(self "<wallet>")`
    - `clipboard-read=(self "<wallet>")`
    - `clipboard-write=(self "<wallet>")`
  - `buildWalletCsp({ mode, allowUnsafeEval, frameSrc, scriptSrcAllowlist })`:
    - `mode: 'strict' | 'compatible'` (default strict). Strict adds `style-src-attr 'none'` and forbids inline.
    - Typical use: apply strict CSP to wallet HTML only, not app pages.

- `vite.ts`
  - `tatchiServeSdk({ sdkBasePath?, sdkDistRoot?, enableDebugRoutes? })`
    - Serves SDK files under a stable base (default `/sdk`).
    - Sets COEP/CORP on all SDK assets; echoes CORS from request (dev only).
    - Emits two tiny virtual assets used by wallet pages: `wallet-shims.js`, `wallet-service.css`.
  - `tatchiWalletService({ walletServicePath?, sdkBasePath? })`
    - Serves minimal wallet HTML with only external CSS/JS (no inline) so strict CSP works.
  - `tatchiWasmMime()`
    - Forces `application/wasm` for any `.wasm` file.
  - `tatchiHeaders({ walletOrigin?, walletServicePath?, sdkBasePath?, devCSP? })`
    - Adds: `COOP: same-origin` (except wallet HTML → `unsafe-none`), `COEP: require-corp`, `CORP: cross-origin`.
    - Adds `Permissions-Policy` built from `walletOrigin`.
    - Optional dev CSP on wallet HTML only: `devCSP: 'strict' | 'compatible'`.
  - `tatchiApp({ walletOrigin?, emitHeaders? })`
    - Dev (serve): same behavior as `tatchiAppServer({ walletOrigin })` (headers only on the app origin).
    - Build (build): when `emitHeaders: true`, writes `_headers` (COOP/COEP/CORP + Permissions‑Policy; strict CSP scoped to wallet HTML routes).
  - `tatchiWallet({ walletOrigin?, walletServicePath?, sdkBasePath?, emitHeaders? })`
    - Dev (serve): same behavior as `tatchiWalletServer({ ... })` (serves `/wallet-service` + `/sdk` with headers).
    - Build (build): when `emitHeaders: true`, writes `_headers` (same as above; strict CSP scoped to wallet HTML routes).
  - `tatchiApp({ walletOrigin?, emitHeaders? })`
    - Dev (serve): same behavior as `tatchiAppServer({ walletOrigin })` (headers only on the app origin).
    - Build (build): when `emitHeaders: true`, writes `_headers` (COOP/COEP/CORP + Permissions‑Policy; strict CSP scoped to wallet HTML routes).
  - Convenience dev servers:
    - `tatchiWalletServer({...})` → wallet origin (`/wallet-service` + `/sdk` + headers)
    - `tatchiAppServer({...})` → app origin (headers only; combine with `tatchiServeSdk` if needed)
  - `tatchiBuildHeaders({ walletOrigin?, cors? })`
    - Writes a Pages/Netlify‑compatible `_headers` file into Vite `outDir`.
    - Global: `COOP: same-origin`, `COEP: require-corp`, `CORP: cross-origin`, `Permissions-Policy`.
    - Wallet HTML (`/wallet-service`, `/export-viewer`): adds strict `Content-Security-Policy`.
    - Optional: emit CORS for `/sdk/*` (prefer platform rules; avoid duplication).

- `next.ts`
  - Provides analogous helpers for Next.js via `headers()` config, sourcing values from `headers.ts`.

## Dev behavior (Vite)

- App pages: receive COOP/COEP/CORP and Permissions‑Policy. No CSP is attached, so inline styles/scripts in your app continue to work.
- Wallet pages (`/wallet-service`): same headers + strict CSP by default (configurable via `VITE_WALLET_DEV_CSP=compatible`).
- SDK assets (`/sdk/*`): COEP/CORP and dev CORS echo:
  - JS: echoes `Access-Control-Allow-Origin` to the request `Origin`, includes `Allow-Credentials: true`.
  - CSS: permits `*` without credentials (safe and cache‑friendly).

## Environment variables

- `VITE_WALLET_ORIGIN` – absolute wallet origin used in `Permissions-Policy`.
- `VITE_WALLET_SERVICE_PATH` – path for wallet HTML (default `/wallet-service`).
- `VITE_SDK_BASE_PATH` – path for SDK assets (default `/sdk`).
- `VITE_WALLET_DEV_CSP` – `'strict' | 'compatible'` (dev only; default strict in tests and dev servers).

## Quick usage

App server (headers only):
```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { tatchiHeaders } from '@tatchi-xyz/sdk/plugins/vite'

export default defineConfig({
  plugins: [react(), tatchiHeaders({ walletOrigin: 'https://wallet.example.com' })],
})
```

Wallet server (full dev integration: serve SDK + wallet HTML + headers):
```ts
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { tatchiWalletServer, tatchiBuildHeaders } from '@tatchi-xyz/sdk/plugins/vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [
      react(),
      tatchiWalletServer({
        walletOrigin: env.VITE_WALLET_ORIGIN,
        sdkBasePath: env.VITE_SDK_BASE_PATH || '/sdk',
        walletServicePath: env.VITE_WALLET_SERVICE_PATH || '/wallet-service',
      }),
      tatchiBuildHeaders({ walletOrigin: env.VITE_WALLET_ORIGIN }),
    ],
  }
})
```

Single‑liner for app (dev + optional build headers):
```ts
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { tatchiApp } from '@tatchi-xyz/sdk/plugins/vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), tatchiApp({ walletOrigin: env.VITE_WALLET_ORIGIN, emitHeaders: true })],
  }
})
```

Single‑liner for wallet (dev + optional build headers):
```ts
import { defineConfig, loadEnv } from 'vite'
import { tatchiWallet } from '@tatchi-xyz/sdk/plugins/vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [
      tatchiWallet({
        walletOrigin: env.VITE_WALLET_ORIGIN,
        sdkBasePath: env.VITE_SDK_BASE_PATH || '/sdk',
        walletServicePath: env.VITE_WALLET_SERVICE_PATH || '/wallet-service',
        emitHeaders: true,
      }),
    ],
  }
})
```

Single‑liner for app (dev + optional build headers):
```ts
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { tatchiApp } from '@tatchi-xyz/sdk/plugins/vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), tatchiApp({ walletOrigin: env.VITE_WALLET_ORIGIN, emitHeaders: true })],
  }
})
```

## Which plugins to use

App integrators (your app server):
- Most common (cross‑origin wallet):
  - Dev: `tatchiHeaders({ walletOrigin })` only.
  - Do not mount `tatchiServeSdk` or `tatchiWalletService` on the app.
  - Your app can keep using inline styles/scripts; no CSP is applied to app routes.
- Same‑origin (host wallet pages on the app):
  - Dev: If you must run a single server, use `tatchiWalletServer({ ... })` on the app server to serve `/sdk` and `/wallet-service` from the same origin.
    Alternatively: `tatchiAppServer({ ... })` for headers only + `tatchiServeSdk()` if you want local `/sdk` without wallet HTML.
  - Build: optionally use `tatchiBuildHeaders()` on static hosts, or the convenience wrappers `tatchiApp({ emitHeaders: true })` / `tatchiWallet({ emitHeaders: true })` to emit `_headers` (COOP/COEP/CORP + PP + strict CSP on wallet routes).

Wallet deployers (wallet‑iframe host):
- Dev: `tatchiWalletServer({ ... })` on the wallet origin. This composes headers, SDK serving, wallet HTML, and WASM MIME.
- Build/Static hosting: `tatchiBuildHeaders({ walletOrigin })` to emit `_headers`. Serve the generated `wallet-service/index.html`, `export-viewer/index.html`, and `/sdk/*` assets.

## Production guidance

- Keep strict CSP on wallet HTML; do not attach CSP to app pages via this plugin.
- Ensure platform emits COEP/CORP and Permissions‑Policy. You can use `tatchiBuildHeaders` on static hosts.
- Avoid duplicating CORS headers for `/sdk/*`. If your platform injects `Access-Control-Allow-Origin`, do not also configure it via the plugin.

## FAQ

- Can the app use inline styles/scripts?
  - Yes. Strict CSP is scoped to wallet HTML only; app routes are unaffected.

- Why is COOP set to `unsafe-none` on the wallet route?
  - To prevent Chromium occasionally dropping a transferred `MessagePort` for cross‑origin wallet pages, while still keeping COEP/CORP for worker/WASM embedding.
