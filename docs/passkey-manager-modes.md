# Passkey Manager Modes: Unified Configuration & Example Setup

## Summary

The Web3Authn SDK supports two runtime modes for passkey management:

- **Same-origin mode**: `PasskeyManager` runs all flows directly in the app origin (`example.localhost`)
- **Cross-origin mode**: `PasskeyManager` proxies flows via a dedicated wallet host iframe (`wallet.example.localhost`)

The system provides a unified configuration API where switching between modes requires only setting the `iframeWallet.walletOrigin` parameter. Two separate examples demonstrate each mode clearly without environment mixing.

**Current dev setup:**
- App origin: `https://example.localhost` (front app served by Vite via Caddy)
- Wallet origin: `https://wallet.example.localhost` (reverse-proxies to the same Vite instance)
- Wallet service route: `GET /wallet-service` returns minimal HTML that loads `/sdk/esm/react/embedded/wallet-iframe-host.js`
- SDK assets + workers/WASM: served under `/sdk` directly from `passkey-sdk/dist`

### Mode Selector

- Same‑origin (examples/vite):
  - You don’t want a separate wallet host.
  - Simplest setup; great for local and many production apps.
  - Omit `iframeWallet` in `PasskeyManager` configs.
- Cross‑origin (examples/vite-secure):
  - You want stronger isolation for WebAuthn/workers/IndexedDB.
  - Configure `iframeWallet.walletOrigin` (+ `walletServicePath`).
  - Use two TLS hosts (Caddy in dev) and serve `/sdk` + `/wallet-service` on the wallet origin.
- Self‑contained dev:
  - One Vite instance proxies two TLS hosts via Caddy.
  - Use the Vite plugin with `mode: 'self-contained'`.

## Vite Plugin (Shipped)

Use the built-in Vite plugin to wire dev middleware with minimal config. It serves the wallet service page, maps SDK assets under `/sdk`, enforces `.wasm` MIME, and can apply dev headers.

Quick start

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { web3authnDev } from '@web3authn/passkey/vite'

export default defineConfig({
  plugins: [react(), web3authnDev()],
})
```

Modes
- `self-contained` (default): one Vite handles app + wallet routes; works with two TLS hosts via Caddy
- `wallet-only`: only serve the wallet service page + SDK assets
- `front-only`: only map SDK assets for a front app that talks to a separate wallet host

Options
- `sdkBasePath` (default `/sdk`)
- `walletServicePath` (default `/wallet-service`)
- `walletOrigin` (default `process.env.VITE_WALLET_ORIGIN` or `https://wallet.example.localhost`)
- `setDevHeaders` (default `true`) – add COOP/COEP/Permissions‑Policy in dev
- `enableDebugRoutes` (default `false`) – adds `GET /__sdk-root`

Examples
- `examples/vite-secure` (self-contained): `web3authnDev({ mode: 'self-contained', setDevHeaders: false, enableDebugRoutes: true })`
- `examples/vite` (same-origin only): no plugin required; keep config minimal

Production
- Serve `/sdk` from CDN/object storage
- Serve a minimal wallet service HTML at the wallet origin that loads `${sdkBasePath}/esm/react/embedded/wallet-iframe-host.js`
- Set headers at the edge (front: COOP/COEP + Permissions‑Policy; wallet: COOP/COEP + `Cross-Origin-Resource-Policy: cross-origin`)

## Goals

- **Single configuration surface** for both modes with zero API churn
- **Mode selection** via `iframeWallet.walletOrigin` (and optional `iframeWallet.walletServicePath`)
- **Clear examples** for each mode: `examples/vite` (same-origin) and `examples/vite-secure` (cross-origin)
- **Comprehensive guidance** on RP ID, headers, TLS, and WASM/asset paths

## Design Overview

### Single Client API with Auto-Selection

Consumers instantiate a single client (or use `PasskeyProvider`) and set `iframeWallet.walletOrigin` to opt into iframe mode.

**Detection logic:**
- If `iframeWallet.walletOrigin` is present and differs from `window.location.origin` → iframe mode
- Otherwise → same-origin mode

