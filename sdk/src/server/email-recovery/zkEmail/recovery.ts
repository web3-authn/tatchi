import {
  buildForwardablePayloadFromRawEmail,
  extractZkEmailBindingsFromPayload,
  normalizeForwardableEmailPayload,
  type ForwardableEmailPayload,
  type ParsedZkEmailBindings,
} from './index';

/**
 * ZK-email recovery helpers used by `EmailRecoveryService`.
 *
 * This module is intentionally pure (no network calls, no logging):
 * - `prepareZkEmailRecovery` validates/parses the raw email into a normalized
 *   payload + bindings (accountId/newPublicKey/from/timestamp/requestId).
 * - `mapZkEmailRecoveryError` converts arbitrary thrown errors (usually from the
 *   prover client) into stable `zkemail_*` error codes/messages that are safe to
 *   return from API handlers.
 */

export type ZkEmailRecoveryPrepared = {
  payload: ForwardableEmailPayload;
  bindings: ParsedZkEmailBindings;
};

export type ZkEmailRecoveryPrepareResult =
  | { ok: true; prepared: ZkEmailRecoveryPrepared }
  | {
      ok: false;
      errorCode: string;
      message: string;
      requestId?: string;
      subjectAccountId?: string;
    };

/**
 * Parse + validate the zk-email inputs from a raw RFC822 email blob.
 *
 * Returns a normalized ForwardableEmailPayload (headers lowercased, raw email present)
 * and extracted subject/header bindings. Also validates that the requested accountId
 * matches the accountId embedded in the email subject.
 */
export function prepareZkEmailRecovery(emailBlob: string, requestedAccountId: string): ZkEmailRecoveryPrepareResult {
  const forwardable = buildForwardablePayloadFromRawEmail(emailBlob);
  const normalized = normalizeForwardableEmailPayload(forwardable);
  if (!normalized.ok) {
    return {
      ok: false,
      errorCode: 'zkemail_invalid_email_payload',
      message: normalized.message || 'Invalid email payload for zk-email recovery',
    };
  }

  const bindings = extractZkEmailBindingsFromPayload(normalized.payload);
  if (!bindings) {
    return {
      ok: false,
      errorCode: 'zkemail_parse_error_bindings',
      message: 'Failed to parse accountId/new_public_key/from_email/timestamp from email',
    };
  }

  if (bindings.accountId !== requestedAccountId) {
    return {
      ok: false,
      errorCode: 'zkemail_account_mismatch',
      message: 'accountId in subject does not match requested accountId',
      requestId: bindings.requestId,
      subjectAccountId: bindings.accountId,
    };
  }

  return { ok: true, prepared: { payload: normalized.payload, bindings } };
}

export type ZkEmailRecoveryMappedError = {
  /** Stable error code returned by EmailRecoveryService/HTTP routes. */
  errorCode: string;
  /** Human-readable message suitable for logs and API responses. */
  message: string;
  proverCauseCode?: string;
  proverCauseMessage?: string;
};

/**
 * Normalize errors from the prover client into stable `zkemail_*` results.
 *
 * We intentionally do not leak raw email contents; only the prover's coarse error
 * information (status/code/message) is surfaced.
 */
export function mapZkEmailRecoveryError(error: unknown): ZkEmailRecoveryMappedError {
  const e: any = error;
  const code = (e && typeof e.code === 'string') ? (e.code as string) : undefined;
  const message = (e && typeof e.message === 'string') ? (e.message as string) : undefined;

  const proverCauseCode =
    (e && typeof e.causeCode === 'string') ? (e.causeCode as string)
    : (e?.cause && typeof e.cause.code === 'string') ? (e.cause.code as string)
    : undefined;
  const proverCauseMessage =
    (e && typeof e.causeMessage === 'string') ? (e.causeMessage as string)
    : (e?.cause && typeof e.cause.message === 'string') ? (e.cause.message as string)
    : undefined;

  if (code === 'prover_timeout') {
    return { errorCode: 'zkemail_prover_timeout', message: 'ZK-email prover request timed out', proverCauseCode, proverCauseMessage };
  }
  if (code === 'prover_unhealthy') {
    return { errorCode: 'zkemail_prover_unhealthy', message: 'ZK-email prover is not healthy (healthz check failed)', proverCauseCode, proverCauseMessage };
  }
  if (code === 'prover_http_error') {
    return { errorCode: 'zkemail_prover_http_error', message: message || 'ZK-email prover HTTP error', proverCauseCode, proverCauseMessage };
  }
  if (code === 'prover_network_error') {
    return {
      errorCode: 'zkemail_prover_network_error',
      message: proverCauseCode ? `ZK-email prover network error (${proverCauseCode})` : 'ZK-email prover network error',
      proverCauseCode,
      proverCauseMessage,
    };
  }
  if (code === 'missing_raw_email') {
    return { errorCode: 'zkemail_missing_raw_email', message: 'raw email contents are required to generate a zk-email proof', proverCauseCode, proverCauseMessage };
  }

  return {
    errorCode: 'zkemail_unknown_error',
    message: message || 'Unknown zk-email recovery error',
    proverCauseCode,
    proverCauseMessage,
  };
}
