import {
  extractPrfFromCredential,
  serializeRegistrationCredentialWithPRF,
  serializeAuthenticationCredentialWithPRF,
} from '../../credentialsHelpers';
import type { SignerWorkerManagerContext } from '../index';
import type { ConfirmationConfig } from '../../../types/signer-worker';
import { determineConfirmationConfig } from './determineConfirmationConfig';
import {
  SecureConfirmDecision,
  TransactionSummary,
  SecureConfirmMessageType,
  SecureConfirmRequest,
  SecureConfirmationType,
  SignTransactionPayload,
  RegisterAccountPayload,
} from './types';
import { TransactionContext, VRFChallenge } from '../../../types';
import { toAccountId } from '../../../types/accountIds';
import { awaitModalTxConfirmerDecision, mountModalTxConfirmer } from '../../LitComponents/modal';
import { IFRAME_BUTTON_ID } from '../../LitComponents/IframeButtonWithTooltipConfirmer/tags';
import { authenticatorsToAllowCredentials } from '../../touchIdPrompt';
import { VrfChallenge } from '@/wasm_signer_worker/wasm_signer_worker';

/**
 * Handles secure confirmation requests from the worker with robust error handling
 * => SecureConfirmMessageType.PROMPT_USER_CONFIRM_IN_JS_MAIN_THREAD
 * and proper data validation. Supports both transaction and registration confirmation flows.
 */
