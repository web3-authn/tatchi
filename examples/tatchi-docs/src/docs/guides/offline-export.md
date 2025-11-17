---
title: Offline Key Export
---

# Offline Key Export

Export private keys to external wallets while completely offline. The SDK includes a Progressive Web App (PWA) that works without network connectivity, ensuring keys never touch a server.

## Why Offline Export?

**Traditional export risks:**
- Network requests could leak keys to servers
- JavaScript on the page could exfiltrate keys
- Malicious dependencies could intercept export flow

**Offline export guarantees:**
- Service Worker caches all assets, page works with network disabled
- User can verify offline state (airplane mode, DevTools network tab)
- rpId remains bound to wallet origin (no security downgrades)

## Using Offline Export

### Browser Requirements

- **Chrome/Edge**: Full support
- **Safari**: Requires manual "Add to Home Screen" for full offline PWA
- **Firefox**: Service Workers supported, may need manual refresh

### Export Flow

1. **Online preparation**: Visit `/offline-export/` once while online to cache assets
2. **Go offline**: Enable airplane mode or disconnect network
3. **Open export**: Navigate to `https://wallet.example.com/offline-export/`
4. **Authenticate**: TouchID/FaceID to decrypt keys
5. **View keys**: Private keys displayed, copy to external wallet

### React Integration

```tsx
import { usePasskeyManager } from '@tatchi-xyz/sdk/react'

function ExportButton() {
  const passkeyManager = usePasskeyManager()

  const handleExport = async () => {
    // SDK handles fallback to offline route if needed
    await passkeyManager.exportPrivateKey('alice.testnet')
  }

  return <button onClick={handleExport}>Export Keys</button>
}
```

### Programmatic API

```typescript
import { TatchiPasskey } from '@tatchi-xyz/sdk'

const tatchi = new TatchiPasskey({ /* config */ })

// Trigger export (opens /offline-export/ in new tab if offline)
await tatchi.exportPrivateKey('alice.testnet')
```

## How It Works

### Service Worker Caching

The SDK includes a Service Worker that pre-caches:
- Export page HTML and manifest
- WASM modules (signer and VRF)
- JavaScript bundles for the export UI
- CSS stylesheets

**Cache scope**: Only `/offline-export/` route, doesn't affect main app.

**Cache version**: `OFFLINE_EXPORT_v4` (automatically managed).

### Automatic Fallback

When online but dynamic chunks fail to load:
1. Wallet iframe attempts export in-iframe
2. If module import fails, posts `OFFLINE_EXPORT_FALLBACK` message
3. SDK opens `/offline-export/` in new tab (guaranteed to work offline)

### Security Model

**WebAuthn still works offline**: TouchID/FaceID verification happens locally on device, no network required.

**rpId preserved**: Export page runs on wallet origin, rpId matches registration origin.

**No network access**: Service Worker serves all assets from cache, blocks network requests.

## Verifying Offline Operation

### Developer Tools Check

1. Open wallet origin `https://wallet.example.com/offline-export/`
2. Open DevTools → Application → Service Workers
3. Verify `OFFLINE_EXPORT_v4` is active and controlling page
4. Switch to Network tab
5. Set throttling to "Offline"
6. Refresh page
7. All assets load from Service Worker (no red network errors)

### Cache Inspection

DevTools → Application → Cache Storage → `OFFLINE_EXPORT_v4`:

Should contain:
- `/offline-export/offline-export-app.js`
- `/offline-export/workers/*.js` and `*.wasm`
- `/sdk/export-private-key-viewer.js`
- `/sdk/export-viewer.css`
- Various SDK chunks (e.g., `common-*.js`, `lit-events-*.js`)

## Deployment

### Development

SDK dev plugins automatically serve offline export:

```typescript
// vite.config.ts
import { tatchiDev } from '@tatchi-xyz/sdk/plugins/vite'

export default defineConfig({
  plugins: [
    tatchiDev({
      mode: 'self-contained',
      walletOrigin: process.env.VITE_WALLET_ORIGIN
    })
  ]
})
```

Visit `http://localhost:5173/offline-export/` once while online.

### Production (Vite)

Build plugin automatically emits offline export assets:

```typescript
import { tatchiBuildHeaders } from '@tatchi-xyz/sdk/plugins/vite'

export default defineConfig({
  plugins: [
    tatchiBuildHeaders({
      walletOrigin: 'https://wallet.example.com'
    })
  ]
})
```

Build output includes:
- `dist/offline-export/index.html`
- `dist/offline-export/sw.js` (Service Worker)
- `dist/offline-export/manifest.webmanifest` (PWA manifest)
- `dist/offline-export/workers/*.js` and `*.wasm`

### Production (Next.js)

Use postbuild helper:

```typescript
// scripts/postbuild-offline.ts
import { nextEmitOfflineExportAssets } from '@tatchi-xyz/sdk/plugins/next'

nextEmitOfflineExportAssets({
  outDir: './public',
  sdkBasePath: '/sdk'
})
```

```json
// package.json
{
  "scripts": {
    "postbuild": "node scripts/postbuild-offline.ts"
  }
}
```

## Troubleshooting

**504 "Offline asset not pre-cached"**: Service Worker cache incomplete. Unregister SW in DevTools, reload online once, try again offline.

**Service Worker not activating**: Check browser console for registration errors. Ensure `/offline-export/sw.js` is served with `Cache-Control: no-cache`.

**Assets load from network when offline**: Service Worker not controlling page. Check DevTools → Application → Service Workers shows "activated and is controlling this page".

**WASM fails to load**: WASM files must be served with `Content-Type: application/wasm`. Check build config includes this MIME type.

**Export works online but not offline**: Likely a missing asset in cache. Check Cache Storage in DevTools, compare against precache manifest at `/offline-export/precache.manifest.json`.

## Headers

Production deployment requires specific headers:

```
# /offline-export/sw.js and /offline-export/index.html
Cache-Control: no-cache

# Other /offline-export/* assets
Cache-Control: public, max-age=31536000, immutable

# All .wasm files
Content-Type: application/wasm

# Offline export route
Cross-Origin-Embedder-Policy: require-corp
Cross-Origin-Resource-Policy: cross-origin
Permissions-Policy: publickey-credentials-get=(self)
```

These are automatically generated by `tatchiBuildHeaders` plugin.

## See Also

- [Self-Hosting](./selfhosting.md) - Deploy wallet infrastructure
- [Security Model](../concepts/security-model.md) - Defense-in-depth principles
- [Passkeys](./passkeys.md) - WebAuthn authentication flows
