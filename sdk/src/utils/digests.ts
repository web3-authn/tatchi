// Shared digest primitives used across browser + server code.
//
// These helpers deliberately stay small and dependency-free so they can be used from:
// - UI/VRF binding (WebAuthnManager)
// - Relayer/server-side verification (threshold validation)

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

// Deterministic stringify by alphabetizing object keys recursively.
// Arrays preserve order; only keys within objects are sorted.
export function alphabetizeStringify(input: unknown): string {
  const normalizeValue = (value: unknown): unknown => {
    if (Array.isArray(value)) {
      return value.map(normalizeValue);
    }
    if (isRecord(value)) {
      const sortedKeys = Object.keys(value).sort();
      const result: Record<string, unknown> = {};
      for (const key of sortedKeys) {
        result[key] = normalizeValue(value[key]);
      }
      return result;
    }
    return value;
  };

  return JSON.stringify(normalizeValue(input));
}

export async function sha256BytesUtf8(input: string): Promise<Uint8Array> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return new Uint8Array(digest);
}

