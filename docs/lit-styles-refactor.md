Lit Styles Refactor Plan

Objectives
- Enforce CSP without 'unsafe-inline' by eliminating inline styles.
- Externalize theme tokens and component CSS into static stylesheets.
- Co‑locate CSS under LitComponents/css and keep a single source of color tokens from palette.json.

Scope (LitComponents)
- Drawer: sdk/src/core/WebAuthnManager/LitComponents/Drawer
- TxTree: sdk/src/core/WebAuthnManager/LitComponents/TxTree
- Iframe Button Host: sdk/src/core/WebAuthnManager/LitComponents/IframeButtonWithTooltipConfirmer
- Iframe Tx Confirmer: sdk/src/core/WebAuthnManager/LitComponents/IframeTxConfirmer
- Export Private Key: sdk/src/core/WebAuthnManager/LitComponents/ExportPrivateKey
- Passkey Halo Loading: sdk/src/core/WebAuthnManager/LitComponents/PasskeyHaloLoading
- HaloBorder: sdk/src/core/WebAuthnManager/LitComponents/HaloBorder (defer JS‑driven animation changes)

Constraints
- Lit static styles = css injects <style> into Shadow DOM; for strict CSP, either hash/nonce or externalize.
- Avoid template style="…" and element.style.* writes that violate CSP.
- Preserve visual parity across dark/light themes and mobile behaviors (drag, hover, keyboard).

Theme + Tokens Source of Truth
- Colors/palette: sdk/src/theme/palette.json
  - Generated CSS variables in w3a-components.css via rolldown (with sdk/scripts/assert-palette-css.mjs in CI).
- Component tokens: colocated CSS under sdk/src/core/WebAuthnManager/LitComponents/css/*.css

Phases
1) Remove template inline styles and per‑node CSS var writes
   - TxTree: depth classes instead of per‑node --indent writes (done).
   - Replace styleMap/style="…" with classes and CSS vars.

2) Externalize component themes to CSS
   - tx-tree.css, modal-confirmer.css, button-with-tooltip.css (done, colocated).
   - w3a-components.css generated from palette.json (done, colocated fallback).

3) Deprecate runtime theme injections
   - Stop using applyStyles for theme tokens; rely on CSS vars.
   - Keep setCssVars for safe, CSP‑aware dynamic tokens (via adoptedStyleSheets).

4) Stop bootstrap inline style writes in iframes
   - Replace inline <style> in iframe srcdoc with <link href="…/wallet-service.css"> (in progress; first two hosts done).

5) Tackle Lit shadow CSS under strict CSP
   - Interim: inject SHA‑256 hashes for emitted shadow CSS into _headers.
   - Long‑term: fully externalize remaining static styles into css/*.css files and drop css`` where feasible.

Deliverables per Component
- Drawer
  - Externalize static styles to css/drawer.css.
  - Replace JS style.transform/transition writes with CSS vars and classes (dragging, vv-sync retained).
  - Acceptance: no style mutations on drawer/overlay except setCssVars; identical gestures & visuals.

- TxTree
  - Use css/tx-tree.css exclusively for theme tokens.
  - Remove TX_TREE_THEMES runtime mapping; keep interface as no‑op wrapper or deprecate.
  - Acceptance: no style="…"; depth classes drive indent; same look.

- Iframe Button Host
  - Remove srcdoc inline <style> (done) and link wallet-service.css.
  - Keep constructable stylesheet for per‑instance hover/base state (CSP‑compatible).
  - Acceptance: transparent first paint; tooltip/iframe sizing unchanged.

- Iframe Tx Confirmer (viewer-modal/drawer/tx-confirm-content/wrapper)
  - Externalize static styles to css/modal-confirmer-*.css as needed; keep tokens in modal-confirmer.css.
  - Acceptance: zero inline styles; theming via [theme] attrs + CSS vars.

- Export Private Key
  - Remove srcdoc inline <style> (done) and link wallet-service.css.
  - Consider externalizing viewer styles if needed; rely on w3a-components tokens.

- Passkey Halo Loading
  - Replace styleMap on icon containers with classes + CSS vars.
  - Acceptance: no inline style attributes; same visuals.

- HaloBorder
  - Keep as‑is for now per README (JS‑driven animation via CSS vars).

Acceptance Criteria
- No template style="…" or imperative element.style writes except via setCssVars adoptedStyleSheets path.
- Wallet iframes load with CSP style-src 'self' and no violations.
- Visual parity within ±1px; gestures and behaviors unchanged.

Validation
- Dev harness with strict CSP: templates/wallet-dist/_headers.
- E2E: sdk/src/__tests__/e2e/*, wallet-iframe tests, visual sanity on mobile.

Status Snapshot (2025-10-25)
- Colocated CSS complete; build copies from LitComponents/css (rolldown updated).
- Removed inline <style> in two iframe hosts and linked wallet-service.css.
- modal-confirmer.css, tx-tree.css, button-with-tooltip.css present under css/.
- Remaining: externalize Drawer, TxTree static styles; remove css`` in viewer-modal/drawer and button host where possible.

Next Steps (Implementation Queue)
1) Iframe hosts: verify no inline styles remain (done for ETX + Export).
2) PasskeyHaloLoading: drop styleMap usages in templates.
3) Drawer: map transform/transition to vars; move static CSS to css/drawer.css.
4) TxTree: migrate static styles from css`` into external file; deprecate TX_TREE_THEMES.
5) Confirmers: externalize static styles; ensure tokens from modal-confirmer.css.
6) CSP hashes (optional interim) for remaining css`` before full externalization.

