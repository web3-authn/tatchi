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

Plan (Next.js)

- [ ] Phase 1 — Assets & HTML
  - [ ] Add a copy script for SDK -> `public/sdk`.
  - [ ] Create `public/wallet-service/index.html` and `public/export-viewer/index.html` from the skeleton above.
- [ ] Phase 2 — Dev Headers
  - [ ] Implement `headers()` in `next.config.js` for `/wallet-service`, `/export-viewer`, `/sdk/:path*`, and `.wasm`.
- [ ] Phase 3 — Production Headers
  - [ ] Configure your host (Vercel/Pages/Netlify/nginx) to mirror these headers; ensure only one `Access-Control-Allow-Origin`.
- [ ] Phase 4 — Verification
  - [ ] `curl -I https://your-app/sdk/workers/wasm_signer_worker_bg.wasm` shows `application/wasm` and a single ACAO.
  - [ ] Open `/wallet-service` and check DevTools for CSP/COEP/CORP correctness.

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

- If your Vue app uses Vite, you can import the SDK’s Vite plugin directly (tatchiDev + tatchiBuildHeaders) just like the examples do.

Plan (Vue with Vite)

- [ ] Phase 1 — Assets & HTML
  - [ ] Add static wallet pages under the project’s `public/` if you want to serve them as-is.
- [ ] Phase 2 — Dev Headers
  - [ ] Use the SDK Vite plugin `tatchiDev` to serve `/sdk` and apply dev headers + WASM MIME.
- [ ] Phase 3 — Production Headers
  - [ ] Use `tatchiBuildHeaders({ walletOrigin })` to emit `_headers` for Pages/Netlify, or mirror rules in your platform.
- [ ] Phase 4 — Verification
  - [ ] `curl -I` a `.wasm`; check wallet route CSP in DevTools.

### SvelteKit (Vite)

- Static assets: create `static/wallet-service/index.html` and (optionally) `static/export-viewer/index.html` with only external CSS/JS from `/sdk/*`.
- Dev/build: use the SDK’s Vite plugins like in the React/Vue examples.

Example `vite.config.ts`:

```ts
import { defineConfig, loadEnv } from 'vite'
import { sveltekit } from '@sveltejs/kit/vite'
import { tatchiDev, tatchiBuildHeaders } from '@tatchi-xyz/sdk/plugins/vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [
      sveltekit(),
      tatchiDev({
        sdkBasePath: env.VITE_SDK_BASE_PATH || '/sdk',
        walletServicePath: env.VITE_WALLET_SERVICE_PATH || '/wallet-service',
        walletOrigin: env.VITE_WALLET_ORIGIN,
      }),
      tatchiBuildHeaders({ walletOrigin: env.VITE_WALLET_ORIGIN }),
    ],
  }
})
```

Plan (SvelteKit with Vite)

- [ ] Phase 1 — Assets & HTML
  - [ ] Place `static/wallet-service/index.html` (and `static/export-viewer/index.html`) with links to `/sdk/*`.
- [ ] Phase 2 — Dev Headers
  - [ ] Enable `tatchiDev` to serve `/sdk` and apply COEP/CORP/COOP, CSP, Permissions-Policy, and WASM MIME in dev.
- [ ] Phase 3 — Production Headers
  - [ ] Enable `tatchiBuildHeaders({ walletOrigin })` to emit `_headers`, or configure headers in your target adapter/host.
- [ ] Phase 4 — Verification
  - [ ] `curl -I` a `.wasm`; confirm wallet routes load with strict CSP and no ORB/CORP issues.

Express / generic Node servers

- Serve /sdk as static with headers:

app.use('/sdk', (req, res, next) => {
  res.set('Cross-Origin-Embedder-Policy', 'require-corp')
  res.set('Cross-Origin-Resource-Policy', 'cross-origin')
  res.set('Access-Control-Allow-Origin', '*')
  next()
}, express.static(path.join(__dirname, 'public', 'sdk')))

- Serve /wallet-service and /export-viewer as static HTML files with the strict CSP and Permissions‑Policy headers shown above.
- Ensure .wasm served with application/wasm.

Plan (Express / Node)

- [ ] Phase 1 — Assets & HTML
  - [ ] Copy SDK to `public/sdk`; add `public/wallet-service/index.html` and `public/export-viewer/index.html`.
- [ ] Phase 2 — Dev Headers
  - [ ] Add an `app.use('/sdk', …)` that sets COEP/CORP + CORS and serves static files; set MIME for `.wasm`.
  - [ ] Set wallet route headers (COOP unsafe-none, COEP, CSP, Permissions-Policy) when serving the HTML files.
- [ ] Phase 3 — Production Headers
  - [ ] Mirror the same headers in your reverse proxy/CDN; ensure only one ACAO header.
- [ ] Phase 4 — Verification
  - [ ] `curl -I` a `.wasm` in `/sdk/workers/*`; load `/wallet-service` and check DevTools security headers.

Production hosting (Cloudflare Pages/Netlify)

- Use the SDK’s build helper when building with Vite to emit dist/_headers with the security headers, or replicate equivalent headers in your platform UI.
- Ensure /sdk/* and /sdk/workers/* have CORS and CORP.
- Keep wallet HTML static to satisfy strict CSP.

Plan (Hosting)

- [ ] Phase 1 — Assets & HTML
  - [ ] Ensure `/sdk/*` and static wallet pages are included in the deploy artifact.
- [ ] Phase 2 — Dev Headers
  - [ ] N/A (platform-specific); verify local dev mirrors production headers.
- [ ] Phase 3 — Production Headers
  - [ ] Add COEP/CORP/COOP, CSP, Permissions-Policy; set `application/wasm` for `.wasm`.
  - [ ] Avoid duplicated ACAO when combining platform rules with build-time `_headers`.
- [ ] Phase 4 — Verification
  - [ ] `curl -I https://wallet.example.com/sdk/workers/wasm_signer_worker_bg.wasm` shows correct headers and MIME.
  - [ ] Confirm wallet pages render with strict CSP and no cross-origin isolation errors.

Note on CORS header duplication

- Some platforms add Access-Control-Allow-Origin automatically. If you also emit it via the SDK’s build helper, browsers may see a combined value like "*, *" and block the request.
- Default behavior: the SDK does not emit ACAO in production. Opt in explicitly if your platform cannot set CORS:
  - Vite config: `tatchiBuildHeaders({ walletOrigin, cors: { accessControlAllowOrigin: '*' } })`
- Prefer a single source of truth. If you opt in via plugin, remove any platform CORS rule for `/sdk/*`.
- Always verify with curl -I https://wallet.example.com/sdk/workers/wasm_signer_worker_bg.wasm that only one Access-Control-Allow-Origin header is present and that Content-Type is application/wasm.

Dev UX tips

- React apps should call usePreconnectWalletAssets and use TatchiPasskeyProvider to set window.__W3A_WALLET_SDK_BASE__ to an absolute https://wallet-origin/sdk/ when cross‑origin, preventing ORB and path mistakes.
- When running strict dev CSP, avoid inline style attributes and style tags. The SDK already externalizes and adopts styles into Shadow DOM via constructable stylesheets.
