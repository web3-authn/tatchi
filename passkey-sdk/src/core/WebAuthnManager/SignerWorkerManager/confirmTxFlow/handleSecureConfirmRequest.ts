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
import type { BlockReference, AccessKeyView } from '@near-js/types';
import { toAccountId } from '../../../types/accountIds';
import { awaitModalTxConfirmerDecision, mountModalTxConfirmer } from '../../LitComponents/modal';
import { W3A_TX_BUTTON_ID } from '../../LitComponents/tags';
import { authenticatorsToAllowCredentials } from '../../touchIdPrompt';
import { isObject, isFunction } from '../../../WalletIframe/validation';
import { errorMessage, toError, isTouchIdCancellationError } from '../../../../utils/errors';

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
  } catch (e: unknown) {
    console.error('[SecureConfirm][Host] validateAndParseRequest failed', e);
    // Attempt to send a structured error back to the worker to avoid hard failure
    try {
      const rid = message?.data?.requestId;
      sendWorkerResponse(worker, {
        requestId: rid,
        confirmed: false,
        error: errorMessage(e) || 'Invalid secure confirm request'
      });
      return;
    } catch (_err: unknown) {
      throw toError(e);
    }
  }

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
  const nearAccountId = getNearAccountId(request);
  const txCount = getTxCount(request);

  const nearRpcResult = await performNearRpcCalls(ctx, { nearAccountId, txCount });

  // 3. If NEAR RPC failed entirely, return error. Otherwise, proceed with whatever
  //    transactionContext we could obtain (fallback includes block info for registration flows).
  if (nearRpcResult.error && !nearRpcResult.transactionContext) {
    sendWorkerResponse(worker, {
      requestId: request.requestId,
      intentDigest: getIntentDigest(request),
      confirmed: false,
      error: `Failed to fetch NEAR data: ${nearRpcResult.details}`
    });
    return;
  }

  const transactionContext = nearRpcResult.transactionContext as TransactionContext;

  // 4. Generate VRF challenge with NEAR data
  if (!ctx.vrfWorkerManager) {
    throw new Error('VrfWorkerManager not available in context');
  }
  // For registration/link flows, there is no unlocked VRF keypair yet.
  // Use the bootstrap path which creates a temporary VRF keypair in-memory
  // and returns a VRF challenge for the WebAuthn create() ceremony.
  // Derive effective rpId from the same TouchIdPrompt instance that will
  // perform navigator.credentials.create()/get(), so VRF rpId matches
  // the WebAuthn ceremony rpId exactly.
  // Use the TouchIdPrompt's resolved rpId so WebAuthn and VRF share the same value
  const rpId = ctx.touchIdPrompt.getRpId();
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
  } catch (e: unknown) {
    console.warn('[SignerWorkerManager]: Failed to release reserved nonces on cancel:', e);
  }
    closeModalSafely(false, confirmHandle);
    sendWorkerResponse(worker, {
      requestId: request.requestId,
      intentDigest: getIntentDigest(request),
      confirmed: false,
      error: uiError
    });
    return;
  }

  // 7. Create decision with generated data
  const decision: SecureConfirmDecision = {
    requestId: request.requestId,
    intentDigest: getIntentDigest(request),
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
  } catch (touchIdError: unknown) {
    console.error('[SignerWorkerManager]: Failed to collect credentials:', touchIdError);
    const cancelled = isTouchIdCancellationError(touchIdError) || (() => {
      const err = toError(touchIdError);
      return err.name === 'NotAllowedError' || err.name === 'AbortError';
    })();

    if (cancelled) {
      console.log('[SignerWorkerManager]: User cancelled secure confirm request');
    }

    decisionWithCredentials = {
      ...decision,
      confirmed: false,
      error: cancelled ? 'User cancelled secure confirm request' : 'Failed to collect credentials',
      _confirmHandle: undefined,
    };
    touchIdSuccess = false;
  } finally {
    // Always close the modal after TouchID attempt (success or failure)
    closeModalSafely(touchIdSuccess, confirmHandle);
  }

  // 9. Send confirmation response back to wasm-signer-worker
  // Release any reserved nonces if final decision is not confirmed
  try {
    if (!decisionWithCredentials?.confirmed) {
      nearRpcResult.reservedNonces?.forEach(n => ctx.nonceManager.releaseNonce(n));
    }
  } catch (e: unknown) {
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

// ===== Small helpers to centralize request shape access =====
function getNearAccountId(request: SecureConfirmRequest): string {
  return request.type === SecureConfirmationType.SIGN_TRANSACTION
    ? (request.payload as SignTransactionPayload).rpcCall.nearAccountId
    : (request.payload as RegisterAccountPayload).nearAccountId;
}

function getTxCount(request: SecureConfirmRequest): number {
  return request.type === SecureConfirmationType.SIGN_TRANSACTION
    ? ((request.payload as SignTransactionPayload).txSigningRequests?.length || 1)
    : 1;
}

function getIntentDigest(request: SecureConfirmRequest): string | undefined {
  return request.type === SecureConfirmationType.SIGN_TRANSACTION
    ? (request.payload as SignTransactionPayload).intentDigest
    : undefined;
}

/**
 * Performs RPC call to get nonce, block hash and height
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
  } catch (error) {
    // Registration or pre-login flows may not have NonceManager initialized.
    // Fallback: fetch latest block info directly; nonces are not required for registration/link flows.
    try {
      const block = await ctx.nearClient.viewBlock({ finality: 'final' } as BlockReference);
      const txBlockHeight = String(block?.header?.height ?? '');
      const txBlockHash = String(block?.header?.hash ?? '');
      const fallback: TransactionContext = {
        nearPublicKeyStr: '', // not needed for registration VRF challenge
        accessKeyInfo: ({
          nonce: 0,
          permission: 'FullAccess',
          block_height: 0,
          block_hash: ''
        } as unknown) as AccessKeyView, // minimal shape; not used in registration/link flows
        nextNonce: '0',       // placeholder; not used in registration/link flows
        txBlockHeight,
        txBlockHash,
      } as TransactionContext;
      return { transactionContext: fallback };
    } catch (e) {
      return {
        transactionContext: null,
        error: 'NEAR_RPC_FAILED',
        details: errorMessage(e) || errorMessage(error),
      };
    }
  }
}

//////////////////////////////////
// === CONFIRMATION LOGIC ===
//////////////////////////////////

interface SummaryType {
  totalAmount?: string,
  method?: string,
}

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
    intentDigest: getIntentDigest(request),
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
  vrfChallenge: VRFChallenge;
}): Promise<{
  confirmed: boolean;
  confirmHandle?: { element: HTMLElement, close: (confirmed: boolean) => void };
  error?: string;
}> {
  const nearAccountIdForUi = getNearAccountId(request);
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
        const hostEl = document.querySelector(W3A_TX_BUTTON_ID) as HTMLElement & {
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
          const intentDigest = getIntentDigest(request);
          console.log('[SecureConfirm] digest check', { uiDigest, intentDigest });
        } else {
          console.error('[SecureConfirm]: missing requestUiIntentDigest on secure element');
        }
        // Debug: show UI digest and WASM worker's provided intentDigest for comparison
        const expectedDigest = getIntentDigest(request);
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
          txSigningRequests: request.type === SecureConfirmationType.SIGN_TRANSACTION
            ? (request.payload as SignTransactionPayload).txSigningRequests
            : [],
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
          txSigningRequests: request.type === SecureConfirmationType.SIGN_TRANSACTION
            ? (request.payload as SignTransactionPayload).txSigningRequests
            : [],
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
        txSigningRequests: request.type === SecureConfirmationType.SIGN_TRANSACTION
          ? (request.payload as SignTransactionPayload).txSigningRequests
          : [],
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
    // Some authenticators throw InvalidStateError if a resident credential already exists
    // for the same rpId + user.id. In that case, fallback to the next deviceNumber to
    // derive a distinct user.id ("<account> (2)") and retry within the transient activation.
    const tryCreate = async (dn?: number): Promise<PublicKeyCredential> => {
      return await ctx.touchIdPrompt.generateRegistrationCredentialsInternal({
        nearAccountId,
        challenge: vrfChallenge,
        deviceNumber: dn,
      });
    };
    try {
      credential = await tryCreate(deviceNumber);
    } catch (e: unknown) {
      const err = toError(e);
      const name = String(err?.name || '');
      const msg = String(err?.message || '');
      const isDuplicate = name === 'InvalidStateError' || /excluded|already\s*registered/i.test(msg);
      if (isDuplicate) {
        const nextDeviceNumber = (deviceNumber !== undefined && Number.isFinite(deviceNumber))
          ? (deviceNumber + 1)
          : 2;
        try {
          credential = await tryCreate(nextDeviceNumber);
          // Update deviceNumber used downstream (naming/UI only)
          (request.payload as RegisterAccountPayload).deviceNumber = nextDeviceNumber;
        } catch (_e2: unknown) {
          throw err; // rethrow original error if retry also fails
        }
      } else {
        throw err;
      }
    }
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
function parseTransactionSummary(summaryData: unknown): SummaryType {
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
  // Already an object-like summary; trust the caller (shape is loose by design)
  return summaryData as SummaryType;
}

/**
 * Safely closes modal with error handling
 */
function closeModalSafely(
  confirmed: boolean,
  confirmHandle?: { element: HTMLElement; close: (confirmed: boolean) => void; },
): void {
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
function sendWorkerResponse(worker: Worker, responseData: SecureConfirmDecision): void {
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
  if (data == null) return data as ShallowPostMessageSafe<T>;
  if (Array.isArray(data)) {
    return data.map((v) => v) as unknown as ShallowPostMessageSafe<T>;
  }
  if (isObject(data)) {
    const src = data as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(src)) {
      if (key === '_confirmHandle') continue;
      const value = src[key];
      if (isFunction(value)) continue;
      out[key] = value;
    }
    return out as ShallowPostMessageSafe<T>;
  }
  return data as ShallowPostMessageSafe<T>;
}
