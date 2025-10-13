---
title: Wallet Iframe
---

# Wallet Iframe

Run sensitive flows in a sandboxed wallet origin via an embedded iframe. The SDK mounts a hidden service iframe and shows a visible modal only when user presence is required.

## Configure

```tsx
import { PasskeyProvider, PASSKEY_MANAGER_DEFAULT_CONFIGS } from '@tatchi/sdk/react'

<PasskeyProvider
  config={{
    ...PASSKEY_MANAGER_DEFAULT_CONFIGS,
    iframeWallet: {
      walletOrigin: import.meta.env.VITE_WALLET_ORIGIN,       // https://wallet.example.localhost
      walletServicePath: import.meta.env.VITE_WALLET_SERVICE_PATH || '/wallet-service',
      // Optional: pick credential scope base
      // rpIdOverride: import.meta.env.VITE_RP_ID_BASE,        // e.g. example.localhost
    },
  }}
>
  <App />
</PasskeyProvider>
```

Vite plugin (dev/build):

```ts
import { tatchiDev, tatchiBuildHeaders } from '@tatchi/sdk/plugins/vite'

plugins: [
  tatchiDev({ sdkBasePath: '/sdk', walletServicePath: '/wallet-service', walletOrigin: process.env.VITE_WALLET_ORIGIN }),
  tatchiBuildHeaders({ walletOrigin: process.env.VITE_WALLET_ORIGIN }),
]
```

## Use

All calls route through the wallet origin when configured. When a confirm click is needed, the SDK expands a modal inside the iframe so the gesture is captured in the wallet context.

```ts
await passkeyManager.signTransactionsWithActions({
  transactions: [{
    nearAccountId: 'alice.testnet',
    receiverId: 'contract.testnet',
    actions: [{ type: 'FunctionCall', method_name: 'set_greeting', args: '{"message":"hi"}', gas: '50000000000000', deposit: '0' }],
  }],
})
```

## Tips

- Keep `/sdk/*` assets at a stable path; ensure correct MIME types (`.js` JS, `.wasm` application/wasm).
- For cross‑origin credential usage from a top‑level app, serve `/.well-known/webauthn` (Related Origin Requests) on the wallet origin listing allowed top‑level origins.
- The progress bus heuristics ensure the overlay is visible during user‑confirm step; avoid hiding that phase.

See also:
- [Architecture](/concepts/wallet-iframe-architecture)
- [Asset URL Resolution](/guides/asset-url-resolution)

