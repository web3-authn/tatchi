**Summary**
- Core issue: embedded bundles were requested from the wrong base path in production and hit SPA rewrites, returning `text/html` instead of JS/WASM. As a result, custom elements never registered and WASM sometimes loaded with an incorrect MIME type.

**Root Cause**
- No single, explicit base for embedded asset URLs across build/runtime.
- Production host rewrote unknown routes to `index.html`, including `/sdk/*` when not excluded.
- Some servers served `.wasm` without `application/wasm`.

**Fix**
- Standardize the base to `/sdk` at build time: set `VITE_SDK_BASE_PATH=/sdk` for prod builds.
- Publish embedded bundles under `/sdk` and have the wallet-only site load `/sdk/wallet-iframe-host.js`.
- Disable SPA rewrites for `/sdk/*` so assets aren’t routed to the SPA shell.
- Serve correct MIME types: JS as `application/javascript`, WASM as `application/wasm`.
- Runtime base resolution tightened:
  - Wallet host sets `window.__W3A_EMBEDDED_BASE__` to the directory of the loaded host bundle using `new URL('.', import.meta.url)`.
  - SDK resolves with `window.__W3A_EMBEDDED_BASE__` first, falling back to `'/sdk/'`.

**Key Code**
- `passkey-sdk/src/core/WebAuthnManager/LitComponents/asset-base.ts:1` – resolves embedded base; prefers `window.__W3A_EMBEDDED_BASE__`, else `'/sdk/'`.
- `passkey-sdk/src/core/WalletIframe/host/wallet-iframe-host.ts:1` – sets `window.__W3A_EMBEDDED_BASE__` from `import.meta.url` at module load.

**Deployment Notes (Cloudflare Pages)**
- Copy `dist/esm/sdk/*` to `/sdk/`.
- Ensure Pages config doesn’t rewrite `/sdk/*` to `index.html`.
- Confirm MIME types for `.js` and `.wasm`.

**Quick Checks**
- `GET <wallet-origin>/sdk/wallet-iframe-host.js` → 200 `application/javascript`.
- `GET <wallet-origin>/sdk/w3a-tx-confirmer.js` → 200 `application/javascript`.
- `GET <wallet-origin>/sdk/tx-confirm-ui.js` → 200 `application/javascript`.
- In wallet iframe console: `window.__W3A_EMBEDDED_BASE__` ends with `/sdk/`.

**Outcome**
- With the base path fixed, rewrites excluded, and MIME types correct, embedded bundles like `w3a-tx-confirmer` load in both development and production.