export async function handlePromptUserConfirmInJsMainThread(
  ctx: SignerWorkerManagerContext,
  message: {
    type: SecureConfirmMessageType.PROMPT_USER_CONFIRM_IN_JS_MAIN_THREAD,
    data: SecureConfirmRequest,
  },
  worker: Worker
): Promise<void> {
  // 1. Validate and parse request
  let request: SecureConfirmRequest;
  let summary: TransactionSummary;
  let confirmationConfig: ConfirmationConfig;
  let transactionSummary: TransactionSummary;
  try {
    const parsed = validateAndParseRequest({ ctx, request: message.data });
    request = parsed.request;
    summary = parsed.summary;
    confirmationConfig = parsed.confirmationConfig;
    transactionSummary = parsed.transactionSummary;
  } catch (e: any) {
    console.error('[SecureConfirm][Host] validateAndParseRequest failed', e);
    // Attempt to send a structured error back to the worker to avoid hard failure
    try {
      const rid = message?.data?.requestId;
      sendWorkerResponse(worker, {
        requestId: rid,
        confirmed: false,
        error: e?.message || 'Invalid secure confirm request'
      });
      return;
    } catch (_) {
      throw e;
    }
  }

  // Set invocation source hint if missing: detect embedded iframe button presence
  try {
    if (!request.invokedFrom) {
      const el = document.querySelector(IFRAME_BUTTON_ID);
      request.invokedFrom = el ? 'iframe' : 'parent';
    }
  } catch {}

  // Extra diagnostics: ensure payload exists and has required fields
  if (!request?.payload) {
    console.error('[SecureConfirm][Host] Invalid secure confirm request: missing payload', request);
    sendWorkerResponse(worker, {
      requestId: request.requestId,
      confirmed: false,
      error: 'Invalid secure confirm request - missing payload'
    });
    return;
  }

  // 2. Perform NEAR RPC calls first (needed for VRF challenge)
  const nearAccountId = request.type === SecureConfirmationType.SIGN_TRANSACTION
    ? (request.payload as SignTransactionPayload).rpcCall.nearAccountId
    : (request.payload as RegisterAccountPayload).nearAccountId;
  const txCount = request.type === SecureConfirmationType.SIGN_TRANSACTION
    ? ((request.payload as SignTransactionPayload).txSigningRequests?.length || 1)
    : 1;
  const nearRpcResult = await performNearRpcCalls(ctx, { nearAccountId, txCount });

  // 3. If NEAR RPC failed, return error
  if (nearRpcResult.error || !nearRpcResult.transactionContext) {
    sendWorkerResponse(worker, {
      requestId: request.requestId,
      intentDigest: (request.type === SecureConfirmationType.SIGN_TRANSACTION
        ? (request.payload as SignTransactionPayload).intentDigest
        : undefined),
      confirmed: false,
      error: `Failed to fetch NEAR data: ${nearRpcResult.details}`
    });
    return;
  }

  const transactionContext = nearRpcResult.transactionContext;

  // 4. Generate VRF challenge with NEAR data
  if (!ctx.vrfWorkerManager) {
    throw new Error('VrfWorkerManager not available in context');
  }
  // For registration/link flows, there is no unlocked VRF keypair yet.
  // Use the bootstrap path which creates a temporary VRF keypair in-memory
  // and returns a VRF challenge for the WebAuthn create() ceremony.
  const rpId = resolveRpId(ctx.rpIdOverride);
  let vrfChallenge: VRFChallenge;
  if (
    request.type === SecureConfirmationType.REGISTER_ACCOUNT ||
    request.type === SecureConfirmationType.LINK_DEVICE
  ) {
    const bootstrap = await ctx.vrfWorkerManager.generateVrfKeypairBootstrap({
      vrfInputData: {
        userId: nearAccountId,
        rpId,
        blockHeight: transactionContext.txBlockHeight,
        blockHash: transactionContext.txBlockHash,
      },
      saveInMemory: true,
    });
    vrfChallenge = bootstrap.vrfChallenge;
  } else {
    vrfChallenge = await ctx.vrfWorkerManager.generateVrfChallenge({
      userId: nearAccountId,
      rpId,
      blockHeight: transactionContext.txBlockHeight,
      blockHash: transactionContext.txBlockHash,
    });
  }

  // 5. Render user confirmation UI with VRF challenge
  const userConfirmResult = await renderUserConfirmUI({ ctx, confirmationConfig, transactionSummary, request, vrfChallenge });
  const { confirmed, confirmHandle, error: uiError } = userConfirmResult;

  // 6. If user rejected (confirmed === false), exit early
  if (!confirmed) {
    // Release any reserved nonces for this modal request
    try {
      nearRpcResult.reservedNonces?.forEach(n => ctx.nonceManager.releaseNonce(n));
    } catch (e) {
      console.warn('[SignerWorkerManager]: Failed to release reserved nonces on cancel:', e);
    }
    closeModalSafely(confirmHandle, false);
    sendWorkerResponse(worker, {
      requestId: request.requestId,
      intentDigest: (request.type === SecureConfirmationType.SIGN_TRANSACTION
        ? (request.payload as SignTransactionPayload).intentDigest
        : undefined),
      confirmed: false,
      error: uiError
    });
    return;
  }

  // 7. Create decision with generated data
  const decision: SecureConfirmDecision = {
    requestId: request.requestId,
    intentDigest: (request.type === SecureConfirmationType.SIGN_TRANSACTION
      ? (request.payload as SignTransactionPayload).intentDigest
      : undefined),
    confirmed: true,
    vrfChallenge, // Generated here
    transactionContext: transactionContext, // Generated here
  };

  // 8. Collect credentials using generated VRF challenge
  let decisionWithCredentials: SecureConfirmDecision;
  let touchIdSuccess = false;

  try {
    const result = await collectTouchIdCredentials({ ctx, request, decision });
    decisionWithCredentials = result.decisionWithCredentials;
    touchIdSuccess = decisionWithCredentials?.confirmed ?? false;
  } catch (touchIdError) {
    console.error('[SignerWorkerManager]: Failed to collect credentials:', touchIdError);
    const isCancelled = touchIdError instanceof DOMException &&
      (touchIdError.name === 'NotAllowedError' || touchIdError.name === 'AbortError');

    if (isCancelled) {
      console.log('[SignerWorkerManager]: User cancelled secure confirm request');
    }

    decisionWithCredentials = {
      ...decision,
      confirmed: false,
      error: isCancelled ? 'User cancelled secure confirm request' : 'Failed to collect credentials',
      _confirmHandle: undefined,
    };
    touchIdSuccess = false;
  } finally {
    // Always close the modal after TouchID attempt (success or failure)
    closeModalSafely(confirmHandle, touchIdSuccess);
  }

  // 9. Send confirmation response back to wasm-signer-worker
  // Release any reserved nonces if final decision is not confirmed
  try {
    if (!decisionWithCredentials?.confirmed) {
      nearRpcResult.reservedNonces?.forEach(n => ctx.nonceManager.releaseNonce(n));
    }
  } catch (e) {
    console.warn('[SignerWorkerManager]: Failed to release reserved nonces after decision:', e);
  }
  sendWorkerResponse(worker, decisionWithCredentials);
}

/** Resolve a safe RP ID matching current host; only use override if suffix of host. */
function resolveRpId(rpIdOverride?: string): string {
  try {
    const host = (window?.location?.hostname || '').toLowerCase();
    const override = (rpIdOverride || '').toLowerCase();
    if (override && isRegistrableSuffix(host, override)) return override;
    return host;
  } catch {
    return rpIdOverride || '';
  }
}

