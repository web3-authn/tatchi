---
title: CSP for Lit Components
---

# CSP for Lit Components

This SDK’s wallet UI runs under a strict Content‑Security‑Policy on wallet pages:

```
style-src 'self';
style-src-attr 'none';
```

The core Lit components are designed to work without any inline `<style>` tags or `style="…"` attributes while preserving visuals and UX across modern browsers.

## What we do

- External CSS only
  - All static styles live in `/sdk/*.css` (e.g. `tx-tree.css`, `modal-confirmer.css`, `drawer.css`, `halo-border.css`, `passkey-halo-loading.css`).
- Adopt styles per component
  - Components call `ensureExternalStyles(root, 'file.css', 'data-marker')` to attach the stylesheet into a ShadowRoot (via `adoptedStyleSheets`) or inject one shared `<link rel="stylesheet">` in the document. The function resolves when the sheet is loaded, so components can gate first paint to avoid FOUC.
- Dynamic values via CSS variables
  - Components map runtime values (geometry, colors, tokens) to CSS custom properties with a constructable‑sheet path (no `element.style` writes). This keeps CSP clean and prevents inline mutations.
- Strict iframe surfaces
  - Iframe hosts link only external CSS/JS in `srcdoc`. We avoid inline scripts/styles. Clip‑path and sizing are passed via CSS variables and width/height attributes.

## User experience

- First paint without jank
  - Components that animate or rely on visuals (e.g., `PasskeyHaloLoading`, `HaloBorder`) defer first render until their CSS is ready using a double‑`requestAnimationFrame()` gate.
- Preloads for critical CSS
  - The wallet HTML preloads key styles (e.g., `drawer.css`, `tx-tree.css`, `halo-border.css`, `passkey-halo-loading.css`) so they’re fetched ahead of time.

## Dev & CI

- Dev strict‑CSP mode
  - Set `VITE_WALLET_DEV_CSP=strict` when running the example app to mirror production CSP.
- Tests
  - The repo includes a Playwright test that asserts the wallet route contains strict CSP and zero `<style>` tags or `[style]` attributes.
- Build checks
  - A build‑time assertion verifies that all required `/sdk/*.css` assets are present in the output.

## Edge cases and fallbacks

- Older engines w/o constructable stylesheets
  - Overlay/mounter utilities can fall back to a nonce‑bearing `<style>` tag if you set `window.w3aNonce` (or `window.litNonce`) and include that nonce in your CSP. Modern Chrome/Edge/Safari use `adoptedStyleSheets` and do not require a nonce.
- Shadow DOM
  - We default some components (like `TxTree`) to light DOM for simpler CSP and broader styling. If you need style encapsulation, an opt‑in Shadow DOM mode can be added; it doesn’t make rendering faster, it just isolates styles.

## Integration checklist

- Serve SDK assets under `/sdk/*` with CORS enabled.
- Ensure wallet route sends strict CSP shown above.
- Keep the Permissions‑Policy aligned with your wallet origin for clipboard/WebAuthn delegation.
- If you need older‑engine support for overlay geometry, add a CSP nonce and set `window.w3aNonce = '<your-nonce>'` on the host page.

## References

- Repo doc: `sdk/src/core/WebAuthnManager/LitComponents/README-CSP.md`
- CSS asset list is emitted by the SDK build; see `rolldown.config.ts`.

