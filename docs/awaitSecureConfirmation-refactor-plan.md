# awaitSecureConfirmation Refactoring Plan

## Current Issues

The current `awaitSecureConfirmation` function is tightly coupled to transaction signing operations:

1. **Hardcoded Parameters**: Takes `txSigningRequestsJson` parameter that's only relevant for transaction signing
2. **Limited Summary Types**: Only supports `ConfirmationSummaryAction` and `ConfirmationSummaryRegistration`
3. **Transaction-Specific Logic**: The parsing logic assumes transaction data structure
4. **Inflexible Data Structure**: `SecureConfirmData` has transaction-specific fields like `tx_signing_requests`

## Proposed Refactoring

### 1. Create Generic Confirmation Request Types

```typescript
// New generic confirmation request structure
export interface SecureConfirmationRequest<T = any> {
  requestId: string;
  type: SecureConfirmationType;
  summary: string | object;
  payload: T;
  confirmationConfig?: ConfirmationConfig;
}

export enum SecureConfirmationType {
  SIGN_TRANSACTION = 'signTransaction',
  REGISTER_ACCOUNT = 'registerAccount',
  EXPORT_PRIVATE_KEY = 'exportPrivateKey',
  SIGN_NEP413_MESSAGE = 'signNep413Message',
  // Future types can be added here
}

// Type-specific payload interfaces
export interface SignTransactionPayload {
  txSigningRequests: TransactionInputWasm[];
  intentDigest: string;
  rpcCall: RpcCallPayload;
  isRegistration: boolean;
}

export interface ExportPrivateKeyPayload {
  accountId: string;
  publicKey: string;
  intentDigest?: string; // Optional for export operations
  rpcCall?: RpcCallPayload; // Optional for export operations
}

export interface RegisterAccountPayload {
  nearAccountId: string;
  deviceNumber: number;
  contractId: string;
  deterministicVrfPublicKey: string;
  intentDigest: string;
  rpcCall: RpcCallPayload;
}

export interface SignNep413Payload {
  message: string;
  recipient: string;
  accountId: string;
  intentDigest: string;
  rpcCall: RpcCallPayload;
}
```

### 2. Refactored awaitSecureConfirmation Function

```typescript
/**
 * Generic secure confirmation function that handles different operation types
 */
export function awaitSecureConfirmation<T extends SecureConfirmationType>(
  requestId: string,
  type: T,
  summary: string,
  payloadJson: string,
  confirmationConfigJson?: string
): Promise<WorkerConfirmationResponse> {
  return new Promise((resolve, reject) => {
    let parsedSummary: any;
    let parsedPayload: any;
    let parsedConfirmationConfig: ConfirmationConfig | undefined;

    try {
      // Parse summary based on type
      parsedSummary = parseSummaryByType(type, summary);

      // Parse payload based on type
      parsedPayload = parsePayloadByType(type, payloadJson);

      // Parse confirmation config if provided
      if (confirmationConfigJson) {
        parsedConfirmationConfig = safeJsonParseStrict<ConfirmationConfig>(
          confirmationConfigJson,
          'confirmationConfig'
        );
      }
    } catch (error) {
      return reject(error);
    }

    const onDecisionReceived = (messageEvent: MessageEvent) => {
      const { data } = messageEvent;
      if (
        data?.type === SecureConfirmMessageType.USER_PASSKEY_CONFIRM_RESPONSE &&
        data?.data?.requestId === requestId
      ) {
        self.removeEventListener('message', onDecisionReceived);

        if (typeof data?.data?.confirmed !== 'boolean') {
          return reject(new Error('[signer-worker]: Invalid confirmation response: missing boolean "confirmed"'));
        }

        resolve({
          request_id: requestId,
          intent_digest: data.data?.intentDigest,
          confirmed: !!data.data?.confirmed,
          credential: data.data?.credential,
          prf_output: data.data?.prfOutput,
          vrf_challenge: data.data?.vrfChallenge,
          transaction_context: data.data?.transactionContext,
          error: data.data?.error
        });
      }
    };

    self.addEventListener('message', onDecisionReceived);

    // Send typed confirmation request
    self.postMessage({
      type: SecureConfirmMessageType.PROMPT_USER_CONFIRM_IN_JS_MAIN_THREAD,
      data: {
        requestId,
        type,
        summary: parsedSummary,
        payload: parsedPayload,
        confirmationConfig: parsedConfirmationConfig
      }
    });
  });
}
```

