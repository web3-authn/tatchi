import { base64UrlDecode } from '../../utils';
import { validateNearAccountId } from '../../utils/validation';

/**
 * Parse a WebAuthn userHandle into a NEAR account ID.
 * Accepts either a base64url string (serialized) or an ArrayBuffer-like value.
 * Strips optional device suffixes like " (2)" appended during registration.
 * Returns a validated account ID string or null if invalid/unavailable.
 */
export function parseAccountIdFromUserHandle(userHandle: unknown): string | null {
  try {
    let bytes: Uint8Array | null = null;
    if (typeof userHandle === 'string' && userHandle.length > 0) {
      try { bytes = base64UrlDecode(userHandle); } catch { bytes = null; }
    } else if (userHandle && typeof (userHandle as any).byteLength === 'number') {
      try { bytes = new Uint8Array(userHandle as ArrayBuffer); } catch { bytes = null; }
    }
    if (!bytes || bytes.byteLength === 0) return null;

    const decoded = new TextDecoder().decode(bytes);
    const base = decoded.replace(/ \(\d+\)$/g, '');
    return validateNearAccountId(base).valid ? base : null;
  } catch {
    return null;
  }
}

