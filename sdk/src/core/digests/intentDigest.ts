// Canonical intent digest helpers for UI/host validation.
// Used by both VRF-driven flows and signer-worker signing flows.
//
// Uses Web Crypto API (crypto.subtle). Import a minimal base64url helper that does not pull bs58.
import { ActionType, type ActionArgsWasm, type TransactionInputWasm } from '@/core/types';
import { base64UrlEncode } from '@/utils/base64';
import { alphabetizeStringify, sha256BytesUtf8 } from '@/utils/digests';

export async function sha256Base64UrlUtf8(input: string): Promise<string> {
  const digest = await sha256BytesUtf8(input);
  return base64UrlEncode(digest);
}

export async function computeUiIntentDigestFromNep413(args: {
  nearAccountId: string;
  recipient: string;
  message: string;
}): Promise<string> {
  // This is a UI/host + VRF binding digest. It is NOT the NEP-413 signing hash.
  const json = alphabetizeStringify({ kind: 'nep413', ...args });
  return sha256Base64UrlUtf8(json);
}

export async function computeThresholdEd25519KeygenIntentDigest(args: {
  nearAccountId: string;
  rpId: string;
  clientVerifyingShareB64u: string;
}): Promise<string> {
  const json = alphabetizeStringify({ kind: 'threshold_ed25519_keygen', ...args });
  return sha256Base64UrlUtf8(json);
}

export async function computeLoginIntentDigest(args: {
  nearAccountId: string;
  rpId: string;
}): Promise<string> {
  const json = alphabetizeStringify({ kind: 'login_session', ...args });
  return sha256Base64UrlUtf8(json);
}

// Canonical intent digest for signing flows.
// This is a UI/host validation digest derived from `{ receiverId, actions }` only; it is NOT the
// canonical NEAR signing hash (NEAR signs `sha256(borsh(Transaction))`, computed in the WASM signer).
// Both VRF-side code (confirmAndPrepareSigningSession) and all UI confirmers MUST call this with
// TransactionInputWasm[] built from:
//   { receiverId, actions: ActionArgsWasm[] }
// where each ActionArgsWasm has been normalized via orderActionForDigest.
//
// IMPORTANT:
// - The order of transactions and the order of actions within each transaction is preserved.
// - Only the *keys inside each object* are alphabetically sorted to produce a stable JSON encoding.
//   The arrays themselves are not reordered.
// - Do NOT include nonce or other per-tx fields in the digest input, or INTENT_DIGEST_MISMATCH errors will occur.
export async function computeUiIntentDigestFromTxs(txInputs: TransactionInputWasm[]): Promise<string> {
  // Preserve array order; only object keys are sorted for stable encoding.
  // This must match the relayer/server-side recomputation used for VRF binding.
  const json = alphabetizeStringify(txInputs);
  return sha256Base64UrlUtf8(json);
}

export function orderActionForDigest(a: ActionArgsWasm): ActionArgsWasm {
  switch (a.action_type) {
    case ActionType.FunctionCall:
      return { action_type: a.action_type, args: a.args, deposit: a.deposit, gas: a.gas, method_name: a.method_name };
    case ActionType.Transfer:
      return { action_type: a.action_type, deposit: a.deposit };
    case ActionType.Stake:
      return { action_type: a.action_type, stake: a.stake, public_key: a.public_key };
    case ActionType.AddKey:
      return { action_type: a.action_type, public_key: a.public_key, access_key: a.access_key };
    case ActionType.DeleteKey:
      return { action_type: a.action_type, public_key: a.public_key };
    case ActionType.DeleteAccount:
      return { action_type: a.action_type, beneficiary_id: a.beneficiary_id };
    case ActionType.DeployContract:
      return { action_type: a.action_type, code: a.code };
    case ActionType.SignedDelegate:
      return { action_type: a.action_type, delegate_action: a.delegate_action, signature: a.signature };
    case ActionType.DeployGlobalContract:
      return { action_type: a.action_type, code: a.code, deploy_mode: a.deploy_mode };
    case ActionType.UseGlobalContract:
      return { action_type: a.action_type, account_id: a.account_id, code_hash: a.code_hash };
    case ActionType.CreateAccount:
      return { action_type: a.action_type };
    default: {
      const _exhaustive: never = a;
      return _exhaustive;
    }
  }
}
