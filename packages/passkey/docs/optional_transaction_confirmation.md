# Optional Transaction Confirmation

## Overview

This document describes the optional transaction confirmation feature that allows users to confirm transactions before TouchID signing. The feature provides an optional secure confirmation step between VRF WebAuthn verification and transaction signing in the WASM signer worker, with configurable behavior and UI modes.

## Architecture

The confirmation flow works as follows:

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Frontend      │     │  WASM Worker     │     │   IndexedDB     │
│                 │     │                  │     │                 │
│  1. Initiate ───┼────▶│ 2. VRF Verify    │     │  User Settings  │
│     signing     │     │                  │     │  - confirmTx    │
│                 │     │ 3. Check Setting │◀────┤  - confirmLevel │
│  5. Show Dialog │◀────┤ 4. Request       │     │                 │
│                 │     │    Confirmation  │     └─────────────────┘
│  6. User Action ├────▶│                  │
│                 │     │ 7. Sign or Abort │
└─────────────────┘     └──────────────────┘
```

## Confirmation Modes

### Auto Proceed Mode
- Shows a modal with transaction details and loading indicator
- Automatically proceeds to TouchID prompt after 2 seconds
- User can cancel during the 2-second window
- Provides context while maintaining smooth UX

### Require Click Mode
- Shows a modal with "Cancel" and "Confirm & Sign" buttons
- User must explicitly click "Confirm & Sign" to proceed
- Provides full control over the confirmation process

## Configuration

### SignerWorkerManager Settings

```typescript
// Enable/disable pre-confirmation flow
signerWorkerManager.setPreConfirmFlow(true);

// Set confirmation behavior
signerWorkerManager.setConfirmBehavior('autoProceed'); // or 'requireClick'
```

### UI Modes

The confirmation UI supports two rendering modes:

- **Modal**: Fullscreen overlay with backdrop
- **Inline**: Embedded within a provided container

## Progress Steps

The confirmation flow integrates with the progress tracking system:

1. **UserConfirmation** (Step 1): Requesting user confirmation
2. **ContractVerification** (Step 3): Verifying credentials with contract
3. **WebauthnAuthentication** (Step 4): Authenticating with WebAuthn
4. **AuthenticationComplete** (Step 5): Authentication completed
5. **TransactionSigningProgress** (Step 6): Signing transactions
6. **TransactionSigningComplete** (Step 7): Transactions signed successfully

## Security Features

### Digest Verification
- Transaction intent is canonicalized and hashed
- Digest is verified before and after signing
- Prevents transaction tampering during confirmation

### Secure Communication
- Uses MessageChannel for secure worker-main thread communication
- Nonce-based request/response validation
- Timeout protection (30-60 seconds)

### Closed Shadow DOM
- Confirmation UI rendered in closed Shadow DOM
- Prevents host application tampering
- Limited theming via CSS custom properties

## API Usage

### Basic Usage

```typescript
// Enable confirmation flow
signerWorkerManager.setPreConfirmFlow(true);
signerWorkerManager.setConfirmBehavior('requireClick');

// Sign transactions (confirmation will be requested automatically)
const result = await passkeyManager.signTransactionsWithActions({
  transactions: [...],
  // ... other parameters
});
```

### Custom Confirmation Handler

```typescript
// Handle confirmation requests
signerWorkerManager.onSecureConfirmRequest = async (message) => {
  // Custom confirmation logic
  const confirmed = await showCustomConfirmationDialog(message.data);
  return confirmed;
};
```

## Error Handling

- **Timeout**: If confirmation takes too long, transaction is rejected
- **Digest Mismatch**: If transaction intent changes, signing is aborted
- **User Rejection**: If user cancels, transaction is rejected
- **Credential Failure**: If TouchID fails, transaction is rejected

## UI Components

### SecureTxConfirmElement

A LitElement component that provides the confirmation UI:

```typescript
import { mountSecureTxConfirm } from './Components';

const confirmed = await mountSecureTxConfirm({
  summary: {
    to: 'example.near',
    amount: '5 NEAR',
    method: 'Transfer',
    fingerprint: 'abc123...'
  },
  actionsJson: JSON.stringify(actions),
  mode: 'modal'
});
```

### Theming

Limited theming is supported via CSS custom properties:

```css
:host {
  --pk-color-bg: #ffffff;
  --pk-color-fg: #000000;
  --pk-color-accent: #007AFF;
  --pk-font-family: system-ui, -apple-system, sans-serif;
  --pk-font-size: 14px;
  --pk-radius: 8px;
  --pk-spacing: 12px;
  --pk-z-index: 2147483647;
  --pk-backdrop: rgba(0, 0, 0, 0.5);
}
```

## Integration with Registration Flow

The confirmation system also supports registration flows:

- Detects registration vs authentication flows
- Uses appropriate credential serialization
- Extracts both PRF outputs for registration
- Maintains security throughout the process

## Security Considerations

1. **Confirmation Bypass Prevention**: Worker enforces confirmation before proceeding
2. **Digest Verification**: Transaction intent is verified before and after signing
3. **Replay Protection**: Unique request IDs prevent replay attacks
4. **Isolated UI**: Closed Shadow DOM prevents host application tampering
5. **Secure Communication**: MessageChannel provides secure worker-main thread communication

## Developer Experience

The confirmation system is designed to be:

- **Non-intrusive**: Can be disabled for simple use cases
- **Configurable**: Multiple UI modes and behaviors
- **Secure**: Multiple layers of security verification
- **User-friendly**: Smooth UX with appropriate feedback
- **Extensible**: Custom confirmation handlers supported
