# Tatchi SDK

Web3Authn Passkey SDK for NEAR with WebAuthn PRF, embedded wallet iframe, React components, and WASM workers for signing/VRF.


## Installation

Core (framework-agnostic):

```bash
pnpm add @tatchi-xyz/sdk
# or
npm install @tatchi-xyz/sdk
# or
yarn add @tatchi-xyz/sdk
```

React components (optional):

```bash
pnpm add @tatchi-xyz/sdk
```


### Building from Source

> **Note**: The following requirements are only for SDK development. End users installing the package via npm/pnpm don't need Rust, Bun, or any build tools.

#### Prerequisites

This SDK includes Rust-based WASM modules. You'll need:

```bash
# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Install wasm-pack
curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh

# Add WASM target
rustup target add wasm32-unknown-unknown

# Install pnpm (recommended package manager)
npm install -g pnpm
```

#### Building

From the repo root:

```bash
pnpm install
pnpm -C sdk build     # builds WASM + bundles via rolldown
pnpm -C sdk dev       # watch mode for SDK development
```

#### Build System

The SDK uses:
- **Rolldown** for library bundling (ESM/CJS)
- **wasm-pack** for Rust WASM modules (signer/VRF)

```bash
pnpm -C sdk run build
pnpm -C sdk run build:check:fresh
pnpm -C sdk run dev
```

### Testing

```bash
pnpm -C sdk test           # Run Playwright tests
pnpm -C sdk run type-check # TypeScript type checking
```

### Project Structure

```
src/
├── core/                         # Framework-agnostic core (TatchiPasskey, WebAuthnManager)
│   └── WalletIframe/             # Iframe host/client, messaging, handlers
├── react/                        # React components and provider
├── wasm_signer_worker/           # Rust WASM (signer)
├── wasm_vrf_worker/              # Rust WASM (VRF)
└── plugins/vite.ts               # Dev/build helpers (serve /sdk, /wallet-service, headers)
```

#### Build Configuration

The build system uses centralized configuration files:

```
build-paths.ts        # SDK filepath configs (source of truth)
build-paths.sh        # Build scripts filepaths
rolldown.config.ts   # Rolldown bundler configuration
```

**Filepath Configuraiton Files:**
- **`build-paths.ts`** - Source of truth for all configuration
- **`build-paths.sh`** - Shell version for bash scripts

## WalletIframe (cross‑origin recommended)

The SDK runs sensitive logic in a hidden wallet iframe on a dedicated origin. Parent ↔ wallet communicate via a typed MessagePort.
This SDK mounts a hidden, sandboxed “service iframe” that orchestrates WebAuthn, PRF storage, and signing flows. Running the wallet on a dedicated origin gives you strong isolation, but the SDK continues to support same-origin hosting with console warnings for legacy setups.

- **Dedicated wallet origin (recommended)**: Configure `iframeWallet.walletOrigin` (and optionally `iframeWallet.walletServicePath`) in `TatchiPasskey` configs. When the wallet origin differs from the host, the parent cannot script the wallet iframe.
- **Same-origin fallback**: If you omit `iframeWallet.walletOrigin`, or set it to the host origin, the wallet runs inline with the parent app. This is convenient for quick starts but the parent can observe all secrets. The SDK emits `console.warn` messages in this mode.
- **Static asset delegation**: The wallet origin serves `/wallet-service` and `/sdk/*` (including `/sdk/workers/*`). Dev: use `tatchiDev` Vite plugin. Prod: deploy with your wallet site or use the provided `_headers` emitter.
- **Gesture routing**: Visible iframes (Modal/Button) capture the user gesture and run WebAuthn flows; the service iframe stays headless.

### React usage

```tsx
import { PasskeyProvider, PASSKEY_MANAGER_DEFAULT_CONFIGS } from '@tatchi-xyz/sdk/react';

function App() {
  return (
    <PasskeyProvider
      config={{
        ...PASSKEY_MANAGER_DEFAULT_CONFIGS,
        iframeWallet: {
          walletOrigin: 'https://wallet.example.com',
          walletServicePath: '/wallet-service',
          // Optional: set RP base so passkeys span subdomains
          // rpIdOverride: 'example.localhost'
        }
      }}
    >
      <YourApp />
    </PasskeyProvider>
  );
}
```

### Vanilla TypeScript usage

```ts
import { TatchiPasskey } from '@tatchi-xyz/sdk';

const tatchi = new TatchiPasskey({
  nearRpcUrl: 'https://rpc.testnet.near.org',
  nearNetwork: 'testnet',
  contractId: 'w3a-v1.testnet',
  iframeWallet: {
    walletOrigin: 'https://wallet.example.com',
    walletServicePath: '/wallet-service',
    // Optional: rpIdOverride for subdomain credentials
    // rpIdOverride: 'example.localhost'
  }
  // To run inline without a dedicated origin, omit iframeWallet entirely.
});

await tatchi.initWalletIframe();

const signed = await tatchi.signTransactionsWithActions({
  nearAccountId: 'alice.testnet',
  transactions: [/* ... */],
});
```

### Hosting the wallet origin

When you do host the wallet on a dedicated origin, expose two things:

- Static SDK assets under `/sdk` (workers and embedded bundles):
  - `/sdk/workers/web3authn-signer.worker.js`
  - `/sdk/workers/web3authn-vrf.worker.js`
  - `/sdk/wallet-iframe-host.js` (and other embedded bundles)
