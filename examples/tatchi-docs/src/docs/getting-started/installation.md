---
title: Installation
---

# Installation

Install the SDK and configure the wallet iframe (origin, service path, headers) so sensitive flows run in an isolated wallet origin.

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


## Configure Vite

Install framework packages. We'll be using Vite. If you're using another framework, checkout the [other frameworks](./other-frameworks.md) section.

::: code-group
```bash [pnpm]
pnpm add react react-dom
pnpm add -D vite @vitejs/plugin-react
```

```bash [npm]
npm add react react-dom
npm add -D vite @vitejs/plugin-react
```

```bash [yarn]
yarn add react react-dom
yarn add -D vite @vitejs/plugin-react
```
:::

Then add the following Tatchi plugins to your `vite.config.ts` file:
```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { tatchiAppServer, tatchiBuildHeaders } from '@tatchi-xyz/sdk/plugins/vite'

export default defineConfig(({ mode }) => {
  const walletOrigin = 'https://wallet.web3authn.org'
  return {
    plugins: [
      react(),
      tatchiAppServer({ walletOrigin }),
      tatchiBuildHeaders({ walletOrigin }),
    ],
  }
})
```

These plugins add the right headers that allow your app to access
the wallet origin which serves the wallet SDK from a secure iframe.

You may also choose to self-host the wallet SDK (more on this later in the  [selfhosting](../guides/self-hosting-the-wallet-sdk.md) section).


## Enable HTTPS (Caddy setup)

Passkeys require a secure context (HTTPS). You can use [Caddy](https://caddyserver.com/docs/install) for local development:
```bash
brew install caddy           # macOS (see caddyserver.com for other OSes)
caddy trust                  # trust local CA so browsers accept TLS
```

Add a `Caddyfile` in the root directory:
```caddy
example.localhost {
  tls internal
  encode gzip
  reverse_proxy localhost:5173  # Vite default port
}
```


## React Setup

Setup the React provider:
```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { TatchiPasskeyProvider } from '@tatchi-xyz/sdk/react/provider'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <TatchiPasskeyProvider
      config={{
        iframeWallet: {
          walletOrigin: "https://wallet.web3authn.org",
        },
        relayer: {
          url: "https://relay.tatchi.xyz",
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
          onEvent: (event) => console.log('registration event: ', event)
        });
      }}>
        Register Tatchi Account
      </button>
    </main>
  )
}

export default App
```


## Your first run

Open **two separate tabs** and run the Vite server and Caddy:

```bash
pnpm dev # vite
```

```bash
caddy run --config Caddyfile --adapter caddyfile
```

Then navigate to:
```
https://example.localhost
```

You should see a registration button, which registers passkey derived wallets onchain.

:::info
Safari users will need to have their domains allow-listed for the wallet.web3authn.org  because safari does not allow cross-origin webauthn registrations.

Contact us and we can add your domain to the [webauthn contract](https://testnet.nearblocks.io/address/w3a-v1.testnet?tab=contract), or selfhost the wallet origin (more on this later).
:::


## Next Steps

After you've got the SDK installed, we will walk through login, and sending your first transaction in [next Steps](./next-steps).


::: details Troubleshooting Setup Issues

**WebAuthn requires HTTPS**
  - Symptom: no TouchID/biometric prompt or errors like “Operation is insecure”.
  - Fix: use Caddy and open `https://example.localhost` (not `http://localhost`). If the browser warns about certs, run `caddy trust` and try again.

**Wallet iframe not connecting**
  - Symptom: actions hang; no network requests to the wallet origin.
  - Fix: ensure `walletOrigin` is set and uses `https` (this guide uses `https://wallet.web3authn.org`). If you changed it, verify the URL is reachable from the browser.

**Buttons do nothing**
  - Symptom: calling register/login from effects or timers does nothing.
  - Fix: WebAuthn must run from a user gesture. Trigger flows from `onClick` handlers as shown.

:::
