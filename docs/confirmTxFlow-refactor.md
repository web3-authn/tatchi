# Confirm Transaction Flow Refactoring Plan

## Executive Summary

The `confirmTxFlow` module in `sdk/src/core/WebAuthnManager/VrfWorkerManager/confirmTxFlow/` handles secure user confirmations for various operations (transactions, registrations, key exports). While functionally sound and well-tested, the codebase has accumulated complexity that impacts readability and maintainability. This plan outlines specific refactoring steps to improve code organization, reduce duplication, and enhance testability without changing external behavior.

## Current State Analysis

### Strengths
- **Clear separation of concerns**: Flow handlers are separated by operation type (LocalOnly, Registration, Signing)
- **Comprehensive README**: Documents flow logic, configuration pipeline, and message handshake
- **Type safety**: Uses discriminated unions to bind request types to payloads
- **Good test coverage**: Unit tests cover success paths, defensive paths, and edge cases

### Problem Areas

#### 1. Code Duplication Across Flow Handlers

**Location**: `flows/localOnly.ts`, `flows/transactions.ts`, `flows/registration.ts`

**Issues**:
- Each flow implements its own `send()` function (identical implementation)
- Each flow implements its own `closeModalSafely()` function (identical implementation)
- Credential collection patterns are similar but duplicated
- Error handling for TouchID cancellation is repeated across flows
- Worker response formatting is duplicated

**Impact**: Changes to error handling, serialization, or response format require updates in 3+ places.

#### 2. Large Helper Functions with Multiple Responsibilities

**Location**: `flows/common.ts`

**Issues**:
- `renderConfirmUI()` (130+ lines) handles UI mounting, decision awaiting, and export viewer special-casing
- `fetchNearContext()` combines nonce reservation, RPC fallback, and error handling
- `maybeRefreshVrfChallenge()` conflates retry logic with VRF/NEAR operations

**Impact**: Difficult to test individual concerns; changes to one aspect affect unrelated code.

#### 3. Inconsistent Error Handling Patterns

**Issues**:
- Some flows throw errors, others return error objects
- TouchID cancellation detection uses similar but not identical code
- Error sanitization happens at different levels (flow vs. orchestrator)
- Missing error recovery paths in some flows

**Impact**: Unpredictable error behavior; difficult to maintain consistent error UX.

#### 4. Complex Type Narrowing and Guards

**Location**: `flows/common.ts` helpers like `getNearAccountId()`, `getTxCount()`

**Issues**:
- Manual type narrowing with `as` assertions throughout
- No centralized type guards for payload extraction
- `ensureTypedRequest()` is a placeholder that doesn't provide runtime safety

**Impact**: Runtime type errors possible; verbose code with repeated narrowing logic.

#### 5. Configuration Merging Logic

**Location**: `determineConfirmationConfig.ts`

**Issues**:
- Complex precedence rules scattered across the function
- Mobile/iOS detection and clamping logic inline
- Iframe detection uses inline anonymous IIFE
- Difficult to test individual configuration rules

**Impact**: Hard to reason about effective config; testing requires full integration.

#### 6. Mixed Concerns in Flow Handlers

**Issues**:
- Flow handlers mix orchestration, data fetching, UI rendering, and credential collection
- Nonce management embedded in transaction flow
- WrapKeySeed derivation logic inline in transaction flow
- Hard to follow the happy path vs. error paths

**Impact**: Difficult to modify one aspect without affecting others; large functions with nested try-catch blocks.

## Refactoring Goals

1. **Eliminate code duplication** across flow handlers
2. **Break down large functions** into focused, testable units
3. **Standardize error handling** across all flows
4. **Improve type safety** with proper guards and narrowing utilities
5. **Separate concerns** (orchestration, data fetching, UI, credential collection)
6. **Enhance testability** by making functions pure and composable where possible
7. **Maintain backward compatibility** - no breaking changes to external APIs

## Proposed Changes

### Phase 1: Shared Utilities and Foundation

#### 1.1 Create Shared Response Utilities

**New file**: `flows/shared/response.ts`

```typescript
/**
 * Centralized worker response utilities to eliminate duplication.
 */

import { SecureConfirmMessageType, SecureConfirmDecision } from '../../types';
import { sanitizeForPostMessage } from '../common';

export function sendWorkerResponse(
  worker: Worker,
  response: SecureConfirmDecision
): void {
  const sanitized = sanitizeForPostMessage(response);
  worker.postMessage({
    type: SecureConfirmMessageType.USER_PASSKEY_CONFIRM_RESPONSE,
    data: sanitized
  });
}

export function sendWorkerError(
  worker: Worker,
  requestId: string,
  error: string,
  intentDigest?: string
): void {
  sendWorkerResponse(worker, {
    requestId,
    intentDigest,
    confirmed: false,
    error,
  });
}

export function sendWorkerSuccess(
  worker: Worker,
  response: Omit<SecureConfirmDecision, 'confirmed'>
): void {
  sendWorkerResponse(worker, {
    ...response,
    confirmed: true,
  });
}
```

**Impact**: Eliminates 3 duplicate `send()` implementations; centralizes response format.

#### 1.2 Create Shared UI Utilities

**New file**: `flows/shared/ui.ts`

