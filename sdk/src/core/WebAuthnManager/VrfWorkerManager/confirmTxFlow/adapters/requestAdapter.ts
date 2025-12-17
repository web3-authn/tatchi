import type { SecureConfirmRequest } from '../types';
import { SecureConfirmationType } from '../types';
import { isObject, isString } from '@/core/WalletIframe/validation';

/**
 * Validates secure-confirm requests (V2 only).
 * This deliberately does not accept JSON strings or shorthand/legacy shapes.
 */
export function validateSecureConfirmRequest(input: unknown): SecureConfirmRequest {
  if (typeof input === 'string') {
    throw new Error('Invalid secure confirm request: expected an object (JSON strings are not supported)');
  }
  if (!isObject(input)) throw new Error('parsed is not an object');
  const p = input as {
    schemaVersion?: unknown;
    requestId?: unknown;
    type?: unknown;
    summary?: unknown;
    payload?: unknown;
  };
  if (p.schemaVersion !== 2) throw new Error('schemaVersion must be 2');
  if (!isString(p.requestId) || !p.requestId) throw new Error('missing requestId');
  if (!isString(p.type) || !p.type) throw new Error('missing type');
  if (p.summary === undefined || p.summary === null) throw new Error('missing summary');
  if (p.payload === undefined || p.payload === null) throw new Error('missing payload');
  return input as unknown as SecureConfirmRequest;
}

export function assertNoForbiddenMainThreadSigningSecrets(request: SecureConfirmRequest): void {
  if (
    request.type !== SecureConfirmationType.SIGN_TRANSACTION
    && request.type !== SecureConfirmationType.SIGN_NEP413_MESSAGE
  ) {
    return;
  }

  const payload: any = (request as any).payload || {};
  if (payload.prfOutput !== undefined) {
    throw new Error('Invalid secure confirm request: forbidden signing payload field prfOutput');
  }
  if (payload.wrapKeySeed !== undefined) {
    throw new Error('Invalid secure confirm request: forbidden signing payload field wrapKeySeed');
  }
  if (payload.wrapKeySalt !== undefined) {
    throw new Error('Invalid secure confirm request: forbidden signing payload field wrapKeySalt');
  }
  if (payload.vrf_sk !== undefined) {
    throw new Error('Invalid secure confirm request: forbidden signing payload field vrf_sk');
  }
}
