# Web3Authn SDK

PasskeyWallet SDK for NEAR Protocol. Secure, embedded wallet powered by WebAuthn PRF, cross-origin iframe isolation, and WASM-based cryptography.

## What's Inside

This package provides everything you need to integrate passkey-based wallets into your NEAR applications:

- **Core SDK**: Framework-agnostic JavaScript/TypeScript library
- **React Components**: Drop-in components and hooks for React applications
- **WASM Workers**: High-performance cryptographic operations (signing and VRF)
- **Vite Plugins**: Development and build tools for seamless integration

## Installation

### For End Users

Install the published package:

```bash
npm install @tatchi-xyz/sdk
# or
pnpm add @tatchi-xyz/sdk
# or
yarn add @tatchi-xyz/sdk
```

That's it—no build tools required. The package includes pre-compiled WASM modules and bundled JavaScript.

### For SDK Developers

If you're contributing to the SDK or building from source:

**Prerequisites**:
```bash
# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Install wasm-pack
curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh

# Add WASM target
rustup target add wasm32-unknown-unknown

# Install pnpm
npm install -g pnpm
```

**Build**:
```bash
# From repo root
pnpm install
pnpm -C sdk build     # Builds WASM + bundles
pnpm -C sdk dev       # Watch mode
```

**Test**:
```bash
pnpm -C sdk test           # Playwright tests
pnpm -C sdk run type-check # TypeScript validation
```

---

## Quick Start

### React Integration

The easiest way to get started with React:

Requires React 18+ (React 18 or 19). The core SDK works without React.

```tsx
import { PasskeyProvider, usePasskeyManager, PASSKEY_MANAGER_DEFAULT_CONFIGS } from '@tatchi-xyz/sdk/react'

function App() {
  return (
    <PasskeyProvider
      config={{
        ...PASSKEY_MANAGER_DEFAULT_CONFIGS,
        iframeWallet: {
          walletOrigin: 'https://wallet.example.com',
          walletServicePath: '/wallet-service',
          // Optional: Credential scope strategy
          // rpIdOverride: 'example.com'
        }
      }}
    >
      <YourApp />
    </PasskeyProvider>
  )
}

function SignInButton() {
  const tatchi = usePasskeyManager()

  const handleSignIn = async () => {
    const result = await tatchi.registerPasskey({
      username: 'alice',
      nearAccountId: 'alice.testnet'
    })
    console.log('Registered:', result.credentialId)
  }

  return <button onClick={handleSignIn}>Sign In with Passkey</button>
}
```

### Vanilla TypeScript

For non-React applications or custom integrations:

```typescript
import { TatchiPasskey } from '@tatchi-xyz/sdk'

const tatchi = new TatchiPasskey({
  nearRpcUrl: 'https://rpc.testnet.near.org',
  nearNetwork: 'testnet',
  contractId: 'w3a-v1.testnet',
  iframeWallet: {
    walletOrigin: 'https://wallet.example.com',
    walletServicePath: '/wallet-service',
  }
})

// Initialize the wallet iframe
await tatchi.initWalletIframe()

// Register a new passkey
const registration = await tatchi.registerPasskey({
  username: 'alice',
  nearAccountId: 'alice.testnet'
})

// Sign transactions
const result = await tatchi.signTransactionsWithActions({
  nearAccountId: 'alice.testnet',
  transactions: [{
    receiverId: 'contract.testnet',
    actions: [{
      type: 'FunctionCall',
      method_name: 'my_method',
      args: JSON.stringify({ arg: 'value' }),
      gas: '50000000000000',
      deposit: '0'
    }]
  }]
})

console.log('Transaction hash:', result.transactionHash)
```

---

## Wallet Iframe Architecture

The SDK isolates all sensitive operations in a cross-origin iframe for maximum security.

### Why Iframe Isolation?

Traditional web wallets store keys in the same JavaScript context as your application. This means:

