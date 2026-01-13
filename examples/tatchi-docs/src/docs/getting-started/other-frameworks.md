---
title: Other Frameworks
---

# Other Frameworks

Framework-specific setup for the Tatchi SDK. All frameworks require HTTPS (see [Installation](./installation#enable-https-caddy-setup) for Caddy setup).

## React + Vite

Full setup guide: [Installation](./installation)

**Example**: [react vite repo](https://github.com/web3-authn/tatchi/tree/main/examples/vite)

## Next.js

### Provider Setup

Use `dynamic` import to avoid SSR issues:

```tsx
// pages/_app.tsx
import dynamic from 'next/dynamic'
import '@tatchi-xyz/sdk/react/styles'

const TatchiPasskeyProvider = dynamic(
  () => import('@tatchi-xyz/sdk/react/provider').then(m => m.TatchiPasskeyProvider),
  { ssr: false }
)

export default function App({ Component, pageProps }) {
  return (
    <TatchiPasskeyProvider
      config={{
        iframeWallet: {
          walletOrigin: process.env.NEXT_PUBLIC_WALLET_ORIGIN
        },
        relayer: {
          url: process.env.NEXT_PUBLIC_RELAY_URL,
        },
      }}
    >
      <Component {...pageProps} />
    </TatchiPasskeyProvider>
  )
}
```

### Next Config

```ts
// next.config.js
import { tatchiNextApp } from '@tatchi-xyz/sdk/plugins/next'

const walletOrigin = process.env.NEXT_PUBLIC_WALLET_ORIGIN || 'https://wallet.web3authn.org'
const isDev = process.env.NODE_ENV !== 'production'

export default tatchiNextApp({
  walletOrigin,
  cspMode: isDev ? 'compatible' : 'strict',
  allowUnsafeEvalDev: true,
  compatibleInDev: true,
  extraScriptSrc: isDev ? [walletOrigin] : [],
})({})
```

**Example**: [next-js](https://github.com/web3-authn/tatchi/tree/main/examples/next-js)

## Vue 3

### Component Setup

```ts
// components/LoginButtons.vue (script setup)
import { onMounted } from 'vue'
import { TatchiPasskey } from '@tatchi-xyz/sdk'

const tatchi = new TatchiPasskey({
  iframeWallet: {
    walletOrigin: import.meta.env.VITE_WALLET_ORIGIN
  },
  relayer: {
    url: import.meta.env.VITE_RELAY_URL,
  },
})

onMounted(() => tatchi.initWalletIframe())
```

### Vite Config

```ts
// vite.config.ts
import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { tatchiAppServer, tatchiBuildHeaders } from '@tatchi-xyz/sdk/plugins/vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const walletOrigin = env.VITE_WALLET_ORIGIN || 'https://wallet.web3authn.org'

  return {
    plugins: [
      vue(),
      tatchiAppServer({ walletOrigin }),
      tatchiBuildHeaders({ walletOrigin }),
    ],
  }
})
```

**Example**: [vue](https://github.com/web3-authn/tatchi/tree/main/examples/vue)

## Svelte

### Component Setup

```ts
// src/components/LoginButtons.svelte
import { onMount } from 'svelte'
import { TatchiPasskey } from '@tatchi-xyz/sdk'

let tatchi: TatchiPasskey

onMount(async () => {
  tatchi = new TatchiPasskey({
    iframeWallet: {
      walletOrigin: import.meta.env.VITE_WALLET_ORIGIN,
    },
    relayer: {
      url: import.meta.env.VITE_RELAY_URL,
    },
  })
  await tatchi.initWalletIframe()
})
```

### Vite Config

```ts
// vite.config.ts
import { defineConfig, loadEnv } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { tatchiAppServer, tatchiBuildHeaders } from '@tatchi-xyz/sdk/plugins/vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const walletOrigin = env.VITE_WALLET_ORIGIN || 'https://wallet.web3authn.org'

  return {
    plugins: [
      svelte(),
      tatchiAppServer({ walletOrigin }),
      tatchiBuildHeaders({ walletOrigin }),
    ],
  }
})
```

**Example**: [svelte](https://github.com/web3-authn/tatchi/tree/main/examples/svelte)

## Vanilla JS / Express

Manual header configuration for non-Vite setups:

```ts
// server.js
import express from 'express'
import path from 'node:path'
import { buildPermissionsPolicy, buildWalletCsp } from '@tatchi-xyz/sdk/plugins/headers'

const app = express()
const walletOrigin = process.env.WALLET_ORIGIN || 'https://wallet.web3authn.org'

// App headers: enable cross-origin isolation and delegate WebAuthn
app.use((req, res, next) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp')
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
  res.setHeader('Permissions-Policy', buildPermissionsPolicy(walletOrigin))
  next()
})

// Serve SDK assets with correct MIME types
app.use('/sdk', (req, res, next) => {
  if (req.url?.endsWith('.wasm')) res.setHeader('Content-Type', 'application/wasm')
  next()
}, express.static(path.join(process.cwd(), 'node_modules/@tatchi-xyz/sdk/dist')))

// Wallet service route (if self-hosting)
app.get('/wallet-service', (req, res) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'unsafe-none')
  res.setHeader('Content-Security-Policy', buildWalletCsp({ mode: 'strict' }))
  res.type('html').send(`<!doctype html>
<html><head></head><body>
  <script type="module" src="/sdk/wallet-iframe-host.js"></script>
</body></html>`)
})

app.listen(3000, () => console.log('App on https://example.localhost'))
```

### Client Setup

```ts
// client.js
import { TatchiPasskey } from '@tatchi-xyz/sdk'

const tatchi = new TatchiPasskey({
  iframeWallet: {
    walletOrigin: 'https://wallet.web3authn.org'
  },
  relayer: {
    url: 'https://relay.tatchi.xyz',
  },
})

await tatchi.initWalletIframe()

// Register
await tatchi.registerPasskey('user.testnet', {
  onEvent: (event) => console.log(event)
})
```

## Plugin Reference

**Vite-based frameworks** (React, Vue, Svelte):
- `tatchiAppServer({ walletOrigin })` - Dev server with proper headers
- `tatchiBuildHeaders({ walletOrigin })` - Emit `_headers` file for production (Cloudflare/Netlify)

**Next.js**:
- `tatchiNextApp({ walletOrigin, cspMode, ... })` - Wraps Next config with headers

**Manual/Express**:
- Import `buildPermissionsPolicy`, `buildWalletCsp` from `@tatchi-xyz/sdk/plugins/headers`

See [Self-Hosting](../guides/self-hosting-the-wallet-sdk) for self-hosted wallet configuration.
