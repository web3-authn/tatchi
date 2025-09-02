# WebAuthn Iframe Lit Components

## What Are Iframe Lit Components?

- Lit custom elements that render UI, but live inside a sandboxed iframe to avoid CSS/DOM interference and to enable precise clipping of interactive areas.
- The iframe hosts a single root element (e.g., `<embedded-tx-button>`), which composes smaller components like the tooltip transaction tree.

Key components:
- Embedded Transaction Button: Iframe host + embedded element that shows a button and on hover displays a tooltip with transaction details.
- TooltipTxTree: A tiny, dependency‑free tree component used to visualize transactions, actions, and arguments.

## Initialization (Iframe Bootstrap Scripts)

The parent page never directly manipulates DOM inside the iframe. Instead, it sends messages to a tiny bootstrap module that:
- Loads the embedded element script inside the iframe.
- Positions the embedded element precisely (before measuring geometry).
- Performs an initial geometry handshake (HS1…HS5) so the parent can apply a clip‑path that only exposes the button/tooltip areas.

Files:
- `IframeButtonWithTooltipConfirmer/iframe-button-bootstrap-script.ts`: Child‑side ESM bootstrap handling READY, HS1_INIT, geometry requests/results, and style/data updates.
- `IframeModalConfirmer/iframe-modal-bootstrap-script.ts`: Same pattern for the modal variant.

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

Tip: When changing dimensions (tooltip width/height or modal size), prefer updating the theme objects or the `tooltipPosition` prop so geometry and clip‑path remain aligned.


## Lit Components: Editing Guide

When renaming Lit component files, several files must be updated to maintain consistency across the build system. Follow this checklist:

#### 1. Rolldown Configuration (`packages/passkey/rolldown.config.ts`)
- Update entry points in the `input` configuration
- Example:
  ```typescript
  // Before
  input: {
    'iframe-button': 'src/core/WebAuthnManager/LitComponents/IframeButtonWithTooltipConfirmer/IframeButtonHost.ts',
    // ...
  }

  // After
  input: {
    'iframe-button': 'src/core/WebAuthnManager/LitComponents/IframeButtonWithTooltipConfirmer/IframeButtonHost.ts',
    // ...
  }
  ```

### 2. Update Build Scripts

#### SDK Asset Copy Script (`packages/passkey/scripts/copy-sdk-assets.sh`)
- This script typically doesn't need updates as it copies based on build output names
- Verify that the build output names match expectations


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
- `packages/passkey/scripts/copy-sdk-assets.sh` - Asset copying (usually no changes needed)
- `packages/passkey/docs/*.md` - Documentation files
- Any test files in `packages/passkey/src/__tests__/`


## Components

- **IframeButtonWithTooltipConfirmer/**: Transaction confirmation components with iframe isolation
- **ModalTxConfirmElement.ts**: Modal transaction confirmation dialog
- **renderUtils.ts**: Shared rendering utilities for Lit components
