import { SecureConfirmRequest, SecureConfirmationType } from './types';

/** Deep-clone via JSON to ensure a plain structured-cloneable object. */
export function deepClonePlain<T>(obj: T): T {
  try {
    return JSON.parse(JSON.stringify(obj));
  } catch {
    return obj;
  }
}

/** Normalize snake_case fields and coerce inputs into objects. */
function normalizeShape(input: any): any {
  let req: any = input;
  if (typeof req === 'string') {
    try { req = JSON.parse(req); } catch { req = {}; }
  }
  if (!req || typeof req !== 'object') {
    req = {} as any;
  }
  if (typeof req.requestId !== 'string' && typeof (req as any).request_id === 'string') {
    req.requestId = (req as any).request_id;
  }
  return req;
}

/** Throws if the request is not a valid V2 request envelope. */
export function validateSecureConfirmRequest(req: any): asserts req is SecureConfirmRequest {
  if (!req || typeof req !== 'object') throw new Error('[signer-worker]: invalid V2 request: not an object');
  if (req.schemaVersion !== 2) throw new Error('[signer-worker]: invalid V2 request: schemaVersion must be 2');
  if (typeof req.type !== 'string') throw new Error('[signer-worker]: invalid V2 request: missing type');
  if (typeof req.requestId !== 'string' || !req.requestId) throw new Error('[signer-worker]: invalid V2 request: missing requestId');
  if (!req.payload) throw new Error('[signer-worker]: invalid V2 request: missing payload');

  switch (req.type) {
    case SecureConfirmationType.SIGN_TRANSACTION: {
      const p = req.payload || {};
      if (!Array.isArray(p.txSigningRequests)) throw new Error('[signer-worker]: invalid V2 request: txSigningRequests must be array');
      if (typeof p.intentDigest !== 'string' || !p.intentDigest) throw new Error('[signer-worker]: invalid V2 request: intentDigest missing');
      const rpc = p.rpcCall || {};
      if (!rpc || typeof rpc.nearAccountId !== 'string' || typeof rpc.nearRpcUrl !== 'string' || typeof rpc.contractId !== 'string') {
        throw new Error('[signer-worker]: invalid V2 request: rpcCall incomplete');
      }
      break;
    }
    case SecureConfirmationType.REGISTER_ACCOUNT:
    case SecureConfirmationType.LINK_DEVICE: {
      const p = req.payload || {};
      if (typeof p.nearAccountId !== 'string' || !p.nearAccountId) throw new Error('[signer-worker]: invalid V2 request: nearAccountId missing');
      const rpc = p.rpcCall || {};
      if (!rpc || typeof rpc.nearAccountId !== 'string' || typeof rpc.nearRpcUrl !== 'string' || typeof rpc.contractId !== 'string') {
        throw new Error('[signer-worker]: invalid V2 request: rpcCall incomplete');
      }
      break;
    }
    default:
      // Other types must still include a payload; additional checks can be added as needed
      break;
  }
}

/**
 * Parse, normalize, and validate a V2 request; generates a fallback requestId if missing.
 * Throws with descriptive error on invalid inputs.
 */
export function normalizeSecureConfirmRequest(input: unknown): SecureConfirmRequest {
  const req: any = normalizeShape(input);
  if (typeof req.requestId !== 'string' || !req.requestId) {
    req.requestId = `${Date.now()}-${Math.random()}`;
  }
  // Default invocation source to 'parent' when unspecified
  if (req.invokedFrom !== 'iframe' && req.invokedFrom !== 'parent') {
    req.invokedFrom = 'parent';
  }
  validateSecureConfirmRequest(req);
  return req as SecureConfirmRequest;
}
