import {
  extractPrfFromCredential,
  serializeRegistrationCredentialWithPRF,
  serializeAuthenticationCredentialWithPRF,
} from '../../credentialsHelpers';
import type { SignerWorkerManagerContext } from '../index';
import type { ConfirmationConfig } from '../../../types/signer-worker';
import {
  SecureConfirmMessage,
  SecureConfirmDecision,
  TransactionSummary,
  SecureConfirmMessageType,
  SecureConfirmData,
} from './types';
import { TransactionContext } from '../../../types';
import { toAccountId } from '../../../types/accountIds';
import { fetchNonceBlockHashAndHeight } from '../../../rpcCalls';
import type { NonceManager } from '../../../nonceManager';
import { awaitIframeModalDecisionWithHandle, mountIframeModalHostWithHandle } from '../../LitComponents/modal';
import { IFRAME_BUTTON_ID } from '../../LitComponents/IframeButtonWithTooltipConfirmer/tags';

/**
 * Handles secure confirmation requests from the worker with robust error handling
 * => SecureConfirmMessageType.PROMPT_USER_CONFIRM_IN_JS_MAIN_THREAD
 * and proper data validation. Supports both transaction and registration confirmation flows.
 */
export async function handlePromptUserConfirmInJsMainThread(
  ctx: SignerWorkerManagerContext,
  message: {
    type: SecureConfirmMessageType.PROMPT_USER_CONFIRM_IN_JS_MAIN_THREAD,
    data: SecureConfirmData,
  },
  worker: Worker
): Promise<void> {

  // 1. Validate and parse request
  const {
    data,
    summary,
    confirmationConfig,
    transactionSummary
  } = validateAndParseRequest({ ctx, message });

  // 2. Perform NEAR RPC calls first (needed for VRF challenge)
  const nearRpcResult = await performNearRpcCalls(ctx, data);

  // 3. If NEAR RPC failed, return error
  if (nearRpcResult.error || !nearRpcResult.transactionContext) {
    sendWorkerResponse(worker, {
      requestId: data.requestId,
      intentDigest: data.intentDigest,
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
  const vrfChallenge = await ctx.vrfWorkerManager.generateVrfChallenge({
    userId: data.rpcCall.nearAccountId,
    rpId: (ctx as any).rpIdOverride || window.location.hostname,
    blockHeight: transactionContext.txBlockHeight,
    blockHash: transactionContext.txBlockHash,
  });

  // 5. Render user confirmation UI with VRF challenge
  const userConfirmResult = await renderUserConfirmUI({ ctx, confirmationConfig, transactionSummary, data, vrfChallenge });
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
      requestId: data.requestId,
      intentDigest: data.intentDigest,
      confirmed: false,
      error: uiError
    });
    return;
  }

  // 7. Create decision with generated data
  const decision: SecureConfirmDecision = {
    requestId: data.requestId,
    intentDigest: data.intentDigest,
    confirmed: true,
    vrfChallenge, // Generated here
    transactionContext: transactionContext, // Generated here
  };

  // 8. Collect credentials using generated VRF challenge
  let decisionWithCredentials: SecureConfirmDecision;
  let touchIdSuccess = false;

  try {
    const result = await collectTouchIdCredentials({
      ctx,
      data,
      decision,
    });
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

/**
 * Performs NEAR RPC call to get nonce, block hash and height
 * Uses NonceManager if available, otherwise falls back to direct RPC calls
 * For batch transactions, reserves nonces for each transaction
 */
async function performNearRpcCalls(
  ctx: SignerWorkerManagerContext,
  data: SecureConfirmData
): Promise<{
  transactionContext: TransactionContext | null;
  error?: string;
  details?: string;
  reservedNonces?: string[];
}> {
  try {
    // Prefer NonceManager when initialized (signing flows)
    const transactionContext = await ctx.nonceManager.getNonceBlockHashAndHeight(ctx.nearClient);
    console.log("Using NonceManager smart caching");

    // Reserve nonces for this request to avoid parallel collisions
    const txCount = data.tx_signing_requests?.length || 1;
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
    try {
      const accountId = data?.rpcCall?.nearAccountId;
      let nearPublicKeyStr: string | null = null;
      try {
        const user = accountId ? await ctx.indexedDB.clientDB.getUser(toAccountId(accountId)) : null;
        nearPublicKeyStr = user?.clientNearPublicKey || null;
      } catch {}

      if (accountId && nearPublicKeyStr) {
        // Fetch both access key and block to compute a valid next nonce
        const [accessKeyInfo, block] = await Promise.all([
          ctx.nearClient.viewAccessKey(accountId, nearPublicKeyStr),
          ctx.nearClient.viewBlock({ finality: 'final' } as any)
        ]);

        if (!accessKeyInfo || (accessKeyInfo as any).nonce === undefined) {
          throw new Error('Access key not found or invalid during fallback');
        }
        const txBlockHash = (block as any)?.header?.hash;
        const txBlockHeight = String((block as any)?.header?.height ?? '');
        if (!txBlockHash || !txBlockHeight) throw new Error('Failed to fetch Block Info');

        const nextNonce = (BigInt(accessKeyInfo.nonce) + 1n).toString();
        const ctxResult: TransactionContext = {
          nearPublicKeyStr,
          accessKeyInfo: accessKeyInfo as any,
          nextNonce,
          txBlockHeight,
          txBlockHash,
        };
        return { transactionContext: ctxResult };
      }

      // As a last resort, fetch only the block; nextNonce is unknown here
      const block = await ctx.nearClient.viewBlock({ finality: 'final' } as any);
      const txBlockHash = (block as any)?.header?.hash;
      const txBlockHeight = String((block as any)?.header?.height ?? '');
      if (!txBlockHash || !txBlockHeight) throw new Error('Failed to fetch Block Info');
      const minimalContext = {
        nearPublicKeyStr: '',
        accessKeyInfo: { nonce: 0 } as any,
        nextNonce: '1', // avoid invalid 0; real AK fetch not available
        txBlockHeight,
        txBlockHash,
      } as TransactionContext;
      return { transactionContext: minimalContext };
    } catch (fallbackErr: any) {
      return {
        transactionContext: null,
        error: 'NEAR_RPC_FAILED',
        details: fallbackErr?.message || error?.message || String(fallbackErr || error),
      };
    }
  }
}

//////////////////////////////////
// === CONFIRMATION LOGIC ===
//////////////////////////////////

/**
 * Validates and parses the confirmation request data
 */
function validateAndParseRequest({ ctx, message }: {
  ctx: SignerWorkerManagerContext,
  message: SecureConfirmMessage,
}): {
  data: SecureConfirmData;
  summary: TransactionSummary;
  confirmationConfig: ConfirmationConfig;
  transactionSummary: TransactionSummary;
} {
  // Validate required fields
  const data = message.data;
  if (!data || !data.requestId) {
    throw new Error('Invalid secure confirm request - missing requestId');
  }

  // Parse and validate summary data (can contain extra fields we need)
  const summary = parseTransactionSummary(data.summary);
  // Get confirmation configuration from data (overrides user settings) or use user's settings
  const confirmationConfig = data.confirmationConfig || ctx.userPreferencesManager.getConfirmationConfig();
  const transactionSummary: TransactionSummary = {
    totalAmount: summary?.totalAmount,
    method: summary?.method || (data.isRegistration ? 'Register Account' : undefined),
    intentDigest: data.intentDigest
  };

  return {
    data,
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
  data,
  confirmationConfig,
  transactionSummary,
  vrfChallenge,
}: {
  ctx: SignerWorkerManagerContext,
  data: SecureConfirmData,
  confirmationConfig: ConfirmationConfig,
  transactionSummary: TransactionSummary,
  vrfChallenge?: any;
}): Promise<{
  confirmed: boolean;
  confirmHandle?: { element: any, close: (confirmed: boolean) => void };
  error?: string;
}> {

  switch (confirmationConfig.uiMode) {
    case 'skip': {
      // Bypass UI entirely - automatically confirm
      return { confirmed: true, confirmHandle: undefined };
    }

    case 'embedded': {
      // For embedded mode, validate that the UI displayed transactions match
      // the worker-provided transactions by comparing canonical digests.
      try {
        const hostEl = document.querySelector(IFRAME_BUTTON_ID) as any;

        // Apply theme to existing embedded component if theme is specified
        if (hostEl && confirmationConfig.theme) {
          hostEl.tooltipTheme = confirmationConfig.theme;
        }

        let uiDigest: string | null = null;
        if (hostEl?.requestUiIntentDigest) {
          uiDigest = await hostEl.requestUiIntentDigest();
          console.log('[SecureConfirm] digest check', { uiDigest, intentDigest: data.intentDigest });
        } else {
          console.error('[SecureConfirm]: missing requestUiIntentDigest on secure element');
        }
        // Debug: show UI digest and WASM worker's provided intentDigest for comparison
        if (uiDigest !== data.intentDigest) {
          console.error('[SecureConfirm]: UI digest mismatch');
          const errPayload = JSON.stringify({ code: 'ui_digest_mismatch', uiDigest, intentDigest: data.intentDigest });
          return { confirmed: false, confirmHandle: undefined, error: errPayload };
        }
        return { confirmed: true, confirmHandle: undefined };
      } catch (e) {
        console.error('[SecureConfirm]: Failed to validate UI digest', e);
        return { confirmed: false, confirmHandle: undefined, error: 'ui_digest_validation_failed' };
      }
    }

    case 'modal': {
      if (confirmationConfig.behavior === 'autoProceed') {
        // Mount modal immediately in loading state
        const handle = await mountIframeModalHostWithHandle({
          ctx,
          summary: transactionSummary,
          txSigningRequests: data.tx_signing_requests,
          vrfChallenge: vrfChallenge,
          loading: true,
          theme: confirmationConfig.theme
        });
        // Wait for the specified delay before proceeding
        const delay = confirmationConfig.autoProceedDelay ?? 1000; // Default 1 seconds if not specified
        await new Promise(resolve => setTimeout(resolve, delay));
        return { confirmed: true, confirmHandle: handle };

      } else {
        // Require click
        const { confirmed, handle } = await awaitIframeModalDecisionWithHandle({
          ctx,
          summary: transactionSummary,
          txSigningRequests: data.tx_signing_requests,
          vrfChallenge: vrfChallenge,
          theme: confirmationConfig.theme
        });
        return { confirmed, confirmHandle: handle };
      }
    }

    default: {
      // Fallback to modal with explicit confirm for unknown UI modes
      const handle = await mountIframeModalHostWithHandle({
        ctx,
        summary: transactionSummary,
        txSigningRequests: data.tx_signing_requests,
        vrfChallenge: vrfChallenge,
        loading: true,
        theme: confirmationConfig.theme
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
  data,
  decision,
}: {
  ctx: SignerWorkerManagerContext,
  data: SecureConfirmData,
  decision: SecureConfirmDecision,
}): Promise<{ decisionWithCredentials: SecureConfirmDecision }> {
  const nearAccountId = data.rpcCall?.nearAccountId || (data as any).nearAccountId;
  const vrfChallenge = decision.vrfChallenge; // Now comes from confirmation flow

  if (!nearAccountId) {
    throw new Error('nearAccountId not available for credential collection');
  }
  if (!vrfChallenge) {
    throw new Error('VRF challenge not available for credential collection');
  }

  const authenticators = await ctx.indexedDB.clientDB.getAuthenticatorsByUser(toAccountId(nearAccountId));

  const credential = await ctx.touchIdPrompt.getCredentials({
    nearAccountId: nearAccountId,
    challenge: vrfChallenge,
    authenticators: authenticators,
  });

  // Extract PRF output for decryption (registration needs both PRF outputs)
  const dualPrfOutputs = extractPrfFromCredential({
    credential,
    firstPrfOutput: true,
    secondPrfOutput: data.isRegistration, // Registration needs second PRF output
  });

  if (!dualPrfOutputs.chacha20PrfOutput) {
    throw new Error('Failed to extract PRF output from credential');
  }

  // Serialize credential for WASM worker (use appropriate serializer based on flow type)
  const serializedCredential = data.isRegistration
    ? serializeRegistrationCredentialWithPRF({
        credential,
        firstPrfOutput: true,
        secondPrfOutput: true
      })
    : serializeAuthenticationCredentialWithPRF({ credential });

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

function sanitizeForPostMessage(data: any): any {
  if (data == null) return data;
  if (typeof data !== 'object') return data;
  // Drop private handles and any functions (non-cloneable)
  const out: any = Array.isArray(data) ? [] : {};
  for (const key of Object.keys(data)) {
    if (key === '_confirmHandle') continue;
    const value = (data as any)[key];
    if (typeof value === 'function') continue;
    out[key] = value;
  }
  return out;
}
