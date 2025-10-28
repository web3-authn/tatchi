# Registration Flow Documentation

## Overview

The passkey registration process follows a structured 7-step flow with SDK-Sent Events (SSE) providing real-time progress updates. Users can log in immediately after step 2, while remaining steps complete in the background.

## Event Interface

All registration events extend this base interface:

```typescript
interface BaseRegistrationSSEEvent {
  step: number;           // 0-7, sequential step number
  phase: RegistrationPhase; // Human-readable phase name
  status: RegistrationStatus; // 'progress' | 'success' | 'error'
  message: string;        // Human-readable status message
}

type RegistrationSSEEvent =
  | RegistrationEventStep1    // Step 1: WebAuthn Verification
  | RegistrationEventStep2    // Step 2: Key Generation
  | RegistrationEventStep3    // Step 3: Access Key Addition
  | RegistrationEventStep4    // Step 4: Account Verification
  | RegistrationEventStep5    // Step 5: Database Storage
  | RegistrationEventStep6    // Step 6: Contract Registration
  | RegistrationEventStep7    // Step 7: Registration Complete
  | RegistrationEventStep0;   // Step 0: Error
```

## Registration Phases

The registration process uses these phases defined in `RegistrationPhase`:

```typescript
export enum RegistrationPhase {
  STEP_1_WEBAUTHN_VERIFICATION = 'webauthn-verification',
  STEP_2_KEY_GENERATION = 'key-generation',
  STEP_3_ACCESS_KEY_ADDITION = 'access-key-addition',
  STEP_4_ACCOUNT_VERIFICATION = 'account-verification',
  STEP_5_DATABASE_STORAGE = 'database-storage',
  STEP_6_CONTRACT_REGISTRATION = 'contract-registration',
  STEP_7_REGISTRATION_COMPLETE = 'registration-complete',
  REGISTRATION_ERROR = 'error',
}
```

## Registration Steps

| Step | Phase | Duration | Critical | Concurrent | Description |
|------|-------|----------|----------|------------|-------------|
| 1 | `webauthn-verification` | 100-500ms | Yes | No | WebAuthn credential verification |
| 2 | `key-generation` | Instant | Yes | No | NEAR and VRF key generation |
| 3 | `access-key-addition` | 1-2s | Yes | No | Create NEAR account and add access key |
| 4 | `account-verification` | 50-200ms | No | Yes | Verify account creation on-chain |
| 5 | `database-storage` | 50-200ms | No | Yes | Store authenticator data locally |
| 6 | `contract-registration` | 1-2s | No | Yes | Register user in smart contract |
| 7 | `registration-complete` | Instant | No | No | Final confirmation |
| 0 | `registration-error` | Instant | Fatal | No | Error state |

### Step 1: WebAuthn Verification
Verifies WebAuthn credentials with the authenticator:

```typescript
interface RegistrationEventStep1 extends BaseRegistrationSSEEvent {
  step: 1;
  phase: RegistrationPhase.STEP_1_WEBAUTHN_VERIFICATION;
}
```

### Step 2: Key Generation - Login Enabled
Key generation complete - **login interface can be enabled**:

```typescript
interface RegistrationEventStep2 extends BaseRegistrationSSEEvent {
  step: 2;
  phase: RegistrationPhase.STEP_2_KEY_GENERATION;
  status: RegistrationStatus.SUCCESS;
  verified: boolean;
  nearAccountId: string;
  nearPublicKey: string | null | undefined;
  vrfPublicKey: string | null | undefined;
}
```

### Step 3: Access Key Addition (Critical)
Creates NEAR account and adds access key. **If this fails, remaining steps abort.**

```typescript
interface RegistrationEventStep3 extends BaseRegistrationSSEEvent {
  step: 3;
  phase: RegistrationPhase.STEP_3_ACCESS_KEY_ADDITION;
  error?: string;
}
```

### Step 4: Account Verification
Verifies the account was created successfully on-chain:

```typescript
interface RegistrationEventStep4 extends BaseRegistrationSSEEvent {
  step: 4;
  phase: RegistrationPhase.STEP_4_ACCOUNT_VERIFICATION;
  error?: string;
}
```

### Step 5: Database Storage
Stores authenticator data in local IndexedDB:

```typescript
interface RegistrationEventStep5 extends BaseRegistrationSSEEvent {
  step: 5;
  phase: RegistrationPhase.STEP_5_DATABASE_STORAGE;
  error?: string;
}
```

### Step 6: Contract Registration
Registers user in the smart contract (for optimistic mode):

```typescript
interface RegistrationEventStep6 extends BaseRegistrationSSEEvent {
  step: 6;
  phase: RegistrationPhase.STEP_6_CONTRACT_REGISTRATION;
  error?: string;
}
```

### Step 7: Registration Complete
Final confirmation that all operations completed successfully:

```typescript
interface RegistrationEventStep7 extends BaseRegistrationSSEEvent {
  step: 7;
  phase: RegistrationPhase.STEP_7_REGISTRATION_COMPLETE;
  status: RegistrationStatus.SUCCESS;
}
```

### Step 0: Registration Error
Error state when registration fails:

```typescript
interface RegistrationEventStep0 extends BaseRegistrationSSEEvent {
  step: 0;
  phase: RegistrationPhase.REGISTRATION_ERROR;
  status: RegistrationStatus.ERROR;
  error: string;
}
```

## Flow Diagram

```
Start Registration
       ↓
   [1] WebAuthn Verification
       ↓
   [2] Key Generation ← LOGIN ENABLED HERE
       ↓
   [3] Access Key Addition (Critical)
       ↓
   ┌─ [4] Account Verification ─┐
   │                            │ (Concurrent)
   └─ [5] Database Storage ─────┘
       ↓
   [6] Contract Registration
       ↓
   [7] Registration Complete
```

## Implementation Example

```typescript
import type { RegistrationSSEEvent, RegistrationPhase, RegistrationStatus } from '@tatchi-xyz/sdk';

function handleRegistrationEvent(event: RegistrationSSEEvent) {
  switch (event.step) {
    case 1:
      showProgress('Verifying passkey...');
      break;

    case 2:
      // Critical: Enable login interface immediately
      enableLoginInterface();
      showProgress('Keys generated! Creating blockchain account...');
      break;

    case 3:
      if (event.status === RegistrationStatus.ERROR) {
        showFatalError(`Account creation failed: ${event.error}`);
        return; // Registration aborted
      }
      showProgress('Adding access key...');
      break;

    case 4:
      if (event.status === RegistrationStatus.ERROR) {
        showWarning(`Account verification failed: ${event.error}`);
      }
      break;

    case 5:
      if (event.status === RegistrationStatus.ERROR) {
        showWarning(`Database storage failed: ${event.error}`);
      }
      break;

    case 6:
      if (event.status === RegistrationStatus.ERROR) {
        showWarning(`Contract registration failed: ${event.error}`);
      }
      break;

    case 7:
      showSuccess('Registration complete!');
      break;

    case 0:
      showFatalError(`Registration failed: ${event.error}`);
      break;
  }
}
```

## Registration Result

The registration process returns a `RegistrationResult` object:

```typescript
interface RegistrationResult {
  success: boolean;
  error?: string;
  clientNearPublicKey?: string | null;
  nearAccountId?: AccountId;
  transactionId?: string | null;
  vrfRegistration?: {
    success: boolean;
    vrfPublicKey?: string;
    encryptedVrfKeypair?: EncryptedVRFKeypair;
    contractVerified?: boolean;
    error?: string;
  };
}
```
