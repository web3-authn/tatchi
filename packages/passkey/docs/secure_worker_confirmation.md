# Secure Worker Confirmation

## Overview

The secure worker confirmation system provides a tamper-proof transaction confirmation mechanism that operates directly from within the WASM worker environment. This approach prevents malicious client-side code from intercepting or modifying confirmation dialogs, ensuring that transaction confirmations are secure and trustworthy.

## Architecture

The secure confirmation system uses a multi-layered approach:

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   WASM Worker   │     │  Main Thread     │     │   User Interface │
│                 │     │                  │     │                 │
│ 1. Generate     │────▶│ 2. Render        │────▶│ 3. User         │
│    Confirmation │     │    Secure UI     │     │    Confirmation │
│    Request      │     │                  │     │                 │
│                 │     │ 4. Collect       │◀────┤                 │
│ 6. Verify &     │◀────│    Credentials   │     │                 │
│    Sign         │     │                  │     │                 │
└─────────────────┘     └──────────────────┘     └─────────────────┘
```

## Security Features

### Digest Verification
- Transaction intent is canonicalized and hashed using SHA-256
- Digest is verified before and after signing to prevent tampering
- Ensures transaction integrity throughout the confirmation process

### Secure Communication
- Uses MessageChannel for secure worker-main thread communication
- Nonce-based request/response validation prevents replay attacks
- Timeout protection (30-60 seconds) prevents hanging transactions

### Closed Shadow DOM
- Confirmation UI rendered in closed Shadow DOM prevents host application tampering
- Limited theming via CSS custom properties maintains security
- Isolated from potentially malicious JavaScript context

## Confirmation Flow

### 1. Pre-Confirmation Mode
When `preConfirm` is enabled, the worker requests confirmation before contract verification:

1. **Worker**: Generates transaction summary and digest
2. **Worker**: Sends confirmation request to main thread
3. **Main Thread**: Renders secure confirmation UI
4. **User**: Reviews transaction details and confirms/rejects
5. **Main Thread**: Collects credentials via TouchID prompt
6. **Worker**: Receives confirmation decision and credentials
7. **Worker**: Proceeds with contract verification and signing

### 2. Legacy Mode
When `preConfirm` is disabled, confirmation happens after contract verification:

1. **Worker**: Performs contract verification with provided credentials
2. **Worker**: Generates transaction summary and digest
3. **Worker**: Sends confirmation request to main thread
4. **Main Thread**: Renders secure confirmation UI
5. **User**: Reviews transaction details and confirms/rejects
6. **Worker**: Proceeds with signing if confirmed

## Confirmation Modes

### Auto Proceed Mode
- Shows modal with transaction details and loading indicator
- Automatically proceeds to TouchID prompt after 2-second delay
- User can cancel during the delay window
- Provides context while maintaining smooth UX

### Require Click Mode
- Shows modal with "Cancel" and "Confirm & Sign" buttons
- User must explicitly click "Confirm & Sign" to proceed
- Provides full control over the confirmation process

## Implementation Details

### Worker-Side Implementation

The WASM worker uses the `request_user_confirmation` function to initiate the confirmation process:

```rust
// In confirm_tx_details.rs
pub async fn request_user_confirmation(
    request: &SignTransactionsWithActionsRequest,
    logs: &mut Vec<String>,
) -> Result<ConfirmationResult, String> {
    // Generate transaction summary
    let summary = create_transaction_summary(request);

    // Compute intent digest
    let intent_digest = compute_intent_digest(request);

    // Send confirmation request to main thread
    let confirmation_data = serde_json::json!({
        "requestId": generate_request_id(),
        "summary": summary,
        "intentDigest": intent_digest,
        "actionsJson": serde_json::to_string(&request.tx_signing_requests)?
    });

    // Await confirmation response
    let result = await_secure_confirmation(&confirmation_data).await?;

    // Parse and return result
    parse_confirmation_result(&result)
}
```

### Main Thread Implementation

The main thread handles confirmation requests through the `SignerWorkerManager`:

```typescript
// In signerWorkerManager.ts
private async handleSecureConfirmRequest(message: SecureConfirmMessage, worker: Worker): Promise<void> {
    // Parse transaction summary
    const summary = this.parseTransactionSummary(message.data.summary);
    const isRegistration = summary?.isRegistration || (summary as any)?.type === 'registration';

    // Render confirmation UI based on behavior
    let confirmed = false;
    if (this.confirmationUIMode === 'shadow' && this.confirmBehavior === 'autoProceed') {
        // Auto proceed mode with 2-second delay
        const handle = mountSecureTxConfirmWithHandle({ /* ... */ });
        await new Promise(resolve => setTimeout(resolve, 2000));
        confirmed = true;
    } else {
        // Require explicit confirmation
        confirmed = await this.renderConfirmUI(transactionSummary, message.data.actions);
    }

    // Collect credentials if confirmed
    if (confirmed) {
        const credential = await this.touchIdPrompt.getCredentials({ /* ... */ });
        const dualPrfOutputs = extractPrfFromCredential({ credential, secondPrfOutput: isRegistration });

        // Serialize credential appropriately
        const serializedCredential = isRegistration
            ? serializeRegistrationCredentialWithPRF({ credential, firstPrfOutput: true, secondPrfOutput: true })
            : serializeAuthenticationCredentialWithPRF({ credential });

        decision.credential = serializedCredential;
        decision.prfOutput = dualPrfOutputs.chacha20PrfOutput;
    }

    // Send decision back to worker
    worker.postMessage({
        type: SecureConfirmMessageType.PASSKEY_SECURE_CONFIRM_DECISION,
        data: decision
    });
}
```

## Progress Integration

The confirmation system integrates with the progress tracking system:

1. **UserConfirmation** (Step 1): Requesting user confirmation
2. **ContractVerification** (Step 3): Verifying credentials with contract
3. **WebauthnAuthentication** (Step 4): Authenticating with WebAuthn
4. **AuthenticationComplete** (Step 5): Authentication completed
5. **TransactionSigningProgress** (Step 6): Signing transactions
6. **TransactionSigningComplete** (Step 7): Transactions signed successfully

## Error Handling

- **Timeout**: If confirmation takes too long, transaction is rejected
- **Digest Mismatch**: If transaction intent changes, signing is aborted
- **User Rejection**: If user cancels, transaction is rejected
- **Credential Failure**: If TouchID fails, transaction is rejected

## Security Considerations

### Confirmation Bypass Prevention
- Worker enforces confirmation before proceeding with signing
- No way to bypass the confirmation step when enabled
- Digest verification ensures transaction integrity

### Replay Protection
- Unique request IDs prevent replay attacks
- Nonce-based validation ensures request authenticity
- Timestamp validation prevents stale requests

### UI Isolation
- Closed Shadow DOM prevents host application tampering
- Limited theming maintains security boundaries
- Secure communication channels prevent interception

## Performance Considerations

- **Lazy Loading**: Confirmation UI components are loaded on-demand
- **Efficient Communication**: Uses MessageChannel for minimal overhead
- **Timeout Protection**: Prevents hanging on user inaction
- **Memory Management**: Proper cleanup of event listeners and ports

## Developer Experience

The secure worker confirmation system is designed to be:

- **Non-intrusive**: Can be disabled for simple use cases
- **Configurable**: Multiple UI modes and behaviors
- **Secure**: Multiple layers of security verification
- **User-friendly**: Smooth UX with appropriate feedback
- **Extensible**: Custom confirmation handlers supported

## Integration with Registration Flow

The confirmation system also supports registration flows:

- Detects registration vs authentication flows
- Uses appropriate credential serialization
- Extracts both PRF outputs for registration
- Maintains security throughout the process

## Best Practices

1. **Enable for High-Value Transactions**: Use confirmation for transactions above certain thresholds
2. **Provide Clear Transaction Details**: Show meaningful summaries to users
3. **Set Appropriate Timeouts**: Balance security with user experience
4. **Log Confirmation Events**: Create audit trail for debugging
5. **Handle Edge Cases**: Gracefully handle timeouts and failures
