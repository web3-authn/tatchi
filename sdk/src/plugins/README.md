# Tatchi SDK Headers – Dev and Build

This folder contains header builders and small plugins for Vite and Next. They provide security headers needed for the wallet iframe, workers and WASM.

Takeaways:
- Strict CSP is applied only to wallet HTML routes (`/wallet-service`, `/export-viewer`), not to your app pages.
- COEP is **off by default**; enable it only when you need cross‑origin isolation (`coepMode: 'strict'` or `VITE_COEP_MODE=strict`).
- COEP `require-corp` can break browser extensions (e.g., Bitwarden/1Password overlays); this is why the default is off.
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
  - `tatchiServeSdk({ sdkBasePath?, sdkDistRoot?, enableDebugRoutes?, coepMode? })`
    - Serves SDK files under a stable base (default `/sdk`).
    - Sets COEP/CORP only in strict mode; echoes CORS from request (dev only).
    - Emits two tiny virtual assets used by wallet pages: `wallet-shims.js`, `wallet-service.css`.
  - `tatchiWalletService({ walletServicePath?, sdkBasePath?, coepMode? })`
    - Serves minimal wallet HTML with only external CSS/JS (no inline) so strict CSP works.
  - `tatchiWasmMime()`
    - Forces `application/wasm` for any `.wasm` file.
  - `tatchiHeaders({ walletOrigin?, walletServicePath?, sdkBasePath?, devCSP?, coepMode? })`
    - Adds: `COOP: same-origin` (except wallet HTML → `unsafe-none`), `COEP: require-corp`, `CORP: cross-origin` (when `coepMode !== 'off'`).
    - Adds `Permissions-Policy` built from `walletOrigin`.
    - Optional dev CSP on wallet HTML only: `devCSP: 'strict' | 'compatible'`.
  - `tatchiApp({ walletOrigin?, emitHeaders?, coepMode? })`
    - Dev (serve): same behavior as `tatchiAppServer({ walletOrigin })` (headers only on the app origin).
    - Build (build): when `emitHeaders: true`, writes `_headers` (COOP + Permissions‑Policy; optional COEP/CORP when enabled; strict CSP scoped to wallet HTML routes).
  - `tatchiWallet({ walletOrigin?, walletServicePath?, sdkBasePath?, emitHeaders?, coepMode? })`
    - Dev (serve): same behavior as `tatchiWalletServer({ ... })` (serves `/wallet-service` + `/sdk` with headers).
    - Build (build): when `emitHeaders: true`, writes `_headers` (same as above; strict CSP scoped to wallet HTML routes).
  - `tatchiApp({ walletOrigin?, emitHeaders? })`
    - Dev (serve): same behavior as `tatchiAppServer({ walletOrigin })` (headers only on the app origin).
    - Build (build): when `emitHeaders: true`, writes `_headers` (COOP + Permissions‑Policy; optional COEP/CORP when enabled; strict CSP scoped to wallet HTML routes).
  - Convenience dev servers:
    - `tatchiWalletServer({...})` → wallet origin (`/wallet-service` + `/sdk` + headers)
    - `tatchiAppServer({...})` → app origin (headers only; combine with `tatchiServeSdk` if needed)
  - `tatchiBuildHeaders({ walletOrigin?, cors?, coepMode? })`
    - Writes a Pages/Netlify‑compatible `_headers` file into Vite `outDir`.
    - Global: `COOP: same-origin`, `COEP: require-corp`, `CORP: cross-origin`, `Permissions-Policy` (COEP/CORP omitted when `coepMode === 'off'`).
    - Wallet HTML (`/wallet-service`, `/export-viewer`): adds strict `Content-Security-Policy`.
    - Optional: emit CORS for `/sdk/*` (prefer platform rules; avoid duplication).

- `next.ts`
  - Provides analogous helpers for Next.js via `headers()` config, sourcing values from `headers.ts`.

## Dev behavior (Vite)

- App pages: receive COOP and Permissions‑Policy. COEP/CORP are added only when `coepMode: 'strict'` (or `VITE_COEP_MODE=strict`). No CSP is attached, so inline styles/scripts in your app continue to work.
- Wallet pages (`/wallet-service`): same headers + strict CSP by default (configurable via `VITE_WALLET_DEV_CSP=compatible`). COEP/CORP only in strict mode.
- SDK assets (`/sdk/*`): dev CORS echo; COEP/CORP only in strict mode:
  - JS: echoes `Access-Control-Allow-Origin` to the request `Origin`, includes `Allow-Credentials: true`.
  - CSS: permits `*` without credentials (safe and cache‑friendly).

