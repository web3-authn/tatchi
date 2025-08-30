// Canonical transaction digest helpers for UI/host validation
// Uses Web Crypto API (crypto.subtle). Import a minimal base64url helper that does not pull bs58.
import { base64UrlEncode } from '@/utils/base64';

// Deterministic stringify by alphabetizing object keys recursively.
export function alphabetizeStringify(input: any): string {
  const normalize = (v: any): any => {
    if (Array.isArray(v)) return v.map(normalize);
    if (v && typeof v === 'object') {
      const out: Record<string, any> = {};
      Object.keys(v).sort().forEach(k => {
        out[k] = normalize((v as any)[k]);
      });
      return out;
    }
    return v;
  };
  return JSON.stringify(normalize(input));
}

export async function sha256Base64UrlUtf8(input: string): Promise<string> {
  const enc = new TextEncoder();
  const data = enc.encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return base64UrlEncode(digest);
}

export async function computeUiIntentDigestFromTxs(txInputs: any[]): Promise<string> {
  // Important: preserve property insertion order and array order via JSON.stringify
  // This must match the Rust worker's serde_json::to_string over the same shape.
  const json = alphabetizeStringify(txInputs);
  console.log('[JS] uiDigest (alphabetized string tx_signing_requests):', json);
  return sha256Base64UrlUtf8(json);
}