- A service page at `/wallet-service` that loads the service host module.

Use the Vite plugin `tatchiDev` in dev and deploy the wallet site (including `/sdk` and `/wallet-service`) in prod. The build helper `tatchiBuildHeaders` emits a `_headers` file with COOP/COEP/CORP and `Permissions-Policy` for Pages/Netlify‑style deployments.

## Shamir 3‑Pass Rotation (Strict keyId)

The SDK supports VRF auto‑login via a commutative Shamir 3‑pass scheme and includes a strict rotation model based on a server key identifier (`keyId`).

Key points:
- Server returns `keyId` from `POST /vrf/apply-server-lock` and requires it on `POST /vrf/remove-server-lock`.
- The SDK persists this `serverKeyId` alongside the ciphertext in IndexedDB.
- On login:
  - If Shamir unlock fails, SDK falls back to TouchID and immediately re‑encrypts the VRF blob under the current server key (refresh).
  - If Shamir unlock succeeds, SDK proactively refreshes to the latest key when possible.
- Rotation does not expose plaintext VRF or KEK to the server — only blinded locks.

Server endpoints (strict):
- `POST /vrf/apply-server-lock`
  - Request: `{ "kek_c_b64u": "base64url" }`
  - Response: `{ "kek_cs_b64u": "base64url", "keyId": "sha256(e_s_b64u)_base64url" }`
- `POST /vrf/remove-server-lock`
  - Request: `{ "kek_cs_b64u": "base64url", "keyId": "..." }`
  - Response: `{ "kek_c_b64u": "base64url" }`
- `GET /shamir/key-info`
  - Response: `{ "currentKeyId": "...", "p_b64u": "...", "graceKeyIds": ["..."] }`

Grace keys (server):
- During rotation, the server can accept previously active keys for `remove-server-lock` only — not for new wraps — using a `graceShamirKeys` list.
- In the example relay server, populate `grace-keys.json` (or point `SHAMIR_GRACE_KEYS_FILE` at your preferred location) with an array of `{ e_s_b64u, d_s_b64u }` pairs.

See also:
- docs/shamir3pass-rotate-keys.md — full plan and proactive refresh details
- examples/relay-server/README.md — strict API, key info endpoint, and grace keys configuration

Then configure the SDK to use this wallet origin:

```ts
const tatchi = new TatchiPasskey({
  nearRpcUrl: 'https://rpc.testnet.near.org',
  nearNetwork: 'testnet',
  contractId: 'w3a-v1.testnet',
  iframeWallet: {
    walletOrigin: 'http://localhost:8080', // your wallet site
    walletServicePath: 'wallet-service',   // must match the route above
    // rpIdOverride: 'example.localhost',  // optional
  }
});
await tatchi.initWalletIframe();
```

With this approach, you don’t copy HTML into the integrator’s app and you don’t rely on any external vendor servers. You either:

- Use the default same‑origin `srcdoc` mounting (zero configuration), or
- Host the wallet service on your own separate origin by exposing `/sdk` and `/wallet-service` as shown.

### Examples

- `examples/vite`: same‑origin App Wallet demo (default). No env toggles.
- `examples/vite-secure`: dedicated wallet host exposing `/wallet-service` and `/sdk` on `https://wallet.example.localhost` for cross‑origin demos.

## Vite Dev Plugin

For a zero‑friction local setup (same‑origin or cross‑origin iframe wallet) use the built‑in Vite plugin. It wires up the wallet service route, maps SDK assets under `/sdk`, enforces WASM MIME, and can add dev headers.

Minimal usage:

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { tatchiDev } from '@tatchi-xyz/sdk/plugins/vite'

export default defineConfig({
  plugins: [react(), web3authnDev()],
})
```

Options:
- `mode`: `'self-contained' | 'front-only' | 'wallet-only'` (default `'self-contained'`)
- `sdkBasePath`: mount path for assets (default `'/sdk'`)
- `walletServicePath`: route for the wallet service page (default `'/wallet-service'`)
- `walletOrigin`: used in Permissions‑Policy (default `process.env.VITE_WALLET_ORIGIN || 'https://wallet.example.localhost'`)
- `setDevHeaders`: set COOP/COEP/Permissions‑Policy in dev (default `true`)
- `enableDebugRoutes`: add `GET /__sdk-root` to verify asset resolution (default `false`)

Advanced composition:

```ts
import { defineConfig } from 'vite'
import {
  web3authnServeSdk,
  web3authnWalletService,
  web3authnWasmMime,
  web3authnDevHeaders,
} from '@tatchi-xyz/sdk/plugins/vite'

export default defineConfig({
  plugins: [
    web3authnServeSdk({ sdkBasePath: '/sdk' }),
    web3authnWalletService({ walletServicePath: '/wallet-service', sdkBasePath: '/sdk' }),
    web3authnWasmMime(),
    web3authnDevHeaders({ walletOrigin: process.env.VITE_WALLET_ORIGIN }),
  ]
})
```

Dev headers and proxies:
- If your reverse proxy (e.g., Caddy) already sets COOP/COEP/Permissions‑Policy, pass `setDevHeaders: false` to avoid duplicates.
- The wallet host should opt into cross‑origin embedding; set `Cross-Origin-Resource-Policy: cross-origin` for its static assets.

Debugging:
- `GET /__sdk-root` returns the resolved SDK `dist` root used by the plugin.
- Wallet service is served at `GET /wallet-service` and loads `/sdk/wallet-iframe-host.js`.
