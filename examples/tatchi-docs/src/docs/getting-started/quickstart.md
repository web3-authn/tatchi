---
title: Quickstart
---

# Quickstart

Follow these steps to get a working login in minutes.

## 1) React (recommended)

```tsx
// main.tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { PasskeyProvider, PASSKEY_MANAGER_DEFAULT_CONFIGS } from '@tatchi/sdk/react'

function App() {
  return <YourApp />
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <PasskeyProvider
    config={{
      ...PASSKEY_MANAGER_DEFAULT_CONFIGS,
      iframeWallet: {
        walletOrigin: import.meta.env.VITE_WALLET_ORIGIN,       // e.g. https://wallet.example.localhost
        walletServicePath: import.meta.env.VITE_WALLET_SERVICE_PATH || '/wallet-service',
        // Optional: choose RP base for passkey scope (see Concepts → Wallet‑Scoped Credentials)
        // rpIdOverride: import.meta.env.VITE_RP_ID_BASE,
      },
    }}
  >
    <App />
  </PasskeyProvider>
)
```

## 2) Use it in a component

```tsx
import { usePasskeyContext } from '@tatchi/sdk/react'

export function LoginButton() {
  const { loginPasskey } = usePasskeyContext()
  return (
    <button onClick={() => loginPasskey('alice.testnet')}>Login</button>
  )
}
```

## 3) Vanilla TypeScript

```ts
import { PasskeyManager } from '@tatchi/sdk'

const manager = new PasskeyManager({
  nearRpcUrl: 'https://rpc.testnet.near.org',
  nearNetwork: 'testnet',
  contractId: 'w3a-v1.testnet',
  iframeWallet: {
    walletOrigin: 'https://wallet.example.localhost',
    walletServicePath: '/wallet-service',
  },
})

await manager.initWalletIframe() // no-op if walletOrigin omitted
await manager.loginPasskey('alice.testnet')
```

## 4) Next steps

- Explore [Passkeys](../guides/passkeys)
- Try [Secure Tx Confirmation](../guides/tx-confirmation)
