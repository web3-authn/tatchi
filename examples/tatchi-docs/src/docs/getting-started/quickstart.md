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
import { PasskeyProvider, PASSKEY_MANAGER_DEFAULT_CONFIGS } from '@tatchi-xyz/sdk/react'

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
import { useTatchiContext } from '@tatchi-xyz/sdk/react'

export function LoginButton() {
  const { loginPasskey } = useTatchiContext()
  return (
    <button onClick={() => loginPasskey('alice.testnet')}>Login</button>
  )
}
```

## 3) Vanilla TypeScript

```ts
import { TatchiPasskey } from '@tatchi-xyz/sdk'

const manager = new TatchiPasskey({
  nearRpcUrl: 'https://test.rpc.fastnear.com',
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

- Do [Install & Configure](./install-and-configure)
- Explore [Passkeys](../guides/passkeys)
- Try [Secure Tx Confirmation](../guides/tx-confirmation)

## First Flow — Register, Login, Send

Get a working passkey and send your first transaction.

### 1) Register a passkey

```tsx
import { useTatchiContext } from '@tatchi-xyz/sdk/react'

export function Register({ accountId }: { accountId: string }) {
  const { registerPasskey } = useTatchiContext()
  return (
    <button
      onClick={() =>
        registerPasskey(accountId, {
          onEvent: (e) => {
            if (e.step === 2 && e.status === 'success') {
              console.info('Login is now enabled')
            }
          },
        })
      }
    >
      Register Passkey
    </button>
  )
}
```

### 2) Login

```tsx
import { useTatchiContext } from '@tatchi-xyz/sdk/react'

export function Login({ accountId }: { accountId: string }) {
  const { loginPasskey } = useTatchiContext()
  return <button onClick={() => loginPasskey(accountId)}>Login</button>
}
```

Notes
- With a relay configured, login can unlock the VRF key via Shamir 3‑pass without TouchID; falls back automatically when needed.

### 3) Send a transaction

API‑driven

```ts
const result = await passkeyManager.executeAction('alice.testnet', {
  type: 'FunctionCall',
  receiverId: 'contract.testnet',
  methodName: 'set_greeting',
  args: { message: 'hello' },
  gas: '50000000000000',
  deposit: '0',
})
```

React button (optional)

```tsx
import { SendTxButtonWithTooltip } from '@tatchi-xyz/sdk/react'

<SendTxButtonWithTooltip
  nearAccountId="alice.testnet"
  txSigningRequests={[
    { receiverId: 'contract.testnet', actions: [{ type: 'FunctionCall', methodName: 'set_greeting', args: { message: 'hi' }, gas: '50000000000000', deposit: '0' }] },
  ]}
/>
```

Next steps
- [Passkeys guide](/docs/guides/passkeys)
- [Secure Transaction Confirmation](/docs/guides/tx-confirmation)
- [Credential Scope (rpId)](/docs/concepts/wallet-scoped-credentials)

## Self‑hosted note
If you operate the wallet origin yourself (e.g., `wallet.example.com`), see the self‑hosted options in [Install & Configure](./install-and-configure#self-hosted-vs-app-only) for which dev/build plugins to use.
