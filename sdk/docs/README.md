# Web3Authn Passkey System Documentation

This directory contains comprehensive documentation for the Web3Authn passkey system, covering both registration and transaction signing using WASM workers for enhanced security.

## System Overview

The Web3Authn passkey system provides secure, passwordless authentication and transaction signing for NEAR blockchain applications. It consists of two main components:

1. **Registration System**: Event-driven user onboarding with real-time progress
2. **Transaction Signing**: Secure WASM worker-based cryptographic operations

## Quick Start

### Registration
```typescript
import { useTatchiContext } from '@tatchi-xyz/sdk/react';

function MyComponent() {
  const { registerPasskey } = useTatchiContext();

  const handleRegister = async (username: string) => {
    await registerPasskey(username, {
      onEvent: (event) => {
        console.log(`Step ${event.step}: ${event.phase} - ${event.status}`);
        if (event.step === 2) enableUserLogin(); // Enable login after verification
      }
    });
  };
}
```

### Transaction Signing
```typescript
import { useTatchiContext } from '@tatchi-xyz/sdk/react';

function TransactionComponent() {
  const { tatchi } = useTatchiContext();

  const handleTransaction = async () => {
    const result = await passkeyManager.executeAction({
      receiver_id: 'contract.testnet',
      method_name: 'my_method',
      args: { param: 'value' },
      gas: '30000000000000',
      deposit: '0'
    });
  };
}
```

## Documentation Files

### [Registration Flow](./registration-flow.md)
Complete registration process documentation including step-by-step flow, TypeScript interfaces, and implementation examples.

## Registration System

The registration system uses numbered steps (1-6) with SDK-Sent Events (SSE) for real-time progress updates:

| Step | Phase | Description | Duration | Critical |
|------|-------|-------------|----------|----------|
| **1** | `webauthn-verification` | Verify WebAuthn credentials | 100-500ms | Yes |
| **2** | `user-ready` | User verified, **can login** | Instant | Yes |
| **3** | `access-key-addition` | Create NEAR account | 1-3s | Yes |
| **4** | `database-storage` | Store authenticator data | 50-200ms | No |
| **5** | `contract-registration` | Register in smart contract | 2-5s | No |
| **6** | `registration-complete` | Final confirmation | Instant | No |
| **0** | `registration-error` | Fatal error occurred | Instant | Fatal |


## Transaction Signing System

All transaction signing happens inside WASM workers for enhanced security and performance.

### Architecture Benefits

**Security Advantages:**
- Private keys never leave worker context
- Reduced attack surface with isolated memory
- Enhanced protection against main thread exploits

**Performance Benefits:**
- Parallel processing during signing operations
- Reduced main thread blocking
- Better user experience with responsive UI

**Architecture Benefits:**
- Type-safe worker communication
- Cross-library compatibility with near-api-js
- Borsh serialization for NEAR protocol compliance

### Transaction Flow

```
Main Thread                    WASM Worker                   RPC Node
    │                              │                              │
    ├─ Transaction Request ───────>│                              │
    │  (receiver, method, args)    │                              │
    │                              ├─ Decrypt Private Key         │
    │                              │  (using PRF + encrypted key) │
    │                              │                              │
    │                              ├─ Build & Sign Transaction    │
    │                              │  (ed25519 signature)         │
    │                              │                              │
    │                              ├─ Serialize to Borsh          │
    │  <────── Signed Transaction ─┤  (NEAR protocol format)      │
    │          (Borsh bytes)       │                              │
    │                              │                              │
    ├─ Deserialize & Send ───────────────────────────────────────>│
```

### Worker Message Types

```typescript
interface TransactionSigningRequest {
  type: 'SIGN_NEAR_TRANSACTION_WITH_PRF';
  payload: {
    username: string;
    prfOutput: string; // base64
    signerAccountId: string;
    receiverAccountId: string;
    methodName: string;
    args: string; // JSON
    gas: string;
    deposit: string;
    nonce: number;
    blockHash: string; // base58
  };
}

interface TransactionSigningResponse {
  type: 'TRANSACTION_SIGNING_SUCCESS' | 'TRANSACTION_SIGNING_ERROR';
  payload: {
    signedTransactionBorsh?: number[]; // Borsh bytes
    error?: string;
  };
}
```

## Implementation Best Practices

### Registration Event Handling
```typescript
function handleRegistrationEvent(event: RegistrationSSEEvent) {
  // Always handle progress for UX
  if (event.status === 'progress') {
    showProgressBar(calculateProgress(event.step));
  }

  // Enable login after step 2
  if (event.step === 2 && event.status === 'success') {
    enableUserLogin(event.username);
  }

  // Handle errors appropriately
  if (event.status === 'error') {
    if (event.step === 0 || event.step === 3) {
      showFatalError(event.error); // Fatal errors
    } else {
      showWarning(`Step ${event.step} failed: ${event.error}`); // Non-fatal
    }
  }
}
```


## Key Security Features

1. **Private Key Isolation**: Ed25519 private keys never leave WASM worker context
2. **PRF Encryption**: Keys encrypted using WebAuthn PRF extension output
3. **Memory Protection**: Worker memory isolated from main thread
4. **Type Safety**: Full TypeScript support prevents runtime errors

## Architecture Overview

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Frontend UI   │    │   WASM Worker    │    │  NEAR Network   │
│                 │    │                  │    │                 │
│ • Registration  │◄──►│ • Key Generation │◄──►│ • Account Mgmt  │
│ • Authentication│    │ • Transaction    │    │ • Contract Calls│
│ • Progress UI   │    │   Signing        │    │ • State Updates │
│                 │    │ • PRF Decryption │    │                 │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

## Development Workflow

1. **Start** with [Registration Flow](./registration-flow.md) for system overview
2. **Implement** registration with proper step 2 login enablement
3. **Add** transaction signing using WASM worker architecture
4. **Test** error handling for both registration and transactions
5. **Monitor** performance and user experience metrics
