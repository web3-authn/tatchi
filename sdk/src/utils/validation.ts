
export interface ValidationResult {
  valid: boolean;
  error?: string;
}

// ==============================
// Normalization helpers (shared)
// ==============================

/** Strict string coercion: returns the value only when it's already a string. */
export function toOptionalString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** Strict string coercion + trimming. */
export function toOptionalTrimmedString(value: unknown): string {
  return toOptionalString(value).trim();
}

/** String coercion + trimming (useful at IO boundaries). */
export function toTrimmedString(value: unknown): string {
  return String(value ?? '').trim();
}

/** Remove trailing `/` characters (e.g. base URL normalization). */
export function stripTrailingSlashes(value: string): string {
  return String(value ?? '').replace(/\/+$/, '');
}

/** Ensure a non-empty string starts with `/` (path normalization). */
export function ensureLeadingSlash(value: string): string {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return '';
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

/** Normalize an app base path like `/sdk` (leading slash, no trailing slashes except `/`). */
export function toBasePath(value?: string, fallback = '/sdk'): string {
  const base = ensureLeadingSlash(typeof value === 'string' ? value : fallback) || ensureLeadingSlash(fallback) || '/';
  if (base === '/') return '/';
  return base.replace(/\/+$/, '');
}

/** Best-effort origin normalization (used by CSP/Permissions-Policy helpers). */
export function toOriginOrUndefined(input?: string): string | undefined {
  try {
    const v = (input || '').trim();
    if (!v) return undefined;
    // Next/Caddy/etc. expect an origin, not a path
    return new URL(v, 'http://dummy').origin === 'http://dummy' ? new URL(v).origin : v;
  } catch {
    return input?.trim() || undefined;
  }
}

/**
 * Strict origin sanitizer for Related Origin Requests (ROR).
 * - Allows `https://<host>[:port]` and `http://localhost[:port]` only.
 * - Rejects paths (except `/`), queries, and hashes.
 * - Normalizes hostname casing.
 */
export function toRorOriginOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const raw = toTrimmedString(value);
  if (!raw) return null;
  try {
    const u = new URL(raw);
    const scheme = u.protocol;
    const host = u.hostname.toLowerCase();
    const port = u.port ? `:${u.port}` : '';
    const isHttps = scheme === 'https:';
    const isLocalhostHttp = scheme === 'http:' && host === 'localhost';
    if (!isHttps && !isLocalhostHttp) return null;
    if ((u.pathname && u.pathname !== '/') || u.search || u.hash) return null;
    return `${scheme}//${host}${port}`;
  } catch {
    return null;
  }
}

