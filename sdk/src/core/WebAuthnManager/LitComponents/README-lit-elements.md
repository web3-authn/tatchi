# WebAuthn Iframe Lit Components

## What Are Iframe Lit Components?

Lit‑based web components that power the wallet UI in two contexts:

- Embedded on the host app (sandboxed child iframe)
  - `<w3a-tx-button-host>` mounts a child srcdoc iframe and hydrates `<w3a-button-with-tooltip>` via a tiny bootstrap module.
  - Purpose: perfect visual isolation and precise clipping for the tooltip/button without leaking styles into the host page.

- Rendered inside the wallet iframe (no extra iframe)
  - `<w3a-modal-tx-confirmer>` and `<w3a-drawer-tx-confirmer>` render directly in the wallet iframe (wallet origin).
  - Shared building blocks include `<w3a-drawer>`, `<w3a-tx-tree>`, `<w3a-halo-border>`, and `<w3a-passkey-halo-loading>`.
  - The export viewer uses an additional iframe host: `<w3a-export-viewer-iframe>` + `<w3a-export-key-viewer>`.

All components are CSP‑safe: static CSS is externalized under `/sdk/*` and dynamic values are applied via constructable stylesheets (no inline styles or `<style>` tags). TxTree defaults to light DOM (opt‑in Shadow DOM via `shadow-dom`).

## Components

- IframeButtonWithTooltipConfirmer: iframe host + embedded tooltip button (bootstrap hydrates the child)
- IframeTxConfirmer: modal and drawer variants for confirmation UI
- Drawer: reusable sliding container used by the drawer variant
- TxTree: lightweight, themeable transaction tree
- HaloBorder and PasskeyHaloLoading: animated visuals used in confirm flows
- ExportPrivateKey: export viewer (iframe host + viewer + bootstrap)

See the component index below for file paths and tags.

## Runtime Architecture

- Parent never manipulates DOM inside the embedded iframe. A small bootstrap script runs in the child and communicates via postMessage.
- Bootstrap responsibilities: load the embedded element, position it, measure layout, and respond with geometry.
- Flow of updates: parent posts typed messages (e.g., SET_TX_DATA, SET_STYLE); child applies props to the element and triggers re-render; child returns measurements when needed.

## Editing Components and Styles

These components use a small base helper and a variable‑driven styling approach:
- `LitElementWithProps.ts` handles the Lit upgrade race and exposes `applyStyles()` that maps JS objects to `--w3a-*` CSS variables.
- Component themes (e.g., tooltip tree, modal) are plain objects applied through `applyStyles` so you can override any section without touching the component internals.

For guidance on editing properties, style sections, and the CSS variable naming convention, see:
- `./lit-element-with-props.md` – how properties are upgraded and how `applyStyles` maps section/key pairs to CSS vars.

## Styles and CSP

We no longer inject inline styles or `<style>` tags. All components follow strict CSP (no `unsafe-inline`) using:

- External CSS files served under the SDK base (default `/sdk/*`).
- Constructable stylesheets (adoptedStyleSheets) for both static CSS and dynamic CSS variables.
- First‑paint gating to avoid FOUC while styles load.

Key utilities:
- `css/css-loader.ts` → `ensureExternalStyles(root, assetName, marker)` adopts external CSS (ShadowRoot, srcdoc import, or head `<link>` fallback).
- `LitElementWithProps#setCssVars(vars)` writes variables via constructable stylesheets (never `element.style`).

Tokens and scoping:
- Theme tokens come from `css/w3a-components.css`.
- Component variables follow `--w3a-${component}__${section}__${prop}`.

Other notes:
- Base resolution: `asset-base.ts#resolveEmbeddedBase()` prefers `window.__W3A_WALLET_SDK_BASE__`, else `/sdk/`.
- Shadow vs light DOM: TxTree defaults to light DOM; others use Shadow DOM and adopt styles there.

### CSS assets by component

- Shared theme/tokens: `css/w3a-components.css`
- TxTree visuals: `css/tx-tree.css`
- Tx confirmer layout/tokens: `css/tx-confirmer.css`
- Drawer (when used): `css/drawer.css`
- Button host + tooltip: `css/button-with-tooltip.css`, `css/iframe-button-host.css`
- Halo ring + loading icon: `css/halo-border.css`, `css/passkey-halo-loading.css`, `css/padlock-icon.css`
- Export private key UI: `css/export-iframe.css`, `css/export-viewer.css`

These assets are emitted under the SDK base and are loaded at runtime through `ensureExternalStyles()`.

