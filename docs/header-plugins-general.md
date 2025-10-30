# Header plugins and server setup for non‑Vite stacks

This SDK ships a Vite plugin (sdk/src/plugins/vite.ts) that solves three jobs during development and build:

- Serve SDK assets under a stable base (default: /sdk) with correct MIME types and cross‑origin headers (COEP/CORP + CORS).
- Provide a wallet service HTML route (default: /wallet-service) that links only external CSS/JS (CSP‑friendly, no inline) and preloads critical styles.
- Set security headers for dev and build (COEP, COOP, CORP, Permissions‑Policy, CSP) and emit a production _headers file for Pages/Netlify‑style hosts.

If you use another framework or dev server (Next.js, CRA/Webpack, Vue CLI, Express, etc.), replicate these behaviors with small adapters. This guide shows how.

## Implementation Plan (Phased)

- [ ] Phase 1 — Assets & HTML
  - [ ] Copy SDK assets to a stable base (e.g., `/sdk`).
  - [ ] Add static wallet pages: `wallet-service/index.html` and `export-viewer/index.html` that link only external CSS/JS.
- [ ] Phase 2 — Dev Server Headers & MIME
  - [ ] Add COEP/CORP/COOP, CSP, Permissions-Policy on wallet routes; add CORS on `/sdk/*`; set `application/wasm` for `.wasm`.
- [ ] Phase 3 — Production Headers
  - [ ] Configure the hosting platform to mirror the same headers; avoid duplicating ACAO; ensure a single source of truth.
- [ ] Phase 4 — Verification
  - [ ] `curl -I` a `.wasm` under `/sdk/workers/*` to verify headers and MIME.
  - [ ] Load wallet pages and confirm no inline CSP violations and no CORP/ORB errors in DevTools.

