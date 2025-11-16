---
title: Other Frameworks
---

# Other Frameworks

## React (Vite)

See [Installation](./installation) for a full example with `vite` framework.

See [example project here](https://github.com/web3-authn/tatchi/tree/main/examples/vite)

## Next.js

Use a client‑only provider to avoid SSR touching browser APIs.

```tsx
// pages/_app.tsx
import dynamic from 'next/dynamic'
import '@tatchi-xyz/sdk/react/styles'
const TatchiPasskeyProvider = dynamic(() => import('@tatchi-xyz/sdk/react').then(m => m.TatchiPasskeyProvider), { ssr: false })

export default function App({ Component, pageProps }) {
  return (
    <TatchiPasskeyProvider config={{ iframeWallet: { walletOrigin: process.env.NEXT_PUBLIC_WALLET_ORIGIN } }}>
      <Component {...pageProps} />
    </TatchiPasskeyProvider>
  )
}
```

See example project: https://github.com/web3-authn/tatchi/tree/main/examples/next-js

next.config.js

```ts
import { tatchiNextApp } from '@tatchi-xyz/sdk/plugins/next'

const walletOrigin = process.env.NEXT_PUBLIC_WALLET_ORIGIN || 'https://wallet.example.localhost'
const isDev = process.env.NODE_ENV !== 'production'

/** @type {import('next').NextConfig} */
const baseConfig = {}

export default tatchiNextApp({
  walletOrigin,
  cspMode: isDev ? 'compatible' : 'strict',
  allowUnsafeEvalDev: true,
  compatibleInDev: true,
  extraScriptSrc: isDev ? [walletOrigin] : [],
})(baseConfig)
```

## Vue 3 (vanilla SDK)

```ts
// components/LoginButtons.vue (script setup)
import { onMounted } from 'vue'
import { TatchiPasskey } from '@tatchi-xyz/sdk'
const manager = new TatchiPasskey({ iframeWallet: { walletOrigin: import.meta.env.VITE_WALLET_ORIGIN, walletServicePath: '/wallet-service' } })
onMounted(() => manager.initWalletIframe())
```

Vite config

```ts
import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { tatchiApp } from '@tatchi-xyz/sdk/plugins/vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [
      vue(),
      tatchiApp({
        walletOrigin: env.VITE_WALLET_ORIGIN || 'https://wallet.example.localhost',
        emitHeaders: true,
      }),
    ],
  }
})
```

See example project: https://github.com/web3-authn/tatchi/tree/main/examples/vue

## Svelte (vanilla SDK)

```ts
// src/components/LoginButtons.svelte
import { onMount } from 'svelte'
import { TatchiPasskey } from '@tatchi-xyz/sdk'
let manager: TatchiPasskey
onMount(async () => {
  tatchi = new TatchiPasskey({
    iframeWallet: {
      walletOrigin: import.meta.env.VITE_WALLET_ORIGIN,
    }
  })
  await tatchi.initWalletIframe()
})
```

See Vue example project: https://github.com/web3-authn/tatchi/tree/main/examples/svelte

## Vanilla JS (Express.js or similar)

```ts
import express from 'express'
import path from 'node:path'
import { buildPermissionsPolicy, buildWalletCsp } from '@tatchi-xyz/sdk/plugins/headers'

const app = express()
const walletOrigin = process.env.WALLET_ORIGIN || 'https://wallet.example.localhost'

// Global headers for app routes
app.use((req, res, next) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp')
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
  res.setHeader('Permissions-Policy', buildPermissionsPolicy(walletOrigin))
  next()
})

// Serve SDK assets under /sdk with correct MIME (especially .wasm)
app.use('/sdk', (req, res, next) => {
  if (req.url?.endsWith('.wasm')) res.setHeader('Content-Type', 'application/wasm')
  next()
}, express.static(path.join(process.cwd(), 'dist', 'sdk')))

// Wallet service HTML route gets strict CSP and relaxed COOP
app.get('/wallet-service', (req, res) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'unsafe-none')
  res.setHeader('Content-Security-Policy', buildWalletCsp({ mode: 'strict' }))
  res.type('html').send('<!doctype html>\n<html><head></head><body><script type="module" src="/sdk/wallet-iframe-host.js"></script></body></html>')
})

app.listen(3000, () => console.log('App on https://example.localhost'))
```

Next: [Installation](./installation) or explore [Passkeys](/docs/guides/passkeys)

## Plugin Choices
- App‑only (cross‑origin wallet): use `tatchiAppServer({ walletOrigin })` in dev and `tatchiBuildHeaders({ walletOrigin })` at build.
- Self‑hosted (same domain wallet):
  - Two servers in dev → app: `tatchiAppServer`, wallet: `tatchiWalletServer`
  - One server in dev (optional) → `tatchiWalletServer` on the app dev server
See full details in [Installation](./installation#3-enable-https-caddy-setup).