- XSS vulnerabilities can steal keys
- Malicious dependencies can exfiltrate secrets
- One bug compromises everything

**The solution**: Run the wallet in a separate security origin (e.g., `wallet.example.com`). Your app communicates via secure MessageChannel, but can never access keys directly.

### Configuration

**Recommended** (dedicated wallet origin):
```tsx
iframeWallet: {
  walletOrigin: 'https://wallet.example.com',
  walletServicePath: '/wallet-service',
}
```

**Fallback** (same-origin, for quick start):
```tsx
// Omit iframeWallet entirely
// SDK will run inline with console warnings
```

For same-origin deployments, the SDK emits console warnings since the parent can observe secrets. This is convenient for quick starts but not recommended for production.

### Hosting Requirements

When using a dedicated wallet origin, you need to serve:

**1. SDK Assets** (`/sdk/*`):
- `/sdk/workers/web3authn-signer.worker.js`
- `/sdk/workers/web3authn-vrf.worker.js`
- `/sdk/wallet-iframe-host.js`
- Various CSS and component bundles

**2. Wallet Service Page** (`/wallet-service`):
- HTML page that loads the wallet iframe host module

**Development**: The `tatchiDev` Vite plugin serves these automatically.

**Production**: Deploy with your wallet site, or use the `tatchiBuildHeaders` plugin to generate appropriate headers.

---

## Vite Plugin Integration

The SDK includes Vite plugins for development and production builds:

### Development Setup

```typescript
// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { tatchiDev, tatchiBuildHeaders } from '@tatchi-xyz/sdk/plugins/vite'

export default defineConfig({
  plugins: [
    react(),

    // Development: Serves wallet assets locally
    tatchiDev({
      sdkBasePath: '/sdk',
      walletServicePath: '/wallet-service',
      walletOrigin: process.env.VITE_WALLET_ORIGIN
    }),

    // Production: Sets security headers
    tatchiBuildHeaders({
      walletOrigin: process.env.VITE_WALLET_ORIGIN
    })
  ]
})
```

### What The Plugins Do

**`tatchiDev`**:
- Serves `/sdk/*` assets during development
- Mounts `/wallet-service` endpoint
- Enforces WASM MIME type
- Optionally sets COOP/COEP headers (configurable)

**`tatchiBuildHeaders`**:
- Generates Permissions-Policy header for WebAuthn delegation
- Emits `_headers` file for Netlify/Cloudflare Pages deployments
- Ensures iframe can call `navigator.credentials.*`

### Plugin Options

```typescript
tatchiDev({
  mode: 'self-contained',          // or 'front-only', 'wallet-only'
  sdkBasePath: '/sdk',              // Mount path for assets
  walletServicePath: '/wallet-service',  // Wallet service route
  walletOrigin: 'https://wallet.example.com',  // For Permissions-Policy
  setDevHeaders: true,              // Enable COOP/COEP in dev
  coepMode: 'strict',               // 'strict' (default) or 'off'
  enableDebugRoutes: false          // Add /__sdk-root debug endpoint
})
```

### Debugging

Enable debug routes to verify asset resolution:

```typescript
tatchiDev({ enableDebugRoutes: true })
```

Then visit `http://localhost:5173/__sdk-root` to see the resolved SDK path.

---

## Configuration Options

### Core Configuration

```typescript
interface TatchiPasskeyConfig {
  // NEAR blockchain settings
  nearRpcUrl: string               // RPC endpoint
  nearNetwork: 'testnet' | 'mainnet'
  contractId: string               // WebAuthn contract

  // Wallet iframe settings (recommended)
  iframeWallet?: {
    walletOrigin: string           // e.g., 'https://wallet.example.com'
    walletServicePath?: string     // Default: '/wallet-service'
    rpIdOverride?: string          // Optional: Credential scope override
  }

  // Optional relay server (for account creation & Shamir 3-pass)
  relayUrl?: string

  // Optional theme customization
  theme?: 'light' | 'dark' | 'auto'
}
```

