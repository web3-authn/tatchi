// Canonical transaction digest helpers for UI/host validation
// Uses Web Crypto API (crypto.subtle). Import a minimal base64url helper that does not pull bs58.
import { ActionArgsWasm, TransactionInputWasm } from '@/core/types';
import { base64UrlEncode } from '@/utils/base64';

// Deterministic stringify by alphabetizing object keys recursively.
export function alphabetizeStringify<T>(input: T): string {
  const normalizeValue = (value: unknown): unknown => {
    // Arrays: preserve order, normalize each element
    if (Array.isArray(value)) {
      return value.map(normalizeValue);
    }
    // Objects: sort keys alphabetically and normalize each nested value
    if (value !== null && typeof value === 'object') {
      const obj = value as Record<string, unknown>;
      const sortedKeys = Object.keys(obj).sort();
      const result: Record<string, unknown> = {};
      for (const key of sortedKeys) {
        result[key] = normalizeValue(obj[key]);
      }
      return result;
    }
    return value;
  };

  return JSON.stringify(normalizeValue(input));
}

export async function sha256Base64UrlUtf8(input: string): Promise<string> {
  const enc = new TextEncoder();
  const data = enc.encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return base64UrlEncode(digest);
}

export async function computeUiIntentDigestFromTxs(txInputs: TransactionInputWasm[]): Promise<string> {
  // Important: preserve property insertion order and array order via JSON.stringify
  // This must match the Rust worker's serde_json::to_string over the same shape.
  const json = alphabetizeStringify(txInputs);
  return sha256Base64UrlUtf8(json);
}

export function orderActionForDigest(a: ActionArgsWasm) {
  switch (a.action_type) {
    case 'FunctionCall':
      return { action_type: a.action_type, args: a.args, deposit: a.deposit, gas: a.gas, method_name: a.method_name };
    case 'Transfer':
      return { action_type: a.action_type, deposit: a.deposit };
    case 'Stake':
      return { action_type: a.action_type, stake: a.stake, public_key: a.public_key };
    case 'AddKey':
      return { action_type: a.action_type, public_key: a.public_key, access_key: a.access_key };
    case 'DeleteKey':
      return { action_type: a.action_type, public_key: a.public_key };
    case 'DeleteAccount':
      return { action_type: a.action_type, beneficiary_id: a.beneficiary_id };
    case 'DeployContract':
      return { action_type: a.action_type, code: a.code };
    case 'CreateAccount':
    default:
      return { action_type: a.action_type };
  }
};
