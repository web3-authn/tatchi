import {
  extractPrfFromCredential,
  serializeRegistrationCredentialWithPRF,
  serializeAuthenticationCredentialWithPRF,
} from '../../credentialsHelpers';
import type { SignerWorkerManagerContext } from '../index';
import type { ConfirmationConfig, ConfirmationUIMode } from '../../../types/signer-worker';
import { determineConfirmationConfig } from './determineConfirmationConfig';
import {
  SecureConfirmDecision,
  TransactionSummary,
  SecureConfirmMessageType,
  SecureConfirmRequest,
  SecureConfirmationType,
  SignTransactionPayload,
  RegisterAccountPayload,
  DecryptPrivateKeyWithPrfPayload,
  ShowSecurePrivateKeyUiPayload,
  SignNep413Payload,
} from './types';
import { TransactionContext, VRFChallenge } from '../../../types';
import { createRandomVRFChallenge } from '../../../types/vrf-worker';
import type { BlockReference, AccessKeyView } from '@near-js/types';
import { toAccountId } from '../../../types/accountIds';
import { awaitConfirmUIDecision, mountConfirmUI, type ConfirmUIHandle } from '../../LitComponents/confirm-ui';
import { addLitCancelListener } from '../../LitComponents/lit-events';
import { authenticatorsToAllowCredentials } from '../../touchIdPrompt';
import { isObject, isFunction, isString } from '../../../WalletIframe/validation';
import { errorMessage, toError, isTouchIdCancellationError } from '../../../../utils/errors';
// Do not rely solely on side‑effect import for custom element definition.
// Some bundlers tree‑shake side‑effect modules under certain sideEffects configs.
// We keep the static import for type/dependency graph, and will also perform a
// dynamic import at use‑site to guarantee the element is defined before use.
import '../../LitComponents/ExportPrivateKey/iframe-host';
import { ExportViewerIframeElement} from '../../LitComponents/ExportPrivateKey/iframe-host';

