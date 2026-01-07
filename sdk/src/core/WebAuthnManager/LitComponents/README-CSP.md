Web3Authn Lit Components — CSP and Styles

Overview
- Goal: run the wallet UI under strict CSP without 'unsafe-inline'.
- Policy on wallet pages:
  - Content-Security-Policy: style-src 'self'; style-src-attr 'none'.
  - No template style="…" and no element.style writes.

Principles
- Externalize all static styles to CSS files under `/sdk/*`.
- Map dynamic values to CSS variables instead of inline styles.
- Prefer constructable stylesheets (adoptedStyleSheets) in Shadow DOM; fall back to a document <link rel="stylesheet">.
- Gate first paint on stylesheet readiness to prevent FOUC (double rAF after adoption).

Key Utilities
- ensureExternalStyles(root, assetName, marker):
  - In Shadow DOM: fetches CSS and adds to `adoptedStyleSheets`.
  - In light DOM: injects a single `<link rel="stylesheet">` with a marker attribute.
  - Returns a Promise that resolves when the sheet is loaded.
- setCssVars(vars):
  - Writes variables into a constructable stylesheet for the component scope.
  - Avoids `element.style.setProperty` under strict CSP.

Component Notes
- TxTree
  - Renders in light DOM by default to avoid Lit’s inline `<style>` injection.
  - All visuals come from `tx-tree.css`; depth classes replace per-node var writes.
- Iframe Tx Confirmer (modal/drawer)
- `tx-confirmer.css` provides layout/tokens; `tx-tree.css` for nested tree.
  - First render is gated on required styles (including halo/loader) to avoid FOUC.
- Export Private Key (viewer + host)
  - Srcdoc loads `wallet-service.css`, `w3a-components.css`, and viewer CSS; no inline styles/scripts.
  - Inner iframe uses `sandbox="allow-scripts allow-same-origin"` so clipboard Permissions-Policy applies to the wallet origin.
- Overlay/Mounter (host page)
  - `overlay-styles.ts` and `mounter-styles.ts` use constructable sheets for geometry.
  - Fallback creates `<style nonce="…">` if `window.w3aNonce`/`window.litNonce` is provided (older engines only).

Dev and CI
- Enable strict dev CSP by setting `VITE_WALLET_DEV_CSP=strict` (CI already does this).
- Tests assert that the wallet-service route sends strict CSP and contains no `<style>` tags or `[style]` attributes.

Emitted CSS Assets
- The build copies all component CSS to `/sdk` and generates `w3a-components.css` from the palette:
- wallet-service.css, w3a-components.css, tx-tree.css, drawer.css, tx-confirmer.css,
    halo-border.css, passkey-halo-loading.css, padlock-icon.css,
    export-iframe.css, export-viewer.css, overlay.css.
- A build-time assertion (`scripts/assert-sdk-css-assets.mjs`) fails if any are missing.

Shadow DOM (opt‑in)
- Default is light DOM for TxTree to simplify CSP. If a consumer needs encapsulation, we can add an opt-in attribute to render TxTree in Shadow DOM; it won’t make rendering faster, but it can:
  - Improve encapsulation (style isolation),
  - Potentially reduce selector conflicts.
- Performance is typically neutral; initial paint may be slightly slower if styles must be fetched for the shadow root. The default remains light DOM.
