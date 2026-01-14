---
title: Self‑hosting the Wallet SDK
---

# Self-Hosting the Wallet SDK

This guide shows how to run the wallet iframe on your own infrastructure. By self-hosting, your application points `iframeWallet.walletOrigin` at your own domain, ensuring all sensitive operations (WebAuthn, PRF, VRF, key handling, and transaction signing) execute in an isolated environment you fully control.

## What You Will Deploy

Self-hosting requires two components:

1. **Static SDK assets** served at a stable base path (default: `/sdk`)
   - JavaScript bundles
   - WASM modules for signing and VRF
   - CSS and component files

2. **Wallet service HTML page** at a dedicated route (default: `/wallet-service`)
   - Minimal HTML that loads the wallet iframe host script
   - Strict Content Security Policy headers

## When to Self-Host

Consider self-hosting if you need:

- **Full control over infrastructure**: You manage the wallet origin, headers, and deployment pipeline
- **Private deployments**: Internal applications or restricted networks where external wallet origins aren't accessible
- **Custom CSP policies**: Specific security requirements beyond the default configuration
- **Compliance requirements**: Regulatory or organizational policies requiring all code to run on your domains

If you're building a public application and don't have these requirements, using a shared wallet origin (like `wallet.web3authn.org`) can simplify deployment while still providing security through origin isolation.

## 1) Publish the SDK assets

From your app, install `@tatchi-xyz/sdk` and serve its embedded wallet assets under `/sdk`.

Express example
```ts
import express from 'express'
import path from 'node:path'

const app = express()

const sdkDist = path.join(process.cwd(), 'node_modules', '@tatchi-xyz', 'sdk', 'dist')

// The wallet runtime assets live in two folders:
// - dist/esm/sdk      → JS/CSS bundles loaded by wallet-iframe-host.js
// - dist/workers      → module workers + WASM binaries (served under /sdk/workers)
const sdkEsmAssets = path.join(sdkDist, 'esm', 'sdk')
const sdkWorkerAssets = path.join(sdkDist, 'workers')

// Serve Worker + WASM assets with correct MIME (especially .wasm).
// Mount this first so /sdk/workers/* doesn't get handled by the /sdk static route.
app.use('/sdk/workers', (req, res, next) => {
  if (req.url?.endsWith('.wasm')) res.setHeader('Content-Type', 'application/wasm')
  next()
}, express.static(sdkWorkerAssets))

// Serve the rest of the wallet SDK runtime assets (JS/CSS).
app.use('/sdk', express.static(sdkEsmAssets))
```

**Important considerations**:

- **Stable paths**: Keep the base path consistent (e.g., `/sdk`). The wallet iframe host requests assets relative to this path, so changing it will break existing deployments.
- **CDN configuration**: If using a CDN, ensure it doesn't rewrite `/sdk/*` requests to your application shell (index.html). Configure your CDN to serve these paths as static assets.
- **WASM MIME type**: WASM files must be served with `Content-Type: application/wasm` or browsers will refuse to load them. The code above sets this header explicitly.

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
import { TatchiPasskeyProvider } from '@tatchi-xyz/sdk/react/provider'

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
    relayer: { url: 'https://relay.example.com' },
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

## 5) Testing Locally

Local testing requires HTTPS since WebAuthn only works in secure contexts:

**Option 1: Use .localhost domains** (built-in browser trust):
```bash
# Run your app on example.localhost:3000
# Run wallet on wallet.example.localhost:3001
# Both are treated as secure contexts by browsers
```

**Option 2: Use mkcert for custom domains**:
```bash
mkcert -install
mkcert example.test wallet.example.test
# Configure your dev server to use the generated certificates
```

**Verification checklist**:
1. Open browser DevTools → Network tab
2. Your application should load `/wallet-service` in an iframe
3. The wallet iframe should load `/sdk/wallet-iframe-host.js`
4. Check for errors in Console tab

**Common issues**:
- **Mixed content errors**: Ensure both app and wallet origins use HTTPS
- **COOP errors**: Verify `/wallet-service` has `Cross-Origin-Opener-Policy: unsafe-none`
- **404 on /sdk assets**: Check that the SDK dist folder is correctly mounted
- **WASM load failed**: Verify `.wasm` files are served with `application/wasm` MIME type

## Troubleshooting

### Wallet Iframe Fails to Load

**Symptoms**: Console shows "Failed to load wallet iframe" or network errors for `/wallet-service`.

**Fix**:
1. Verify wallet origin is accessible: `curl https://wallet.example.com/wallet-service`
2. Check CORS headers allow embedding
3. Ensure CSP doesn't block iframe loading

### Assets Not Found (404)

**Symptoms**: Network tab shows 404 errors for `/sdk/*.js` or `/sdk/*.wasm`.

**Fix**:
1. Verify SDK assets are at:
   - `node_modules/@tatchi-xyz/sdk/dist/esm/sdk/` (JS/CSS)
   - `node_modules/@tatchi-xyz/sdk/dist/workers/` (workers + WASM)
2. Ensure your static routes mount:
   - `/sdk` → `dist/esm/sdk`
   - `/sdk/workers` → `dist/workers`
3. Test direct access: `curl https://wallet.example.com/sdk/wallet-iframe-host.js`

### WASM Module Failed to Instantiate

**Symptoms**: Console error: "Incorrect response MIME type. Expected 'application/wasm'."

**Fix**:
```typescript
// Ensure .wasm files have correct MIME type.
// WASM binaries ship under dist/workers and are served at /sdk/workers/*.wasm.
app.use('/sdk/workers', (req, res, next) => {
  if (req.url?.endsWith('.wasm')) {
    res.setHeader('Content-Type', 'application/wasm')
  }
  next()
}, express.static(sdkWorkerAssets))
```

## Additional Resources

For more detailed information about wallet iframe integration:
- [Install and Wallet Setup](./wallet-iframe-integration.md) - Complete setup guide
- [Architecture](../concepts/architecture.md) - How origin isolation works
- [Security Model](../concepts/security-model.md) - Defense-in-depth principles
