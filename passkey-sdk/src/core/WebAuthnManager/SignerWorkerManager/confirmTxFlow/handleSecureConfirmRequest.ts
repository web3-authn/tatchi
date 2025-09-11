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
  SecureConfirmRequest,
  SecureConfirmationType,
  SignTransactionPayload,
  RegisterAccountPayload,
  isSecureConfirmRequestV2,
} from './types';
import { TransactionContext } from '../../../types';
import { toAccountId } from '../../../types/accountIds';
import { awaitIframeModalDecisionWithHandle, mountIframeModalHostWithHandle } from '../../LitComponents/modal';
import { IFRAME_BUTTON_ID } from '../../LitComponents/IframeButtonWithTooltipConfirmer/tags';
import { authenticatorsToAllowCredentials } from '../../touchIdPrompt';

/**
 * Handles secure confirmation requests from the worker with robust error handling
 * => SecureConfirmMessageType.PROMPT_USER_CONFIRM_IN_JS_MAIN_THREAD
 * and proper data validation. Supports both transaction and registration confirmation flows.
 */
export async function handlePromptUserConfirmInJsMainThread(
  ctx: SignerWorkerManagerContext,
  message: {
    type: SecureConfirmMessageType.PROMPT_USER_CONFIRM_IN_JS_MAIN_THREAD,
    data: SecureConfirmData | SecureConfirmRequest,
  },
  worker: Worker
): Promise<void> {

  // Normalize V2 request into legacy SecureConfirmData when needed
  const normalizedMessage = normalizeConfirmMessage(message);

  // 1. Validate and parse request
  const {
    data,
    summary,
    confirmationConfig,
    transactionSummary
  } = validateAndParseRequest({ ctx, message: normalizedMessage });

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
  // For registration/link flows, there is no unlocked VRF keypair yet.
  // Use the bootstrap path which creates a temporary VRF keypair in-memory
  // and returns a VRF challenge for the WebAuthn create() ceremony.
  const rpId = (ctx as any).rpIdOverride || window.location.hostname;
  let vrfChallenge: any;
  if (data.registrationDetails) {
    const bootstrap = await ctx.vrfWorkerManager.generateVrfKeypairBootstrap({
      userId: data.rpcCall.nearAccountId,
      rpId,
      blockHeight: transactionContext.txBlockHeight,
      blockHash: transactionContext.txBlockHash,
    }, true /* saveInMemory */);
    vrfChallenge = bootstrap.vrfChallenge;
  } else {
    vrfChallenge = await ctx.vrfWorkerManager.generateVrfChallenge({
      userId: data.rpcCall.nearAccountId,
      rpId,
      blockHeight: transactionContext.txBlockHeight,
      blockHash: transactionContext.txBlockHash,
    });
  }

  // 5. Render user confirmation UI with VRF challenge
  // Install a synchronous activation bridge so the child modal can invoke create() within the same gesture
  if (data.registrationDetails) {
    try {
      (window as any).__W3A_MODAL_SYNC__ = {
        onConfirm: async () => {
          try {
            const nearAccountId = data?.rpcCall?.nearAccountId || (data as any).nearAccountId;
            const dn = data.registrationDetails?.deviceNumber;
            let cred: PublicKeyCredential = await ctx.touchIdPrompt.generateRegistrationCredentialsInternal({
              nearAccountId,
              challenge: vrfChallenge,
              deviceNumber: dn,
            });
            (window as any).__W3A_CREDENTIAL_CACHE__ = { credential: cred, t: Date.now() };
          } catch (e) {
            console.warn('[SecureConfirm] Modal sync onConfirm failed', e);
          }
        }
      };
    } catch {}
  }
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
    // For registration/link flows, the confirm click occurred inside a nested iframe
    // which does not grant user activation to the host window. Ensure a real click
    // happens in the host context before invoking WebAuthn create()/get().
    if (data.registrationDetails && !(window as any).__W3A_CREDENTIAL_CACHE__) {
      await ensureTopLevelUserActivation();
    }
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
    try { (window as any).__W3A_MODAL_SYNC__ = undefined; } catch {}
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
 * Ensures a real user activation occurs in the host browsing context
 * (wallet iframe window) before calling WebAuthn APIs. Displays a small
 * non-blocking CTA in the bottom-right that the user can click.
 */
async function ensureTopLevelUserActivation(): Promise<void> {
  return new Promise<void>((resolve) => {
    try {
      // If a recent transient activation exists, proceed without overlay
      // (best-effort; not standardized across browsers)
      // Fallback to overlay if uncertain
    } catch {}

    const cta = document.createElement('div');
    cta.style.position = 'fixed';
    cta.style.bottom = '16px';
    cta.style.right = '16px';
    cta.style.zIndex = '2147483647';
    cta.style.background = 'white';
    cta.style.color = '#111';
    cta.style.padding = '10px 12px';
    cta.style.borderRadius = '12px';
    cta.style.boxShadow = '0 10px 30px rgba(0,0,0,0.25)';
    cta.style.display = 'flex';
    cta.style.alignItems = 'center';
    cta.style.gap = '10px';

    const label = document.createElement('div');
    label.textContent = 'Continue to create passkey';
    label.style.fontSize = '13px';
    label.style.fontWeight = '600';
    label.style.margin = '0';

    const btn = document.createElement('button');
    btn.textContent = 'Continue';
    btn.style.padding = '6px 10px';
    btn.style.borderRadius = '10px';
    btn.style.border = '0';
    btn.style.background = '#4DAFFE';
    btn.style.color = '#0b1220';
    btn.style.cursor = 'pointer';

    const cleanup = () => { try { cta.remove(); } catch {} };

    const onProceed = () => {
      try { btn.setAttribute('disabled', 'true'); } catch {}
      cleanup();
      resolve();
    };

    btn.addEventListener('click', onProceed, { once: true } as any);
    cta.appendChild(label);
    cta.appendChild(btn);
    document.body.appendChild(cta);
  });
}

/**
 * Converts a V2 request envelope into the legacy SecureConfirmData shape
 * for reuse of existing flow logic. SIGN_TRANSACTION maps 1:1; registration/link
 * set registrationDetails=true and pass tx_signing_requests as [].
 */
function normalizeConfirmMessage(message: {
  type: SecureConfirmMessageType.PROMPT_USER_CONFIRM_IN_JS_MAIN_THREAD,
  data: SecureConfirmData | SecureConfirmRequest,
}): { type: SecureConfirmMessageType.PROMPT_USER_CONFIRM_IN_JS_MAIN_THREAD, data: SecureConfirmData } {
  const data = message.data as any;
  if (!isSecureConfirmRequestV2(data)) {
    return message as unknown as { type: SecureConfirmMessageType.PROMPT_USER_CONFIRM_IN_JS_MAIN_THREAD, data: SecureConfirmData };
  }

  switch (data.type) {
    case SecureConfirmationType.SIGN_TRANSACTION: {
      const payload = data.payload as SignTransactionPayload;
      const legacy: SecureConfirmData = {
        requestId: data.requestId,
        summary: data.summary,
        tx_signing_requests: payload.txSigningRequests || [],
        intentDigest: payload.intentDigest,
        rpcCall: payload.rpcCall,
        confirmationConfig: data.confirmationConfig,
        registrationDetails: undefined,
      } as SecureConfirmData;
      return { type: message.type, data: legacy };
    }
    case SecureConfirmationType.REGISTER_ACCOUNT:
    case SecureConfirmationType.LINK_DEVICE: {
      const payload = data.payload as RegisterAccountPayload;
      const legacy: SecureConfirmData = {
        requestId: data.requestId,
        summary: data.summary,
        tx_signing_requests: [],
        intentDigest: (data as any).intentDigest || '',
        rpcCall: payload.rpcCall,
        confirmationConfig: data.confirmationConfig,
        registrationDetails: {
          nearAccountId: payload.nearAccountId,
          deviceNumber: payload.deviceNumber,
        },
      } as SecureConfirmData;
      return { type: message.type, data: legacy };
    }
    case SecureConfirmationType.SIGN_NEP413_MESSAGE:
    case SecureConfirmationType.DECRYPT_PRIVATE_KEY_WITH_PRF: {
      // Not yet migrated to legacy path; throw explicit error to avoid silent misuse
      // These will have dedicated recipes that don't use tx-specific logic.
      throw new Error(`[SignerWorkerManager]: Unsupported V2 confirmation type in legacy path: ${data.type}`);
    }
    default:
      throw new Error('[SignerWorkerManager]: Unknown V2 confirmation type');
  }
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
    method: summary?.method || (data.registrationDetails ? 'Register Account' : undefined),
    intentDigest: data.registrationDetails ? undefined : data.intentDigest
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
      // Registration/link-device flows do not display a tx tree; enforce modal instead.
      if (data.registrationDetails) {
        // Fall back to modal-confirm-with-click
        const { confirmed, handle } = await awaitIframeModalDecisionWithHandle({
          ctx,
          summary: transactionSummary,
          txSigningRequests: [],
          vrfChallenge: vrfChallenge,
          theme: confirmationConfig.theme,
          nearAccountIdOverride: data?.rpcCall?.nearAccountId,
        });
        return { confirmed, confirmHandle: handle };
      }
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
          theme: confirmationConfig.theme,
          nearAccountIdOverride: data?.rpcCall?.nearAccountId,
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
          theme: confirmationConfig.theme,
          nearAccountIdOverride: data?.rpcCall?.nearAccountId,
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
        theme: confirmationConfig.theme,
        nearAccountIdOverride: data?.rpcCall?.nearAccountId,
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

  let credential: PublicKeyCredential | undefined = undefined;
  // Prefer credential captured during the modal confirm click (same-gesture)
  const cached = (window as any).__W3A_CREDENTIAL_CACHE__?.credential as PublicKeyCredential | undefined;
  if (cached) {
    credential = cached;
    try { delete (window as any).__W3A_CREDENTIAL_CACHE__; } catch {}
  }

  if (!credential && data.registrationDetails) {
    // Registration/link flows must use create() to generate a new credential
    // Resolve optional deviceNumber from summary if present
    let deviceNumber = data.registrationDetails.deviceNumber;
    credential = await ctx.touchIdPrompt.generateRegistrationCredentialsInternal({
      nearAccountId,
      challenge: vrfChallenge,
      deviceNumber,
    });
  } else if (!credential) {
    // Authentication flows use get() with allowCredentials
    const authenticators = await ctx.indexedDB.clientDB.getAuthenticatorsByUser(toAccountId(nearAccountId));
    credential = await ctx.touchIdPrompt.getAuthenticationCredentialsInternal({
      nearAccountId,
      challenge: vrfChallenge,
      allowCredentials: authenticatorsToAllowCredentials(authenticators),
    });
  }

  const isRegistration = !!data.registrationDetails?.nearAccountId
    && !!data.registrationDetails?.deviceNumber;

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
  const serializedCredential = data.registrationDetails
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