Examples omitted for brevity; see HaloBorder, PasskeyHaloLoading, and Modal viewer for usage.

## Subcomponent Docs

- TxTree: `./TxTree/README.md`
- Iframe button + tooltip confirmer: `./IframeButtonWithTooltipConfirmer/README.md`


## Confirm UI API

- File: `sdk/src/core/WebAuthnManager/LitComponents/confirm-ui.ts`
- Element contract: `sdk/src/core/WebAuthnManager/LitComponents/confirm-ui-types.ts`

Confirm UI is container‑agnostic and driven by `uiMode: 'skip' | 'modal' | 'drawer'`.
- Element contract: `ConfirmUIElement` supports `deferClose` and `close(confirmed)`.
- Helpers: `mountConfirmUI()` and `awaitConfirmUIDecision()` mount and coordinate lifecycle.


## Editing Guide (brief)

When adding or refactoring components:
- Expose a single defining module that calls `customElements.define()`.
- If moving/renaming, update build entries and re‑exports so the defining chunk still emits under `/sdk/*`.
- In the wallet host, dynamically import the element module before `document.createElement()` (see tree‑shaking section).
- Ensure required CSS assets exist in `css/` and are adopted via `ensureExternalStyles()`.


## Component Index

- IframeButtonWithTooltipConfirmer/
  - `iframe-host.ts` — `<w3a-tx-button-host>`; mounts embedded button inside an iframe
  - `ButtonWithTooltip.ts` — `<w3a-button-with-tooltip>` embedded element (child iframe)
  - `iframe-tx-button-bootstrap-script.ts` — child bootstrap module

- IframeTxConfirmer/
  - `viewer-modal.ts` — `<w3a-modal-tx-confirmer>`
  - `viewer-drawer.ts` — `<w3a-drawer-tx-confirmer>`
  - `tx-confirmer-wrapper.ts` — inline wrapper selects variant

- Drawer/ — `index.ts` — `<w3a-drawer>`
- TxTree/ — `index.ts` — `<w3a-tx-tree>` (light DOM by default)
- HaloBorder/ — `index.ts` — `<w3a-halo-border>`
- PasskeyHaloLoading/ — `index.ts` — `<w3a-passkey-halo-loading>`

- ExportPrivateKey/
  - `viewer.ts` — `<w3a-export-key-viewer>`
  - `iframe-host.ts` — `<w3a-export-viewer-iframe>`
  - `iframe-export-bootstrap-script.ts` — child bootstrap

- Base / helpers
  - `LitElementWithProps.ts` — CSP‑safe CSS variable application
  - `confirm-ui.ts`, `confirm-ui-types.ts` — confirm UI API and types
  - `css/css-loader.ts` — external CSS adoption
  - `tags.ts` — tag names and helpers


## Wallet-Iframe Lit Components: Tree-shaking Gotchas

When adding a new Lit component that must render inside the wallet iframe host (e.g., a new drawer or modal), there are a few integration pitfalls that can make the custom element appear in the DOM but never upgrade (empty UI). This section documents the fixes and a repeatable checklist.

### Core issue we hit

- The wallet host appended a custom element tag (e.g., `<w3a-export-viewer-iframe>`), but the defining module that calls `customElements.define()` was not executed in that runtime. Depending on bundler tree‑shaking and sideEffects settings, a pure side‑effect import may be omitted. Result: element never upgrades, so the inner iframe/bootstrap never runs.

### The fix

- Do not rely solely on a static, side‑effect import. Perform a dynamic import at the use‑site right before creating the element. This guarantees the defining module runs:

  ```ts
  // Before creating the element
  await import('../../LitComponents/ExportPrivateKey/host');
  const host = document.createElement('w3a-export-viewer-iframe');
  document.body.appendChild(host);
  ```

- Keep the static import too (for type graphs and when bundlers honor side‑effects), but the dynamic import makes it robust.

Implementation reference:
- `src/core/WebAuthnManager/SignerWorkerManager/confirmTxFlow/handleSecureConfirmRequest.ts` (SHOW_SECURE_PRIVATE_KEY_UI path) dynamically imports the iframe host module before creating the element.

### Embedded assets (dev)
- Bundles load from `/sdk/` (viewer + bootstrap) under `dist/esm/sdk/`.
- Dev plugin serves JS/CSS with correct MIME and COEP/CORP.
- Sanity: `/sdk/<bundle>.js` returns 200; no “Unknown custom element” warnings.

### Sticky overlay for two‑phase flows

