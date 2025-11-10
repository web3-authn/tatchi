import type { SignerWorkerManagerContext } from '../../index';
import type { ConfirmationConfig, ConfirmationUIMode } from '../../../../types/signer-worker';
import {
  SecureConfirmRequest,
  SecureConfirmationType,
  SignTransactionPayload,
  RegisterAccountPayload,
  TransactionSummary,
} from '../types';
import { TransactionContext, VRFChallenge } from '../../../../types';
import type { BlockReference, AccessKeyView } from '@near-js/types';
import { awaitConfirmUIDecision, mountConfirmUI, type ConfirmUIHandle } from '../../../LitComponents/confirm-ui';
import { addLitCancelListener } from '../../../LitComponents/lit-events';
import { isObject, isFunction, isString } from '../../../../WalletIframe/validation';
import { errorMessage, toError } from '../../../../../utils/errors';
// Ensure the export viewer custom element is defined when used
import type { ExportViewerIframeElement } from '../../../LitComponents/ExportPrivateKey/iframe-host';
import { ensureDefined } from '../../../LitComponents/ensure-defined';
import { W3A_EXPORT_VIEWER_IFRAME_ID } from '../../../LitComponents/tags';

// Flow classification type (kept close to helpers for reuse)
export type FlowKind = 'LocalOnly' | 'Registration' | 'Signing' | 'Unsupported';

export function classifyFlow(request: SecureConfirmRequest): FlowKind {
  switch (request.type) {
    case SecureConfirmationType.DECRYPT_PRIVATE_KEY_WITH_PRF:
    case SecureConfirmationType.SHOW_SECURE_PRIVATE_KEY_UI:
      return 'LocalOnly';
    case SecureConfirmationType.REGISTER_ACCOUNT:
    case SecureConfirmationType.LINK_DEVICE:
      return 'Registration';
    case SecureConfirmationType.SIGN_TRANSACTION:
    case SecureConfirmationType.SIGN_NEP413_MESSAGE:
      return 'Signing';
    default:
      // Explicitly mark any unknown/unsupported type
      return 'Unsupported';
  }
}