## Environment variables

- `VITE_WALLET_ORIGIN` – absolute wallet origin used in `Permissions-Policy`.
- `VITE_WALLET_SERVICE_PATH` – path for wallet HTML (default `/wallet-service`).
- `VITE_SDK_BASE_PATH` – path for SDK assets (default `/sdk`).
- `VITE_COEP_MODE` – `'strict' | 'off'` (defaults to off; tests should set `strict`).
- `VITE_WALLET_DEV_CSP` – `'strict' | 'compatible'` (dev only; default strict in tests and dev servers).

## Recommended usage (wrappers)

App (dev + optional build headers):
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

Wallet (dev + optional build headers):
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

## Next.js usage

Use the Next helpers to apply Permissions-Policy and a wallet-friendly CSP via `next.config.js` headers().

App origin:
```js
// next.config.js (ESM)
import { tatchiNextApp } from '@tatchi-xyz/sdk/plugins/next'

const isDev = process.env.NODE_ENV !== 'production'
const walletOrigin = process.env.NEXT_PUBLIC_WALLET_ORIGIN || 'https://wallet.example.localhost'

const baseConfig = {
  // Optional: silence workspace monorepo root warning
  // outputFileTracingRoot: __dirname,
}

export default tatchiNextApp({
  walletOrigin,
  // Relax CSP only in dev to accommodate Next's dev runtime
  cspMode: isDev ? 'compatible' : 'strict',
  allowUnsafeEvalDev: true,
  compatibleInDev: true,
  // Allow wallet origin for dev cross-origin modulepreload
  extraScriptSrc: isDev ? [walletOrigin] : [],
})(baseConfig)
```

Wallet origin (if you proxy wallet routes through Next in dev):
```js
import { tatchiNextWallet } from '@tatchi-xyz/sdk/plugins/next'

export default tatchiNextWallet({ walletOrigin: process.env.NEXT_PUBLIC_WALLET_ORIGIN })(/** base config **/)
```

Notes
- `emitHeaders` has no effect for Next.js; headers are added via `headers()` in `next.config.js`.
- In production, keep CSP strict on wallet HTML (no inline styles/scripts; include `style-src-attr 'none'`).


## Advanced: granular/server-level composition

If you need fine-grained control, you can compose the lower-level servers directly.

App server (headers only):
```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { tatchiHeaders } from '@tatchi-xyz/sdk/plugins/vite'

export default defineConfig({
  plugins: [react(), tatchiHeaders({ walletOrigin: 'https://wallet.example.com' })],
})
```

Wallet server (serve SDK + wallet HTML + headers):
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

## Which plugins to use

App integrators (your app server):
- Recommended (cross‑origin wallet):
  - Dev+Build: `tatchiApp({ walletOrigin, emitHeaders: true })`.
  - Advanced: dev-only headers via `tatchiHeaders({ walletOrigin })` if you manage build-time headers yourself.
- Same‑origin (dev convenience only):
  - Dev: If you must run a single server, use `tatchiWallet({ ... })` on the app server. Avoid this in production.
  - Advanced: `tatchiWalletServer` / `tatchiAppServer` exist for granular composition when needed.

Wallet deployers (wallet‑iframe host):
- Recommended: `tatchiWallet({ walletOrigin, sdkBasePath, walletServicePath, emitHeaders: true })`.
- Advanced: `tatchiWalletServer({ ... })` in dev, `tatchiBuildHeaders({ walletOrigin })` at build. Serve the generated `wallet-service/index.html`, `export-viewer/index.html`, and `/sdk/*` assets.

## Production guidance

- Keep strict CSP on wallet HTML; do not attach CSP to app pages via this plugin.
- Ensure platform emits COEP/CORP and Permissions‑Policy. You can use `tatchiBuildHeaders` on static hosts.
- Avoid duplicating CORS headers for `/sdk/*`. If your platform injects `Access-Control-Allow-Origin`, do not also configure it via the plugin.

## FAQ

- Can the app use inline styles/scripts?
  - Yes. Strict CSP is scoped to wallet HTML only; app routes are unaffected.

- Why is COOP set to `unsafe-none` on the wallet route?
  - To prevent Chromium occasionally dropping a transferred `MessagePort` for cross‑origin wallet pages, while still keeping COEP/CORP for worker/WASM embedding.
