// Shared runtime validation helpers for Wallet Iframe code.

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

// Shallowly remove function-valued properties (postMessage/clone safety)
export function stripFunctionsShallow<T extends Record<string, unknown>>(obj?: T): Partial<T> | undefined {
  if (!obj || !isObject(obj)) return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (!isFunction(v)) out[k] = v as unknown;
  }
  return out as Partial<T>;
}

// ===============================
// SignedTransaction shape helpers
// ===============================

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