**Optional parameters:**
- `iframeWallet.walletServicePath` (default: `/service`)
- `sdkBasePath` (default: `/sdk`) for deterministic asset/service routing

### Unified Configuration Object

`PasskeyManagerConfigs` remains the canonical input with these nested fields:

- `iframeWallet.walletOrigin?: string` — enables iframe mode when set
- `iframeWallet.walletServicePath?: string` — default `/service` (examples use `/wallet-service`)
- `iframeWallet.rpIdOverride?: string` — base RP ID for cross-subdomain credential sharing
- Standard fields: `nearRpcUrl`, `nearNetwork`, `contractId`, `relayer`, `vrfWorkerConfigs`

### Example Applications

- **`examples/vite`**: Same-origin example app (omits `iframeWallet`)
- **`examples/vite-secure`**: Cross-origin wallet host serving `/wallet-service` and SDK assets under `/sdk`
- **Caddy/mkcert**: Provides TLS and subdomain hosts for WebAuthn in development

## API Usage

### Same-Origin Mode

```typescript
const passkey = new PasskeyManager({
  nearRpcUrl: 'https://test.rpc.fastnear.com',
  nearNetwork: 'testnet',
  contractId: 'web3-authn-v5.testnet',
  relayer: { accountId: 'web3-authn-v5.testnet', url: 'https://relay-server.localhost' }
  // No iframeWallet = same-origin mode
});
```

### Cross-Origin Mode

```typescript
const passkey = new PasskeyManager({
  nearRpcUrl: 'https://test.rpc.fastnear.com',
  nearNetwork: 'testnet',
  contractId: 'web3-authn-v5.testnet',
  relayer: { accountId: 'web3-authn-v5.testnet', url: 'https://relay-server.localhost' },
  iframeWallet: {
    walletOrigin: 'https://wallet.example.localhost',
    walletServicePath: '/wallet-service',
    rpIdOverride: 'example.localhost' // For cross-subdomain credential sharing
  }
});
```

### React Integration

```tsx
// Same-origin
<PasskeyProvider config={PASSKEY_MANAGER_DEFAULT_CONFIGS}>
  <App />
</PasskeyProvider>

// Cross-origin (just add iframeWallet)
<PasskeyProvider config={{
  ...PASSKEY_MANAGER_DEFAULT_CONFIGS,
  iframeWallet: {
    walletOrigin: 'https://wallet.example.localhost',
    walletServicePath: '/wallet-service',
    rpIdOverride: 'example.localhost'
  }
}}>
  <App />
</PasskeyProvider>
```

## Runtime Detection

**Mode selection logic:**
- If `iframeWallet.walletOrigin` is falsy or equals current origin → same-origin mode
- Otherwise → iframe mode (requests route through `WalletIframeClient`)

**Iframe requirements:**
- `sandbox="allow-scripts allow-same-origin"`
- WebAuthn delegation: the iframe must be allowed to call WebAuthn APIs. The SDK sets a permissive `allow` attribute automatically when `iframeWallet.walletOrigin` is configured, but the parent page must still delegate via `Permissions-Policy`.
- Front origin must set `Permissions-Policy` to include wallet origin for both create/get.
- Wallet origin should only allow self in its policy.

## Security & Headers

### WebAuthn Requirements

**HTTPS/TLS:**
- WebAuthn requires HTTPS or localhost
- For cross-origin subdomains, run TLS with correct permissions policies

**Headers by Origin:**

**Front app origin (`example.localhost`):**
- `Permissions-Policy`: allow WebAuthn for self and wallet origin. Avoid conflicting duplicate headers (e.g., Vite and Caddy both setting different policies) — the effective policy may block WebAuthn in the iframe. Ensure both layers emit the same, permissive policy.
- `COOP/COEP`: `same-origin`/`require-corp`

**Wallet origin (`wallet.example.localhost`):**
- `Permissions-Policy`: allow WebAuthn for self only
- `Cross-Origin-Resource-Policy: cross-origin` for static resources