```typescript
/**
 * Centralized UI management utilities.
 */

import type { ConfirmUIHandle } from '../../../LitComponents/confirm-ui';

export function closeConfirmUI(
  handle: ConfirmUIHandle | undefined,
  confirmed: boolean
): void {
  if (!handle?.close) return;
  try {
    handle.close(confirmed);
  } catch (error) {
    console.warn('[ConfirmUI] Error closing UI:', error);
  }
}

export function updateConfirmUI(
  handle: ConfirmUIHandle | undefined,
  updates: Record<string, unknown>
): void {
  if (!handle?.update) return;
  try {
    handle.update(updates);
  } catch (error) {
    console.warn('[ConfirmUI] Error updating UI:', error);
  }
}
```

**Impact**: Eliminates 3 duplicate `closeModalSafely()` implementations; adds defensive error handling.

#### 1.3 Create Standardized Error Handling

**New file**: `flows/shared/errors.ts`

```typescript
/**
 * Standardized error handling for confirmation flows.
 */

import { toError, isTouchIdCancellationError } from '../../../../../utils/errors';

export interface FlowError {
  type: 'user_cancelled' | 'credential_failed' | 'near_rpc_failed' | 'vrf_failed' | 'unknown';
  message: string;
  userFacing: string;
  originalError?: unknown;
}

export function classifyError(error: unknown): FlowError {
  const err = toError(error);

  // TouchID/FaceID user cancellation
  if (isTouchIdCancellationError(error) ||
      err.name === 'NotAllowedError' ||
      err.name === 'AbortError') {
    return {
      type: 'user_cancelled',
      message: err.message,
      userFacing: 'User cancelled secure confirm request',
      originalError: error,
    };
  }

  // Missing PRF outputs
  if (/Missing PRF result/i.test(err.message)) {
    return {
      type: 'credential_failed',
      message: err.message,
      userFacing: 'Failed to collect credentials: Missing PRF output',
      originalError: error,
    };
  }

  // NEAR RPC errors
  if (err.message.includes('NEAR_RPC_FAILED') || err.message.includes('RPC')) {
    return {
      type: 'near_rpc_failed',
      message: err.message,
      userFacing: 'Failed to connect to NEAR network',
      originalError: error,
    };
  }

  // VRF errors
  if (err.message.includes('VRF')) {
    return {
      type: 'vrf_failed',
      message: err.message,
      userFacing: 'Failed to generate verification challenge',
      originalError: error,
    };
  }

  return {
    type: 'unknown',
    message: err.message,
    userFacing: err.message || 'An unexpected error occurred',
    originalError: error,
  };
}

export function shouldPostUIClosedMessage(error: FlowError): boolean {
  return error.type === 'user_cancelled';
}

export function shouldRethrowError(error: FlowError): boolean {
  // Only rethrow critical errors that need defensive path testing
  return error.type === 'credential_failed' &&
         error.message.includes('Missing PRF');
}
```

**Impact**: Eliminates repeated error classification logic; provides consistent error handling.

#### 1.4 Improve Type Guards and Payload Extraction

**New file**: `flows/shared/typeGuards.ts`

```typescript
/**
 * Centralized type guards and payload extraction utilities.
 */

import {
  SecureConfirmRequest,
  SecureConfirmationType,
  SignTransactionPayload,
  SignNep413Payload,
  RegisterAccountPayload,
  DecryptPrivateKeyWithPrfPayload,
  ShowSecurePrivateKeyUiPayload,
} from '../../types';

// Type-safe payload extractors
export function getSignTransactionPayload(
  request: SecureConfirmRequest
): SignTransactionPayload {
  if (request.type !== SecureConfirmationType.SIGN_TRANSACTION) {
    throw new Error(`Expected SIGN_TRANSACTION, got ${request.type}`);
  }
  return request.payload as SignTransactionPayload;
}

export function getSignNep413Payload(
  request: SecureConfirmRequest
): SignNep413Payload {
  if (request.type !== SecureConfirmationType.SIGN_NEP413_MESSAGE) {
    throw new Error(`Expected SIGN_NEP413_MESSAGE, got ${request.type}`);
  }
  return request.payload as SignNep413Payload;
}

export function getRegisterAccountPayload(
  request: SecureConfirmRequest
): RegisterAccountPayload {
  if (request.type !== SecureConfirmationType.REGISTER_ACCOUNT &&
      request.type !== SecureConfirmationType.LINK_DEVICE) {
    throw new Error(`Expected REGISTER_ACCOUNT or LINK_DEVICE, got ${request.type}`);
  }
  return request.payload as RegisterAccountPayload;
}

export function getDecryptPayload(
  request: SecureConfirmRequest
): DecryptPrivateKeyWithPrfPayload {
  if (request.type !== SecureConfirmationType.DECRYPT_PRIVATE_KEY_WITH_PRF) {
    throw new Error(`Expected DECRYPT_PRIVATE_KEY_WITH_PRF, got ${request.type}`);
  }
  return request.payload as DecryptPrivateKeyWithPrfPayload;
}

export function getExportPayload(
  request: SecureConfirmRequest
): ShowSecurePrivateKeyUiPayload {
  if (request.type !== SecureConfirmationType.SHOW_SECURE_PRIVATE_KEY_UI) {
    throw new Error(`Expected SHOW_SECURE_PRIVATE_KEY_UI, got ${request.type}`);
  }
  return request.payload as ShowSecurePrivateKeyUiPayload;
}

// Safe extraction with defaults
export function safeGetNearAccountId(request: SecureConfirmRequest): string {
  try {
    switch (request.type) {
      case SecureConfirmationType.SIGN_TRANSACTION:
        return getSignTransactionPayload(request).rpcCall.nearAccountId;
      case SecureConfirmationType.SIGN_NEP413_MESSAGE:
        return getSignNep413Payload(request).nearAccountId;
      case SecureConfirmationType.REGISTER_ACCOUNT:
      case SecureConfirmationType.LINK_DEVICE:
        return getRegisterAccountPayload(request).nearAccountId;
      case SecureConfirmationType.DECRYPT_PRIVATE_KEY_WITH_PRF:
        return getDecryptPayload(request).nearAccountId || '';
      case SecureConfirmationType.SHOW_SECURE_PRIVATE_KEY_UI:
        return getExportPayload(request).nearAccountId || '';
      default:
        return '';
    }
  } catch {
    return '';
  }
}
```