### rpId Strategy

The `rpIdOverride` option controls credential scoping:

**Undefined** (wallet-scoped):
- One passkey works across all apps using this wallet
- Good for multi-tenant wallet services
- Requires ROR configuration for Safari

**App domain** (app-scoped):
- Credentials tied to your product's domain
- Works across `*.example.com` subdomains
- Simpler Safari integration

See [Credential Scope Strategy](../examples/tatchi-docs/src/docs/concepts/wallet-scoped-credentials.md) for detailed guidance.

---

## Shamir 3-Pass (Auto-Login)

The SDK includes optional Shamir 3-pass protocol for smooth login UX.

### What It Does

Normally, every login requires TouchID/FaceID. With Shamir 3-pass, returning users can log in without biometric prompts—the SDK cooperates with a relay server to unlock keys.

**Security**: The relay never sees plaintext keys or key-encryption keys. It only handles blinded values that can't be used alone.

### Server Endpoints

**Apply Server Lock**:
```
POST /vrf/apply-server-lock
Request:  { "kek_c_b64u": "..." }
Response: { "kek_cs_b64u": "...", "keyId": "sha256(...)" }
```

**Remove Server Lock**:
```
POST /vrf/remove-server-lock
Request:  { "kek_st_b64u": "...", "keyId": "..." }
Response: { "kek_t_b64u": "..." }
```

**Get Key Info**:
```
GET /shamir/key-info
Response: {
  "currentKeyId": "...",
  "p_b64u": "...",
  "graceKeyIds": ["..."]
}
```

### Key Rotation

Servers should rotate keys periodically. The SDK handles migration transparently:

1. After unlock, SDK checks current `keyId`
2. If different from stored value, SDK re-wraps with new key
3. Old keys stay in grace period temporarily
4. Clients migrate automatically on next login

Grace keys allow rotation without breaking existing sessions. Keep the grace window short (24-48 hours) and prune old keys aggressively.

---

## Project Structure

```
sdk/
├── src/
│   ├── core/                     # Framework-agnostic core
│   │   ├── TatchiPasskey.ts      # Main SDK class
│   │   ├── WebAuthnManager.ts    # WebAuthn operations
│   │   └── WalletIframe/         # Iframe host/client, messaging
│   ├── react/                    # React bindings
│   │   ├── PasskeyProvider.tsx   # Context provider
│   │   └── hooks.ts              # usePasskeyManager, etc.
│   ├── wasm_signer_worker/       # Rust WASM (transaction signing)
│   ├── wasm_vrf_worker/          # Rust WASM (VRF challenges)
│   └── plugins/
│       └── vite.ts               # Vite dev/build helpers
│
├── dist/                         # Build output
│   ├── core/                     # Core SDK bundles
│   ├── react/                    # React component bundles
│   ├── workers/                  # WASM worker modules
│   └── wallet-iframe-host.js     # Wallet iframe entry point
│
├── build-paths.ts                # Build configuration (source of truth)
├── rolldown.config.ts            # Rolldown bundler config
└── README.md                     # This file
```

## Build System

The SDK uses **Rolldown** for JavaScript bundling and **wasm-pack** for Rust compilation.

### Build Commands

```bash
# Full build (WASM + bundles)
pnpm -C sdk build

# Watch mode for development
pnpm -C sdk dev

# Clean build (removes dist/ first)
pnpm -C sdk run build:check:fresh

# Type checking only
pnpm -C sdk run type-check
```

### Build Configuration

All build paths are centralized in `build-paths.ts`:

```typescript
export const BUILD_PATHS = {
  sdkRoot: path.resolve(__dirname),
  distRoot: path.resolve(__dirname, 'dist'),
  wasmSignerSource: path.resolve(__dirname, 'src/wasm_signer_worker'),
  // ... other paths
}
```

This ensures consistency across build scripts, bundler config, and runtime path resolution.

---

## Security Best Practices

### 1. Use HTTPS Everywhere

