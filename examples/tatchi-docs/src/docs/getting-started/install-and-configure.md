---
title: Install & Configure
---

# Install & Configure

Install the SDK and configure the wallet iframe (origin, service path, headers) so sensitive flows run in an isolated wallet origin.

## 1) Install the SDK

::: code-group
```bash [pnpm]
pnpm add @tatchi-xyz/sdk
```

```bash [npm]
npm i @tatchi-xyz/sdk
```

```bash [yarn]
yarn add @tatchi-xyz/sdk
```
:::

React quick installs (recommended)

```bash
pnpm add @tatchi-xyz/sdk react react-dom
pnpm add -D vite @vitejs/plugin-react
```

## 2) Configure Vite (dev/build)

Add the following plugins to your `vite.config.ts` file:
```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { tatchiAppServer, tatchiBuildHeaders } from '@tatchi-xyz/sdk/plugins/vite'

export default defineConfig(({ mode }) => {
  const walletOrigin = 'https://wallet.tatchi.xyz'
  return {
    plugins: [
      react(),
      tatchiAppServer({ walletOrigin }),
      tatchiBuildHeaders({ walletOrigin }),
    ],
  }
})
```

Your app delegates to a remote wallet origin which serves the wallet SDK from a secure iframe.

You may also choose to self-host the wallet SDK in your origin origin (more on this later).  See: /docs/guides/self-hosted-wallet


## 3) Enable HTTPS (Caddy minimal setup)

Passkeys require a secure context (HTTPS). The simplest local setup is Caddy with its internal CA.

Install and trust the local CA:

```bash
brew install caddy           # macOS (see caddyserver.com for other OSes)
caddy trust                  # trust local CA so browsers accept TLS
```

Add a `Caddyfile` next to `package.json`:

```caddyfile
example.localhost {
  tls internal
  encode gzip
  reverse_proxy localhost:5173  # Vite default port
}
```


## 4) React Setup

Setup the React provider:
```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { TatchiPasskeyProvider } from '@tatchi-xyz/sdk/react'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <TatchiPasskeyProvider
      config={{
        iframeWallet: {
          walletOrigin: "https://wallet.tatchi.xyz",
        },
        relayer: {
          url: "https://relay.tatchi.xyz",
          accountId: "w3a-relayer.testnet",
        },
      }}
    >
      <App />
    </TatchiPasskeyProvider>
  </React.StrictMode>,
)
```

Then in your `App.tsx`:
```tsx
import { useTatchi } from '@tatchi-xyz/sdk/react';

function App() {
  const { tatchi } = useTatchi();
  const { configs } = tatchi;
  return (
    <main>
      <h1>Tatchi Example</h1>
      <button onClick={() => {
        const id = Date.now();
        tatchi.registerPasskey(`tatchi-test-${id}.${configs.contractId}`, {
          onEvent: (event) => {
            console.log('registration event: ', event)
          }
        });
      }}>
        Register Tatchi Account
      </button>
    </main>
  )
}

export default App
```


## 5) Your first run

Open two separate tabs and run the Caddy and Vite servers:

Caddy:
```bash
caddy run --config Caddyfile --adapter caddyfile
```

Vite
```bash
pnpm dev
```

Then navigate to:
```
https://example.localhost:
```


More: [Wallet Iframe guide](/docs/guides/wallet-iframe) and [Credential Scope](/docs/concepts/wallet-scoped-credentials).

Next: [Quickstart](./quickstart)


## Self‑hosting the Wallet SDK

If you need to operate your own wallet origin, follow the dedicated self‑hosting guide:
See: /docs/guides/self-hosted-wallet

## Troubleshooting

- SPA rewrites break `/sdk/*`
  - Ensure your host does not rewrite `/sdk/*` (and `/sdk/workers/*`) to `index.html`. Asset routes must return JS and WASM, not HTML.
- Wrong MIME types
  - Serve `.js` as `application/javascript` and `.wasm` as `application/wasm`. Many platforms default `.wasm` to `application/octet-stream` — fix this in your server or headers config.
- WebAuthn blocked in iframe
  - Add `Permissions-Policy` that delegates `publickey-credentials-get/create` to the wallet origin, and ensure the iframe has matching `allow` attributes. The SDK’s Vite plugin sets these in development; mirror them in production.
- Cross-site passkeys not shown
  - If your app and wallet are on different registrable sites, enable Related Origin Requests by serving `/.well-known/webauthn` on the wallet origin listing your app origins. See Concepts → Credential Scope.
- CSP violations (inline styles)
  - Wallet pages should use strict CSP like `style-src 'self'; style-src-attr 'none'`. The SDK’s Lit components adopt external stylesheets and avoid inline styles. If you must support older engines, set a nonce (e.g., `window.w3aNonce`) and include it in your CSP.
- Vite env gotcha
  - Use `import.meta.env.VITE_*` exactly (no optional chaining) so Vite replaces at build time.