**Impact**: Eliminates `as` assertions; provides runtime type checking; centralizes payload logic.

### Phase 2: Break Down Large Functions

#### 2.1 Refactor `renderConfirmUI()`

**Current**: 130+ line function mixing UI mounting, export viewer, and decision logic.

**Proposed**: Split into focused functions in `flows/shared/uiRenderer.ts`:

```typescript
/**
 * UI rendering pipeline - each function has a single responsibility.
 */

// Step 1: Determine UI requirements
export function determineUIRequirements(
  request: SecureConfirmRequest,
  config: ConfirmationConfig
): {
  shouldSkip: boolean;
  isExportViewer: boolean;
  uiMode: 'modal' | 'drawer';
  shouldAutoProceed: boolean;
  autoProceedDelay: number;
} {
  // Logic extracted from renderConfirmUI switch/case
  // ...
}

// Step 2: Mount export viewer (specialized)
export async function mountExportViewer(
  request: SecureConfirmRequest,
  config: ConfirmationConfig
): Promise<{ confirmed: boolean; confirmHandle: ConfirmUIHandle }> {
  // Extracted export viewer mounting logic
  // ...
}

// Step 3: Mount standard confirmation UI
export async function mountStandardConfirmUI(
  ctx: VrfWorkerManagerContext,
  request: SecureConfirmRequest,
  transactionSummary: TransactionSummary,
  vrfChallenge: VRFChallenge,
  config: ConfirmationConfig
): Promise<ConfirmUIHandle> {
  // Extracted modal/drawer mounting logic
  // ...
}

// Step 4: Await user decision (when required)
export async function awaitUserDecision(
  ctx: VrfWorkerManagerContext,
  request: SecureConfirmRequest,
  transactionSummary: TransactionSummary,
  vrfChallenge: VRFChallenge,
  config: ConfirmationConfig
): Promise<{ confirmed: boolean; handle: ConfirmUIHandle; error?: string }> {
  // Extracted decision awaiting logic
  // ...
}

// Orchestrator (simplified)
export async function renderConfirmUI(params: RenderUIParams): Promise<UIResult> {
  const requirements = determineUIRequirements(params.request, params.confirmationConfig);

  if (requirements.shouldSkip) {
    return { confirmed: true };
  }

  if (requirements.isExportViewer) {
    return mountExportViewer(params.request, params.confirmationConfig);
  }

  if (requirements.shouldAutoProceed) {
    const handle = await mountStandardConfirmUI(...);
    await delay(requirements.autoProceedDelay);
    return { confirmed: true, confirmHandle: handle };
  }

  return awaitUserDecision(...);
}
```

**Impact**: Each function is ~20-30 lines, testable in isolation, single responsibility.

#### 2.2 Refactor `fetchNearContext()`

**Current**: 50+ line function mixing nonce reservation, RPC calls, and fallback logic.

**Proposed**: Split into focused functions in `flows/shared/nearContext.ts`:

```typescript
/**
 * NEAR context fetching pipeline.
 */

// Step 1: Try nonce manager path
async function tryNonceManagerPath(
  ctx: VrfWorkerManagerContext,
  txCount: number
): Promise<{ context: TransactionContext; nonces: string[] } | null> {
  try {
    const context = await ctx.nonceManager.getNonceBlockHashAndHeight(ctx.nearClient);
    const nonces = ctx.nonceManager.reserveNonces(txCount);
    context.nextNonce = nonces[0];
    return { context, nonces };
  } catch {
    return null;
  }
}

// Step 2: Fallback to direct RPC
async function tryDirectRpcPath(
  ctx: VrfWorkerManagerContext
): Promise<TransactionContext | null> {
  try {
    const block = await ctx.nearClient.viewBlock({ finality: 'final' });
    return {
      nearPublicKeyStr: '',
      accessKeyInfo: { nonce: 0, permission: 'FullAccess' } as any,
      nextNonce: '0',
      txBlockHeight: String(block?.header?.height ?? ''),
      txBlockHash: String(block?.header?.hash ?? ''),
    };
  } catch {
    return null;
  }
}

// Orchestrator
export async function fetchNearContext(
  ctx: VrfWorkerManagerContext,
  opts: { nearAccountId: string; txCount: number }
): Promise<NearContextResult> {
  // Try nonce manager first
  const nonceResult = await tryNonceManagerPath(ctx, opts.txCount);
  if (nonceResult) {
    return {
      transactionContext: nonceResult.context,
      reservedNonces: nonceResult.nonces,
    };
  }

  // Fallback to direct RPC
  const fallbackContext = await tryDirectRpcPath(ctx);
  if (fallbackContext) {
    return { transactionContext: fallbackContext };
  }

  // Both paths failed
  return {
    transactionContext: null,
    error: 'NEAR_RPC_FAILED',
    details: 'Failed to fetch block context from both nonce manager and direct RPC',
  };
}
```