// ==== Small helpers to centralize request shape access ====
export function getNearAccountId(request: SecureConfirmRequest): string {
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

export function getTxCount(request: SecureConfirmRequest): number {
  return request.type === SecureConfirmationType.SIGN_TRANSACTION
    ? ((request.payload as SignTransactionPayload).txSigningRequests?.length || 1)
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
  ctx: SignerWorkerManagerContext,
  opts: { nearAccountId: string; txCount: number },
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

    // Reserve nonces for this request to avoid parallel collisions
    const txCount = opts.txCount || 1;
    let reservedNonces: string[] | undefined;
    try {
      reservedNonces = ctx.nonceManager.reserveNonces(txCount);
      console.debug(`[NonceManager]: Reserved ${txCount} nonce(s):`, reservedNonces);
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
  ctx: SignerWorkerManagerContext,
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
        })).vrfChallenge
      : await vrfWorkerManager.generateVrfChallenge({
          userId: nearAccountId,
          rpId,
          blockHeight: latestCtx.txBlockHeight,
          blockHash: latestCtx.txBlockHash,
        });

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
  ctx: SignerWorkerManagerContext,
  request: SecureConfirmRequest,
  confirmationConfig: ConfirmationConfig,
  transactionSummary: TransactionSummary,
  vrfChallenge: VRFChallenge;
}): Promise<{ confirmed: boolean; confirmHandle?: ConfirmUIHandle; error?: string }> {
  const nearAccountIdForUi = getNearAccountId(request);
  console.debug('[RenderConfirmUI] start', {
    type: request?.type,
    uiMode: confirmationConfig?.uiMode,
    behavior: confirmationConfig?.behavior,
    theme: confirmationConfig?.theme,
    nearAccountIdForUi,
    intentDigest: transactionSummary?.intentDigest,
  });
  // Show-only export viewer: mount with provided key and return immediately
  if (request.type === SecureConfirmationType.SHOW_SECURE_PRIVATE_KEY_UI) {
    console.debug('[RenderConfirmUI] SHOW_SECURE_PRIVATE_KEY_UI');
    // Ensure the defining module runs in this runtime before creating the element.
    await ensureDefined(W3A_EXPORT_VIEWER_IFRAME_ID, () => import('../../../LitComponents/ExportPrivateKey/iframe-host'));
    const host = document.createElement(W3A_EXPORT_VIEWER_IFRAME_ID) as ExportViewerIframeElement;
    host.theme = confirmationConfig.theme || 'dark';
    host.variant = (confirmationConfig.uiMode === 'drawer') ? 'drawer' : 'modal';
    {
      const p = request.payload as { nearAccountId?: string; publicKey?: string; privateKey?: string };
      if (p?.nearAccountId) host.accountId = p.nearAccountId;
      if (p?.publicKey) host.publicKey = p.publicKey;
      if (p?.privateKey) host.privateKey = p.privateKey;
      host.loading = false;
    }
    window.parent?.postMessage({ type: 'WALLET_UI_OPENED' }, '*');
    document.body.appendChild(host);
    let removeCancelListener: (() => void) | undefined;
    const onCancel = (_event: CustomEvent<{ reason?: string } | undefined>) => {
      window.parent?.postMessage({ type: 'WALLET_UI_CLOSED' }, '*');
      removeCancelListener?.();
      host.remove();
    };
    removeCancelListener = addLitCancelListener(host, onCancel, { once: true });
    const close = (_c: boolean) => { removeCancelListener?.(); host.remove(); };
    const update = (_props: any) => { /* no-op for export viewer */ };
    return Promise.resolve({ confirmed: true, confirmHandle: { close, update } });
  }

  const uiMode = confirmationConfig.uiMode as ConfirmationUIMode;
  switch (uiMode) {
    case 'skip': {
      console.debug('[RenderConfirmUI] uiMode=skip');
      return { confirmed: true, confirmHandle: undefined };
    }
    case 'drawer': {
      if (confirmationConfig.behavior === 'autoProceed') {
        console.debug('[RenderConfirmUI] drawer + autoProceed');
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
        const delay = confirmationConfig.autoProceedDelay ?? 0;
        await new Promise((r) => setTimeout(r, delay));
        return { confirmed: true, confirmHandle: handle };
      } else {
        console.debug('[RenderConfirmUI] drawer + requireClick');
        const { confirmed, handle, error } = await awaitConfirmUIDecision({
          ctx,
          summary: transactionSummary,
          txSigningRequests: request.type === SecureConfirmationType.SIGN_TRANSACTION
            ? (request.payload as SignTransactionPayload).txSigningRequests
            : [],
          vrfChallenge,
          theme: confirmationConfig.theme,
          uiMode: 'drawer',
          nearAccountIdOverride: nearAccountIdForUi,
        });
        console.debug('[RenderConfirmUI] drawer decision', { confirmed });
        return { confirmed, confirmHandle: handle, error };
      }
    }
    case 'modal': {
      if (confirmationConfig.behavior === 'autoProceed') {
        console.debug('[RenderConfirmUI] modal + autoProceed');
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
        const delay = confirmationConfig.autoProceedDelay ?? 0;
        await new Promise((r) => setTimeout(r, delay));
        return { confirmed: true, confirmHandle: handle };
      } else {
        console.debug('[RenderConfirmUI] modal + requireClick');
        const { confirmed, handle, error } = await awaitConfirmUIDecision({
          ctx,
          summary: transactionSummary,
          txSigningRequests: request.type === SecureConfirmationType.SIGN_TRANSACTION
            ? (request.payload as SignTransactionPayload).txSigningRequests
            : [],
          vrfChallenge,
          theme: confirmationConfig.theme,
          uiMode: 'modal',
          nearAccountIdOverride: nearAccountIdForUi,
        });
        console.debug('[RenderConfirmUI] modal decision', { confirmed });
        return { confirmed, confirmHandle: handle, error };
      }
    }
    default: {
      console.debug('[RenderConfirmUI] default branch → mount modal loading');
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
      return { confirmed: true, confirmHandle: handle };
    }
  }
}

// ===== Summary parsing =====
export interface SummaryType { totalAmount?: string; method?: string }

export function parseTransactionSummary(summaryData: unknown): SummaryType {
  if (!summaryData) return {};
  if (isString(summaryData)) {
    try {
      return JSON.parse(summaryData);
    } catch (parseError) {
      console.warn('[SignerWorkerManager]: Failed to parse summary string:', parseError);
      return {};
    }
  }
  return summaryData as SummaryType;
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
