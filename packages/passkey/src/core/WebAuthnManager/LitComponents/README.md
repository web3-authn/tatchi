# Lit Components: Editing Guide

When renaming Lit component files, several files must be updated to maintain consistency across the build system. Follow this checklist:

#### 1. Rolldown Configuration (`packages/passkey/rolldown.config.ts`)
- Update entry points in the `input` configuration
- Example:
  ```typescript
  // Before
  input: {
    'iframe-button': 'src/core/WebAuthnManager/LitComponents/SecureTxConfirmButton/IframeButton.ts',
    // ...
  }

  // After
  input: {
    'iframe-button': 'src/core/WebAuthnManager/LitComponents/SecureTxConfirmButton/IframeButtonHost.ts',
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

- **SecureTxConfirmButton/**: Transaction confirmation components with iframe isolation
- **ModalTxConfirmElement.ts**: Modal transaction confirmation dialog
- **renderUtils.ts**: Shared rendering utilities for Lit components
