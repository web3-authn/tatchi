# ExportPrivateKeyDrawer Implementation Plan

## Overview

This document outlines the implementation plan for creating an `ExportPrivateKeyDrawer` Lit component that displays the results of the `decryptPrivateKeyWithPrf()` function in a secure, user-friendly drawer interface. The component will integrate with the existing secure confirmation flow to ensure proper authentication before displaying sensitive private key information.

## Architecture Overview

The implementation will follow the existing secure confirmation pattern used for transaction signing, but adapted for private key export operations. The flow will be:

1. **WASM Worker** → calls `decryptPrivateKeyWithPrf()`
2. **WASM Worker** → defers to `awaitSecureConfirmation()` flow
3. **Main Thread** → `handleSecureConfirmRequest.ts` detects export operation
4. **Main Thread** → shows `ExportPrivateKeyDrawer` component
5. **User** → confirms export with TouchID/biometric authentication
6. **Main Thread** → returns credentials to WASM worker
7. **WASM Worker** → decrypts and returns private key data
8. **Main Thread** → displays results in drawer

## Implementation Steps

### Step 1: Create ExportPrivateKeyDrawer Lit Component

**File**: `passkey-sdk/src/core/WebAuthnManager/LitComponents/ExportPrivateKeyDrawer/index.ts`

**Features**:
- Extends the existing `DrawerElement` base class
- Displays private key information in a secure, copyable format
- Shows account ID, public key, and private key
- Includes copy-to-clipboard functionality
- Supports dark/light themes
- Includes security warnings about private key exposure
- Drag-to-close functionality
- Proper accessibility attributes

**Properties**:
```typescript
interface ExportPrivateKeyDrawerProps {
  open: boolean;
  theme: 'dark' | 'light';
  accountId: string;
  publicKey: string;
  privateKey: string;
  loading?: boolean;
  errorMessage?: string;
  onClose: () => void;
  onCopy?: (type: 'publicKey' | 'privateKey', value: string) => void;
}
```

**Key Features**:
- **Security Warning**: Prominent warning about private key sensitivity
- **Copy Functionality**: Individual copy buttons for public/private keys
- **Visual Indicators**: Clear labeling and formatting for different key types
- **Responsive Design**: Works on mobile and desktop
- **Accessibility**: Proper ARIA labels and keyboard navigation

### Step 2: Extend Secure Confirmation Types

**File**: `passkey-sdk/src/core/WebAuthnManager/SignerWorkerManager/confirmTxFlow/types.ts`

**Additions**:
```typescript
// New operation type for private key export
export type SecureConfirmOperationType =
  | 'transaction_signing'
  | 'registration'
  | 'private_key_export';

// Extended SecureConfirmData interface
export interface SecureConfirmData {
  // ... existing fields ...
  operationType?: SecureConfirmOperationType;
  exportData?: {
    accountId: string;
    publicKey: string;
  };
}

// New summary type for export operations
export interface ExportSummary {
  operation: 'Export Private Key';
  accountId: string;
  publicKey: string;
  warning: string;
}
```

### Step 3: Update WASM Worker Integration

**File**: `passkey-sdk/src/core/WebAuthnManager/SignerWorkerManager/handlers/decryptPrivateKeyWithPrf.ts`

**Changes**:
- Modify to use secure confirmation flow instead of direct TouchID prompt
- Create appropriate summary data for export operation
- Handle the confirmation response and extract credentials
- Return decrypted private key data

