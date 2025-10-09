# WebAuthn Iframe Lit Components

## What Are Iframe Lit Components?

- Lit custom elements that render UI, but live inside a sandboxed iframe to avoid CSS/DOM interference and to enable precise clipping of interactive areas.
- The iframe hosts a single root element (e.g., `<embedded-tx-button>`), which composes smaller components like the tooltip transaction tree.

Key components:
- Embedded Transaction Button: Iframe host + embedded element that shows a button and on hover displays a tooltip with transaction details.
- TxTree: A tiny, dependency‑free tree component used to visualize transactions, actions, and arguments.

## Initialization (Iframe Bootstrap Scripts)

The parent page never directly manipulates DOM inside the iframe. Instead, it sends messages to a tiny bootstrap module that:
- Loads the embedded element script inside the iframe.
- Positions the embedded element precisely (before measuring geometry).
- Performs an initial geometry handshake (HS1…HS5) so the parent can apply a clip‑path that only exposes the button/tooltip areas.

Files:
- `IframeButtonWithTooltipConfirmer/iframe-tx-button-bootstrap-script.ts`: Child‑side ESM bootstrap handling READY, HS1_INIT, geometry requests/results, and style/data updates. The emitted module name is `iframe-tx-button-bootstrap.js`.
- `IframeTxConfirmer/tx-confirmer-wrapper.ts`: Inline wrapper that chooses modal or drawer.

## Prop Flow and Data Updates

Props and updates are delivered via `postMessage`:
- Parent (host) Lit component builds an init payload and sends it to the iframe (HS1_INIT).
- Subsequent changes (tx data, loading state, theme, tooltip position, button styles) are sent as typed messages (e.g., SET_TX_DATA, SET_STYLE).
- The bootstrap receives these and calls methods on the embedded element (`updateProperties`, `updateButtonStyles`) or sets properties directly, then requests a render/update. The embedded element measures its tooltip and returns geometry back to the parent when needed.

## Editing Components and Styles

These components use a small base helper and a variable‑driven styling approach:
- `LitElementWithProps.ts` handles the Lit upgrade race and exposes `applyStyles()` that maps JS objects to `--w3a-*` CSS variables.
- Component themes (e.g., tooltip tree, modal) are plain objects applied through `applyStyles` so you can override any section without touching the component internals.

For guidance on editing properties, style sections, and the CSS variable naming convention, see:
- `./lit-element-with-props.md` – how properties are upgraded and how `applyStyles` maps section/key pairs to CSS vars.

## Subcomponent Docs

- Tooltip tree: `./TooltipTxTree/README.md`
- Iframe button + tooltip confirmer: `./IframeButtonWithTooltipConfirmer/README.md`
- Arrow register button: `./ArrowRegisterButton/index.ts` (emits `arrow-submit` when proceeding)

Tip: When changing dimensions (tooltip width/height or modal size), prefer updating the theme objects or the `tooltipPosition` prop so geometry and clip‑path remain aligned.


## Confirm UI API

- File: `passkey-sdk/src/core/WebAuthnManager/LitComponents/confirm-ui.ts`
- Element contract: `passkey-sdk/src/core/WebAuthnManager/LitComponents/confirm-ui-types.ts`

Confirm UI is container‑agnostic and driven by `uiMode: 'skip' | 'modal' | 'drawer'`.

- ConfirmUIElement: Minimal element API implemented by both containers.
  - deferClose: When true, host controls removal (two‑phase close).
  - close(confirmed): Optional programmatic close.

Example usage (inline wrapper rendered inside the wallet iframe):

```ts
import { mountConfirmUI, awaitConfirmUIDecision } from '@/core/WebAuthnManager/LitComponents/confirm-ui';

// Mount + auto‑proceed (e.g., show loading then close)
const handle = await mountConfirmUI({
  ctx,
  summary,                // TransactionSummary
  txSigningRequests,      // optional
  vrfChallenge,           // optional
  loading: true,
  theme: 'dark',
  uiMode: 'drawer',       // 'modal' | 'drawer' | 'skip'
  nearAccountIdOverride: accountId, // optional
});
// ... do work, then close
handle.close(true);

// Or await an explicit decision from the UI
const { confirmed, handle: h } = await awaitConfirmUIDecision({
  ctx,
  summary,
  txSigningRequests,
  vrfChallenge,
  theme: 'dark',
  uiMode: 'modal',
  nearAccountIdOverride: accountId,
});
if (!confirmed) h.close(false);
```


## Lit Components: Editing Guide

When renaming Lit component files, several files must be updated to maintain consistency across the build system. Follow this checklist:

#### 1. Rolldown Configuration (`packages/passkey/rolldown.config.ts`)
- Update entry points in the `input` configuration

### 2. Dev Asset Serving