**Impact**: Clear fallback strategy; each path is testable; orchestrator shows the logic flow.

#### 2.3 Refactor `maybeRefreshVrfChallenge()`

**Current**: 45+ line function mixing retry logic with VRF operations.

**Proposed**: Split into focused functions in `flows/shared/vrfRefresh.ts`:

```typescript
/**
 * VRF challenge refresh with retry logic.
 */

// Step 1: Perform single refresh attempt
async function performVrfRefresh(
  ctx: VrfWorkerManagerContext,
  request: SecureConfirmRequest,
  nearAccountId: string
): Promise<{ vrfChallenge: VRFChallenge; transactionContext: TransactionContext }> {
  const rpId = ctx.touchIdPrompt.getRpId();
  const vrfWorkerManager = ctx.vrfWorkerManager!;

  // Force refresh NEAR context
  const latestCtx = await ctx.nonceManager.getNonceBlockHashAndHeight(
    ctx.nearClient,
    { force: true }
  );

  // Generate VRF challenge based on flow type
  const vrfChallenge = await generateVrfChallengeForFlow(
    vrfWorkerManager,
    request,
    nearAccountId,
    rpId,
    latestCtx
  );

  return { vrfChallenge, transactionContext: latestCtx };
}

// Step 2: Generate VRF challenge for specific flow
async function generateVrfChallengeForFlow(
  vrfWorkerManager: VrfWorkerManager,
  request: SecureConfirmRequest,
  nearAccountId: string,
  rpId: string,
  context: TransactionContext
): Promise<VRFChallenge> {
  const isRegistration =
    request.type === SecureConfirmationType.REGISTER_ACCOUNT ||
    request.type === SecureConfirmationType.LINK_DEVICE;

  if (isRegistration) {
    const result = await vrfWorkerManager.generateVrfKeypairBootstrap({
      vrfInputData: {
        userId: nearAccountId,
        rpId,
        blockHeight: context.txBlockHeight,
        blockHash: context.txBlockHash,
      },
      saveInMemory: true,
    });
    return result.vrfChallenge;
  }

  return vrfWorkerManager.generateVrfChallenge({
    userId: nearAccountId,
    rpId,
    blockHeight: context.txBlockHeight,
    blockHash: context.txBlockHash,
  });
}

// Orchestrator with retry
export async function maybeRefreshVrfChallenge(
  ctx: VrfWorkerManagerContext,
  request: SecureConfirmRequest,
  nearAccountId: string
): Promise<{ vrfChallenge: VRFChallenge; transactionContext: TransactionContext }> {
  return retryWithBackoff(
    () => performVrfRefresh(ctx, request, nearAccountId),
    {
      attempts: 3,
      baseDelayMs: 150,
      onError: (err, attempt) => {
        const msg = errorMessage(err);
        console.debug(`[VRF Refresh] Attempt ${attempt} failed: ${msg}`);
      },
      errorFactory: () => new Error('VRF refresh failed after retries'),
    }
  );
}

// Extract retry utility to shared location
// flows/shared/retry.ts
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions
): Promise<T> {
  // ... existing retry logic ...
}
```

**Impact**: VRF logic separated from retry logic; flow-specific generation isolated; retry is reusable.

### Phase 3: Simplify Flow Handlers

#### 3.1 Create Credential Collection Utilities

**New file**: `flows/shared/credentials.ts`

