---
title: Self‑hosting the Wallet SDK
---

# Self‑hosting the Wallet SDK

This guide shows how to run the wallet iframe on your own origin. Your app then points `iframeWallet.walletOrigin` at this origin so all sensitive flows (WebAuthn/PRF/VRF, key handling, signing) execute in an isolated, sandboxed site you control.

What you will deploy
- Static SDK assets under a stable base path (default: `/sdk`).
- A simple HTML route for the wallet service (default: `/wallet-service`).

When to self‑host
- You want to own the wallet origin and headers entirely.
- You want tighter network and CSP controls or a private deployment.

## 1) Publish the SDK assets

From your app, install `@tatchi-xyz/sdk` and serve its embedded wallet assets under `/sdk`.

Express example
```ts
import express from 'express'
import path from 'node:path'

const app = express()

// Serve SDK assets with correct MIME (especially .wasm)
app.use('/sdk', (req, res, next) => {
  if (req.url?.endsWith('.wasm')) res.setHeader('Content-Type', 'application/wasm')
  next()
}, express.static(path.join(process.cwd(), 'node_modules', '@tatchi-xyz', 'sdk', 'dist', 'sdk')))
```

Notes
- Keep the base path stable (e.g., `/sdk`); the wallet host will request URLs relative to it.
- If using a CDN, make sure it doesn’t rewrite `/sdk/*` to your app shell and that `.wasm` is served as `application/wasm`.

## 2) Add the wallet service route

Serve a minimal HTML page that boots the wallet host script. Use strict CSP on this route.

Express example
```ts
import { buildWalletCsp } from '@tatchi-xyz/sdk/plugins/headers'

app.get('/wallet-service', (req, res) => {
  // The wallet runs inside an iframe; relax COOP on this route only.
  res.setHeader('Cross-Origin-Opener-Policy', 'unsafe-none')
  res.setHeader('Content-Security-Policy', buildWalletCsp({ mode: 'strict' }))
  res.type('html').send(`<!doctype html>
<html>
  <head><meta charset="utf-8"/></head>
  <body>
    <script type="module" src="/sdk/wallet-iframe-host.js"></script>
  </body>
</html>`)
})
```

If you serve HTML via a framework router, ensure this route returns the HTML above and is not replaced by your app’s index.html.

## 3) Point your app to the wallet origin

Configure the SDK in your app to use the self‑hosted wallet origin. Example (React provider):

```tsx
import { TatchiPasskeyProvider } from '@tatchi-xyz/sdk/react'

<TatchiPasskeyProvider
  config={{
    iframeWallet: {
      walletOrigin: 'https://wallet.example.com',
      walletServicePath: '/wallet-service',
      // Optional: where the wallet host loads SDK bundles from (defaults to '/sdk')
      sdkBasePath: '/sdk',
      // Optional: force passkey scope base across subdomains
      // rpIdOverride: 'example.com',
    },
    // Optional: relay for VRF session and account creation flows
    relayer: { accountId: 'w3a-relayer.testnet', url: 'https://relay.example.com' },
  }}
>
  <App />
</TatchiPasskeyProvider>
```

Vite (dev/build) helpers (optional)
```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { tatchiAppServer, tatchiBuildHeaders } from '@tatchi-xyz/sdk/plugins/vite'

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    // Emits headers that enable the cross‑origin wallet integration in dev/build
    tatchiAppServer({ walletOrigin: process.env.VITE_WALLET_ORIGIN || 'https://wallet.example.com' }),
    tatchiBuildHeaders({ walletOrigin: process.env.VITE_WALLET_ORIGIN || 'https://wallet.example.com' }),
  ],
}))
```

## 4) Production headers checklist

On the wallet origin:
- Wallet service (`/wallet-service`)
  - `Content-Security-Policy`: serve a strict CSP. The helper `buildWalletCsp({ mode: 'strict' })` is a good default.
  - `Cross-Origin-Opener-Policy: unsafe-none` (wallet is embedded).
- SDK assets (`/sdk/*`)
  - Correct MIME: `.js` → `application/javascript`, `.wasm` → `application/wasm`.
  - Don’t rewrite to index.html.

On the app origin:
- Use the SDK/Vite header helpers or mirror their output in your platform.
- Ensure HTTPS (WebAuthn requires a secure context).

## 5) Testing locally

- Use HTTPS locally (e.g., Caddy with `example.localhost` and `wallet.example.localhost`).
- Verify the wallet iframe connects (network tab should show `/wallet-service`).
- If you see mixed‑content or COOP errors, recheck origins, HTTPS, and per‑route headers above.

## See also
- Wallet iframe details: ../guides/wallet-iframe
- Concepts: ../concepts/wallet-iframe-architecture
- Deployment notes: ../deployment/asset-url-resolution