Header recipes (Caddy)

```caddyfile
# Front app (example.localhost)
example.localhost {
  tls internal
  header {
    Cross-Origin-Embedder-Policy "require-corp"
    Cross-Origin-Opener-Policy   "same-origin"
    Permissions-Policy           "publickey-credentials-get=(self \"https://wallet.example.localhost\"), publickey-credentials-create=(self \"https://wallet.example.localhost\")"
  }
  reverse_proxy localhost:5173
}

# Wallet host (wallet.example.localhost)
wallet.example.localhost {
  tls internal
  header {
    Cross-Origin-Embedder-Policy "require-corp"
    Cross-Origin-Opener-Policy   "same-origin"
    Permissions-Policy           "publickey-credentials-get=(self), publickey-credentials-create=(self)"
    Cross-Origin-Resource-Policy "cross-origin"
  }
  reverse_proxy localhost:5174
}
```

Note: Choose one source of truth for these headers (proxy or Vite plugin) to avoid conflicts.

### RP ID Strategy

- **Same-origin**: RP ID automatically matches current host
- **Cross-origin**: Set `rpIdOverride` to base domain (e.g., `example.localhost`) for credentials valid across subdomains

**Important:** Ensure your contract/server verification accepts the configured RP ID.

### Browser Compatibility

- **Safari/iOS**: Cross-origin WebAuthn in iframes requires `allow` attribute and Permissions-Policy
- **Older Safari versions**: May not fully support cross-origin WebAuthn; use same-origin mode as fallback
- **RP ID migrations**: Changing `rpIdOverride` may invalidate existing credentials; document changes to users

## Asset Management

### SDK Assets

- Serve SDK assets under `/sdk` in both apps
- Wallet service page loads embedded bundles from `/sdk/esm/react/embedded/`
- In dev, the Vite plugin serves from `passkey-sdk/dist` (workspace or node_modules)
- Minimal wallet service HTML (for production):

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Web3Authn Wallet Service</title>
    <script>window.global ||= window; window.process ||= { env: {} };</script>
  </head>
  <body>
    <script type="module" src="/sdk/esm/react/embedded/wallet-iframe-host.js"></script>
  </body>
  </html>
