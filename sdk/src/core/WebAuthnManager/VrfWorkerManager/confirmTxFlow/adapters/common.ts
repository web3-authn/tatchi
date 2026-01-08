import type { TransactionSummary, SecureConfirmDecision } from '../types';
import { SecureConfirmMessageType } from '../types';
import { isObject, isFunction, isString } from '@/utils/validation';
import { toError, isTouchIdCancellationError } from '../../../../../utils/errors';

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

// ===== Shared worker response + UI close helpers =====
export const ERROR_MESSAGES = {
  cancelled: 'User cancelled secure confirm request',
  collectCredentialsFailed: 'Failed to collect credentials',
  nearRpcFailed: 'Failed to fetch NEAR data',
} as const;

export function sendConfirmResponse(worker: Worker, response: SecureConfirmDecision) {
  const sanitized = sanitizeForPostMessage(response);
  worker.postMessage({ type: SecureConfirmMessageType.USER_PASSKEY_CONFIRM_RESPONSE, data: sanitized });
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