- Some flows are two‑phase (e.g., decrypt private key with PRF, then show the viewer). The PM request that kicks off the flow should mark the overlay sticky so the wallet iframe isn’t hidden before the second UI phase mounts:

  ```ts
  // In wallet iframe client router
  await this.post({
    type: 'PM_EXPORT_NEAR_KEYPAIR_UI',
    payload: { nearAccountId, variant, theme },
    options: { sticky: true },
  });

  // Only hide overlay if request is not sticky
  if (!this.progressBus.isSticky(requestId)) this.hideFrameForActivation();
  ```

Implementation reference:
- `src/core/WalletIframe/client/router.ts` sets `options: { sticky: true }` for the export‑UI call and guards overlay hiding with `isSticky()`.

### Build entries
- Add both: `iframe-<feature>-bootstrap.js` and `<feature>-viewer.js` (emit under `dist/esm/sdk/`).

### Hard rules (never break again)
- Always ensure definition at use‑site: before `document.createElement('w3a-*')`, dynamically import the module that calls `customElements.define()` for that tag.
- Never rely only on side‑effect imports for elements rendered inside the wallet iframe.
- Centralize tag names in `tags.ts` and prefer a small helper to ensure definition.

### Use‑site helper pattern

Create a tiny helper to guarantee the module runs before creating the element:

```ts
// sdk/src/core/WebAuthnManager/LitComponents/ensure-defined.ts
export async function ensureDefined(tag: string, loader: () => Promise<unknown>) {
  if (!customElements.get(tag)) await loader();
}

// Usage (export viewer)
import { W3A_EXPORT_VIEWER_IFRAME_ID } from '../tags';
import { ensureDefined } from '../ensure-defined';
await ensureDefined(W3A_EXPORT_VIEWER_IFRAME_ID, () => import('../ExportPrivateKey/iframe-host'));
const host = document.createElement(W3A_EXPORT_VIEWER_IFRAME_ID);
document.body.appendChild(host);
```

Reference in codebase:
- `SignerWorkerManager/confirmTxFlow/flows/common.ts` dynamically imports `ExportPrivateKey/iframe-host` before `createElement('w3a-export-viewer-iframe')`.

### Keep‑imports in wallet host (secondary defense)

Keep critical element definitions alive in the wallet host runtime:

```ts
// sdk/src/core/WalletIframe/host/WalletHostElements.ts
import { IframeButtonHost as __KeepTxButton } from '../../WebAuthnManager/LitComponents/IframeButtonWithTooltipConfirmer/iframe-host';
import { IframeExportHost as __KeepExportViewerIframe } from '../../WebAuthnManager/LitComponents/ExportPrivateKey/iframe-host';
const __ensure = [__KeepTxButton, __KeepExportViewerIframe];
```

### Dev/Test guardrails
- Unit: keep the SHOW_SECURE_PRIVATE_KEY_UI test that verifies the viewer remains mounted (already present under `src/__tests__/unit/confirmTxFlow.defensivePaths.test.ts`).
- E2E: add a production‑bundle run that triggers export viewer to catch treeshaking differences from dev.
- Lint/check: optional script that fails CI if a `document.createElement('w3a-…')` call is not preceded by an `ensureDefined(...)` in the same module.
- Dev observer: optional `MutationObserver` in wallet host that warns if a `w3a-*` element is un‑upgraded for >250ms after insertion.

### Build config notes
- `package.json#sideEffects` cannot protect intra‑bundle treeshaking across all tools. The reliable fix is dynamic import at use‑site, plus keep‑imports in the wallet host.

## Importing and Composing (quick checklist)

- Define the element in a standalone module and `customElements.define()` it.
- In wallet host paths, dynamically `await import('<module>')` before `document.createElement('<tag>')`.
- When composing, keep required sub‑elements referenced so they aren’t tree‑shaken (e.g., private field or `static keepDefinitions`).
- For iframe bootstraps, set variant flags before element creation.
- Use two‑phase close (`deferClose`) for animated flows; close after animation.
- Ensure srcdoc loads viewer + bootstrap from `/sdk/` with `type="module"`.
- Validate in dev: `/sdk/*.js` 200; element upgrades; READY/SET_* messages flow.

## Troubleshooting Styles + FOUC

- Unstyled component: ensure correct SDK base; confirm a single head `<link data-w3a-…>` or adopted sheet; check `/sdk/*.css` fetches succeed without CSP errors.
- FOUC: gate first paint on `ensureExternalStyles()` settling (see HaloBorder, PasskeyHaloLoading, Modal viewer patterns).
- CSP violations: never write `element.style`; use `setCssVars()` + external CSS.
