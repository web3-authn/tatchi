---
title: Framework by Framework
---

# Framework by Framework

Short starter patterns per framework. Do [Install & Configure](./install-and-configure) first so the wallet iframe works.

## React (Vite)

See [Quickstart](./quickstart) for a full example with `TatchiPasskeyProvider`.

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

## Vue 3 (vanilla SDK)

```ts
// components/LoginButtons.vue (script setup)
import { onMounted } from 'vue'
import { PasskeyManager } from '@tatchi-xyz/sdk'
const manager = new PasskeyManager({ iframeWallet: { walletOrigin: import.meta.env.VITE_WALLET_ORIGIN, walletServicePath: '/wallet-service' } })
onMounted(() => manager.initWalletIframe())
```

## Svelte (vanilla SDK)

```ts
// src/components/LoginButtons.svelte
import { onMount } from 'svelte'
import { PasskeyManager } from '@tatchi-xyz/sdk'
let manager: PasskeyManager
onMount(async () => {
  manager = new PasskeyManager({ iframeWallet: { walletOrigin: import.meta.env.VITE_WALLET_ORIGIN, walletServicePath: '/wallet-service' } })
  await manager.initWalletIframe()
})
```

More examples: [Framework Snippets](/docs/guides/frameworks)

## Plugin Choices
- App‑only (cross‑origin wallet): use `tatchiAppServer({ walletOrigin })` in dev and `tatchiBuildHeaders({ walletOrigin })` at build.
- Self‑hosted (same domain wallet):
  - Two servers in dev → app: `tatchiAppServer`, wallet: `tatchiWalletServer`
  - One server in dev (optional) → `tatchiWalletServer` on the app dev server
See full details in [Install & Configure](./install-and-configure#self-hosted-vs-app-only).
