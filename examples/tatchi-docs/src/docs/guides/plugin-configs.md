---
title: Plugin Configuration
---

# Plugin Configuration

The SDK ships framework helpers under `sdk/src/plugins/` (published as `@tatchi-xyz/sdk/plugins/*`) to make wallet integration reliable:

- Apply required headers (`Permissions-Policy`, `COOP`, optional `COEP/CORP`)
- Serve wallet “surface” routes like `/wallet-service` (dev servers)
- Serve SDK assets (workers/WASM/CSS/JS) under a stable base like `/sdk`
- Optionally emit a static-host `_headers` file at build time

You generally have two deployments:

- **App origin (your dApp)**: embeds the wallet iframe and sends requests to it.
- **Wallet origin (iframe host)**: serves wallet UI + SDK assets and runs WebAuthn/key flows.

The **wallet origin plugins are only needed if you are self-hosting the wallet**. If you use a hosted wallet (e.g. a Tatchi-provided wallet origin), you typically only need to configure the app origin to:

- Point `iframeWallet.walletOrigin` at that hosted wallet
- Send the correct `Permissions-Policy` (and related headers) from your app origin

## Why this is required

For the app to delegate WebAuthn to an embedded wallet iframe, browsers require a `Permissions-Policy` that explicitly allows the wallet origin:

- `publickey-credentials-get=(self "https://wallet.example.com")`
- `publickey-credentials-create=(self "https://wallet.example.com")`

The plugins also set `Cross-Origin-Opener-Policy` (COOP) and can optionally enable cross‑origin isolation (`COEP/CORP`) when you need it.


## Vite

Import from `@tatchi-xyz/sdk/plugins/vite`.

### Recommended wrappers

**App origin**

```ts
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { tatchiApp } from '@tatchi-xyz/sdk/plugins/vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [
      react(),
      tatchiApp({
        walletOrigin: env.VITE_WALLET_ORIGIN,
        emitHeaders: true, // build: writes `_headers` into outDir
      }),
    ],
  }
})
```

This is the only Vite plugin configuration most app integrators need (when using a hosted wallet origin).

**Wallet origin (self-hosted wallets only)**

```ts
import { defineConfig, loadEnv } from 'vite'
import { tatchiWallet } from '@tatchi-xyz/sdk/plugins/vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [
      tatchiWallet({
        walletOrigin: env.VITE_WALLET_ORIGIN,
        walletServicePath: env.VITE_WALLET_SERVICE_PATH || '/wallet-service',
        sdkBasePath: env.VITE_SDK_BASE_PATH || '/sdk',
        emitHeaders: true, // build: writes `_headers` into outDir
      }),
    ],
  }
})
```

Use this only when you operate the wallet iframe host yourself; see [Self-Hosting the Wallet SDK](/docs/guides/self-hosting-the-wallet-sdk).

Self-hosting a wallet origin also means **that wallet build is only valid on the origin/domain you host it on**:

- WebAuthn is origin- and rpId-scoped; moving the wallet to a different domain changes the security origin and can invalidate assumptions about which credentials can be used.
- Your app’s `Permissions-Policy` must delegate `publickey-credentials-*` to the exact wallet origin you embed.
- If you need the wallet on multiple domains (staging/prod/custom domains), deploy it per domain and configure each domain explicitly (and choose an appropriate [Passkey Scope Strategy](/docs/concepts/passkey-scope)).

### Options (Vite)

- `walletOrigin?: string` – used to build `Permissions-Policy`
- `walletServicePath?: string` – wallet HTML route (default `/wallet-service`)
- `sdkBasePath?: string` – base path for SDK assets (default `/sdk`)
- `emitHeaders?: boolean` – build: write `_headers` for static hosts (Cloudflare Pages / Netlify-style)
- `coepMode?: 'off' | 'strict'` – default `off`; strict emits `COEP: require-corp` + `CORP: cross-origin`
- `devCSP?: 'strict' | 'compatible'` – dev-only CSP mode for wallet HTML routes

### Lower-level building blocks (Vite)

Use these when you need more control than the wrappers:

- `tatchiHeaders({ walletOrigin, walletServicePath, sdkBasePath, devCSP, coepMode })`: headers middleware (no asset serving)
- `tatchiServeSdk({ sdkBasePath, sdkDistRoot, enableDebugRoutes, coepMode })`: serve `/sdk/*` assets
- `tatchiWalletService({ walletServicePath, sdkBasePath, coepMode })`: serve wallet HTML (`/wallet-service`)
- `tatchiBuildHeaders({ walletOrigin, coepMode, cors? })`: build-only `_headers` emitter

## COEP/CORP note

`coepMode: 'strict'` enables cross-origin isolation (`Cross-Origin-Embedder-Policy: require-corp`). This can break some browser extensions and overlays; it’s off by default. Enable it only when you need it.

Also note that strict CSP is scoped to wallet HTML routes (`/wallet-service`, `/export-viewer`), not your app pages.

## Next.js

Import from `@tatchi-xyz/sdk/plugins/next`.

Next.js helpers focus on producing correct `headers()` entries (and optional `.well-known/webauthn` handlers for dev). They do not serve `/sdk/*` assets or wallet HTML for you in production.

### App origin: `next.config.js` headers

```js
// next.config.js (ESM)
import { tatchiNextApp } from '@tatchi-xyz/sdk/plugins/next'

const isDev = process.env.NODE_ENV !== 'production'
const walletOrigin = process.env.NEXT_PUBLIC_WALLET_ORIGIN

export default tatchiNextApp({
  walletOrigin,
  cspMode: isDev ? 'compatible' : 'strict',
  allowUnsafeEvalDev: true,
  compatibleInDev: true,
  extraScriptSrc: isDev ? [walletOrigin] : [],
})({})
```

### Next options

- `walletOrigin: string` – required; used for `Permissions-Policy` and CSP `frame-src`
- `cspMode?: 'strict' | 'compatible'` – keep strict in production; relax only for dev tooling
- `allowUnsafeEvalDev?: boolean` – enables `'unsafe-eval'` for Next dev runtime
- `extraFrameSrc?: string[]` – add allowed frames (rare)
- `extraScriptSrc?: string[]` – allowlist for `script-src` (dev modulepreload cases)

## Environment variables

- Vite: `VITE_WALLET_ORIGIN`, `VITE_WALLET_SERVICE_PATH`, `VITE_SDK_BASE_PATH`, `VITE_COEP_MODE`
- Next: `NEXT_PUBLIC_WALLET_ORIGIN`

## Related docs

- [Installation](/docs/getting-started/installation)
- [Self-Hosting the Wallet SDK](/docs/guides/self-hosting-the-wallet-sdk)
- [Security Model](/docs/concepts/security-model)