```typescript
/**
 * Credential collection utilities to eliminate duplication.
 */

export async function collectAuthenticationCredential(
  ctx: VrfWorkerManagerContext,
  nearAccountId: string,
  vrfChallenge: VRFChallenge
): Promise<{
  credential: SerializableCredential;
  prfOutput: string;
}> {
  const authenticators = await ctx.indexedDB.clientDB.getAuthenticatorsByUser(
    toAccountId(nearAccountId)
  );

  const credential = await ctx.touchIdPrompt.getAuthenticationCredentialsInternal({
    nearAccountId,
    challenge: vrfChallenge,
    allowCredentials: authenticatorsToAllowCredentials(authenticators),
  });

  const { chacha20PrfOutput } = extractPrfFromCredential({
    credential,
    firstPrfOutput: true,
    secondPrfOutput: false,
  });

  if (!chacha20PrfOutput) {
    throw new Error('Missing PRF result from credential');
  }

  const serialized = serializeAuthenticationCredentialWithPRF({ credential });

  return {
    credential: serialized,
    prfOutput: chacha20PrfOutput,
  };
}

export async function collectAndDeriveWrapKeySeed(
  ctx: VrfWorkerManagerContext,
  request: SecureConfirmRequest,
  nearAccountId: string,
  vrfChallenge: VRFChallenge
): Promise<{
  credential: SerializableCredential;
  wrapKeySalt: string;
}> {
  const { credential, prfOutput } = await collectAuthenticationCredential(
    ctx,
    nearAccountId,
    vrfChallenge
  );

  // Fetch wrap key salt from vault
  const deviceNumber = await getDeviceNumberForAccount(
    toAccountId(nearAccountId),
    ctx.indexedDB.clientDB
  );
  const encryptedKeyData = await ctx.indexedDB.nearKeysDB.getEncryptedKey(
    nearAccountId,
    deviceNumber
  );
  const wrapKeySalt = encryptedKeyData?.wrapKeySalt || encryptedKeyData?.iv || '';

  if (!wrapKeySalt) {
    throw new Error('Missing wrapKeySalt in vault; re-register to upgrade vault format');
  }

  // Extract contract verification context
  const { contractId, nearRpcUrl } = extractVerificationContext(request);

  // Derive and send WrapKeySeed to signer worker
  await ctx.vrfWorkerManager!.deriveWrapKeySeedAndSendToSigner({
    sessionId: request.requestId,
    prfFirstAuthB64u: prfOutput,
    wrapKeySalt,
    contractId,
    nearRpcUrl,
    vrfChallenge,
    credential,
  });

  return { credential, wrapKeySalt };
}

function extractVerificationContext(
  request: SecureConfirmRequest
): { contractId?: string; nearRpcUrl?: string } {
  if (request.type === SecureConfirmationType.SIGN_TRANSACTION) {
    const payload = getSignTransactionPayload(request);
    return {
      contractId: payload.rpcCall?.contractId,
      nearRpcUrl: payload.rpcCall?.nearRpcUrl,
    };
  }

  if (request.type === SecureConfirmationType.SIGN_NEP413_MESSAGE) {
    const defaultRpc = PASSKEY_MANAGER_DEFAULT_CONFIGS.nearRpcUrl;
    return {
      contractId: PASSKEY_MANAGER_DEFAULT_CONFIGS.contractId,
      nearRpcUrl: defaultRpc.split(',')[0] || defaultRpc,
    };
  }

  return {};
}
```

**Impact**: Eliminates credential collection duplication; centralizes WrapKeySeed logic.

#### 3.2 Refactor Transaction Signing Flow

**Updated**: `flows/transactions.ts`

```typescript
/**
 * Simplified transaction signing flow using shared utilities.
 */

import {
  sendWorkerResponse,
  sendWorkerError,
  sendWorkerSuccess,
} from './shared/response';
import { closeConfirmUI, updateConfirmUI } from './shared/ui';
import { classifyError, shouldPostUIClosedMessage, shouldRethrowError } from './shared/errors';
import { collectAndDeriveWrapKeySeed } from './shared/credentials';
import { fetchNearContext } from './shared/nearContext';
import { maybeRefreshVrfChallenge } from './shared/vrfRefresh';
import { renderConfirmUI } from './shared/uiRenderer';
import { safeGetNearAccountId, getIntentDigest, getTxCount } from './shared/typeGuards';

export async function handleTransactionSigningFlow(
  ctx: VrfWorkerManagerContext,
  request: SigningSecureConfirmRequest,
  worker: Worker,
  opts: { confirmationConfig: ConfirmationConfig; transactionSummary: TransactionSummary }
): Promise<void> {
  const { confirmationConfig, transactionSummary } = opts;
  const nearAccountId = safeGetNearAccountId(request);

  // Step 1: Fetch NEAR context + reserve nonces
  const nearRpc = await fetchNearContext(ctx, {
    nearAccountId,
    txCount: getTxCount(request),
  });

  if (!nearRpc.transactionContext) {
    return sendWorkerError(
      worker,
      request.requestId,
      `Failed to fetch NEAR data: ${nearRpc.details}`,
      getIntentDigest(request)
    );
  }

  let transactionContext = nearRpc.transactionContext;
  const reservedNonces = nearRpc.reservedNonces || [];

  // Step 2: Generate initial VRF challenge
  let vrfChallenge = await generateInitialVrfChallenge(ctx, nearAccountId, transactionContext);

  // Step 3: Render UI and await confirmation
  const uiResult = await renderConfirmUI({
    ctx,
    request,
    confirmationConfig,
    transactionSummary,
    vrfChallenge,
  });

  if (!uiResult.confirmed) {
    releaseNonces(ctx, reservedNonces);
    closeConfirmUI(uiResult.confirmHandle, false);
    return sendWorkerError(
      worker,
      request.requestId,
      uiResult.error || 'User cancelled',
      getIntentDigest(request)
    );
  }

  // Step 4: JIT refresh VRF (best-effort)
  try {
    const refreshed = await maybeRefreshVrfChallenge(ctx, request, nearAccountId);
    vrfChallenge = refreshed.vrfChallenge;
    transactionContext = refreshed.transactionContext;
    updateConfirmUI(uiResult.confirmHandle, { vrfChallenge });
  } catch (error) {
    console.debug('[SigningFlow] VRF JIT refresh skipped', error);
  }

  // Step 5: Collect credentials and derive WrapKeySeed
  try {
    const { credential } = await collectAndDeriveWrapKeySeed(
      ctx,
      request,
      nearAccountId,
      vrfChallenge
    );

    // Step 6: Success response
    sendWorkerSuccess(worker, {
      requestId: request.requestId,
      intentDigest: getIntentDigest(request),
      credential,
      vrfChallenge,
      transactionContext,
    });

    closeConfirmUI(uiResult.confirmHandle, true);

  } catch (error) {
    // Step 7: Handle errors with classification
    const flowError = classifyError(error);

    if (shouldPostUIClosedMessage(flowError)) {
      window.parent?.postMessage({ type: 'WALLET_UI_CLOSED' }, '*');
    }

    releaseNonces(ctx, reservedNonces);
    closeConfirmUI(uiResult.confirmHandle, false);

    if (shouldRethrowError(flowError)) {
      throw error;
    }

    sendWorkerError(
      worker,
      request.requestId,
      flowError.userFacing,
      getIntentDigest(request)
    );
  }
}

// Helper functions
async function generateInitialVrfChallenge(
  ctx: VrfWorkerManagerContext,
  nearAccountId: string,
  transactionContext: TransactionContext
): Promise<VRFChallenge> {
  const rpId = ctx.touchIdPrompt.getRpId();
  return ctx.vrfWorkerManager!.generateVrfChallenge({
    userId: nearAccountId,
    rpId,
    blockHeight: transactionContext.txBlockHeight,
    blockHash: transactionContext.txBlockHash,
  });
}

function releaseNonces(ctx: VrfWorkerManagerContext, nonces: string[]): void {
  nonces.forEach(n => ctx.nonceManager.releaseNonce(n));
}
```