/** Collapse a string into a single line by normalizing whitespace. */
export function toSingleLine(value: unknown): string {
  return String(value ?? '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Ensure a key string has the NEAR Ed25519 prefix (`ed25519:`).
 *
 * - Accepts either `ed25519:<base58>` or a bare `<base58>` string.
 * - Canonicalizes `ED25519:` → `ed25519:`.
 * - If a different prefix is present (e.g. `secp256k1:`), returns the input unchanged.
 */
export function ensureEd25519Prefix(value: string): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '';

  if (/^[a-z0-9_]+:/i.test(raw)) {
    if (/^ed25519:/i.test(raw)) {
      return `ed25519:${raw.replace(/^ed25519:/i, '')}`;
    }
    return raw;
  }

  return `ed25519:${raw}`;
}

export interface NearAccountValidationOptions {
  /** Restrict to specific suffixes (e.g., ['testnet', 'near']) */
  allowedSuffixes?: string[];
  /** Require Top-level domains with exactly 2 parts (username.suffix) instead of allowing subdomains */
  requireTopLevelDomain?: boolean;
}

/**
 * Validate NEAR account ID format with optional suffix restrictions
 * @param nearAccountId - The account ID to validate
 * @param options - Optional validation constraints
 */
export function validateNearAccountId(
  nearAccountId: string,
  options: NearAccountValidationOptions = {
    allowedSuffixes: ['testnet', 'near'],
    requireTopLevelDomain: false
  }
): ValidationResult {
  if (!nearAccountId || typeof nearAccountId !== 'string') {
    return { valid: false, error: 'Account ID must be a non-empty string' };
  }

  const parts = nearAccountId.split('.');
  if (parts.length < 2) {
    return { valid: false, error: 'Account ID must contain at least one dot (e.g., username.testnet)' };
  }

  // Check for exact two parts requirement (e.g., server registration)
  if (options.requireTopLevelDomain && parts.length !== 2) {
    const suffixList = options.allowedSuffixes?.join(', ') || 'valid suffixes';
    return {
      valid: false,
      error: `Invalid NEAR account ID format. Expected format: <username>.<suffix> where suffix is one of: ${suffixList}`
    };
  }

  const username = parts[0];
  const suffix = parts[parts.length - 1]; // Last part for suffix checking
  const domain = parts.slice(1).join('.');

  // Validate username part
  if (!username || username.length === 0) {
    return { valid: false, error: 'Username part cannot be empty' };
  }

  if (!/^[a-z0-9_\-]+$/.test(username)) {
    return { valid: false, error: 'Username can only contain lowercase letters, numbers, underscores, and hyphens' };
  }

  // Validate domain part
  if (!domain || domain.length === 0) {
    return { valid: false, error: 'Domain part cannot be empty' };
  }

  // Check allowed suffixes if specified
  if (options.allowedSuffixes && options.allowedSuffixes.length > 0) {
    // Check if the account ID ends with any of the allowed suffixes
    const matchesAnySuffix = options.allowedSuffixes.some(allowedSuffix => {
      // For single-part suffixes, check the last part
      if (!allowedSuffix.includes('.')) {
        return suffix === allowedSuffix;
      }
      // For multi-part suffixes, check if the account ID ends with the full suffix
      return nearAccountId.endsWith(`.${allowedSuffix}`);
    });

    if (!matchesAnySuffix) {
      return {
        valid: false,
        error: `Invalid NEAR account ID suffix. Expected account to end with one of: ${options.allowedSuffixes.join(', ')}`
      };
    }
  }

  return { valid: true };
}

/**
 * Lightweight NEAR account ID validation used by server-side helpers.
 * - length: 2..64
 * - chars: lowercase letters, digits, `_`, `.`, `-`
 */
export function isValidAccountId(accountId: unknown): accountId is string {
  if (typeof accountId !== 'string') return false;
  if (!accountId || accountId.length < 2 || accountId.length > 64) return false;
  return /^[a-z0-9_.-]+$/.test(accountId);
}

// ===========================
// Runtime validation helpers
// ===========================

export function isObject(x: unknown): x is Record<string, unknown> {
  return x !== null && typeof x === 'object';
}

export function isString(x: unknown): x is string {
  return typeof x === 'string';
}

export function isNonEmptyString(x: unknown): x is string {
  return typeof x === 'string' && x.length > 0;
}

export function isNumber(x: unknown): x is number {
  return typeof x === 'number';
}

export function isFiniteNumber(x: unknown): x is number {
  return typeof x === 'number' && Number.isFinite(x);
}

export function isFunction(x: unknown): x is Function {
  return typeof x === 'function';
}

export function isBoolean(x: unknown): x is boolean {
  return typeof x === 'boolean';
}

export function isArray<T = unknown>(x: unknown): x is T[] {
  return Array.isArray(x);
}

export function assertString(val: unknown, name = 'value'): string {
  if (typeof val !== 'string') throw new Error(`Invalid ${name}: expected string`);
  return val;
}

export function assertNumber(val: unknown, name = 'value'): number {
  if (typeof val !== 'number' || !Number.isFinite(val)) throw new Error(`Invalid ${name}: expected finite number`);
  return val;
}

export function assertBoolean(val: unknown, name = 'value'): boolean {
  if (typeof val !== 'boolean') throw new Error(`Invalid ${name}: expected boolean`);
  return val;
}

export function assertObject<T extends Record<string, unknown> = Record<string, unknown>>(val: unknown, name = 'value'): T {
  if (!isObject(val)) throw new Error(`Invalid ${name}: expected object`);
  return val as T;
}

export function assertArray<T = unknown>(val: unknown, name = 'value'): T[] {
  if (!Array.isArray(val)) throw new Error(`Invalid ${name}: expected array`);
  return val as T[];
}

export function stripFunctionsShallow<T extends Record<string, unknown>>(obj?: T): Partial<T> | undefined {
  if (!obj || !isObject(obj)) return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (!isFunction(v)) out[k] = v as unknown;
  }
  return out as Partial<T>;
}

export interface PlainSignedTransactionLike {
  transaction: unknown;
  signature: unknown;
  borsh_bytes?: unknown;
  borshBytes?: unknown;
  base64Encode?: unknown;
}

export function isPlainSignedTransactionLike(x: unknown): x is PlainSignedTransactionLike {
  if (!isObject(x)) return false;
  const hasTx = 'transaction' in x;
  const hasSig = 'signature' in x;
  const bytes = x as { borsh_bytes?: unknown; borshBytes?: unknown };
  const hasBytes = Array.isArray(bytes.borsh_bytes) || bytes.borshBytes instanceof Uint8Array;
  const hasMethod = typeof (x as { base64Encode?: unknown }).base64Encode === 'function';
  return hasTx && hasSig && hasBytes && !hasMethod;
}

export function extractBorshBytesFromPlainSignedTx(x: PlainSignedTransactionLike): number[] {
  const asArray = Array.isArray(x.borsh_bytes) ? (x.borsh_bytes as number[]) : undefined;
  if (asArray) return asArray;
  const asU8 = (x.borshBytes instanceof Uint8Array) ? x.borshBytes : undefined;
  return Array.from(asU8 || new Uint8Array());
}
