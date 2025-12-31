# Tatchi Wallet Extension (MV3 Side Panel) — Dev Scaffold

This is an early scaffold for the “Chrome extension security upgrade” plan.

## Goals (for this scaffold)

- Clicking the extension icon opens the **Side Panel** (no popup).
- Provide a minimal external-messaging handshake so a web app can detect the extension.

## Load unpacked in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select this folder: `apps/tatchi-wallet-extension`

## What’s implemented

- MV3 `manifest.json` with a Side Panel (`sidepanel.html`)
- Service worker sets `openPanelOnActionClick: true`
- External messaging:
  - `chrome.runtime.onMessageExternal` supports `type: "TATCHI_EXT_PING"`
  - responds with `type: "TATCHI_EXT_PONG"` including extension + protocol versions
- Wallet service stub:
  - `wallet-service.html` implements a Phase 0 WebAuthn PRF smoke test UI
  - Supports CONNECT → READY over a transferred `MessagePort` and a minimal `PM_SET_CONFIG` response

## Detect from a web app (dev)

1) Load the extension unpacked.

2) Copy the extension id from `chrome://extensions` (the long string).

3) Call the SDK helper:

```ts
import { detectTatchiWalletExtension } from '@tatchi-xyz/sdk';

const info = await detectTatchiWalletExtension('<EXTENSION_ID>');
console.log('extension reachable?', info);
```

## Phase 0 (Architecture A) harness

1) Load the extension unpacked.

2) Open `examples/vite` dev server (HTTPS via Caddy) and visit:
- `https://example.localhost/phase0-extension.html`

The extension exposes the wallet service page at:
- `chrome-extension://<id>/wallet-service.html`

Note: Chrome treats extension resources without a file extension as downloads/non-HTML.
The SDK aliases the default `/wallet-service` path to `/wallet-service.html` when `walletOrigin` is a `chrome-extension://` URL.

3) Paste the extension id (from `chrome://extensions`) and click:
- “Embed iframe”
- “CONNECT → READY”

4) In the embedded iframe, click:
- “Create passkey (PRF)”
- “Get passkey (PRF)”

If WebAuthn is blocked, check:
- App `Permissions-Policy` includes `chrome-extension://<id>` for `publickey-credentials-*`
- App COEP is not blocking extension iframes (disable COEP on app pages if needed)

## Next steps

- Decide on the web ↔ extension transport (`externally_connectable` vs content-script bridge)
- Move the wallet host runtime into the extension side panel (or a dedicated extension page)
- Mirror the wallet-iframe message protocol (`PM_*`, `PROGRESS`, `PM_RESULT`) over a `chrome.runtime.Port`
