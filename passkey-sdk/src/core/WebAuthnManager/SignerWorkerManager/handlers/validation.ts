import { normalizeRegistrationCredential } from '../../credentialsHelpers';
import type { WebAuthnRegistrationCredential } from '../../../types/webauthn';
import { validateVRFChallenge, type VRFChallenge } from '../../../types/vrf-worker';
import type { TransactionContext } from '../../../types/rpc';

// Strongly typed payload expected from the WASM → JS boundary
export interface RegistrationCredentialConfirmationPayload {
  confirmed: boolean;
  requestId: string;
  intentDigest: string;
  credential?: WebAuthnRegistrationCredential; // serialized PublicKeyCredential (no methods)
  prfOutput?: string; // base64url string (ChaCha20 PRF)
  vrfChallenge?: VRFChallenge;
  transactionContext?: TransactionContext;
  error?: string;
}

function isObject(x: any): x is Record<string, any> {
  return x !== null && typeof x === 'object';
}

function assertString(val: any, name: string): string {
  if (typeof val !== 'string') throw new Error(`Invalid ${name}: expected string`);
  return val;
}

function validateTransactionContextMaybe(input: any): TransactionContext | undefined {
  if (input == null) return undefined;
  if (!isObject(input)) throw new Error('Invalid transactionContext: expected object');
  // Minimal structural validation; AccessKeyView is complex. Be tolerant because the WASM struct omits it.
  const nearPublicKeyStr = assertString((input as any).nearPublicKeyStr, 'transactionContext.nearPublicKeyStr');
  const nextNonce = assertString((input as any).nextNonce, 'transactionContext.nextNonce');
  const txBlockHeight = assertString((input as any).txBlockHeight, 'transactionContext.txBlockHeight');
  const txBlockHash = assertString((input as any).txBlockHash, 'transactionContext.txBlockHash');
  let accessKeyInfo = (input as any).accessKeyInfo;
  if (accessKeyInfo != null && !isObject(accessKeyInfo)) {
    throw new Error('Invalid transactionContext.accessKeyInfo: expected object');
  }
  if (accessKeyInfo == null) {
    // Synthesize a minimal placeholder; not used by registration flows consuming this payload
    accessKeyInfo = { nonce: 0 } as any;
  }
  return {
    nearPublicKeyStr,
    nextNonce,
    txBlockHeight,
    txBlockHash,
    accessKeyInfo,
  } as TransactionContext;
}

function validateCredentialMaybe(input: any): WebAuthnRegistrationCredential | undefined {
  if (input == null) return undefined;
  const cred = normalizeRegistrationCredential(input);
  if (cred.type !== 'public-key') {
    throw new Error('Invalid credential.type: expected "public-key"');
  }
  // Core field/type validation (serialized shapes should be base64url strings)
  assertString((cred as any).id, 'credential.id');
  assertString((cred as any).rawId, 'credential.rawId');
  const resp: any = (cred as any).response;
  if (!isObject(resp)) throw new Error('Invalid credential.response: expected object');
  assertString(resp.clientDataJSON, 'credential.response.clientDataJSON');
  assertString(resp.attestationObject, 'credential.response.attestationObject');
  if (!Array.isArray(resp.transports)) throw new Error('Invalid credential.response.transports: expected string[]');
  for (const t of resp.transports) {
    if (typeof t !== 'string') throw new Error('Invalid credential.response.transports item: expected string');
  }
  if ((cred as any).authenticatorAttachment != null && typeof (cred as any).authenticatorAttachment !== 'string') {
    throw new Error('Invalid credential.authenticatorAttachment: expected string | undefined');
  }
  // Note: prf.results may be undefined/null here. We intentionally do NOT
  // require them at the boundary; internal callers that need PRF (e.g. key
  // derivation) will extract/compute them separately. Contract payloads must
  // not include PRF values.
  return cred;
}

function validateVrfChallengeMaybe(input: any): VRFChallenge | undefined {
  if (input == null) return undefined;
  return validateVRFChallenge(input);
}

export function parseAndValidateRegistrationCredentialConfirmationPayload(payload: any): RegistrationCredentialConfirmationPayload {
  if (!isObject(payload)) throw new Error('Invalid response payload: expected object');
  const confirmed = !!payload.confirmed;
  const requestId = assertString(payload.requestId, 'requestId');
  // intentDigest is only used for TX signing requests, not registration or link device requests
  const intentDigest = payload.intentDigest == null ? '' : assertString(payload.intentDigest, 'intentDigest');

  const credential = payload.credential != null ? validateCredentialMaybe(payload.credential) : undefined;
  const prfOutput = payload.prfOutput == null ? undefined : assertString(payload.prfOutput, 'prfOutput');
  const vrfChallenge = payload.vrfChallenge != null ? validateVrfChallengeMaybe(payload.vrfChallenge) : undefined;
  const transactionContext = payload.transactionContext != null ? validateTransactionContextMaybe(payload.transactionContext) : undefined;
  const error = payload.error == null ? undefined : assertString(payload.error, 'error');

  return {
    confirmed,
    requestId,
    intentDigest,
    credential,
    prfOutput,
    vrfChallenge,
    transactionContext,
    error,
  };
}

