# Chrome Extension Wallet (Dev Harness)

This folder is a minimal MV3 Chrome extension that hosts the Tatchi wallet service page under an extension origin (`chrome-extension://…`) so it can be embedded as the wallet-iframe target (Architecture A).

## Setup (local)

1) Build the SDK so `sdk/dist` exists:

- `pnpm -C sdk build`

2) Copy the built SDK assets into the extension folder:

- `node examples/chrome-extension/scripts/sync-sdk.mjs`

This creates:
- `examples/chrome-extension/sdk/*` (from `sdk/dist/esm/sdk`)
- `examples/chrome-extension/sdk/workers/*` (from `sdk/dist/workers`)

3) Load the extension unpacked:

- Open `chrome://extensions`
- Enable **Developer mode**
- Click **Load unpacked**
- Select `examples/chrome-extension`

4) Point the app at the extension origin:

- In `examples/vite/.env` (or your shell env):
  - `VITE_WALLET_ORIGIN=chrome-extension://<extension_id>`
  - `VITE_WALLET_SERVICE_PATH=/wallet-service.html`
  - Optional (migration / toggle): set both wallet origins and use the debug toggle in the app:
    - `VITE_WALLET_ORIGIN=https://wallet.example.localhost,chrome-extension://<extension_id>`

5) Run the app:

- `pnpm -C examples/vite dev`

## Notes

- `wallet-service.html` matches the strict-CSP-friendly template in `sdk/src/plugins/plugin-utils.ts:buildWalletServiceHtml`.
- `manifest.json` uses broad `host_permissions` for dev; tighten these for production (Phase 4).
- If your app origin differs, add it to `web_accessible_resources[].matches` in `manifest.json`.
- The dev harness also enables `externally_connectable` + a simple `TATCHI_EXT_PING`/`TATCHI_EXT_PONG` handshake (used by `sdk/src/core/ExtensionWallet/detect.ts`).