### 3. Type-Specific Parsing Functions

```typescript
function parseSummaryByType(type: SecureConfirmationType, summary: string): any {
  switch (type) {
    case SecureConfirmationType.SIGN_TRANSACTION:
      return parseTransactionSummary(summary);
    case SecureConfirmationType.REGISTER_ACCOUNT:
      return parseRegistrationSummary(summary);
    case SecureConfirmationType.EXPORT_PRIVATE_KEY:
      return parseExportSummary(summary);
    case SecureConfirmationType.SIGN_NEP413_MESSAGE:
      return parseNep413Summary(summary);
    default:
      throw new Error(`Unknown confirmation type: ${type}`);
  }
}

function parsePayloadByType(type: SecureConfirmationType, payloadJson: string): any {
  switch (type) {
    case SecureConfirmationType.SIGN_TRANSACTION:
      return safeJsonParseStrict<SignTransactionPayload>(payloadJson, 'signTransactionPayload');
    case SecureConfirmationType.REGISTER_ACCOUNT:
      return safeJsonParseStrict<RegisterAccountPayload>(payloadJson, 'registerAccountPayload');
    case SecureConfirmationType.EXPORT_PRIVATE_KEY:
      return safeJsonParseStrict<ExportPrivateKeyPayload>(payloadJson, 'exportPrivateKeyPayload');
    case SecureConfirmationType.SIGN_NEP413_MESSAGE:
      return safeJsonParseStrict<SignNep413Payload>(payloadJson, 'signNep413Payload');
    default:
      throw new Error(`Unknown confirmation type: ${type}`);
  }
}

// Type-specific summary parsers
function parseTransactionSummary(summary: string): ConfirmationSummaryAction | ConfirmationSummaryRegistration {
  if (summary.includes("to") && summary.includes("totalAmount")) {
    return safeJsonParseStrict<ConfirmationSummaryAction>(summary, 'action summary');
  } else {
    return safeJsonParseStrict<ConfirmationSummaryRegistration>(summary, 'registration summary');
  }
}

function parseExportSummary(summary: string): ExportSummary {
  return safeJsonParseStrict<ExportSummary>(summary, 'export summary');
}

function parseNep413Summary(summary: string): Nep413Summary {
  return safeJsonParseStrict<Nep413Summary>(summary, 'nep413 summary');
}
```

### 4. Updated Type Definitions

```typescript
// New summary types for different operations
export interface ExportSummary {
  operation: 'Export Private Key';
  accountId: string;
  publicKey: string;
  warning: string;
}

export interface Nep413Summary {
  operation: 'Sign NEP-413 Message';
  message: string;
  recipient: string;
  accountId: string;
}

// Updated SecureConfirmData to be generic
export interface SecureConfirmData<T = any> {
  requestId: string;
  type: SecureConfirmationType;
  summary: string | object;
  payload: T;
  confirmationConfig?: ConfirmationConfig;
}

// Updated SecureConfirmMessage
export interface SecureConfirmMessage<T = any> {
  type: SecureConfirmMessageType;
  data: SecureConfirmData<T>;
}
```

### 5. Updated Handler Integration

```typescript
// In handleSecureConfirmRequest.ts
export async function handlePromptUserConfirmInJsMainThread(
  ctx: SignerWorkerManagerContext,
  message: SecureConfirmMessage,
  worker: Worker
): Promise<void> {

  const { data } = message;
  const { type, payload } = data;

  // Route to appropriate handler based on type
  switch (type) {
    case SecureConfirmationType.SIGN_TRANSACTION:
      return handleSignTransactionConfirmation(ctx, data as SecureConfirmData<SignTransactionPayload>, worker);

    case SecureConfirmationType.EXPORT_PRIVATE_KEY:
      return handleExportPrivateKeyConfirmation(ctx, data as SecureConfirmData<ExportPrivateKeyPayload>, worker);

    case SecureConfirmationType.REGISTER_ACCOUNT:
      return handleRegisterAccountConfirmation(ctx, data as SecureConfirmData<RegisterAccountPayload>, worker);

    case SecureConfirmationType.SIGN_NEP413_MESSAGE:
      return handleSignNep413Confirmation(ctx, data as SecureConfirmData<SignNep413Payload>, worker);

    default:
      throw new Error(`Unsupported confirmation type: ${type}`);
  }
}

// Type-specific handlers
async function handleSignTransactionConfirmation(
  ctx: SignerWorkerManagerContext,
  data: SecureConfirmData<SignTransactionPayload>,
  worker: Worker
): Promise<void> {
  // Existing transaction signing logic
  // ... (current implementation)
}

async function handleExportPrivateKeyConfirmation(
  ctx: SignerWorkerManagerContext,
  data: SecureConfirmData<ExportPrivateKeyPayload>,
  worker: Worker
): Promise<void> {
  // New export private key logic
  // ... (implementation from the previous plan)
}
```