function isRegistrableSuffix(host: string, cand: string): boolean {
  if (!host || !cand) return false;
  if (host === cand) return true;
  return host.endsWith('.' + cand);
}

/**
 * Performs NEAR RPC call to get nonce, block hash and height
 * Uses NonceManager if available, otherwise falls back to direct RPC calls
 * For batch transactions, reserves nonces for each transaction
 */
async function performNearRpcCalls(
  ctx: SignerWorkerManagerContext,
  opts: { nearAccountId: string, txCount: number }
): Promise<{
  transactionContext: TransactionContext | null;
  error?: string;
  details?: string;
  reservedNonces?: string[];
}> {
  try {
    // Prefer NonceManager when initialized (signing flows)
    const transactionContext = await ctx.nonceManager.getNonceBlockHashAndHeight(ctx.nearClient, { force: true });

    // Reserve nonces for this request to avoid parallel collisions
    const txCount = opts.txCount || 1;
    let reservedNonces: string[] | undefined;
    try {
      reservedNonces = ctx.nonceManager.reserveNonces(txCount);
      console.log(`[NonceManager]: Reserved ${txCount} nonce(s):`, reservedNonces);
      // Provide the first reserved nonce to the worker context; worker handles per-tx assignment
      transactionContext.nextNonce = reservedNonces[0];
    } catch (error) {
      console.warn(`[NonceManager]: Failed to reserve ${txCount} nonce(s):`, error);
      // Continue with existing nextNonce; worker may auto-increment where appropriate
    }

    return { transactionContext, reservedNonces };
  } catch (error: any) {
    // Registration or pre-login flows may not have NonceManager initialized.
    // Fallback: try to fetch access key + block using IndexedDB public key, else block-only.
    return {
      transactionContext: null,
      error: 'NEAR_RPC_FAILED',
      details: error?.message,
    };
  }
}

//////////////////////////////////
// === CONFIRMATION LOGIC ===
//////////////////////////////////

/**
 * Validates and parses the confirmation request data
 */
function validateAndParseRequest({ ctx, request }: {
  ctx: SignerWorkerManagerContext,
  request: SecureConfirmRequest,
}): {
  request: SecureConfirmRequest;
  summary: TransactionSummary;
  confirmationConfig: ConfirmationConfig;
  transactionSummary: TransactionSummary;
} {
  // Parse and validate summary data (can contain extra fields we need)
  const summary = parseTransactionSummary(request.summary);
  // Get confirmation configuration from data (overrides user settings) or use user's settings,
  // then compute effective config based on runtime and request type
  const confirmationConfig: ConfirmationConfig = determineConfirmationConfig(ctx, request);
  const transactionSummary: TransactionSummary = {
    totalAmount: summary?.totalAmount,
    method: summary?.method,
    intentDigest: request.type === SecureConfirmationType.SIGN_TRANSACTION
      ? (request.payload as SignTransactionPayload).intentDigest
      : undefined,
  };

  return {
    request,
    summary,
    confirmationConfig,
    transactionSummary
  };
}


/**
 * Determines user confirmation based on UI mode and configuration
 */