Note (cross-origin mode): If your app embeds a remote wallet (for example, https://wallet.tatchi.xyz), you do not need to copy `/sdk/*` or serve wallet HTML on your app origin. Configure your provider with `iframeWallet.walletOrigin` and ensure your app’s CSP/Permissions‑Policy allow the wallet origin.

### Minimal Cross‑Origin Examples (recommended)

- Do not copy or serve SDK assets locally; use the remote wallet origin.
- Configure your app provider with a hardcoded `iframeWallet.walletOrigin` and `relayer.url` for dev.
- Add only the headers you need on the app:
  - Permissions‑Policy delegation to the wallet origin (WebAuthn, clipboard).
  - CSP `frame-src 'self' https://wallet.tatchi.xyz` (and any other embedded origins).
- In Vite‑based stacks, you can either:
  - Use no plugin and set headers via your reverse proxy (e.g., Caddy), or
  - Use the lightweight `tatchiDevHeaders({ walletOrigin: 'https://wallet.tatchi.xyz' })` plugin.

Minimal React provider snippet:

```tsx
import { TatchiPasskeyProvider } from '@tatchi-xyz/sdk/react'

const config = {
  nearNetwork: 'testnet',
  nearRpcUrl: 'https://test.rpc.fastnear.com',
  contractId: 'w3a-v1.testnet',
  relayer: { accountId: 'w3a-v1.testnet', url: 'https://relay-server.localhost' },
  iframeWallet: { walletOrigin: 'https://wallet.tatchi.xyz' },
}

export function AppProviders({ children }) {
  return <TatchiPasskeyProvider config={config}>{children}</TatchiPasskeyProvider>
}
```

Minimal Vite config (headers only):

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { tatchiDevHeaders } from '@tatchi-xyz/sdk/plugins/vite'

export default defineConfig({
  plugins: [react(), tatchiDevHeaders({ walletOrigin: 'https://wallet.tatchi.xyz' })],
})
```

## What you must provide

- Static SDK files available at a predictable base, typically /sdk, including:
  - ESM bundles (e.g., wallet-iframe-host.js, w3a-button-with-tooltip.js, iframe-* modules)
  - CSS files (w3a-components.css, drawer.css, tx-tree.css, modal-confirmer.css, halo-border.css, passkey-halo-loading.css, iframe-button-host.css, export-iframe.css, wallet-service.css)
  - Workers/WASM files under /sdk/workers/* and /sdk/*/pkg/*.wasm
- A wallet service route (e.g., /wallet-service) that returns minimal HTML linking only external CSS/JS and no inline scripts/styles.
- Headers:
  - Cross-Origin-Embedder-Policy: require-corp
  - Cross-Origin-Resource-Policy: cross-origin (for /sdk/* so cross‑origin pages can import)
  - Cross-Origin-Opener-Policy: same-origin globally, and unsafe-none for wallet HTML routes (/wallet-service, /export-viewer) to avoid Chromium dropping transferred MessagePort in some scenarios.
  - Permissions-Policy: delegate WebAuthn + clipboard to your wallet origin:
    - publickey-credentials-get=(self "https://wallet.example.com")
    - publickey-credentials-create=(self "https://wallet.example.com")
    - clipboard-read=(self "https://wallet.example.com")
    - clipboard-write=(self "https://wallet.example.com")
  - CSP (strict recommended):
    - style-src 'self'
    - style-src-attr 'none'
    - default-src 'self'; script-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self' https:; worker-src 'self' blob:; frame-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'
  - CORS on /sdk/* and /sdk/workers/*: Access-Control-Allow-Origin: *
  - WASM MIME: application/wasm for .wasm assets

## Copying the SDK assets

At build time (or postinstall), copy the SDK dist assets into your app’s public directory so they deploy under /sdk. For example:

"scripts": {
  "prepare:sdk": "node -e \"const fs=require('fs'),path=require('path');const src=path.dirname(require.resolve('@tatchi-xyz/sdk/package.json'));const from=path.join(src,'dist','esm','sdk');const to=path.join(process.cwd(),'public','sdk');fs.mkdirSync(to,{recursive:true});(function cp(a,b){for(const e of fs.readdirSync(a)){const s=path.join(a,e),d=path.join(b,e);const st=fs.statSync(s);if(st.isDirectory()){fs.mkdirSync(d,{recursive:true});cp(s,d);}else{fs.copyFileSync(s,d);}}})(from,to);\""
}

Run this before your dev/build steps so /public/sdk exists with the latest SDK.

Serve wallet HTML as static files

To avoid framework‑injected inline scripts/styles (which violate strict CSP), serve wallet HTML as static files, not SSR pages:

- public/wallet-service/index.html (use the head/body structure emitted by the Vite plugin; link only /sdk/* CSS and import /sdk/wallet-iframe-host.js as a module)
- public/export-viewer/index.html (links /sdk/* CSS, preloads viewer modules, imports export-private-key-viewer.js and iframe-export-bootstrap.js)

Example wallet-service HTML skeleton:

<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Web3Authn Wallet Service</title>
    <link rel="preload" as="style" href="/sdk/tx-tree.css">
    <link rel="preload" as="style" href="/sdk/drawer.css">
    <link rel="preload" as="style" href="/sdk/halo-border.css">
    <link rel="preload" as="style" href="/sdk/passkey-halo-loading.css">
    <link rel="stylesheet" href="/sdk/wallet-service.css">
    <link rel="stylesheet" href="/sdk/w3a-components.css">
    <link rel="stylesheet" href="/sdk/drawer.css">
    <link rel="stylesheet" href="/sdk/tx-tree.css">
    <link rel="stylesheet" href="/sdk/modal-confirmer.css">
    <script src="/sdk/wallet-shims.js"></script>
    <link rel="modulepreload" href="/sdk/wallet-iframe-host.js" crossorigin>
  </head>
  <body>
    <script type="module" src="/sdk/wallet-iframe-host.js"></script>
  </body>
  </html>

### Next.js

- Static assets: copy SDK to public/sdk (see script above). Next will serve them at https://your-app/sdk/*.
- Wallet HTML: put the two HTML files into public/wallet-service/index.html and public/export-viewer/index.html. This avoids Next injecting inline data/scripts.
- Headers: add headers() in next.config.js:

// next.config.js
module.exports = {
  async headers() {
    const permissions = 'publickey-credentials-get=(self "https://wallet.example.com"), publickey-credentials-create=(self "https://wallet.example.com"), clipboard-read=(self "https://wallet.example.com"), clipboard-write=(self "https://wallet.example.com")'
    return [
      {
        source: '/wallet-service',
        headers: [
          { key: 'Cross-Origin-Opener-Policy', value: 'unsafe-none' },
          { key: 'Cross-Origin-Embedder-Policy', value: 'require-corp' },
          { key: 'Cross-Origin-Resource-Policy', value: 'cross-origin' },
          { key: 'Permissions-Policy', value: permissions },
          { key: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self'; style-src 'self'; style-src-attr 'none'; img-src 'self' data:; font-src 'self'; connect-src 'self' https:; worker-src 'self' blob:; frame-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'" }
        ],
      },
      { source: '/wallet-service/', headers: [/* same as above */] },
      { source: '/export-viewer', headers: [
          { key: 'Cross-Origin-Opener-Policy', value: 'unsafe-none' },
          { key: 'Permissions-Policy', value: permissions },
        ] },
      { source: '/sdk/:path*', headers: [
          { key: 'Cross-Origin-Embedder-Policy', value: 'require-corp' },
          { key: 'Cross-Origin-Resource-Policy', value: 'cross-origin' },
          { key: 'Access-Control-Allow-Origin', value: '*' },
        ] },
      { source: '/:path*.wasm', headers: [ { key: 'Content-Type', value: 'application/wasm' } ] },
    ]
  },
}

Notes:
- Avoid implementing /wallet-service as a React page to keep CSP strict; serve the static HTML from public instead.
- If you must SSR the wallet route, you’ll need to relax CSP in dev and ensure no inline styles/scripts are injected by the framework.

Plan (Next.js — cross-origin wallet at https://wallet.tatchi.xyz)

- [ ] Phase 1 — Cross-Origin Setup
  - [ ] In your provider config: set `iframeWallet.walletOrigin = 'https://wallet.tatchi.xyz'` and a dev `relayer.url`.
  - [ ] Do not copy `/sdk/*`; do not serve wallet HTML from the app.
- [ ] Phase 2 — Dev Headers
  - [ ] Add `Permissions-Policy` delegating WebAuthn + clipboard to `https://wallet.tatchi.xyz` in `next.config.js` headers.
  - [ ] Ensure CSP `frame-src` includes `https://wallet.tatchi.xyz`.
- [ ] Phase 3 — Production Headers
  - [ ] Keep the same delegation and frame-src. No `_headers` emission needed for SDK assets since they’re remote.
- [ ] Phase 4 — Verification
  - [ ] App renders; wallet iframe boots from `https://wallet.tatchi.xyz` with no CSP or isolation errors in DevTools.

### Vanilla React (CRA/Webpack) & Vue CLI (webpack)

- Static assets: copy SDK into public/sdk.
- Wallet HTML: add public/wallet-service/index.html and public/export-viewer/index.html.
- Dev headers: add a setupProxy.js (CRA) or devServer.headers (Vue CLI) to inject security headers and CORS for /sdk/*.

// CRA: src/setupProxy.js
const { createProxyMiddleware } = require('http-proxy-middleware')
module.exports = function (app) {
  app.use((req, res, next) => {
    const url = req.url.split('?')[0]
    const permissions = 'publickey-credentials-get=(self "https://wallet.example.com"), publickey-credentials-create=(self "https://wallet.example.com"), clipboard-read=(self "https://wallet.example.com"), clipboard-write=(self "https://wallet.example.com")'
    if (url === '/wallet-service' || url === '/wallet-service/') {
      res.setHeader('Cross-Origin-Opener-Policy', 'unsafe-none')
      res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp')
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
      res.setHeader('Permissions-Policy', permissions)
      res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; style-src-attr 'none'; img-src 'self' data:; font-src 'self'; connect-src 'self' https:; worker-src 'self' blob:; frame-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'")
    }
    if (url.startsWith('/sdk/')) {
      res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp')
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
      res.setHeader('Access-Control-Allow-Origin', '*')
    }
    next()
  })
}

### Vue (Vite)

- If your Vue app uses Vite, prefer the lightweight `tatchiDevHeaders` for cross‑origin setups; no local `/sdk` is required.

Plan (Vue with Vite — cross-origin wallet at https://wallet.tatchi.xyz)

- [ ] Phase 1 — Cross-Origin Setup
  - [ ] Configure provider with `iframeWallet.walletOrigin = 'https://wallet.tatchi.xyz'` and a dev `relayer.url`.
  - [ ] Skip copying `/sdk/*` and wallet HTML; assets and pages live on the wallet origin.
- [ ] Phase 2 — Dev Headers
  - [ ] Prefer `tatchiDevHeaders({ walletOrigin: 'https://wallet.tatchi.xyz' })` for minimal setup.
  - [ ] Alternatively rely on your proxy (Caddy) to inject `Permissions-Policy` and CSP `frame-src`.
- [ ] Phase 3 — Production Headers
  - [ ] No `_headers` emission needed for SDK assets since they’re remote; keep delegation/frame-src.
- [ ] Phase 4 — Verification
  - [ ] App renders; wallet iframe boots; no CSP violations in DevTools.

### SvelteKit (Vite)

- Minimal cross‑origin setup: no static wallet HTML in `static/`; assets and pages come from the wallet origin.

Example `vite.config.ts` (headers‑only, minimal):

```ts
import { defineConfig, loadEnv } from 'vite'
import { sveltekit } from '@sveltejs/kit/vite'
import { tatchiDevHeaders } from '@tatchi-xyz/sdk/plugins/vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [
      sveltekit(),
      tatchiDevHeaders({ walletOrigin: env.VITE_WALLET_ORIGIN || 'https://wallet.tatchi.xyz' }),
    ],
  }
})
```

Plan (SvelteKit with Vite — cross-origin wallet at https://wallet.tatchi.xyz)

- [ ] Phase 1 — Cross-Origin Setup
  - [ ] Configure provider with `iframeWallet.walletOrigin = 'https://wallet.tatchi.xyz'` and a dev `relayer.url`.
  - [ ] Skip `static/wallet-service` pages; they live on the wallet origin.
- [ ] Phase 2 — Dev Headers
  - [ ] Use `tatchiDevHeaders` or set headers via your proxy (Caddy); ensure CSP `frame-src` includes the wallet origin.
- [ ] Phase 3 — Production Headers
  - [ ] Keep delegation/frame-src. No `_headers` emission needed for SDK assets.
- [ ] Phase 4 — Verification
  - [ ] App renders; wallet iframe boots; no CSP or isolation errors.

<!-- Express/Node and hosting sections intentionally omitted here: focus is minimal frontend cross-origin examples. -->

Note on CORS header duplication

- Some platforms add Access-Control-Allow-Origin automatically. If you also emit it via the SDK’s build helper, browsers may see a combined value like "*, *" and block the request.
- Default behavior: the SDK does not emit ACAO in production. Opt in explicitly if your platform cannot set CORS:
  - Vite config: `tatchiBuildHeaders({ walletOrigin, cors: { accessControlAllowOrigin: '*' } })`
- Prefer a single source of truth. If you opt in via plugin, remove any platform CORS rule for `/sdk/*`.
- Always verify with curl -I https://wallet.example.com/sdk/workers/wasm_signer_worker_bg.wasm that only one Access-Control-Allow-Origin header is present and that Content-Type is application/wasm.

Dev UX tips

- React apps should call usePreconnectWalletAssets and use TatchiPasskeyProvider to set window.__W3A_WALLET_SDK_BASE__ to an absolute https://wallet-origin/sdk/ when cross‑origin, preventing ORB and path mistakes.
- When running strict dev CSP, avoid inline style attributes and style tags. The SDK already externalizes and adopts styles into Shadow DOM via constructable stylesheets.
