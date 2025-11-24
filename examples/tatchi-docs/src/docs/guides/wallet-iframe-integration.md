---
title: Install and Wallet Setup
---

# Install and Wallet Setup

Install the SDK, configure the wallet iframe, and wire up `TatchiPasskeyProvider` so your app can register users, log them in, and send transactions.

For a deep dive into the architecture and threat model, see [Architecture](/docs/concepts/architecture).



## 1. Install the SDK

```bash
pnpm add @tatchi-xyz/sdk

# or
npm install @tatchi-xyz/sdk
```



## 2. Wallet configuration

The wallet runs in a dedicated iframe hosted on a separate origin. Your app talks to it over a `MessageChannel`, and all WebAuthn + key handling stays inside that iframe.

### Basic React setup

Wrap your app with `TatchiPasskeyProvider` and point `iframeWallet` at the wallet host:

```tsx
import { TatchiPasskeyProvider } from '@tatchi-xyz/sdk/react/provider'
import { PASSKEY_MANAGER_DEFAULT_CONFIGS } from '@tatchi-xyz/sdk/react'

export function AppShell() {
  return (
    <TatchiPasskeyProvider
      config={{
        ...PASSKEY_MANAGER_DEFAULT_CONFIGS,
        iframeWallet: {
          // Where the wallet iframe is hosted
          walletOrigin: import.meta.env.VITE_WALLET_ORIGIN,

          // Path to the wallet service page (default: '/wallet-service')
          walletServicePath: import.meta.env.VITE_WALLET_SERVICE_PATH || '/wallet-service',

          // Optional: credential scope strategy (see credential-scope-rpid)
          // rpIdOverride: 'example.com',
        },
      }}
    >
      <App />
    </TatchiPasskeyProvider>
  )
}
```

### Environment variables

Create `.env` files per environment to control the wallet host:

**.env.development**

```bash
VITE_WALLET_ORIGIN=https://wallet.example.localhost:5174
VITE_WALLET_SERVICE_PATH=/wallet-service
# Optional: VITE_RP_ID_BASE=example.localhost
```

**.env.production**

```bash
VITE_WALLET_ORIGIN=https://wallet.example.com
VITE_WALLET_SERVICE_PATH=/wallet-service
# Optional: VITE_RP_ID_BASE=example.com
```

### Vite plugin configuration

Use the SDK’s Vite plugins to serve wallet assets in dev and inject security headers in production:

```ts
import { defineConfig } from 'vite'
import { tatchiDev, tatchiBuildHeaders } from '@tatchi-xyz/sdk/plugins/vite'

export default defineConfig({
  plugins: [
    // Development: serves wallet assets and wallet-service locally
    tatchiDev({
      sdkBasePath: '/sdk',
      walletServicePath: '/wallet-service',
      walletOrigin: process.env.VITE_WALLET_ORIGIN,
    }),

    // Production: sets Permissions-Policy headers so the iframe can call WebAuthn
    tatchiBuildHeaders({
      walletOrigin: process.env.VITE_WALLET_ORIGIN,
    }),
  ],
})
```



## 3. Registration (with config options)

Once the wallet iframe is mounted, you can register users with `registerPasskey`. This example mirrors the Getting Started flow but exposes configuration hooks.

```tsx
import { useTatchi } from '@tatchi-xyz/sdk/react'
import type { RegistrationSSEEvent } from '@tatchi-xyz/sdk/react'

export function RegisterButton({ accountId }: { accountId: string }) {
  const { registerPasskey } = useTatchi()

  return (
    <button
      onClick={() =>
        registerPasskey(accountId, {
          // Optional: customize confirmation UI for this call only
          confirmationConfig: {
            uiMode: 'modal',          // 'modal' | 'drawer'
            behavior: 'requireClick', // 'requireClick' | 'autoProceed'
          },
          // Optional: observe progress
          onEvent: (event: RegistrationSSEEvent) => {
            console.log('[registerPasskey]', event.step, event.phase, event.status, event.message)
          },
          // Optional: per-call error handler
          onError: (error) => {
            console.error('Registration failed:', error)
          },
        })
      }
    >
      Register Passkey
    </button>
  )
}
```

### Registration hooks options

`registerPasskey(accountId, options)` uses `RegistrationHooksOptions`:

- `onEvent?: (event: RegistrationSSEEvent) => void` – see [Progress Events](./progress-events.md).
- `onError?: (error: Error) => void` – per‑call error handler.
- `afterCall?: (success: boolean, result?: RegistrationResult) => void` – callback after the flow finishes.
- `confirmationConfig?: Partial<ConfirmationConfig>` – per‑call override for confirmation UI (does not persist).



## 4. Sending transactions (high level)

All operations route through the wallet origin when configured:

```tsx
import { usePasskeyManager } from '@tatchi-xyz/sdk/react'
import { ActionType } from '@tatchi-xyz/sdk'

function TransferButton() {
  const passkeyManager = usePasskeyManager()

  const handleTransfer = async () => {
    try {
      const result = await passkeyManager.executeAction('alice.testnet', {
        type: ActionType.FunctionCall,
        receiverId: 'usdc.testnet',
        methodName: 'ft_transfer',
        args: { receiver_id: 'bob.testnet', amount: '1000000' },
        gas: '50000000000000',
        deposit: '1',
      }, {
        // Optional: observe tx progress
        // onEvent: (event) => console.log('[executeAction]', event),
      })

      console.log('Transaction result:', result)
    } catch (error) {
      console.error('Transaction failed:', error)
    }
  }

  return <button onClick={handleTransfer}>Transfer USDC</button>
}
```

Behind the scenes:

1. The app sends a typed request to the wallet iframe.
2. The wallet opens a confirmation modal inside the iframe.
3. WebAuthn + VRF operations run in WASM workers on the wallet origin.
4. The iframe returns only signed payloads and outcomes to your app.

For a deeper dive into transaction flows and configuration options, see [Sending Transactions](./sending-transaction.md) and [Progress Events](./progress-events.md).



## 5. Troubleshooting

If the iframe or WebAuthn flows behave unexpectedly:

- Check that `VITE_WALLET_ORIGIN` and `VITE_WALLET_SERVICE_PATH` point to a live wallet host.
- Verify the `Permissions-Policy` header delegates `publickey-credentials-*` to the wallet origin.
- Ensure both app and wallet are served over HTTPS (required for WebAuthn in production).
- Confirm that `/sdk/*` assets (JS, CSS, WASM) are reachable on the wallet origin.

For credential scoping and Safari/ROR details, see [Passkey Scope Strategy](/docs/concepts/passkey-scope).