**Impact**:
- Flow reduced from ~180 lines to ~120 lines
- Happy path is clear and linear
- Error handling is standardized
- All duplication eliminated
- Each step has a single responsibility

#### 3.3 Refactor Local-Only Flow

**Updated**: `flows/localOnly.ts`

```typescript
/**
 * Simplified local-only flow using shared utilities.
 */

import {
  sendWorkerSuccess,
  sendWorkerError,
} from './shared/response';
import { closeConfirmUI } from './shared/ui';
import { classifyError, shouldPostUIClosedMessage } from './shared/errors';
import { collectAuthenticationCredential } from './shared/credentials';
import { renderConfirmUI } from './shared/uiRenderer';
import { safeGetNearAccountId, getIntentDigest } from './shared/typeGuards';
import { createRandomVRFChallenge } from '../../../../types/vrf-worker';

export async function handleLocalOnlyFlow(
  ctx: VrfWorkerManagerContext,
  request: LocalOnlySecureConfirmRequest,
  worker: Worker,
  opts: { confirmationConfig: ConfirmationConfig; transactionSummary: TransactionSummary }
): Promise<void> {
  const { confirmationConfig, transactionSummary } = opts;
  const nearAccountId = safeGetNearAccountId(request);
  const vrfChallenge = createRandomVRFChallenge();

  // Render UI (export viewer or skip)
  const uiResult = await renderConfirmUI({
    ctx,
    request,
    confirmationConfig,
    transactionSummary,
    vrfChallenge,
  });

  // Export viewer: keep open and return success
  if (request.type === SecureConfirmationType.SHOW_SECURE_PRIVATE_KEY_UI) {
    if (!uiResult.confirmed) {
      closeConfirmUI(uiResult.confirmHandle, false);
      return sendWorkerError(
        worker,
        request.requestId,
        uiResult.error || 'User cancelled',
        getIntentDigest(request)
      );
    }

    // Keep viewer open
    return sendWorkerSuccess(worker, {
      requestId: request.requestId,
      intentDigest: getIntentDigest(request),
    });
  }

  // Decrypt flow: collect credentials and return PRF
  if (request.type === SecureConfirmationType.DECRYPT_PRIVATE_KEY_WITH_PRF) {
    try {
      const { credential, prfOutput } = await collectAuthenticationCredential(
        ctx,
        nearAccountId,
        vrfChallenge
      );

      return sendWorkerSuccess(worker, {
        requestId: request.requestId,
        intentDigest: getIntentDigest(request),
        credential,
        prfOutput,
      });

    } catch (error) {
      const flowError = classifyError(error);

      if (shouldPostUIClosedMessage(flowError)) {
        window.parent?.postMessage({ type: 'WALLET_UI_CLOSED' }, '*');
      }

      closeConfirmUI(uiResult.confirmHandle, false);

      return sendWorkerError(
        worker,
        request.requestId,
        flowError.userFacing,
        getIntentDigest(request)
      );
    }
  }
}
```

**Impact**:
- Flow reduced from ~115 lines to ~80 lines
- Clear separation between export and decrypt paths
- Standardized error handling
- No duplication

#### 3.4 Apply Same Pattern to Registration Flow

**Updated**: `flows/registration.ts`

Similar refactoring approach:
- Use shared response utilities
- Use shared UI utilities
- Use shared error classification
- Use credential collection utilities
- Break down into clear steps

**Impact**: Consistent structure across all three flow handlers.

### Phase 4: Improve Configuration Logic

#### 4.1 Refactor Configuration Determination

**Updated**: `determineConfirmationConfig.ts`