async function renderUserConfirmUI({
  ctx,
  request,
  confirmationConfig,
  transactionSummary,
  vrfChallenge,
}: {
  ctx: SignerWorkerManagerContext,
  request: SecureConfirmRequest,
  confirmationConfig: ConfirmationConfig,
  transactionSummary: TransactionSummary,
  vrfChallenge?: any;
}): Promise<{
  confirmed: boolean;
  confirmHandle?: { element: any, close: (confirmed: boolean) => void };
  error?: string;
}> {
  // Recompute effective config defensively at render time as well
  confirmationConfig = determineConfirmationConfig(ctx, request);

  const nearAccountIdForUi = request.type === SecureConfirmationType.SIGN_TRANSACTION
    ? (request.payload as SignTransactionPayload).rpcCall.nearAccountId
    : (request.payload as RegisterAccountPayload).nearAccountId;
  // runtimeMode retained for future selection but not needed for confirm UI

  switch (confirmationConfig.uiMode) {
    case 'skip': {
      // Bypass UI entirely - automatically confirm
      return { confirmed: true, confirmHandle: undefined };
    }

    case 'embedded': {
      // For embedded mode, validate that the UI displayed transactions match
      // the worker-provided transactions by comparing canonical digests.
      // Registration/link-device flows do not display a tx tree; enforce modal instead.
      if (request.type === SecureConfirmationType.REGISTER_ACCOUNT || request.type === SecureConfirmationType.LINK_DEVICE) {
        // Fall back to modal-confirm-with-click
        const { confirmed, handle } = await awaitModalTxConfirmerDecision({
          ctx,
          summary: transactionSummary,
          txSigningRequests: [],
          vrfChallenge: vrfChallenge,
          theme: confirmationConfig.theme,
          nearAccountIdOverride: nearAccountIdForUi,
          useIframe: !!ctx.iframeModeDefault
        });
        return { confirmed, confirmHandle: handle };
      }
      try {
        const hostEl = document.querySelector(IFRAME_BUTTON_ID) as HTMLElement & {
          tooltipTheme?: string;
          requestUiIntentDigest?: () => Promise<string | null>;
        };

        // Apply theme to existing embedded component if theme is specified
        if (hostEl && confirmationConfig.theme) {
          hostEl.tooltipTheme = confirmationConfig.theme;
        }

        let uiDigest: string | null = null;
        if (hostEl?.requestUiIntentDigest) {
          uiDigest = await hostEl.requestUiIntentDigest();
          const intentDigest = request.type === SecureConfirmationType.SIGN_TRANSACTION
            ? request.payload.intentDigest
            : undefined;
          console.log('[SecureConfirm] digest check', { uiDigest, intentDigest });
        } else {
          console.error('[SecureConfirm]: missing requestUiIntentDigest on secure element');
        }
        // Debug: show UI digest and WASM worker's provided intentDigest for comparison
        const expectedDigest = (request.type === SecureConfirmationType.SIGN_TRANSACTION
          ? request.payload.intentDigest
          : undefined);
        if (uiDigest !== expectedDigest) {
          console.error('[SecureConfirm]: INTENT_DIGEST_MISMATCH', { uiDigest, expectedDigest });
          // Return explicit error code so upstream does not misclassify as user cancel
          return { confirmed: false, confirmHandle: undefined, error: 'INTENT_DIGEST_MISMATCH' };
        }
        return { confirmed: true, confirmHandle: undefined };
      } catch (e) {
        console.error('[SecureConfirm]: Failed to validate UI digest', e);
        return { confirmed: false, confirmHandle: undefined, error: 'ui_digest_validation_failed' };
      }
    }

    case 'modal': {
      if (confirmationConfig.behavior === 'autoProceed') {
        const handle = await mountModalTxConfirmer({
          ctx,
          summary: transactionSummary,
          txSigningRequests: request.payload?.txSigningRequests,
          vrfChallenge,
          loading: true,
          theme: confirmationConfig.theme,
          nearAccountIdOverride: nearAccountIdForUi,
        });
        const delay = confirmationConfig.autoProceedDelay ?? 1000;
        await new Promise((r) => setTimeout(r, delay));
        return { confirmed: true, confirmHandle: handle };
      } else {
        const { confirmed, handle } = await awaitModalTxConfirmerDecision({
          ctx,
          summary: transactionSummary,
          txSigningRequests: request.payload?.txSigningRequests,
          vrfChallenge,
          theme: confirmationConfig.theme,
          nearAccountIdOverride: nearAccountIdForUi,
          useIframe: !!ctx.iframeModeDefault
        });
        return { confirmed, confirmHandle: handle };
      }
    }

    default: {
      // Fallback to modal with explicit confirm for unknown UI modes
      const handle = await mountModalTxConfirmer({
        ctx,
        summary: transactionSummary,
        txSigningRequests: request.payload.txSigningRequests,
        vrfChallenge: vrfChallenge,
        loading: true,
        theme: confirmationConfig.theme,
        nearAccountIdOverride: nearAccountIdForUi,
      });
      return { confirmed: true, confirmHandle: handle };
    }
  }
}

/**
 * Collects WebAuthn credentials and PRF output if conditions are met
 */
