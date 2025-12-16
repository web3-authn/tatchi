import type { VrfWorkerManagerContext } from '../../';
import type { ConfirmationConfig, ConfirmationUIMode } from '../../../../types/signer-worker';
import {
  SecureConfirmRequest,
  SecureConfirmationType,
  type SecureConfirmDecision,
  type SerializableCredential,
  SignTransactionPayload,
  RegisterAccountPayload,
  SignNep413Payload,
  TransactionSummary,
  SecureConfirmMessageType,
} from '../types';
import { TransactionContext, VRFChallenge } from '../../../../types';
import type { BlockReference, AccessKeyView } from '@near-js/types';
import { awaitConfirmUIDecision, mountConfirmUI, type ConfirmUIHandle } from '../../../LitComponents/confirm-ui';
import { isObject, isFunction, isString } from '../../../../WalletIframe/validation';
import { errorMessage, toError, isTouchIdCancellationError } from '../../../../../utils/errors';
import { serializeAuthenticationCredentialWithPRF } from '../../../credentialsHelpers';
import { toAccountId } from '../../../../types/accountIds';
import { authenticatorsToAllowCredentials } from '../../../touchIdPrompt';
import type { ClientAuthenticatorData } from '../../../../IndexedDBManager';

// ==== Small helpers to centralize request shape access ====
export function getNearAccountId(request: SecureConfirmRequest): string {
  switch (request.type) {
    case SecureConfirmationType.SIGN_TRANSACTION:
      return getSignTransactionPayload(request).rpcCall.nearAccountId;
    case SecureConfirmationType.SIGN_NEP413_MESSAGE:
      return (request.payload as SignNep413Payload).nearAccountId;
    case SecureConfirmationType.REGISTER_ACCOUNT:
    case SecureConfirmationType.LINK_DEVICE:
      return getRegisterAccountPayload(request).nearAccountId;
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

export function getTxCount(request: SecureConfirmRequest): number {
  return request.type === SecureConfirmationType.SIGN_TRANSACTION
    ? (getSignTransactionPayload(request).txSigningRequests?.length || 1)
    : 1;
}

export function getIntentDigest(request: SecureConfirmRequest): string | undefined {
  if (request.type === SecureConfirmationType.SIGN_TRANSACTION) {
    const p = request?.payload as Partial<SignTransactionPayload> | undefined;
    return p?.intentDigest;
  }
  return request?.intentDigest;
}

// ===== NEAR context and nonce management =====
export async function fetchNearContext(
  ctx: VrfWorkerManagerContext,
  opts: { nearAccountId: string; txCount: number; reserveNonces: boolean },
): Promise<{
  transactionContext: TransactionContext | null;
  error?: string;
  details?: string;
  reservedNonces?: string[];
}> {
  try {
    // Prefer NonceManager when initialized (signing flows)
    // Use cached transaction context if fresh; avoid forcing a refresh here.
    // JIT refresh later will force a new block height for the VRF challenge.
    const transactionContext = await ctx.nonceManager.getNonceBlockHashAndHeight(ctx.nearClient);

    const txCount = opts.txCount || 1;
    let reservedNonces: string[] | undefined;
    if (opts.reserveNonces) {
      try {
        reservedNonces = ctx.nonceManager.reserveNonces(txCount);
        console.debug(`[NonceManager]: Reserved ${txCount} nonce(s):`, reservedNonces);
        // Provide the first reserved nonce to the worker context; worker handles per-tx assignment
        transactionContext.nextNonce = reservedNonces[0];
      } catch (error) {
        console.debug(`[NonceManager]: Failed to reserve ${txCount} nonce(s):`, error);
        // Continue with existing nextNonce; worker may auto-increment where appropriate
      }
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
        nextNonce: '0',
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

// ===== VRF refresh helper with backoff =====
export async function maybeRefreshVrfChallenge(
  ctx: VrfWorkerManagerContext,
  request: SecureConfirmRequest,
  nearAccountId: string,
): Promise<{ vrfChallenge: VRFChallenge; transactionContext: TransactionContext }> {
  const rpId = ctx.touchIdPrompt.getRpId();
  const vrfWorkerManager = ctx.vrfWorkerManager;
  if (!vrfWorkerManager) throw new Error('VrfWorkerManager not available');

  const attempts = 3;
  return await retryWithBackoff(async (attempt) => {
    const latestCtx = await ctx.nonceManager.getNonceBlockHashAndHeight(ctx.nearClient, { force: true });
    console.debug('[SecureConfirm] Refreshed VRF block height', latestCtx?.txBlockHeight, 'hash', latestCtx?.txBlockHash);

    const vrfChallenge = (request.type === SecureConfirmationType.REGISTER_ACCOUNT || request.type === SecureConfirmationType.LINK_DEVICE)
      ? (await vrfWorkerManager.generateVrfKeypairBootstrap({
          vrfInputData: {
            userId: nearAccountId,
            rpId,
            blockHeight: latestCtx.txBlockHeight,
            blockHash: latestCtx.txBlockHash,
          },
          saveInMemory: true,
          sessionId: request.requestId,
        })).vrfChallenge
      : await vrfWorkerManager.generateVrfChallengeForSession(
          {
            userId: nearAccountId,
            rpId,
            blockHeight: latestCtx.txBlockHeight,
            blockHash: latestCtx.txBlockHash,
          },
          request.requestId,
        );

    return { vrfChallenge, transactionContext: latestCtx };
  }, {
    attempts,
    baseDelayMs: 150,
    onError: (err, attempt) => {
      const msg = errorMessage(err);
      const isFinal = attempt >= attempts;
      if (isFinal) {
        console.warn(`[SecureConfirm] VRF refresh failed: ${msg}`);
      } else {
        console.debug(`[SecureConfirm] VRF refresh attempt ${attempt} failed: ${msg}`);
      }
    },
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

// ===== UI rendering =====
export async function renderConfirmUI({
  ctx,
  request,
  confirmationConfig,
  transactionSummary,
  vrfChallenge,
}: {
  ctx: VrfWorkerManagerContext,
  request: SecureConfirmRequest,
  confirmationConfig: ConfirmationConfig,
  transactionSummary: TransactionSummary,
  vrfChallenge?: Partial<VRFChallenge>;
}): Promise<{ confirmed: boolean; confirmHandle?: ConfirmUIHandle; error?: string }> {
  const nearAccountIdForUi = getNearAccountId(request);

  const uiMode = confirmationConfig.uiMode as ConfirmationUIMode;
  const txSigningRequests = request.type === SecureConfirmationType.SIGN_TRANSACTION
    ? getSignTransactionPayload(request).txSigningRequests
    : [];

  const renderDrawerOrModal = async (mode: 'drawer' | 'modal') => {
    if (confirmationConfig.behavior === 'autoProceed') {
      const handle = await mountConfirmUI({
        ctx,
        summary: transactionSummary,
        txSigningRequests,
        vrfChallenge,
        loading: true,
        theme: confirmationConfig.theme,
        uiMode: mode,
        nearAccountIdOverride: nearAccountIdForUi,
      });
      const delay = confirmationConfig.autoProceedDelay ?? 0;
      await new Promise((r) => setTimeout(r, delay));
      return { confirmed: true, confirmHandle: handle } as const;
    }

    const { confirmed, handle, error } = await awaitConfirmUIDecision({
      ctx,
      summary: transactionSummary,
      txSigningRequests,
      vrfChallenge,
      theme: confirmationConfig.theme,
      uiMode: mode,
      nearAccountIdOverride: nearAccountIdForUi,
    });
    return { confirmed, confirmHandle: handle, error } as const;
  };

  switch (uiMode) {
    case 'skip': {
      return { confirmed: true, confirmHandle: undefined };
    }
    case 'drawer': {
      return await renderDrawerOrModal('drawer');
    }
    case 'modal': {
      return await renderDrawerOrModal('modal');
    }
    default: {
      const handle = await mountConfirmUI({
        ctx,
        summary: transactionSummary,
        txSigningRequests,
        vrfChallenge,
        loading: true,
        theme: confirmationConfig.theme,
        uiMode: 'modal',
        nearAccountIdOverride: nearAccountIdForUi,
      });
      return { confirmed: true, confirmHandle: handle };
    }
  }
}

// ===== Summary parsing =====
export function parseTransactionSummary(summaryData: unknown): TransactionSummary {
  if (!summaryData) return {};
  if (isString(summaryData)) {
    try {
      const parsed = JSON.parse(summaryData) as unknown;
      return isObject(parsed) ? (parsed as TransactionSummary) : {};
    } catch (parseError) {
      console.warn('[SignerWorkerManager]: Failed to parse summary string:', parseError);
      return {};
    }
  }
  return isObject(summaryData) ? (summaryData as TransactionSummary) : {};
}

// ===== Utility: postMessage sanitization (exported in case flows need to respond directly) =====
export type NonFunctionKeys<T> = { [K in keyof T]: T[K] extends Function ? never : K }[keyof T];
export type ShallowPostMessageSafe<T> = T extends object
  ? Omit<Pick<T, NonFunctionKeys<T>>, '_confirmHandle'>
  : T;

export function sanitizeForPostMessage<T>(data: T): ShallowPostMessageSafe<T> {
  if (data == null) return data as ShallowPostMessageSafe<T>;
  if (Array.isArray(data)) return data.map((v) => v) as unknown as ShallowPostMessageSafe<T>;
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

// Placeholder to assist per-flow modules; narrows request using caller-provided guard
export function ensureTypedRequest<T extends SecureConfirmRequest>(req: SecureConfirmRequest): T {
  return req as unknown as T;
}

// ===== Shared worker response + UI close helpers (deduplicated from per-flow modules) =====
export const ERROR_MESSAGES = {
  cancelled: 'User cancelled secure confirm request',
  collectCredentialsFailed: 'Failed to collect credentials',
  nearRpcFailed: 'Failed to fetch NEAR data',
} as const;

export function sendConfirmResponse(worker: Worker, response: SecureConfirmDecision) {
  const sanitized = sanitizeForPostMessage(response);
  worker.postMessage({ type: SecureConfirmMessageType.USER_PASSKEY_CONFIRM_RESPONSE, data: sanitized });
}

export function closeModalSafely(confirmed: boolean, handle?: ConfirmUIHandle) {
  handle?.close?.(confirmed);
}

export function isUserCancelledSecureConfirm(error: unknown): boolean {
  return (
    isTouchIdCancellationError(error) ||
    (() => {
      const e = toError(error);
      return e?.name === 'NotAllowedError' || e?.name === 'AbortError';
    })()
  );
}

export function releaseReservedNonces(ctx: VrfWorkerManagerContext, nonces?: string[]) {
  nonces?.forEach((n) => ctx.nonceManager.releaseNonce(n));
}

export async function collectAuthenticationCredentialWithPRF({
  ctx,
  nearAccountId,
  vrfChallenge,
  onBeforePrompt,
  includeSecondPrfOutput = false,
}: {
  ctx: VrfWorkerManagerContext;
  nearAccountId: string;
  vrfChallenge: VRFChallenge;
  onBeforePrompt?: (info: {
    authenticators: ClientAuthenticatorData[];
    authenticatorsForPrompt: ClientAuthenticatorData[];
    vrfChallenge: VRFChallenge;
  }) => void;
  /**
   * When true, include PRF.second in the serialized credential.
   * Use only for explicit recovery/export flows (higher-friction paths).
   */
  includeSecondPrfOutput?: boolean;
}): Promise<SerializableCredential> {
  const authenticators = await ctx.indexedDB.clientDB.getAuthenticatorsByUser(toAccountId(nearAccountId));
  const { authenticatorsForPrompt, wrongPasskeyError } = await ctx.indexedDB.clientDB.ensureCurrentPasskey(
    toAccountId(nearAccountId),
    authenticators,
  );
  if (wrongPasskeyError) {
    throw new Error(wrongPasskeyError);
  }

  onBeforePrompt?.({ authenticators, authenticatorsForPrompt, vrfChallenge });

  const credential = await ctx.touchIdPrompt.getAuthenticationCredentialsInternal({
    nearAccountId,
    challenge: vrfChallenge,
    allowCredentials: authenticatorsToAllowCredentials(authenticatorsForPrompt),
  });

  const serialized = serializeAuthenticationCredentialWithPRF({
    credential,
    firstPrfOutput: true,
    secondPrfOutput: includeSecondPrfOutput,
  });

  // Verify that the chosen credential matches the "current" passkey device, when applicable.
  const { wrongPasskeyError: wrongSelectedCredentialError } = await ctx.indexedDB.clientDB.ensureCurrentPasskey(
    toAccountId(nearAccountId),
    authenticators,
    serialized.rawId,
  );
  if (wrongSelectedCredentialError) {
    throw new Error(wrongSelectedCredentialError);
  }

  return serialized;
}

// ===== Payload guards =====
export function getSignTransactionPayload(request: SecureConfirmRequest): SignTransactionPayload {
  if (request.type !== SecureConfirmationType.SIGN_TRANSACTION) {
    throw new Error(`Expected SIGN_TRANSACTION request, got ${request.type}`);
  }
  return request.payload as SignTransactionPayload;
}

export function getRegisterAccountPayload(request: SecureConfirmRequest): RegisterAccountPayload {
  if (request.type !== SecureConfirmationType.REGISTER_ACCOUNT && request.type !== SecureConfirmationType.LINK_DEVICE) {
    throw new Error(`Expected REGISTER_ACCOUNT or LINK_DEVICE request, got ${request.type}`);
  }
  return request.payload as RegisterAccountPayload;
}