### 6. Backward Compatibility

To maintain backward compatibility, we can create wrapper functions:

```typescript
/**
 * Backward compatible wrapper for transaction signing
 * @deprecated Use awaitSecureConfirmation with SecureConfirmationType.SIGN_TRANSACTION instead
 */
export function awaitSecureConfirmationLegacy(
  requestId: string,
  summary: string,
  confirmationData: string,
  txSigningRequestsJson: string | undefined
): Promise<WorkerConfirmationResponse> {

  // Convert legacy parameters to new format
  const parsedConfirmationData = safeJsonParseStrict<SecureConfirmData>(confirmationData, 'confirmationData');
  const parsedTxSigningRequests = txSigningRequestsJson
    ? safeJsonParseStrict<TransactionInputWasm[]>(txSigningRequestsJson, 'txSigningRequestsJson')
    : [];

  const payload: SignTransactionPayload = {
    txSigningRequests: parsedTxSigningRequests,
    intentDigest: parsedConfirmationData.intentDigest,
    rpcCall: parsedConfirmationData.rpcCall,
    isRegistration: parsedConfirmationData.isRegistration
  };

  return awaitSecureConfirmation(
    requestId,
    SecureConfirmationType.SIGN_TRANSACTION,
    summary,
    JSON.stringify(payload),
    parsedConfirmationData.confirmationConfig ? JSON.stringify(parsedConfirmationData.confirmationConfig) : undefined
  );
}
```

### 7. Usage Examples

```typescript
// Transaction signing (new way)
await awaitSecureConfirmation(
  requestId,
  SecureConfirmationType.SIGN_TRANSACTION,
  JSON.stringify(transactionSummary),
  JSON.stringify({
    txSigningRequests,
    intentDigest,
    rpcCall,
    isRegistration: false
  })
);

// Private key export (new way)
await awaitSecureConfirmation(
  requestId,
  SecureConfirmationType.EXPORT_PRIVATE_KEY,
  JSON.stringify({
    operation: 'Export Private Key',
    accountId: 'user.near',
    publicKey: 'ed25519:...',
    warning: 'This will reveal your private key...'
  }),
  JSON.stringify({
    accountId: 'user.near',
    publicKey: 'ed25519:...'
  })
);

// NEP-413 signing (new way)
await awaitSecureConfirmation(
  requestId,
  SecureConfirmationType.SIGN_NEP413_MESSAGE,
  JSON.stringify({
    operation: 'Sign NEP-413 Message',
    message: 'Hello World',
    recipient: 'app.near',
    accountId: 'user.near'
  }),
  JSON.stringify({
    message: 'Hello World',
    recipient: 'app.near',
    accountId: 'user.near',
    intentDigest: '...',
    rpcCall: { ... }
  })
);
```

## Benefits of This Refactoring

1. **Type Safety**: Each confirmation type has its own strongly-typed payload
2. **Extensibility**: Easy to add new confirmation types without modifying existing code
3. **Separation of Concerns**: Each operation type has its own handler
4. **Maintainability**: Clear separation between different confirmation flows
5. **Backward Compatibility**: Legacy code continues to work
6. **Better Error Handling**: Type-specific error messages and validation

## Migration Strategy

1. **Phase 1**: Implement new types and functions alongside existing code
2. **Phase 2**: Update new features (like ExportPrivateKeyDrawer) to use new API
3. **Phase 3**: Gradually migrate existing transaction signing code
4. **Phase 4**: Remove legacy functions after full migration

This refactoring provides a clean, extensible foundation for supporting multiple secure confirmation types while maintaining backward compatibility.