WebAuthn requires secure contexts. Even in development, use HTTPS:

```bash
# Use mkcert for local HTTPS
mkcert -install
mkcert localhost
```

### 2. Configure Permissions-Policy

Ensure your server delegates WebAuthn to the wallet origin:

```
Permissions-Policy:
  publickey-credentials-get=(self "https://wallet.example.com"),
  publickey-credentials-create=(self "https://wallet.example.com")
```

The `tatchiBuildHeaders` plugin generates this automatically.

### 3. Set Content Security Policy

The wallet should have strict CSP:

```
Content-Security-Policy:
  default-src 'none';
  script-src 'self';
  style-src 'self';
  worker-src 'self' blob:;
  connect-src 'self' https://rpc.testnet.near.org;
```

### 4. Configure ROR (if wallet-scoped)

For wallet-scoped credentials in Safari, serve `/.well-known/webauthn`:

```json
{
  "origins": [
    "https://app.example.com",
    "https://localhost:5173"
  ]
}
```

### 5. Rotate Shamir Keys

If using Shamir 3-pass, rotate server keys regularly:

```typescript
const result = await authService.rotateShamirServerKeypair({
  keepCurrentInGrace: true
})
// Persist new keypair securely
```

---

## Troubleshooting

### "WebAuthn not available"

**Cause**: Permissions-Policy not set or iframe missing `allow` attribute.

**Fix**: Ensure `tatchiBuildHeaders` plugin is configured and check iframe has:
```html
<iframe allow="publickey-credentials-get; publickey-credentials-create">
```

### Passkey not appearing in Safari

**Cause**: ROR manifest missing for wallet-scoped credentials.

**Fix**: Serve `/.well-known/webauthn` on wallet origin with allowed origins.

### WASM module fails to load

**Cause**: Incorrect MIME type or path resolution.

**Fix**:
- Ensure WASM files served with `application/wasm` MIME type
- Verify `/sdk/workers/*.wasm` files are accessible
- Check `tatchiDev` plugin is enabled

### Iframe not loading

**Cause**: CORS or CSP blocking cross-origin iframe.

**Fix**:
- Check wallet origin allows embedding
- Verify CSP includes `frame-src 'self' https://wallet.example.com`
- Check browser console for specific errors

---

## API Reference

See the comprehensive API documentation in:
- [SDK Documentation](./docs/) - Full API reference
- [Guides](../examples/tatchi-docs/src/docs/guides/) - Integration tutorials
- [Concepts](../examples/tatchi-docs/src/docs/concepts/) - Architecture deep-dives

---

## Examples

**Vite + React**: `examples/vite/`
- Basic passkey registration and login
- Transaction signing with confirmation UI
- Same-origin wallet deployment

**Relay Server**: `examples/relay-server/`
- Node.js/Express relay implementation
- Account creation endpoint
- Shamir 3-pass key management
- Automatic key rotation

**Cloudflare Worker**: `examples/relay-cloudflare-worker/`
- Serverless relay deployment
- WASM bundling for Workers runtime
- Secrets management with Wrangler

---

## Contributing

Contributions welcome! See [CONTRIBUTING.md](../CONTRIBUTING.md) for guidelines.

### Development Setup

1. Fork and clone the repository
2. Install dependencies: `pnpm install`
3. Build SDK: `pnpm -C sdk build`
4. Make changes
5. Run tests: `pnpm -C sdk test`
6. Submit pull request

### Areas We Need Help

- Framework integrations (Vue, Svelte, Angular)
- Mobile browser testing
- Documentation improvements
- Example applications
- Performance optimization

---

## License

MIT License - see [LICENSE](../LICENSE) for details.

## Support

- **Documentation**: [../examples/tatchi-docs/](../examples/tatchi-docs/)
- **Issues**: [GitHub Issues](https://github.com/your-org/web3-authn-sdk/issues)
- **Discussions**: [GitHub Discussions](https://github.com/your-org/web3-authn-sdk/discussions)