```typescript
/**
 * Simplified configuration determination with extracted rules.
 */

import type { ConfirmationConfig } from '../../../types/signer-worker';
import type { VrfWorkerManagerContext } from '../';
import type { SecureConfirmRequest } from './types';
import { SecureConfirmationType } from './types';

// Extract detection utilities
function isInIframe(): boolean {
  return window.self !== window.top;
}

function isRegistrationFlow(requestType: SecureConfirmationType): boolean {
  return (
    requestType === SecureConfirmationType.REGISTER_ACCOUNT ||
    requestType === SecureConfirmationType.LINK_DEVICE
  );
}

function isDecryptFlow(requestType: SecureConfirmationType): boolean {
  return requestType === SecureConfirmationType.DECRYPT_PRIVATE_KEY_WITH_PRF;
}

// Extract configuration rules
function applyDecryptFlowRule(config: ConfirmationConfig): ConfirmationConfig {
  return {
    ...config,
    uiMode: 'skip',
  };
}

function applyMobileActivationRule(config: ConfirmationConfig): ConfirmationConfig {
  const newUiMode = config.uiMode === 'skip' ? 'drawer' : config.uiMode;
  return {
    ...config,
    uiMode: newUiMode,
    behavior: 'requireClick',
  };
}

function applyIframeRegistrationRule(config: ConfirmationConfig): ConfirmationConfig {
  return {
    ...config,
    uiMode: 'modal',
    behavior: 'requireClick',
  };
}

// Main function (simplified)
export function determineConfirmationConfig(
  ctx: VrfWorkerManagerContext,
  request: SecureConfirmRequest | undefined
): ConfirmationConfig {
  // Step 1: Merge base config with override
  const baseConfig = ctx.userPreferencesManager.getConfirmationConfig();
  const override = cleanOverride(request?.confirmationConfig);
  let config: ConfirmationConfig = { ...baseConfig, ...override };

  // Step 2: Normalize theme
  config = { ...config, theme: config.theme || 'dark' };

  // Step 3: Apply flow-specific rules
  if (request && isDecryptFlow(request.type)) {
    return applyDecryptFlowRule(config);
  }

  // Step 4: Apply platform rules
  if (needsExplicitActivation()) {
    config = applyMobileActivationRule(config);
  }

  // Step 5: Apply iframe registration rule
  if (request && isInIframe() && isRegistrationFlow(request.type)) {
    config = applyIframeRegistrationRule(config);
  }

  return config;
}

// Extract override cleaning
function cleanOverride(
  override: Partial<ConfirmationConfig> | undefined
): Partial<ConfirmationConfig> {
  if (!override) return {};

  return Object.fromEntries(
    Object.entries(override).filter(([, v]) => v !== undefined && v !== null)
  ) as Partial<ConfirmationConfig>;
}
```

**Impact**:
- Each rule is isolated and testable
- Clear rule application order
- Easier to add/modify rules
- Detection logic extracted

### Phase 5: Testing Strategy

#### 5.1 Unit Test Structure

Create focused unit tests for new shared utilities:

**New file**: `__tests__/unit/confirmTxFlow.shared.response.test.ts`
- Test `sendWorkerResponse()` serialization
- Test `sendWorkerError()` format
- Test `sendWorkerSuccess()` format

**New file**: `__tests__/unit/confirmTxFlow.shared.errors.test.ts`
- Test error classification for each error type
- Test `shouldPostUIClosedMessage()` logic
- Test `shouldRethrowError()` logic

**New file**: `__tests__/unit/confirmTxFlow.shared.typeGuards.test.ts`
- Test each payload extractor
- Test runtime type checking
- Test safe extraction with invalid inputs

**New file**: `__tests__/unit/confirmTxFlow.shared.credentials.test.ts`
- Test credential collection in isolation
- Test WrapKeySeed derivation flow
- Test verification context extraction

#### 5.2 Integration Test Updates

Update existing integration tests to verify refactored behavior:

- `confirmTxFlow.successPaths.test.ts`: Ensure success paths still work
- `confirmTxFlow.defensivePaths.test.ts`: Ensure error handling still works
- `confirmTxFlow.determineConfirmationConfig.test.ts`: Add tests for extracted rules

#### 5.3 Test Coverage Goals

