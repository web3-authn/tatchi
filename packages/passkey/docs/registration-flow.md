# Registration Flow Documentation

## Overview

The passkey registration process follows a structured 6-step flow with Server-Sent Events (SSE) providing real-time progress updates. Users can log in immediately after step 2, while remaining steps complete in the background.

## Event Interface

All registration events extend this base interface:

```typescript
interface BaseSSERegistrationEvent {
  step: number;           // 0-6, sequential step number
  phase: string;          // Human-readable phase name
  status: 'progress' | 'success' | 'error';
  timestamp: number;      // Unix timestamp in milliseconds
  message: string;        // Human-readable status message
}

type RegistrationSSEEvent =
  | RegistrationEventStep1    // Step 1
  | RegistrationEventStep2    // Step 2
  | RegistrationEventStep3    // Step 3
  | RegistrationEventStep4    // Step 4
  | RegistrationEventStep5    // Step 5
  | RegistrationEventStep6    // Step 6
  | RegistrationEventStep7    // Step 7
  | RegistrationEventStep0;   // Step 0
```

## Registration Steps

| Step | Phase | Duration | Critical | Concurrent |
|------|-------|----------|----------|------------|
| 1 | `webauthn-verification` | 100-500ms | Yes | No |
| 2 | `user-ready` | Instant | Yes | No |
| 3 | `access-key-addition` | 1-3s | Yes | No |
| 4 | `database-storage` | 50-200ms | No | Yes |
| 5 | `contract-registration` | 2-5s | No | Yes |
| 6 | `registration-complete` | Instant | No | No |
| 0 | `registration-error` | Instant | Fatal | No |

### Step 1: WebAuthn Verification
Verifies WebAuthn credentials with mode detection:
- `optimistic`: Fast verification using SimpleWebAuthn
- `secure`: Contract-based verification with on-chain commitment

```typescript
interface RegistrationEventStep1 extends BaseSSERegistrationEvent {
  step: 1;
  phase: 'webauthn-verification';
  mode?: 'optimistic' | 'secure';
}
```

### Step 2: User Ready - Login Enabled
User verification complete - **login interface can be enabled**:

```typescript
interface RegistrationEventStep2 extends BaseSSERegistrationEvent {
  step: 2;
  phase: 'user-ready';
  status: 'success';
  verified: boolean;
  username: string;
  nearAccountId: string;
  clientNearPublicKey: string;
  mode: string;
}
```

### Step 3: Access Key Addition (Critical)
Creates NEAR account and adds access key. **If this fails, remaining steps abort.**

### Steps 4-5: Concurrent Background Operations
- **Step 4**: Store authenticator data in database
- **Step 5**: Register user in smart contract (optimistic mode only)

These run concurrently and are non-fatal if they fail.

### Step 6: Registration Complete
Final confirmation that all operations completed successfully.

## Flow Diagram

```
Start Registration
       ↓
   [1] WebAuthn Verification
       ↓
   [2] User Ready ← LOGIN ENABLED HERE
       ↓
   [3] Access Key Addition (Critical)
       ↓
   ┌─ [4] Database Storage ─┐
   │                       │ (Concurrent)
   └─ [5] Contract Registration ─┘
       ↓
   [6] Registration Complete
```

## Implementation Example

```typescript
import type { RegistrationSSEEvent } from '@web3authn/passkey/react';

function handleRegistrationEvent(event: RegistrationSSEEvent) {
  switch (event.step) {
    case 1:
      showProgress('Verifying passkey...');
      break;

    case 2:
      // Critical: Enable login interface immediately
      enableLoginInterface();
      showProgress('Account ready! Creating blockchain account...');
      break;

    case 3:
      if (event.status === 'error') {
        showFatalError(`Account creation failed: ${event.error}`);
        return; // Registration aborted
      }
      showProgress('Storing credentials...');
      break;

    case 4:
    case 5:
      if (event.status === 'error') {
        showWarning(`Non-critical error in ${event.phase}: ${event.error}`);
      }
      break;

    case 6:
      showSuccess('Registration complete!');
      break;

    case 0:
      showFatalError(`Registration failed: ${event.error}`);
      break;
  }
}
```

## Error Handling Strategy

- **Fatal Errors**: Steps 0, 1, 3 - Abort registration
- **Non-Fatal Errors**: Steps 4, 5 - Log warnings, continue
- **Early Access**: Enable login after Step 2, regardless of later failures

## Key Implementation Notes

1. **Enable login after Step 2** - Don't wait for full completion
2. **Handle Step 3 failures gracefully** - This is the critical blockchain operation
3. **Steps 4-5 failures are recoverable** - Registration is still successful
4. **Use step numbers for progress indicators** - `(step/6) * 100`% complete
5. **Implement timeouts** - 30s for full registration flow