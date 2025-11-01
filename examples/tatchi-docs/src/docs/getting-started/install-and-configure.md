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

Optional peer deps (only if you use these features)
- React UI: `react`, `react-dom`
- Icons/QR: `lucide-react`, `qrcode`, `jsqr`
- Node router: `express`

## 2) Configure Vite (dev/build)

Add the plugin to serve wallet assets and headers during dev/build:

```ts
// vite.config.ts
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { tatchiDev, tatchiBuildHeaders } from '@tatchi-xyz/sdk/plugins/vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [
      react(),
      tatchiDev({
        sdkBasePath: env.VITE_SDK_BASE_PATH || '/sdk',
        walletServicePath: env.VITE_WALLET_SERVICE_PATH || '/wallet-service',
        walletOrigin: env.VITE_WALLET_ORIGIN,
      }),
      tatchiBuildHeaders({ walletOrigin: env.VITE_WALLET_ORIGIN }),
    ],
  }
})
```

Notes
- On build, the plugin emits `dist/wallet-service/index.html` if missing and adds CORS for `${VITE_SDK_BASE_PATH||'/sdk'}` (including `/workers/*`) in `_headers`.

## 3) Env vars

```bash
VITE_WALLET_ORIGIN=https://wallet.example.localhost
VITE_WALLET_SERVICE_PATH=/wallet-service
VITE_SDK_BASE_PATH=/sdk
```

## 4) React provider

```tsx
import { PasskeyProvider, PASSKEY_MANAGER_DEFAULT_CONFIGS } from '@tatchi-xyz/sdk/react'

<PasskeyProvider
  config={{
    ...PASSKEY_MANAGER_DEFAULT_CONFIGS,
    iframeWallet: {
      walletOrigin: import.meta.env.VITE_WALLET_ORIGIN,       // e.g. https://wallet.example.localhost
      walletServicePath: import.meta.env.VITE_WALLET_SERVICE_PATH || '/wallet-service',
      // Optional: choose rpId base for credential scope (see Concepts → Credential Scope)
      // rpIdOverride: import.meta.env.VITE_RP_ID_BASE,
    },
  }}
>
  <App />
</PasskeyProvider>
```

More: [Wallet Iframe guide](/docs/guides/wallet-iframe) and [Credential Scope](/docs/concepts/wallet-scoped-credentials).

Next: [Quickstart](./quickstart)

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