async function collectTouchIdCredentials({
  ctx,
  request,
  decision,
}: {
  ctx: SignerWorkerManagerContext,
  request: SecureConfirmRequest,
  decision: SecureConfirmDecision,
}): Promise<{ decisionWithCredentials: SecureConfirmDecision }> {
  const nearAccountId = request.type === SecureConfirmationType.SIGN_TRANSACTION
    ? (request.payload as SignTransactionPayload).rpcCall.nearAccountId
    : (request.payload as RegisterAccountPayload).nearAccountId;
  const vrfChallenge = decision.vrfChallenge; // Now comes from confirmation flow

  if (!nearAccountId) {
    throw new Error('nearAccountId not available for credential collection');
  }
  if (!vrfChallenge) {
    throw new Error('VRF challenge not available for credential collection');
  }

  let credential: PublicKeyCredential | undefined = undefined;
  if (request.type === SecureConfirmationType.REGISTER_ACCOUNT || request.type === SecureConfirmationType.LINK_DEVICE) {
    // Registration/link flows must use create() to generate a new credential
    // Resolve optional deviceNumber from summary if present
    let deviceNumber = (request.payload as RegisterAccountPayload)?.deviceNumber;
    credential = await ctx.touchIdPrompt.generateRegistrationCredentialsInternal({
      nearAccountId,
      challenge: vrfChallenge,
      deviceNumber,
    });
  } else {
    // Authentication flows use get() with allowCredentials
    const authenticators = await ctx.indexedDB.clientDB.getAuthenticatorsByUser(toAccountId(nearAccountId));
    credential = await ctx.touchIdPrompt.getAuthenticationCredentialsInternal({
      nearAccountId,
      challenge: vrfChallenge,
      allowCredentials: authenticatorsToAllowCredentials(authenticators),
    });
  }

  const isRegistration = (request.type === SecureConfirmationType.REGISTER_ACCOUNT || request.type === SecureConfirmationType.LINK_DEVICE);

  // Extract PRF output for decryption (registration needs both PRF outputs)
  const dualPrfOutputs = extractPrfFromCredential({
    credential,
    firstPrfOutput: true,
    secondPrfOutput: isRegistration, // Registration needs second PRF output
  });

  if (!dualPrfOutputs.chacha20PrfOutput) {
    throw new Error('Failed to extract PRF output from credential');
  }

  // Serialize credential for WASM worker (use appropriate serializer based on flow type)
  const serializedCredential = (request.type === SecureConfirmationType.REGISTER_ACCOUNT || request.type === SecureConfirmationType.LINK_DEVICE)
    ? serializeRegistrationCredentialWithPRF({
        credential: credential,
        firstPrfOutput: true,
        secondPrfOutput: true
      })
    : serializeAuthenticationCredentialWithPRF({ credential: credential });

  return {
    decisionWithCredentials: {
      ...decision,
      credential: serializedCredential,
      prfOutput: dualPrfOutputs.chacha20PrfOutput,
      confirmed: true,
      _confirmHandle: undefined,
    }
  };
}

/**
 * Safely parses transaction summary data, handling both string and object formats
 */
function parseTransactionSummary(summaryData: string | object | undefined): any {
  if (!summaryData) {
    return {};
  }
  if (typeof summaryData === 'string') {
    try {
      return JSON.parse(summaryData);
    } catch (parseError) {
      console.warn('[SignerWorkerManager]: Failed to parse summary string:', parseError);
      return {};
    }
  }
  if (typeof summaryData === 'object' && summaryData !== null) {
    return summaryData;
  }
  console.warn('[SignerWorkerManager]: Unexpected summary data type:', typeof summaryData);
  return {};
}

/**
 * Safely closes modal with error handling
 */
function closeModalSafely(confirmHandle: any, confirmed: boolean): void {
  if (confirmHandle?.close) {
    try {
      confirmHandle.close(confirmed);
      console.log('[SecureConfirm] Modal closed safely');
    } catch (modalError) {
      console.warn('[SecureConfirm] Error closing modal:', modalError);
    }
  }
}

/**
 * Sends response to worker with consistent message format
 */
function sendWorkerResponse(worker: Worker, responseData: any): void {
  // Sanitize payload to ensure postMessage structured-clone safety
  const sanitized = sanitizeForPostMessage(responseData);
  worker.postMessage({
    type: SecureConfirmMessageType.USER_PASSKEY_CONFIRM_RESPONSE,
    data: sanitized
  });
}

// Shallow type that removes function-valued properties and the private `_confirmHandle` key
type NonFunctionKeys<T> = { [K in keyof T]: T[K] extends Function ? never : K }[keyof T];
type ShallowPostMessageSafe<T> = T extends object
  ? Omit<Pick<T, NonFunctionKeys<T>>, '_confirmHandle'>
  : T;

function sanitizeForPostMessage<T>(data: T): ShallowPostMessageSafe<T> {
  if (data == null || typeof data !== 'object') return data as ShallowPostMessageSafe<T>;
  // Drop private handles and any functions (non-cloneable)
  const out: Record<string, unknown> | unknown[] = Array.isArray(data) ? [] : {};
  for (const key of Object.keys(data as any)) {
    if (key === '_confirmHandle') continue;
    const value = (data as any)[key];
    if (typeof value === 'function') continue;
    (out as any)[key] = value;
  }
  return out as ShallowPostMessageSafe<T>;
}