Use the Vite dev plugin to serve SDK assets at `/sdk/*` directly from the SDK `dist/` directory (no manual copy):
- Plugin: `@tatchi/sdk/plugins/vite`
- Example usage (in `vite.config.ts`):
  ```ts
  import { tatchiDev } from '@tatchi/sdk/plugins/vite'
  export default defineConfig({
    plugins: [
      web3authnDev({ mode: 'self-contained', setDevHeaders: false }),
    ],
  })
  ```


### 3. Update Class Names and Exports

In the renamed component file:
- Update the class name to match the new filename (following PascalCase convention)
- Update the `customElements.define()` call to use the new class name
- Update the default export to match the new class name

Example:
```typescript
// Before: IframeButton.ts
export class IframeButton extends LitElement {
  // ...
}
customElements.define(IFRAME_BUTTON_ID, IframeButton);
export default IframeButton;

// After: IframeButtonHost.ts
export class IframeButtonHost extends LitElement {
  // ...
}
customElements.define(IFRAME_BUTTON_ID, IframeButtonHost);
export default IframeButtonHost;
```

### 4. Update Documentation

- **Component README**: Update component overview and file references
- **API Documentation**: Update class names and file paths in docs
- **Architecture Docs**: Update component references in architectural documentation


### Common Files to Check

- `packages/passkey/rolldown.config.ts` - Build entry points
- `packages/passkey/src/core/types/components.ts` - Component exports
- Dev server config (Vite) that serves `/sdk/*` via the plugin
- `packages/passkey/docs/*.md` - Documentation files
- Any test files in `packages/passkey/src/__tests__/`


## Components

- **IframeButtonWithTooltipConfirmer/**: Transaction confirmation components with iframe isolation
- **ModalTxConfirmElement.ts**: Modal transaction confirmation dialog
- **renderUtils.ts**: Shared rendering utilities for Lit components


## Wallet-Iframe Lit Integration: Gotchas & Checklist

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

### Embedded asset serving (dev)

- Embedded UIs that render in a child srcdoc iframe must import their bundles from `/sdk/` (viewer + bootstrap). Rolldown produces these under `dist/esm/sdk/`.
- The Vite dev plugin serves `/sdk/**` by probing `dist/esm/sdk` (canonical), with fallbacks to `dist/esm` and `dist` so no manual copy is needed:
  - `/sdk/export-private-key-viewer.js`
  - `/sdk/iframe-export-bootstrap.js`
- Wallet host initializes the base: `window.__W3A_EMBEDDED_BASE__ = '/sdk/'` during `PM_SET_CONFIG` handling.

Sanity checks in the wallet origin devtools:
- Network 200 for `/sdk/<bundle>.js` requests
- Console: no “Unknown custom element” warnings; the element should upgrade and post READY back to parent

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

### Rolldown entries to include

- For any new iframe‑hosted UI:
  - Add a bundle for the child iframe bootstrap (e.g., `iframe-<feature>-bootstrap.js`)
  - Add a bundle for the viewer element (`<feature>-viewer.js`)
- Ensure both end up under `dist/esm/sdk/`

Implementation reference:
- `rolldown.config.ts` entries for:
  - `src/core/WebAuthnManager/LitComponents/ExportPrivateKey/iframe-export-bootstrap-script.ts`
  - `src/core/WebAuthnManager/LitComponents/ExportPrivateKey/viewer.ts`

## Importing and Composing Lit Components

### Quick checklist (copy/paste for new components)

1) Define the custom element and export it from a standalone module (ensures a direct defining chunk in dist/esm/sdk)
2) In the wallet host code path that uses it, add a dynamic `await import('<module>')` before `document.createElement('<tag>')`
3) Prevent tree-shaking of required sub-elements when composing
   - If your component composes other custom elements (e.g., Drawer, TxTree), reference them in a private field so bundlers don’t drop the import:
     ```ts
     import DrawerElement from '../Drawer';
     import TxTree from '../TxTree';
     export class MyElement extends LitElementWithProps {
       private _ensureDrawerDefinition = DrawerElement;
       private _ensureTreeDefinition = TxTree;
       // ...
     }
     ```
   - For iframe bootstraps, import side-effect modules for variants you may dynamically create (e.g., `'./DrawerTxConfirmer'`).
4) Set variant before creating elements in iframe bootstraps
   - Apply any `variant`/mode flags before calling your `ensureElement()` function so the correct tag is created on first paint.
5) Two‑phase close in embedded flows
   - Set `deferClose = true` on the inner element and have the bootstrap/host call `close(confirmed)` after animations complete.
3) Ensure the child iframe HTML (srcdoc) loads the viewer and bootstrap with `type="module"` under `__W3A_EMBEDDED_BASE__`
4) Add rolldown entries so both viewer and bootstrap bundles are emitted
5) For two‑phase or long‑lived UIs, mark the wallet request sticky and hide the overlay only on WALLET_UI_CLOSED
6) Dev validate: Network 200 for `/sdk/*.js`; element upgrades; READY/SET_* messages flow between parent and child

Following this checklist prevents “empty custom element” regressions when introducing new Lit components into the wallet‑iframe architecture.