// Narrowed request union that binds `type` to its corresponding payload shape
type KnownSecureConfirmRequest =
  | (SecureConfirmRequest<SignTransactionPayload> & { type: SecureConfirmationType.SIGN_TRANSACTION })
  | (SecureConfirmRequest<RegisterAccountPayload> & { type: SecureConfirmationType.REGISTER_ACCOUNT })
  | (SecureConfirmRequest<RegisterAccountPayload> & { type: SecureConfirmationType.LINK_DEVICE })
  | (SecureConfirmRequest<DecryptPrivateKeyWithPrfPayload> & { type: SecureConfirmationType.DECRYPT_PRIVATE_KEY_WITH_PRF })
  | (SecureConfirmRequest<SignNep413Payload> & { type: SecureConfirmationType.SIGN_NEP413_MESSAGE })
  | (SecureConfirmRequest<ShowSecurePrivateKeyUiPayload> & { type: SecureConfirmationType.SHOW_SECURE_PRIVATE_KEY_UI });

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
  let request: KnownSecureConfirmRequest;
  let summary: TransactionSummary;
  let confirmationConfig: ConfirmationConfig;
  let transactionSummary: TransactionSummary;
  try {
    const parsed = validateAndParseRequest({ ctx, request: message.data });
    request = parsed.request as unknown as KnownSecureConfirmRequest;
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

  // 2. Perform NEAR RPC calls first (needed for VRF challenge). Skip for local-only flows
  const nearAccountId = getNearAccountId(request);
  const txCount = getTxCount(request);
  const isLocalOnly = request.type === SecureConfirmationType.DECRYPT_PRIVATE_KEY_WITH_PRF
    || request.type === SecureConfirmationType.SHOW_SECURE_PRIVATE_KEY_UI;

  const nearRpcResult = isLocalOnly
    ? { transactionContext: null as TransactionContext | null, reservedNonces: undefined as string[] | undefined }
    : await performNearRpcCalls(ctx, { nearAccountId, txCount });

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

  // 4. Generate VRF challenge with NEAR data (or a local random challenge for local-only flows)
  if (!ctx.vrfWorkerManager && !isLocalOnly) {
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
  let uiVrfChallenge: VRFChallenge;
  if (isLocalOnly) {
    // For decrypt/export, no network-dependent VRF is needed to drive UI/flow; use a local random challenge only for UI plumbing.
    uiVrfChallenge = createRandomVRFChallenge() as VRFChallenge;
  } else if (
    request.type === SecureConfirmationType.REGISTER_ACCOUNT ||
    request.type === SecureConfirmationType.LINK_DEVICE
  ) {
    const bootstrap = await ctx.vrfWorkerManager!.generateVrfKeypairBootstrap({
      vrfInputData: {
        userId: nearAccountId,
        rpId,
        blockHeight: transactionContext.txBlockHeight,
        blockHash: transactionContext.txBlockHash,
      },
      saveInMemory: true,
    });
    uiVrfChallenge = bootstrap.vrfChallenge;
  } else {
    uiVrfChallenge = await ctx.vrfWorkerManager!.generateVrfChallenge({
      userId: nearAccountId,
      rpId,
      blockHeight: transactionContext.txBlockHeight,
      blockHash: transactionContext.txBlockHash,
    });
  }

  // 5. Render user confirmation UI with VRF challenge
  const userConfirmResult = await renderUserConfirmUI({ ctx, confirmationConfig, transactionSummary, request, vrfChallenge: uiVrfChallenge });
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
    // For local-only flows, omit vrfChallenge and transactionContext entirely
    ...(isLocalOnly ? {} : { vrfChallenge: uiVrfChallenge, transactionContext: transactionContext }),
  };

  // Refresh VRF challenge just-in-time and reflect it in the modal UI (cosmetic) — skip for local-only flows
  if (!isLocalOnly) {
    try {
      const { vrfChallenge: refreshed, transactionContext: latestCtx } = await refreshVrfChallenge(ctx, request, nearAccountId);
      decision.vrfChallenge = refreshed;
      decision.transactionContext = latestCtx;
      try { confirmHandle?.update?.({ vrfChallenge: refreshed }); } catch {}
    } catch (jitErr) {
      console.debug('[SecureConfirm] JIT VRF refresh skipped:', jitErr);
    }
  }

  // 8. Collect credentials using generated VRF challenge
  let decisionWithCredentials: SecureConfirmDecision;
  let touchIdSuccess = false;
  let keepUiOpen = false;

  try {
    if (request.type === SecureConfirmationType.SHOW_SECURE_PRIVATE_KEY_UI) {
      // No credentials needed for pure UI display
      decisionWithCredentials = {
        ...decision,
        confirmed: true,
      };
      touchIdSuccess = true;
      keepUiOpen = true;
    } else {
      const result = await collectTouchIdCredentials({ ctx, request, decision });
      decisionWithCredentials = result.decisionWithCredentials;
      touchIdSuccess = decisionWithCredentials?.confirmed ?? false;
      // For decrypt flow, we only collect PRF and return it to the worker; UI is handled in a second call
    }
  } catch (touchIdError: unknown) {
    console.error('[SignerWorkerManager]: Failed to collect credentials:', touchIdError);
    const cancelled = isTouchIdCancellationError(touchIdError) || (() => {
      const err = toError(touchIdError);
      return err.name === 'NotAllowedError' || err.name === 'AbortError';
    })();

    if (cancelled) {
      console.log('[SignerWorkerManager]: User cancelled secure confirm request');
      // If this was the decrypt-private-key flow (phase 1 of export UI),
      // notify the parent window to collapse the wallet iframe overlay.
      // The client keeps the overlay visible in exportNearKeypairWithUI()
      // until it receives WALLET_UI_CLOSED. When cancellation happens here
      // (before the export viewer is shown), we must explicitly signal close.
      try {
        if (request.type === SecureConfirmationType.DECRYPT_PRIVATE_KEY_WITH_PRF) {
          window.parent?.postMessage({ type: 'WALLET_UI_CLOSED' }, '*');
        }
      } catch {}
    }

    decisionWithCredentials = {
      ...decision,
      confirmed: false,
      error: cancelled ? 'User cancelled secure confirm request' : 'Failed to collect credentials',
      _confirmHandle: undefined,
    };
    touchIdSuccess = false;
  } finally {
    // Close only when not displaying export viewer output
    if (!keepUiOpen) {
      closeModalSafely(touchIdSuccess, confirmHandle);
    }
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

// ===== Small helpers to centralize request shape access =====
function getNearAccountId(request: SecureConfirmRequest): string {
  switch (request.type) {
    case SecureConfirmationType.SIGN_TRANSACTION:
      return (request.payload as SignTransactionPayload).rpcCall.nearAccountId;
    case SecureConfirmationType.REGISTER_ACCOUNT:
    case SecureConfirmationType.LINK_DEVICE:
      return (request.payload as RegisterAccountPayload).nearAccountId;
    case SecureConfirmationType.DECRYPT_PRIVATE_KEY_WITH_PRF: {
      const p = request.payload as { nearAccountId?: string };
      return p?.nearAccountId || '';
    }
    case SecureConfirmationType.SHOW_SECURE_PRIVATE_KEY_UI: {
      const p = request.payload as { nearAccountId?: string };
      return p?.nearAccountId || '';
    }
    default:
      return '';
  }
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
}): Promise<{ confirmed: boolean; confirmHandle?: ConfirmUIHandle; error?: string }> {
  const nearAccountIdForUi = getNearAccountId(request);
  // runtimeMode retained for future selection but not needed for confirm UI

  // Show-only export viewer: mount with provided key and return immediately
  if (request.type === SecureConfirmationType.SHOW_SECURE_PRIVATE_KEY_UI) {
    // Ensure the export viewer iframe host custom element is defined
    try { await import('../../LitComponents/ExportPrivateKey/iframe-host'); } catch {}
    const host = document.createElement('w3a-export-viewer-iframe') as ExportViewerIframeElement;
    try { host.theme = confirmationConfig.theme || 'dark'; } catch {}
    // Map confirmation UI preference to export viewer container
    try { host.variant = (confirmationConfig.uiMode === 'drawer') ? 'drawer' : 'modal'; } catch {}
    try {
      const p = request.payload as { nearAccountId?: string; publicKey?: string; privateKey?: string };
      if (p?.nearAccountId) host.accountId = p.nearAccountId;
      if (p?.publicKey) host.publicKey = p.publicKey;
      if (p?.privateKey) host.privateKey = p.privateKey;
      host.loading = false;
    } catch {}
    try { window.parent?.postMessage({ type: 'WALLET_UI_OPENED' }, '*'); } catch {}
    document.body.appendChild(host);
    let removeCancelListener: (() => void) | undefined;
    try {
      const onCancel = (_event: CustomEvent<{ reason?: string } | undefined>) => {
        try { window.parent?.postMessage({ type: 'WALLET_UI_CLOSED' }, '*'); } catch {}
        try { removeCancelListener?.(); } catch {}
        try { host.remove(); } catch {}
      };
      removeCancelListener = addLitCancelListener(host, onCancel, { once: true });
    } catch {}
    const close = (_c: boolean) => { try { removeCancelListener?.(); } catch {}; try { host.remove(); } catch {} };
    const update = (_props: any) => { /* no-op for export viewer */ };
    return Promise.resolve({ confirmed: true, confirmHandle: { close, update } });
  }

  const uiMode = confirmationConfig.uiMode as ConfirmationUIMode;
  switch (uiMode) {
    case 'skip': {
      // Bypass UI entirely - automatically confirm
      return { confirmed: true, confirmHandle: undefined };
    }

    case 'drawer': {
      // Drawer is a modal-style flow with a drawer container
      if (confirmationConfig.behavior === 'autoProceed') {
        const handle = await mountConfirmUI({
          ctx,
          summary: transactionSummary,
          txSigningRequests: request.type === SecureConfirmationType.SIGN_TRANSACTION
            ? (request.payload as SignTransactionPayload).txSigningRequests
            : [],
          vrfChallenge,
          loading: true,
          theme: confirmationConfig.theme,
          uiMode: 'drawer',
          nearAccountIdOverride: nearAccountIdForUi,
        });
        const delay = confirmationConfig.autoProceedDelay ?? 1000;
        await new Promise((r) => setTimeout(r, delay));
        return { confirmed: true, confirmHandle: handle };
      } else {
        const { confirmed, handle } = await awaitConfirmUIDecision({
          ctx,
          summary: transactionSummary,
          txSigningRequests: request.type === SecureConfirmationType.SIGN_TRANSACTION
            ? (request.payload as SignTransactionPayload).txSigningRequests
            : [],
          vrfChallenge,
          theme: confirmationConfig.theme,
          uiMode: 'drawer',
          nearAccountIdOverride: nearAccountIdForUi,
          useIframe: !!ctx.iframeModeDefault
        });
        return { confirmed, confirmHandle: handle };
      }
    }

    case 'modal': {
      if (confirmationConfig.behavior === 'autoProceed') {
        const handle = await mountConfirmUI({
          ctx,
          summary: transactionSummary,
          txSigningRequests: request.type === SecureConfirmationType.SIGN_TRANSACTION
            ? (request.payload as SignTransactionPayload).txSigningRequests
            : [],
          vrfChallenge,
          loading: true,
          theme: confirmationConfig.theme,
          uiMode: 'modal',
          nearAccountIdOverride: nearAccountIdForUi,
        });
        const delay = confirmationConfig.autoProceedDelay ?? 1000;
        await new Promise((r) => setTimeout(r, delay));
        return { confirmed: true, confirmHandle: handle };
      } else {
        const { confirmed, handle } = await awaitConfirmUIDecision({
          ctx,
          summary: transactionSummary,
          txSigningRequests: request.type === SecureConfirmationType.SIGN_TRANSACTION
            ? (request.payload as SignTransactionPayload).txSigningRequests
            : [],
          vrfChallenge,
          theme: confirmationConfig.theme,
          uiMode: 'modal',
          nearAccountIdOverride: nearAccountIdForUi,
          useIframe: !!ctx.iframeModeDefault
        });
        return { confirmed, confirmHandle: handle };
      }
    }

    default: {
      // Fallback to modal with explicit confirm for unknown UI modes
      const handle = await mountConfirmUI({
        ctx,
        summary: transactionSummary,
        txSigningRequests: request.type === SecureConfirmationType.SIGN_TRANSACTION
          ? (request.payload as SignTransactionPayload).txSigningRequests
          : [],
        vrfChallenge: vrfChallenge,
        loading: true,
        theme: confirmationConfig.theme,
        uiMode: 'modal',
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
  request: KnownSecureConfirmRequest,
  decision: SecureConfirmDecision,
}): Promise<{ decisionWithCredentials: SecureConfirmDecision }> {
  const nearAccountId = (() => {
    switch (request.type) {
      case SecureConfirmationType.SIGN_TRANSACTION:
        return (request.payload as SignTransactionPayload).rpcCall.nearAccountId;
      case SecureConfirmationType.REGISTER_ACCOUNT:
      case SecureConfirmationType.LINK_DEVICE:
        return (request.payload as RegisterAccountPayload).nearAccountId;
      case SecureConfirmationType.DECRYPT_PRIVATE_KEY_WITH_PRF:
        return (request.payload as { nearAccountId?: string }).nearAccountId || '';
      default:
        return (request.payload as { nearAccountId?: string }).nearAccountId || '';
    }
  })();
  let vrfChallenge = decision.vrfChallenge; // Comes from confirmation flow; may be refreshed below

  if (!nearAccountId) {
    throw new Error('nearAccountId not available for credential collection');
  }

  const isLocalOnly = request.type === SecureConfirmationType.DECRYPT_PRIVATE_KEY_WITH_PRF
    || request.type === SecureConfirmationType.SHOW_SECURE_PRIVATE_KEY_UI;

  if (!vrfChallenge) {
    if (isLocalOnly) {
      vrfChallenge = createRandomVRFChallenge() as VRFChallenge;
    } else {
      throw new Error('VRF challenge not available for credential collection');
    }
  }

  // Refresh NEAR context/VRF only for network-dependent flows
  if (!isLocalOnly) {
    try {
      const { vrfChallenge: refreshed, transactionContext: latestCtx } = await refreshVrfChallenge(ctx, request, nearAccountId);
      vrfChallenge = refreshed;
      decision.vrfChallenge = refreshed;
      decision.transactionContext = latestCtx;
    } catch (e: unknown) {
      console.warn('[SecureConfirm]: VRF refresh failed; proceeding with initial challenge/context', e);
    }
  }

  let credential: PublicKeyCredential | undefined = undefined;
  if (
    request.type === SecureConfirmationType.REGISTER_ACCOUNT ||
    request.type === SecureConfirmationType.LINK_DEVICE
  ) {
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
  const serializedCredential = isRegistration
    ? serializeRegistrationCredentialWithPRF({ credential, firstPrfOutput: true, secondPrfOutput: true })
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
function parseTransactionSummary(summaryData: unknown): SummaryType {
  if (!summaryData) {
    return {};
  }
  if (isString(summaryData)) {
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
  confirmHandle?: ConfirmUIHandle,
): void {
  if (confirmHandle?.close) {
    try {
      confirmHandle.close(confirmed);
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
  try {
    const bh = (sanitized as any)?.vrfChallenge?.blockHeight;
    if (bh) console.debug('[SecureConfirm] Sent VRF challenge block height', bh);
  } catch {}
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

// === Helpers ===
async function refreshVrfChallenge(
  ctx: SignerWorkerManagerContext,
  request: SecureConfirmRequest,
  nearAccountId: string,
): Promise<{ vrfChallenge: VRFChallenge; transactionContext: TransactionContext }> {
  const rpId = ctx.touchIdPrompt.getRpId();
  const vrfWorkerManager = ctx.vrfWorkerManager;
  if (!vrfWorkerManager) throw new Error('VrfWorkerManager not available');

  return await retryWithBackoff(async (attempt) => {
    const latestCtx = await ctx.nonceManager.getNonceBlockHashAndHeight(ctx.nearClient, { force: true });
    try {
      console.debug('[SecureConfirm] Refreshed VRF block height', latestCtx?.txBlockHeight, 'hash', latestCtx?.txBlockHash);
    } catch {}

    const vrfChallenge = (request.type === SecureConfirmationType.REGISTER_ACCOUNT || request.type === SecureConfirmationType.LINK_DEVICE)
      ? (await vrfWorkerManager.generateVrfKeypairBootstrap({
          vrfInputData: {
            userId: nearAccountId,
            rpId,
            blockHeight: latestCtx.txBlockHeight,
            blockHash: latestCtx.txBlockHash,
          },
          saveInMemory: true,
        })).vrfChallenge
      : await vrfWorkerManager.generateVrfChallenge({
          userId: nearAccountId,
          rpId,
          blockHeight: latestCtx.txBlockHeight,
          blockHash: latestCtx.txBlockHash,
        });

    return { vrfChallenge, transactionContext: latestCtx };
  }, {
    attempts: 3,
    baseDelayMs: 150,
    onError: (err, attempt) => console.warn(`[SecureConfirm] VRF refresh attempt ${attempt} failed`, err),
    errorFactory: () => new Error('VRF refresh failed'),
  });
}

interface RetryOptions {
  attempts: number;
  baseDelayMs: number;
  onError?: (error: unknown, attempt: number) => void;
  errorFactory?: () => Error;
}

async function retryWithBackoff<T>(fn: (attempt: number) => Promise<T>, options: RetryOptions): Promise<T> {
  const { attempts, baseDelayMs, onError, errorFactory } = options;
  let lastError: unknown;

  for (let attempt = 1; attempt <= Math.max(1, attempts); attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastError = err;
      onError?.(err, attempt);
      if (attempt < attempts) {
        const delay = baseDelayMs * attempt;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw errorFactory ? errorFactory() : toError(lastError ?? new Error('Retry exhausted'));
}
