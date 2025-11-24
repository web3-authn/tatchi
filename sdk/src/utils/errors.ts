/**
 * Centralized error handling utilities for the Passkey SDK
 */

/**
 * Best-effort error message extractor without relying on `any`.
 * Always returns a string (may be empty when nothing usable can be derived).
 */
export function errorMessage(err: unknown): string {
  try {
    if (typeof err === 'string') return err;
    if (err && typeof (err as { message?: unknown }).message === 'string') {
      return (err as { message: string }).message;
    }
    return String(err ?? '');
  } catch {
    return '';
  }
}

/**
 * Normalize any thrown value into an Error instance.
 * - preserves message/name/stack when available
 * - best-effort copies optional code/details properties if present
 */
export function toError(e: unknown): Error {
  if (e instanceof Error) return e;
  const err = new Error(errorMessage(e));
  try {
    const src = e as { name?: unknown; stack?: unknown; code?: unknown; details?: unknown };
    if (typeof src?.name === 'string') err.name = src.name;
    if (typeof src?.stack === 'string') (err as { stack?: string }).stack = src.stack;
    if (src && typeof src.code !== 'undefined') (err as { code?: unknown }).code = src.code;
    if (src && typeof src.details !== 'undefined') (err as { details?: unknown }).details = src.details;
  } catch {}
  return err;
}

/**
 * Check if an error is related to user cancellation of TouchID/FaceID prompt
 * @param error - The error object or error message string
 * @returns true if the error indicates user cancellation
 */
export function isTouchIdCancellationError(error: unknown): boolean {
  const msg = errorMessage(error);

  // Normalize for case-insensitive substring checks on user-facing phrases
  const lower = msg.toLowerCase();

  return msg.includes('The operation either timed out or was not allowed') ||
         msg.includes('NotAllowedError') ||
         msg.includes('AbortError') ||
         lower.includes('user cancelled') ||
         lower.includes('user canceled') ||
         lower.includes('user aborted');
}

/**
 * Get a user-friendly error message for TouchID/FaceID cancellation
 * @param context - The context where the cancellation occurred (e.g., 'registration', 'login')
 * @returns A user-friendly error message
 */
export function getTouchIdCancellationMessage(context: 'registration' | 'login'): string {
  switch (context) {
    case 'registration':
      return `Registration was cancelled. Please try again when you're ready to set up your passkey.`;
    case 'login':
      return `Login was cancelled. Please try again when you're ready to authenticate.`;
    default:
      return `Operation was cancelled. Please try again when you're ready.`;
  }
}

/**
 * Transform an error message to be more user-friendly
 * @param error - The original error object or message
 * @param context - The context where the error occurred
 * @param nearAccountId - Optional NEAR account ID for context-specific messages
 * @returns A user-friendly error message
 */
export function getUserFriendlyErrorMessage(
  error: unknown,
  context: 'registration' | 'login' = 'registration',
  nearAccountId?: string
): string {
  const msg = errorMessage(error);

  // Handle TouchID/FaceID cancellation
  if (isTouchIdCancellationError(error)) {
    return getTouchIdCancellationMessage(context);
  }

  // Missing PRF outputs
  if (msg.includes('PRF outputs missing')) {
    const op = context === 'registration' ? 'Registration' : 'Login';
    return `${op} failed because your browser did not return the required passkey PRF results. On some mobile browsers this is not available for create(); try updating your browser or use a desktop browser. We’re working on an alternate path for broader device support.`;
  }

  // Handle other common errors
  if (msg.includes('one of the credentials already registered')) {
    return `A passkey for '${nearAccountId || 'this account'}' already exists. Please try logging in instead.`;
  }

  if (msg.includes('Cannot deserialize the contract state')) {
    return `Contract state deserialization failed. This may be due to a contract upgrade. Please try again or contact support.`;
  }

  if (msg.includes('Web3Authn contract registration check failed')) {
    return `Contract registration check failed: ${msg.replace('Web3Authn contract registration check failed: ', '')}`;
  }

  if (msg.includes('Unknown error occurred')) {
    return `${context === 'registration' ? 'Registration' : 'Login'} failed due to an unknown error. Please check your connection and try again.`;
  }

  // Return the original error message if no specific handling is needed
  return msg;
}

/**
 * Format a NEAR JSON-RPC error into a concise, human-friendly message while
 * preserving the original error payload on `details`.
 *
 * The function is defensive and only relies on structural checks. It does not
 * require concrete NEAR types to avoid tight coupling with providers.
 */