- Shared utilities: 95%+ coverage (they're small and focused)
- Flow handlers: 85%+ coverage (integration-heavy)
- Configuration logic: 90%+ coverage (rule-based, testable)

### Phase 6: Migration and Validation

#### 6.1 Migration Steps

1. **Create shared utilities** (Phase 1)
   - Implement new shared modules
   - Add unit tests for each module
   - No changes to existing code yet

2. **Refactor one flow at a time** (Phase 2-3)
   - Start with `localOnly.ts` (simplest)
   - Then `registration.ts`
   - Finally `transactions.ts` (most complex)
   - Run tests after each flow migration

3. **Update configuration logic** (Phase 4)
   - Refactor `determineConfirmationConfig.ts`
   - Update related tests
   - Verify all configuration scenarios

4. **Update common.ts** (Phase 2)
   - Move functions to new shared locations
   - Update imports in flow handlers
   - Remove old implementations
   - Update tests

5. **Final cleanup**
   - Remove deprecated exports
   - Update documentation
   - Run full test suite

#### 6.2 Validation Checklist

- [ ] All existing tests pass
- [ ] New unit tests for shared utilities
- [ ] Integration tests cover refactored flows
- [ ] No breaking changes to public APIs
- [ ] Performance is equivalent or better
- [ ] Error messages are user-friendly
- [ ] Code review completed
- [ ] Documentation updated

#### 6.3 Rollback Plan

Each phase can be rolled back independently:
- Shared utilities are additive (no breaking changes)
- Flow handlers can be reverted one at a time
- Configuration logic is isolated

If issues arise:
1. Identify the problematic phase
2. Revert commits for that phase only
3. Fix issues in a branch
4. Re-apply with fixes

## Benefits Summary

### Maintainability
- **Reduced duplication**: 3 duplicate `send()` functions → 1 shared utility
- **Reduced duplication**: 3 duplicate error handlers → 1 shared classifier
- **Smaller functions**: 130-line renderUI → 4 focused 20-30 line functions
- **Clear separation**: UI, data fetching, credentials, errors all separated

### Readability
- **Linear flow**: Each handler shows clear steps (fetch → UI → collect → respond)
- **Named functions**: `collectAuthenticationCredential()` vs inline try-catch blocks
- **Type safety**: Runtime-checked payload extraction vs `as` assertions
- **Error clarity**: Classified errors with user-facing messages

### Testability
- **Unit testable**: All shared utilities can be tested in isolation
- **Focused tests**: Each function tests one responsibility
- **Mock friendly**: Clear dependency injection points
- **Regression safe**: Existing integration tests catch breaking changes

### Performance
- **No regression**: Refactoring doesn't change execution paths
- **Potential improvement**: Shared serialization can be optimized once
- **Better caching**: Extracted functions enable memoization opportunities

## Timeline Estimate

- **Phase 1** (Shared utilities): 2-3 days
- **Phase 2** (Break down large functions): 3-4 days
- **Phase 3** (Simplify flow handlers): 4-5 days
- **Phase 4** (Configuration logic): 2-3 days
- **Phase 5** (Testing): 3-4 days
- **Phase 6** (Migration & validation): 2-3 days

**Total**: ~16-22 days (3-4 weeks)

Can be done incrementally with each phase providing immediate value.

## Risk Assessment

### Low Risk
- Creating new shared utilities (additive only)
- Adding unit tests for new code
- Documentation updates

### Medium Risk
- Refactoring flow handlers (covered by integration tests)
- Breaking down large functions (behavior must remain identical)

### High Risk (None Identified)
- All changes are internal refactorings
- Public APIs unchanged
- Comprehensive test coverage exists

### Mitigation
- Incremental migration (one flow at a time)
- Run full test suite after each phase
- Code review at each phase boundary
- Keep rollback plan ready

## Success Criteria

1. **All existing tests pass** without modification
2. **New unit tests** achieve 90%+ coverage on shared utilities
3. **Code metrics improve**:
   - Average function length: < 50 lines (currently 60-130)
   - Duplication: < 5% (currently ~15%)
   - Cyclomatic complexity: < 10 per function (currently up to 15)
4. **No performance regression** (measured via existing benchmarks)
5. **Positive code review** from 2+ team members
6. **Documentation updated** to reflect new structure

## Future Improvements (Out of Scope)

These improvements are not part of this refactoring but could be considered later:

1. **Async state management**: Use a state machine for flow orchestration
2. **Event-driven architecture**: Replace worker postMessage with EventEmitter
3. **Retry strategies**: Configurable retry policies per operation
4. **Metrics and telemetry**: Add performance tracking for each phase
5. **A/B testing support**: Infrastructure for testing UI config variations

## Appendix: File Structure

### Before Refactoring
```
confirmTxFlow/
├── index.ts (exports)
├── README.md
├── types.ts
├── awaitSecureConfirmation.ts
├── determineConfirmationConfig.ts
├── handleSecureConfirmRequest.ts
└── flows/
    ├── common.ts (large, mixed concerns)
    ├── localOnly.ts (duplication)
    ├── registration.ts (duplication)
    └── transactions.ts (duplication)
```

### After Refactoring
```
confirmTxFlow/
├── index.ts (exports)
├── README.md
├── types.ts
├── awaitSecureConfirmation.ts
├── determineConfirmationConfig.ts (simplified)
├── handleSecureConfirmRequest.ts (unchanged)
└── flows/
    ├── common.ts (re-exports, backward compat)
    ├── localOnly.ts (simplified, 80 lines)
    ├── registration.ts (simplified, ~100 lines)
    ├── transactions.ts (simplified, ~120 lines)
    └── shared/
        ├── response.ts (worker communication)
        ├── ui.ts (UI management)
        ├── errors.ts (error classification)
        ├── typeGuards.ts (type safety)
        ├── credentials.ts (credential collection)
        ├── nearContext.ts (NEAR data fetching)
        ├── vrfRefresh.ts (VRF challenge refresh)
        ├── uiRenderer.ts (UI rendering pipeline)
        └── retry.ts (retry utilities)
```

## Conclusion

This refactoring plan provides a systematic approach to improving the confirmTxFlow codebase without breaking existing functionality. By eliminating duplication, breaking down large functions, and standardizing patterns, we'll achieve a more maintainable, testable, and readable implementation. The incremental migration strategy minimizes risk while delivering value at each phase.
