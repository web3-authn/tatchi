# @web3authn/passkey

> **⚠️ Development Note**: worker files are copied to `frontend/public/workers/` for development. The code is environment-aware and will automatically use the correct paths in production. This ensures robust operation across different deployment scenarios.

Web3Authn Passkey SDK for NEAR Protocol integration with React components and TypeScript support.


## Installation

```bash
pnpm add @web3authn/passkey
# or
npm install @web3authn/passkey
# or
yarn add @web3authn/passkey
```


### Building from Source

> **Note**: The following requirements are only for SDK development. End users installing the package via npm/pnpm don't need Rust, Bun, or any build tools.

#### Prerequisites

This SDK includes Rust-based WASM modules and uses Bun for worker compilation. You'll need:

```bash
# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Install wasm-pack
curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh

# Add WASM target
rustup target add wasm32-unknown-unknown

# Install Bun (for TypeScript worker compilation)
curl -fsSL https://bun.sh/install | bash

# Install pnpm (recommended package manager)
npm install -g pnpm
```

#### Building

```bash
git clone https://github.com/near/passkey.git
cd passkey/packages/passkey
pnpm install

# Build complete SDK (includes WASM compilation and TypeScript worker bundling)
pnpm run build

# For development with file watching
pnpm run dev
```

#### Build System

The SDK uses a hybrid build system:
- **Rolldown** for main library bundling (ESM/CJS)
- **Bun** for TypeScript worker compilation (better TypeScript support)
- **wasm-pack** for Rust WASM modules

```bash
# Full build (WASM + TypeScript + bundling)
pnpm run build

# Check if build is up to date
pnpm run build:check:fresh

# Development with file watching
pnpm run dev
```

### Testing

```bash
pnpm test           # Run E2E tests with Playwright
pnpm run lint       # Lint code
pnpm run type-check # TypeScript type checking
```

### Project Structure

```
src/
├── core/              # Framework-agnostic core
│   ├── PasskeyManager.ts
│   ├── WebAuthnManager.ts
│   ├── types.ts
│   ├── web3authn-signer.worker.ts    # NEAR transaction signing worker
│   ├── web3authn-vrf.worker.ts       # VRF challenge generation worker
│   └── utils/
├── react/             # React-specific exports
│   ├── components/
│   ├── hooks/
│   ├── context/
│   └── index.ts
├── wasm_signer_worker/    # Rust WASM module for signing
├── wasm_vrf_worker/       # Rust WASM module for VRF
└── index.ts               # Main entry point
```

#### Build Configuration

The build system uses centralized configuration files:

```
build-paths.ts        # SDK filepath configs (source of truth)
build-paths.sh        # Build scripts filepaths
rolldown.config.mjs   # Rolldown bundler configuration
```

**Filepath Configuraiton Files:**
- **`build-paths.ts`** - Source of truth for all configuration
- **`build-paths.sh`** - Shell version for bash scripts

## Service Iframe (no external hosting required)

This SDK mounts a hidden, sandboxed “service iframe” that runs sensitive logic (WebAuthn orchestration, workers, IndexedDB) without relying on any external server or copied HTML files.

- Same‑origin by default: The iframe is created with `srcdoc` and loads an embedded ESM bundle (service‑host) resolved by your bundler (`?url` import). No manual copying.
- Optional cross‑origin: If you want to run the service on a separate wallet origin, set `walletOrigin` (and optionally `walletServicePath`) in `PasskeyManager` configs. This is not required.
- UI/gesture: Visible iframes (Modal/Button) capture the user gesture and run WebAuthn; the service iframe remains headless.

### React usage

```tsx
import { PasskeyProvider, PASSKEY_MANAGER_DEFAULT_CONFIGS } from '@web3authn/passkey/react';

function App() {
  return (
    <PasskeyProvider
      config={{
        ...PASSKEY_MANAGER_DEFAULT_CONFIGS,
        // Optional: set a custom wallet origin if you need a separate domain
        // walletOrigin: 'https://wallet.example.com',
        // walletServicePath: '/service',
      }}
    >
      <YourApp />
    </PasskeyProvider>
  );
}
```

### Vanilla TypeScript usage

```ts
import { PasskeyManager } from '@web3authn/passkey';

const pm = new PasskeyManager({
  nearRpcUrl: 'https://rpc.testnet.near.org',
  nearNetwork: 'testnet',
  contractId: 'web3-authn-v5.testnet',
  // Optional: walletOrigin for a separate wallet site. Omit to stay same‑origin.
  // walletOrigin: 'https://wallet.example.com',
  // walletServicePath: '/service',
});

await pm.initServiceIframe();

const signed = await pm.signTransactionsWithActions({
  nearAccountId: 'alice.testnet',
  transactions: [/* ... */],
});
```

No external hosting or HTML copying is required when using the default same‑origin mode.

### Optional: hosting on a separate wallet origin

If you want stronger isolation by running the service iframe on a separate origin, you need to serve two things from that origin:

- Static SDK assets under `/sdk` (workers and embedded bundles):
  - `/sdk/workers/web3authn-signer.worker.js`
  - `/sdk/workers/web3authn-vrf.worker.js`
  - `/sdk/embedded/service-host.js` (and other embedded bundles)
- A service page at `/service` that loads the service host module.

You do not need to copy files into your app bundle — you can serve them directly from `node_modules` at runtime, or deploy them as part of your wallet site. Below is a minimal Node/Express example that serves assets from the installed package and exposes `/service`:

```ts
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { getWalletServiceHtml } from '@web3authn/passkey/core/ServiceIframe/html';

const app = express();

// Resolve the dist directory inside the installed package
const pkgEntry = require.resolve('@web3authn/passkey/dist/esm/index.js');
const distEsmDir = path.dirname(pkgEntry);           // .../node_modules/@web3authn/passkey/dist/esm
const distRoot = path.resolve(distEsmDir, '..');     // .../node_modules/@web3authn/passkey/dist

// Serve SDK assets at /sdk
app.use('/sdk', express.static(path.join(distRoot, 'esm')));
app.use('/sdk/workers', express.static(path.join(distRoot, 'workers')));

// Service page at /service
app.get('/service', (_req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  // sdkBasePath must match where you serve the SDK assets (here, '/sdk')
  res.end(getWalletServiceHtml('/sdk'));
});

app.listen(8080, () => console.log('Wallet host running on http://localhost:8080'));
```

Then configure the SDK to use this wallet origin:

```ts
const pm = new PasskeyManager({
  nearRpcUrl: 'https://rpc.testnet.near.org',
  nearNetwork: 'testnet',
  contractId: 'web3-authn-v5.testnet',
  walletOrigin: 'http://localhost:8080', // your wallet site
  walletServicePath: '/service',         // must match the route above
});
await pm.initServiceIframe();
```

With this approach, you don’t copy HTML into the integrator’s app and you don’t rely on any external vendor servers. You either:

- Use the default same‑origin `srcdoc` mounting (zero configuration), or
- Host the wallet service on your own separate origin by exposing `/sdk` and `/service` as shown.