export function formatNearRpcError(
  operationName: string,
  rpc: { error?: { code?: number; name?: string; message?: string; data?: unknown } }
): { message: string; code?: number; name?: string; details?: unknown } {
  const err = rpc?.error || {};
  const details = err.data as unknown;

  const code = typeof err.code === 'number' ? err.code : undefined;
  const name = typeof err.name === 'string' ? err.name : undefined;
  const generic = typeof err.message === 'string'
    ? err.message
    : (details && typeof (details as { message?: unknown }).message === 'string'
        ? (details as { message: string }).message
        : 'RPC error');

  // Helper: get first key of object
  const firstKey = (o: unknown): string | undefined => {
    if (!o || typeof o !== 'object') return undefined;
    const keys = Object.keys(o as Record<string, unknown>);
    return keys.length ? keys[0] : undefined;
  };

  // Helper: shallow object check
  const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

  // Extract structured NEAR error kinds if present (generic traversal)
  const d = details as Record<string, unknown> | undefined;
  const txExec = isObj(d) ? d.TxExecutionError : undefined;
  if (isObj(txExec)) {
    let node: Record<string, unknown> | undefined = txExec;
    const path: string[] = ['TxExecutionError'];
    let depth = 0;
    while (node && depth < 5 && isObj(node)) {
      const k = firstKey(node);
      if (!k) break;
      const nextNode: unknown = (node as Record<string, unknown>)[k as string];
      path.push(k);
      node = isObj(nextNode) ? (nextNode as Record<string, unknown>) : undefined;
      depth++;
    }

    // Special-case action index when present for better UX
    const actionError = (isObj(txExec) && isObj(txExec.ActionError)) ? txExec.ActionError as Record<string, unknown> : undefined;
    const idx = (isObj(actionError) && typeof actionError.index === 'number') ? ` at action ${actionError.index}` : '';

    const payload = isObj(node) ? node : undefined;
    const suffix = payload && Object.keys(payload).length ? `: ${JSON.stringify(payload)}` : '';
    const prefix = [name, typeof code === 'number' ? `code ${code}` : undefined].filter(Boolean).join(' ');
    const kindPath = path.join('.');
    const message = [prefix, `${operationName} failed${idx} (${kindPath}${suffix})`].filter(Boolean).join(' - ');
    return { message, code, name, details };
  }

  // Fallback generic message including data when available
  const prefix = [name, typeof code === 'number' ? `code ${code}` : undefined].filter(Boolean).join(' ');
  const dataStr = isObj(details) ? ` Details: ${JSON.stringify(details)}` : '';
  const message = [prefix, `${operationName} RPC error: ${generic}${dataStr}`].filter(Boolean).join(' - ');
  return { message, code, name, details };
}

/**
 * Extract a short NEAR error label for UI display, e.g.:
 *   "InvalidTxError: UnsuitableStakingKey"
 * Falls back to undefined when structure is not recognized.
 */
export function getNearShortErrorMessage(error: unknown): string | undefined {
  try {
    const err = error as { details?: unknown; message?: string };
    const details = err?.details as Record<string, unknown> | undefined;
    const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
    if (!isObj(details)) return undefined;

    // Path 1: details.TxExecutionError (RPC top-level error)
    const txExec = details.TxExecutionError as unknown;
    if (isObj(txExec)) {
      if (isObj(txExec.InvalidTxError)) {
        const inv = txExec.InvalidTxError as Record<string, unknown>;
        if (isObj(inv.ActionsValidation)) {
          const kind = Object.keys(inv.ActionsValidation)[0];
          if (kind) return `InvalidTxError: ${kind}`;
        }
        const first = Object.keys(inv)[0];
        if (first) return `InvalidTxError: ${first}`;
        return 'InvalidTxError';
      }
      if (isObj(txExec.ActionError)) {
        const ae = txExec.ActionError as Record<string, unknown>;
        const kindObj = isObj(ae.kind) ? (ae.kind as Record<string, unknown>) : undefined;
        const kind = kindObj ? Object.keys(kindObj)[0] : undefined;
        if (kind) return `ActionError: ${kind}`;
        return 'ActionError';
      }
    }

    // Path 2: details.Failure (sendTransaction resolved with Failure)
    const failure = details.Failure as unknown;
    if (isObj(failure)) {
      if (isObj(failure.InvalidTxError)) {
        const inv = failure.InvalidTxError as Record<string, unknown>;
        if (isObj(inv.ActionsValidation)) {
          const kind = Object.keys(inv.ActionsValidation)[0];
          if (kind) return `InvalidTxError: ${kind}`;
        }
        const first = Object.keys(inv)[0];
        if (first) return `InvalidTxError: ${first}`;
        return 'InvalidTxError';
      }
      if (isObj(failure.ActionError)) {
        const ae = failure.ActionError as Record<string, unknown>;
        const kindObj = isObj(ae.kind) ? (ae.kind as Record<string, unknown>) : undefined;
        const kind = kindObj ? Object.keys(kindObj)[0] : undefined;
        if (kind) return `ActionError: ${kind}`;
        return 'ActionError';
      }
    }

    return undefined;
  } catch {
    return undefined;
  }
}
