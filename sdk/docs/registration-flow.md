# Registration Flow Documentation

## Overview

The passkey registration process follows a structured 8-step flow with SDK-Sent Events (SSE) providing real-time progress updates. Users can log in immediately after step 2, while remaining steps complete in the background.

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
  | RegistrationEventStep3    // Step 3: Contract Pre-check
  | RegistrationEventStep4    // Step 4: Access Key Addition (relay)
  | RegistrationEventStep5    // Step 5: Contract Registration (relay)
  | RegistrationEventStep6    // Step 6: Post-registration Account Verification
  | RegistrationEventStep7    // Step 7: Database Storage
  | RegistrationEventStep8    // Step 8: Registration Complete
  | RegistrationEventStep0;   // Step 0: Error
```

## Registration Phases

The registration process uses these phases defined in `RegistrationPhase`:

```typescript
export enum RegistrationPhase {
  STEP_1_WEBAUTHN_VERIFICATION = 'webauthn-verification',
  STEP_2_KEY_GENERATION = 'key-generation',
  STEP_3_CONTRACT_PRE_CHECK = 'contract-pre-check',
  STEP_4_ACCESS_KEY_ADDITION = 'access-key-addition',
  STEP_5_CONTRACT_REGISTRATION = 'contract-registration',
  STEP_6_ACCOUNT_VERIFICATION = 'account-verification',
  STEP_7_DATABASE_STORAGE = 'database-storage',
  STEP_8_REGISTRATION_COMPLETE = 'registration-complete',
  REGISTRATION_ERROR = 'error',
}
```

## Registration Steps

| Step | Phase | Duration | Critical | Concurrent | Description |
|------|-------|----------|----------|------------|-------------|
| 1 | `webauthn-verification` | 100-500ms | Yes | No | WebAuthn credential verification |
| 2 | `key-generation` | Instant | Yes | No | NEAR and VRF key generation |
| 3 | `contract-pre-check` | 50-200ms | No | Yes | Validate contract availability and account feasibility |
| 4 | `access-key-addition` | 1-2s | Yes | No | Create NEAR account and add access key (relay) |
| 5 | `contract-registration` | 1-2s | Yes | No | Register user in smart contract (relay) |
| 6 | `account-verification` | 50-200ms | No | Yes | Verify on-chain access key post-commit |
| 7 | `database-storage` | 50-200ms | No | Yes | Store authenticator data locally |
| 8 | `registration-complete` | Instant | No | No | Final confirmation |
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

### Step 3: Contract Pre-check
Performs lightweight checks (contract reachable, account available). May run concurrently with key generation progress.

```typescript
interface RegistrationEventStep3 extends BaseRegistrationSSEEvent {
  step: 3;
  phase: RegistrationPhase.STEP_3_CONTRACT_PRE_CHECK;
}
```

### Step 4: Access Key Addition (Critical, relay)
Creates NEAR account and adds access key via the relay. **If this fails, remaining steps abort.**

```typescript
interface RegistrationEventStep4 extends BaseRegistrationSSEEvent {
  step: 4;
  phase: RegistrationPhase.STEP_4_ACCESS_KEY_ADDITION;
  error?: string;
}
```

### Step 5: Contract Registration (relay)
Registers user in the smart contract via the same relay operation:

```typescript
interface RegistrationEventStep5 extends BaseRegistrationSSEEvent {
  step: 5;
  phase: RegistrationPhase.STEP_5_CONTRACT_REGISTRATION;
  error?: string;
}
```

### Step 6: Account Verification
SDK polls access keys and asserts the expected public key is present before persisting anything or auto-login:

```typescript
interface RegistrationEventStep6 extends BaseRegistrationSSEEvent {
  step: 6;
  phase: RegistrationPhase.STEP_6_ACCOUNT_VERIFICATION;
  error?: string;
}
```

### Step 7: Database Storage
Stores authenticator data in local IndexedDB:

```typescript
interface RegistrationEventStep7 extends BaseRegistrationSSEEvent {
  step: 7;
  phase: RegistrationPhase.STEP_7_DATABASE_STORAGE;
  error?: string;
}
```

### Step 8: Registration Complete
Final confirmation that all operations completed successfully:

```typescript
interface RegistrationEventStep8 extends BaseRegistrationSSEEvent {
  step: 8;
  phase: RegistrationPhase.STEP_8_REGISTRATION_COMPLETE;
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
   [3] Contract Pre-check (may be concurrent)
       ↓
   [4] Access Key Addition (relay)
       ↓
   [5] Contract Registration (relay)
       ↓
   [6] Account Verification (post-commit)
       ↓
   [7] Database Storage
       ↓
   [8] Registration Complete
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
      showProgress('Pre-checking contract and account…');
      break;

    case 4:
      if (event.status === RegistrationStatus.ERROR) {
        showFatalError(`Account creation failed: ${event.error}`);
        return; // Registration aborted
      }
      showProgress('Adding access key…');
      break;

    case 5:
      if (event.status === RegistrationStatus.ERROR) {
        showWarning(`Contract registration failed: ${event.error}`);
      } else {
        showProgress('Contract registration submitted…');
      }
      break;

    case 6:
      if (event.status === RegistrationStatus.ERROR) {
        showWarning(`On-chain key verification failed: ${event.error}`);
      }
      break;

    case 7:
      if (event.status === RegistrationStatus.ERROR) {
        showWarning(`Database storage failed: ${event.error}`);
      }
      break;

    case 8:
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