**New Flow**:
```typescript
export async function decryptPrivateKeyWithPrf({
  ctx,
  nearAccountId,
  authenticators,
}: {
  ctx: SignerWorkerManagerContext,
  nearAccountId: AccountId,
  authenticators: ClientAuthenticatorData[],
}): Promise<{ decryptedPrivateKey: string; nearAccountId: AccountId }> {

  // 1. Get user data for summary
  const userData = await ctx.indexedDB.clientDB.getUser(nearAccountId);
  if (!userData?.clientNearPublicKey) {
    throw new Error(`No public key found for ${nearAccountId}`);
  }

  // 2. Create export summary
  const exportSummary: ExportSummary = {
    operation: 'Export Private Key',
    accountId: nearAccountId,
    publicKey: userData.clientNearPublicKey,
    warning: 'This will reveal your private key. Only proceed if you trust this application.'
  };

  // 3. Use secure confirmation flow
  const confirmationResult = await ctx.awaitSecureConfirmation(
    generateRequestId(),
    JSON.stringify(exportSummary),
    JSON.stringify({
      requestId: generateRequestId(),
      operationType: 'private_key_export',
      exportData: {
        accountId: nearAccountId,
        publicKey: userData.clientNearPublicKey
      },
      // ... other required fields
    }),
    undefined // No transaction data for export
  );

  if (!confirmationResult.confirmed) {
    throw new Error('User cancelled private key export');
  }

  // 4. Use credentials to decrypt private key
  const encryptedKeyData = await ctx.indexedDB.nearKeysDB.getEncryptedKey(nearAccountId);
  if (!encryptedKeyData) {
    throw new Error(`No encrypted key found for account: ${nearAccountId}`);
  }

  // 5. Extract PRF output from credential
  const dualPrfOutputs = extractPrfFromCredential({
    credential: confirmationResult.credential,
    firstPrfOutput: true,
    secondPrfOutput: false,
  });

  // 6. Send to WASM worker for decryption
  const response = await ctx.sendMessage({
    message: {
      type: WorkerRequestType.DecryptPrivateKeyWithPrf,
      payload: {
        nearAccountId: nearAccountId,
        chacha20PrfOutput: dualPrfOutputs.chacha20PrfOutput,
        encryptedPrivateKeyData: encryptedKeyData.encryptedData,
        encryptedPrivateKeyIv: encryptedKeyData.iv
      }
    }
  });

  if (!isDecryptPrivateKeyWithPrfSuccess(response)) {
    throw new Error('Private key decryption failed');
  }

  return {
    decryptedPrivateKey: response.payload.privateKey,
    nearAccountId: toAccountId(response.payload.nearAccountId)
  };
}
```

### Step 4: Update Secure Confirmation Handler

**File**: `passkey-sdk/src/core/WebAuthnManager/SignerWorkerManager/confirmTxFlow/handleSecureConfirmRequest.ts`

**Changes**:
- Add detection for `private_key_export` operation type
- Create specialized UI rendering for export operations
- Handle export-specific confirmation flow
- Display results in ExportPrivateKeyDrawer

**New Function**:
```typescript
async function renderExportConfirmUI({
  ctx,
  data,
  confirmationConfig,
  exportSummary,
}: {
  ctx: SignerWorkerManagerContext,
  data: SecureConfirmData,
  confirmationConfig: ConfirmationConfig,
  exportSummary: ExportSummary,
}): Promise<{
  confirmed: boolean;
  confirmHandle?: { element: any, close: (confirmed: boolean) => void };
  error?: string;
}> {

  // Create and mount ExportPrivateKeyDrawer
  const drawer = document.createElement('w3a-export-private-key-drawer');
  drawer.open = true;
  drawer.theme = confirmationConfig.theme || 'dark';
  drawer.accountId = exportSummary.accountId;
  drawer.publicKey = exportSummary.publicKey;
  drawer.loading = true; // Show loading state initially

  document.body.appendChild(drawer);

  return new Promise((resolve) => {
    const handleConfirm = () => {
      resolve({ confirmed: true, confirmHandle: { element: drawer, close: () => drawer.remove() } });
    };

    const handleCancel = () => {
      drawer.remove();
      resolve({ confirmed: false, confirmHandle: undefined });
    };

    drawer.addEventListener('confirm', handleConfirm);
    drawer.addEventListener('cancel', handleCancel);
  });
}
```

**Update renderUserConfirmUI function**:
```typescript
async function renderUserConfirmUI({
  ctx,
  data,
  confirmationConfig,
  transactionSummary,
  vrfChallenge,
}: {
  // ... existing parameters
}): Promise<{
  confirmed: boolean;
  confirmHandle?: { element: any, close: (confirmed: boolean) => void };
  error?: string;
}> {

  // Check if this is a private key export operation
  if (data.operationType === 'private_key_export') {
    const exportSummary = JSON.parse(data.summary as string) as ExportSummary;
    return renderExportConfirmUI({ ctx, data, confirmationConfig, exportSummary });
  }

  // ... existing logic for transaction/registration flows
}
```

