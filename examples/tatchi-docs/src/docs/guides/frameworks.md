---
title: Framework Snippets
---

# Framework Snippets

Quick setup patterns for common stacks. For all setups, first complete [Install & Configure](/docs/getting-started/install-and-configure) so the wallet iframe and assets are served correctly.

## React (Vite)

See [Quickstart](/docs/getting-started/quickstart). Wrap your app with `TatchiPasskeyProvider` and pass `iframeWallet` config and optional `relayer` URL.

## Next.js (App/Pages Router)

Avoid server‑side imports of the React SDK. Dynamically import the provider on the client and read env from `NEXT_PUBLIC_*`.

```tsx
// pages/_app.tsx
import type { AppProps } from 'next/app'
import dynamic from 'next/dynamic'
import '@tatchi-xyz/sdk/react/styles'

const walletOrigin = process.env.NEXT_PUBLIC_WALLET_ORIGIN!
const relayerUrl = process.env.NEXT_PUBLIC_RELAYER_URL!

const TatchiPasskeyProvider = dynamic(() =>
  import('@tatchi-xyz/sdk/react').then((m) => m.TatchiPasskeyProvider),
  { ssr: false }
)

export default function MyApp({ Component, pageProps }: AppProps) {
  return (
    <TatchiPasskeyProvider
      config={{
        nearNetwork: 'testnet',
        nearRpcUrl: 'https://test.rpc.fastnear.com',
        contractId: 'w3a-v1.testnet',
        relayer: { url: relayerUrl, accountId: 'w3a-v1.testnet' },
        iframeWallet: { walletOrigin },
      }}
    >
      <Component {...pageProps} />
    </TatchiPasskeyProvider>
  )
}
```

Env (next.config.js or Vercel/Pages project):
```
NEXT_PUBLIC_WALLET_ORIGIN=https://wallet.example.localhost
NEXT_PUBLIC_RELAYER_URL=https://relay.example.com
```

## Vue 3 (vanilla SDK)

Use the vanilla `PasskeyManager` inside a component or composable and initialize the iframe on mount.

```vue
<!-- components/LoginButtons.vue -->
<script setup lang="ts">
import { onMounted } from 'vue'
import { PasskeyManager } from '@tatchi-xyz/sdk'

const manager = new PasskeyManager({
  nearRpcUrl: 'https://test.rpc.fastnear.com',
  nearNetwork: 'testnet',
  contractId: 'w3a-v1.testnet',
  iframeWallet: {
    walletOrigin: import.meta.env.VITE_WALLET_ORIGIN,
    walletServicePath: '/wallet-service',
  },
})

onMounted(async () => {
  await manager.initWalletIframe()
})

async function register(accountId: string) {
  await manager.registerPasskey(accountId)
}
async function login(accountId: string) {
  await manager.loginPasskey(accountId)
}
</script>

<template>
  <button @click="register('alice.testnet')">Register</button>
  <button @click="login('alice.testnet')">Login</button>
  <!-- Add tx buttons similarly using passkeyManager.executeAction(...) -->
  
</template>
```

## Svelte (vanilla SDK)

```svelte
<!-- src/components/LoginButtons.svelte -->
<script lang="ts">
  import { onMount } from 'svelte'
  import { PasskeyManager } from '@tatchi-xyz/sdk'

  let manager: PasskeyManager
  onMount(async () => {
    manager = new PasskeyManager({
      nearRpcUrl: 'https://test.rpc.fastnear.com',
      nearNetwork: 'testnet',
      contractId: 'w3a-v1.testnet',
      iframeWallet: {
        walletOrigin: import.meta.env.VITE_WALLET_ORIGIN,
        walletServicePath: '/wallet-service',
      },
    })
    await manager.initWalletIframe()
  })

  async function register() { await manager.registerPasskey('alice.testnet') }
  async function login() { await manager.loginPasskey('alice.testnet') }
</script>

<button on:click={register}>Register</button>
<button on:click={login}>Login</button>
```

## Notes

- Always configure the wallet iframe first; see [Install & Configure](/docs/getting-started/install-and-configure).
- For Cloudflare or separate wallet origins, set `rpIdOverride` per your [Credential Scope](/docs/concepts/wallet-scoped-credentials).
- For React UI components (buttons, drawers), see [Secure Tx Confirmation](/docs/guides/tx-confirmation).