```
- Ensure `.wasm` files are served with `application/wasm` content type

### Security Notes

- Wallet host iframe isolates sensitive flows (WebAuthn, key material) to dedicated origin
- Strict headers and minimal capabilities via `sandbox` attribute
- Only expose necessary functionality via postMessage
- All RPCs are typed and origin-checked in `IframeTransport`/`client`

## Development Workflows

### Same-Origin Development

1. **Host setup** (once):
   ```bash
   echo "127.0.0.1 example.localhost" >> /etc/hosts
   ```

2. **Start development server**:
   ```bash
   pnpm -C examples/vite dev
   ```

3. **Configuration**: Omit `iframeWallet` in app config

### Cross-Origin Development

1. **Host setup** (once):
   ```bash
   echo "127.0.0.1 example.localhost" >> /etc/hosts
   echo "127.0.0.1 wallet.example.localhost" >> /etc/hosts
   echo "127.0.0.1 relay-server.localhost" >> /etc/hosts  # if using relay
   ```

2. **Start development servers**:
   ```bash
   # Frontend (spawns Caddy)
   pnpm -C examples/vite dev

   # Wallet host
   pnpm -C examples/vite-secure dev
   ```

3. **Configuration**: Set iframe wallet config:
   ```typescript
   iframeWallet: {
     walletOrigin: 'https://wallet.example.localhost',
     walletServicePath: '/wallet-service',
     rpIdOverride: 'example.localhost'  // if sharing RP ID across subdomains
   }
   ```

### Optional Convenience Scripts

Repo root scripts (available now):
```json
{
  "scripts": {
    "dev:same-origin": "concurrently --kill-others \"pnpm -C passkey-sdk dev\" \"pnpm -C examples/vite dev\"",
    "dev:wallet-only": "concurrently --kill-others \"pnpm -C passkey-sdk dev\" \"pnpm -C examples/vite-secure dev\"",
    "dev:iframe": "concurrently --kill-others \"pnpm -C passkey-sdk dev\" \"pnpm -C examples/vite dev\" \"pnpm -C examples/vite-secure vite --port 5174 --strictPort\""
  }
}
```

## Integration Checklists

### Same-Origin Checklist
- [ ] Config omits `iframeWallet`
- [ ] Front headers include COOP/COEP; Permissions-Policy can be self-only
- [ ] WASM served with correct MIME type

### Cross-Origin Checklist
- [ ] Config sets `iframeWallet.walletOrigin` and `iframeWallet.walletServicePath`
- [ ] Front `Permissions-Policy` grants WebAuthn to self and wallet origin
- [ ] Wallet `Permissions-Policy` grants WebAuthn to self only
- [ ] Iframe `allow` attribute includes WebAuthn create/get
- [ ] TLS configured for both origins (Caddy in dev)

## Troubleshooting

### WebAuthn Errors (`NotAllowedError`)
- Verify front origin's `Permissions-Policy` includes wallet origin for both create/get
- Verify iframe has `allow="publickey-credentials-create; publickey-credentials-get"`
- Ensure recent user activation (click/tap) before starting WebAuthn

### Wallet Iframe Never Ready
- Check network tab for `/wallet-service` 200 response in wallet host
- Ensure SDK assets served under `/sdk`; look for 404s for `wallet-iframe-host.js` or worker WASM files
- Handshake reliability: the initial CONNECT handshake uses a `MessagePort`. Some environments can drop the port if an explicit `targetOrigin` is used too early; the SDK posts with `'*'` to avoid that during host boot.

### RP ID Mismatch (`InvalidStateError`)
- Confirm `rpIdOverride` and origins align with how credentials were created

### WASM MIME Errors
- Ensure `.wasm` responses use `application/wasm` (the Vite plugin enforces this in dev)

## Self-Contained Development Setup

### Overview

Run a single Vite server (`examples/vite-secure`) that serves:
- The dApp UI at `https://example.localhost`
- The wallet service iframe at `https://wallet.example.localhost/wallet-service`

Two distinct origins (required for cross-origin WebAuthn) are maintained by Caddy; both reverse-proxy to Vite on port 5174. The plugin serves SDK assets and workers/WASM under `/sdk`.

### Goals

- One Vite server for both the dApp and wallet service
- Strict COOP/COEP headers with correct `Permissions-Policy` per origin
- Serve `/sdk/*` with proper MIME types (including `.wasm`)
- Minimal configuration changes; reuse existing example plugins

### Setup Steps

1. **Use `examples/vite-secure` as the single dev app**
2. **Vite config**: Keep wallet service route (`/wallet-service`) and `/sdk/*` asset server
3. **Caddy config**: Two hosts (`example.localhost`, `wallet.example.localhost`) both proxy to `localhost:5174`
4. **App config**: Configure iframe mode in `PasskeyProvider`
5. **Dev script**: Run both Vite and Caddy concurrently

### Verification

- `https://example.localhost` loads dApp; register/login/transfer works with passkey
- `https://wallet.example.localhost/wallet-service` loads host page without console errors
- `/sdk/workers/*.wasm` served with `application/wasm`; embedded bundles load correctly

## Key Benefits

- **Single configuration surface** - One API for both modes
- **Zero API churn** - Existing code works unchanged
- **Production-ready examples** - Proper TLS, headers, and security
- **Flexible deployment** - Choose mode based on security requirements
- **Clear separation** - Distinct examples prevent environment mixing
- **Asset/WASM routing** - Consistent and debuggable across modes

## Related Documentation

- `docs/modalConfirmer-walletIframeMode.md`
- `docs/wallet-iframe-onevent-hooks.md`
- `passkey-sdk/docs/wallet-iframe-architecture.md`
- `passkey-sdk/src/core/WebAuthnManager/SignerWorkerManager/confirmTxFlow/README.md`