### Step 5: Update WebAuthnManager Integration

**File**: `passkey-sdk/src/core/WebAuthnManager/index.ts`

**Changes**:
- Update `exportNearKeypairWithTouchId` method to use new secure confirmation flow
- Handle the drawer display and result presentation
- Ensure proper cleanup and error handling

**Updated Method**:
```typescript
async exportNearKeypairWithTouchId(nearAccountId: AccountId): Promise<{
  accountId: string,
  publicKey: string,
  privateKey: string
}> {
  console.debug(`🔐 Exporting private key for account: ${nearAccountId}`);

  // Get user data to verify user exists
  const userData = await this.getUser(nearAccountId);
  if (!userData) {
    throw new Error(`No user data found for ${nearAccountId}`);
  }
  if (!userData.clientNearPublicKey) {
    throw new Error(`No public key found for ${nearAccountId}`);
  }

  // Get stored authenticator data for this user
  const authenticators = await this.getAuthenticatorsByUser(nearAccountId);
  if (authenticators.length === 0) {
    throw new Error(`No authenticators found for account ${nearAccountId}. Please register first.`);
  }

  // Use WASM worker with secure confirmation flow
  const decryptionResult = await this.signerWorkerManager.decryptPrivateKeyWithPrf({
    nearAccountId,
    authenticators,
  });

  return {
    accountId: userData.nearAccountId,
    publicKey: userData.clientNearPublicKey,
    privateKey: decryptionResult.decryptedPrivateKey,
  }
}
```

### Step 6: Create React Wrapper Component

**File**: `passkey-sdk/src/react/components/ExportPrivateKeyDrawer.tsx`

**Purpose**: Provide React integration for the Lit component

```typescript
import React from 'react';
import { createComponent } from '@lit/react';
import ExportPrivateKeyDrawerElement from '../../core/WebAuthnManager/LitComponents/ExportPrivateKeyDrawer';

export interface ExportPrivateKeyDrawerProps {
  open?: boolean;
  theme?: 'dark' | 'light';
  accountId?: string;
  publicKey?: string;
  privateKey?: string;
  loading?: boolean;
  errorMessage?: string;
  className?: string;
  style?: React.CSSProperties;
  onClose?: () => void;
  onCopy?: (type: 'publicKey' | 'privateKey', value: string) => void;
}

export const ExportPrivateKeyDrawer = createComponent({
  react: React,
  tagName: 'w3a-export-private-key-drawer',
  elementClass: ExportPrivateKeyDrawerElement,
  displayName: 'ExportPrivateKeyDrawer',
  events: {
    onClose: 'cancel',
    onCopy: 'copy',
  },
});

export default ExportPrivateKeyDrawer;
```

### Step 7: Update Type Definitions

**File**: `passkey-sdk/src/core/types/signer-worker.ts`

**Additions**:
```typescript
// New request type for private key export
export enum WorkerRequestType {
  // ... existing types ...
  ExportPrivateKey = 'EXPORT_PRIVATE_KEY',
}

// New response type for private key export
export enum WorkerResponseType {
  // ... existing types ...
  ExportPrivateKeySuccess = 'EXPORT_PRIVATE_KEY_SUCCESS',
}

// Type guards
export function isExportPrivateKeySuccess(response: any): response is {
  type: WorkerResponseType.ExportPrivateKeySuccess;
  payload: {
    accountId: string;
    publicKey: string;
    privateKey: string;
  };
} {
  return response?.type === WorkerResponseType.ExportPrivateKeySuccess;
}
```

### Step 8: Update Bundle Configuration

**File**: `passkey-sdk/rolldown.config.ts`

**Changes**:
- Ensure ExportPrivateKeyDrawer is included in the bundle
- Add proper tree-shaking configuration
- Include in both ESM and CJS builds
