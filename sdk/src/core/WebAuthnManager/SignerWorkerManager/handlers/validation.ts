import { normalizeRegistrationCredential } from '../../credentialsHelpers';
import type { WebAuthnRegistrationCredential } from '../../../types/webauthn';
import { validateVRFChallenge, type VRFChallenge } from '../../../types/vrf-worker';
import type { TransactionContext } from '../../../types/rpc';
import { isObject, assertString } from '../../../WalletIframe/validation';

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

function validateTransactionContextMaybe(input: unknown): TransactionContext | undefined {
  if (input == null) return undefined;
  if (!isObject(input)) throw new Error('Invalid transactionContext: expected object');
  // Minimal structural validation; AccessKeyView is complex. Be tolerant because the WASM struct omits it.
  const nearPublicKeyStr = assertString((input as { nearPublicKeyStr?: unknown }).nearPublicKeyStr, 'transactionContext.nearPublicKeyStr');
  const nextNonce = assertString((input as { nextNonce?: unknown }).nextNonce, 'transactionContext.nextNonce');
  const txBlockHeight = assertString((input as { txBlockHeight?: unknown }).txBlockHeight, 'transactionContext.txBlockHeight');
  const txBlockHash = assertString((input as { txBlockHash?: unknown }).txBlockHash, 'transactionContext.txBlockHash');
  let accessKeyInfo = (input as { accessKeyInfo?: unknown }).accessKeyInfo as unknown;
  if (accessKeyInfo != null && !isObject(accessKeyInfo)) {
    throw new Error('Invalid transactionContext.accessKeyInfo: expected object');
  }
  if (accessKeyInfo == null) {
    // Synthesize a minimal placeholder; not used by registration flows consuming this payload
    accessKeyInfo = { nonce: 0 } as unknown;
  }
  return {
    nearPublicKeyStr,
    nextNonce,
    txBlockHeight,
    txBlockHash,
    accessKeyInfo: accessKeyInfo as TransactionContext['accessKeyInfo'],
  } as TransactionContext;
}

function validateCredentialMaybe(input: unknown): WebAuthnRegistrationCredential | undefined {
  if (input == null) return undefined;
  const cred = normalizeRegistrationCredential(input);
  if (cred.type !== 'public-key') {
    throw new Error('Invalid credential.type: expected "public-key"');
  }
  // Core field/type validation (serialized shapes should be base64url strings)
  assertString((cred as { id?: unknown }).id, 'credential.id');
  assertString((cred as { rawId?: unknown }).rawId, 'credential.rawId');
  const resp: unknown = (cred as { response?: unknown }).response;
  if (!isObject(resp)) throw new Error('Invalid credential.response: expected object');
  assertString((resp as { clientDataJSON?: unknown }).clientDataJSON, 'credential.response.clientDataJSON');
  assertString((resp as { attestationObject?: unknown }).attestationObject, 'credential.response.attestationObject');
  const transports = (resp as { transports?: unknown }).transports;
  if (!Array.isArray(transports)) throw new Error('Invalid credential.response.transports: expected string[]');
  for (const t of transports) {
    if (typeof t !== 'string') throw new Error('Invalid credential.response.transports item: expected string');
  }
  if ((cred as { authenticatorAttachment?: unknown }).authenticatorAttachment != null && typeof (cred as { authenticatorAttachment?: unknown }).authenticatorAttachment !== 'string') {
    throw new Error('Invalid credential.authenticatorAttachment: expected string | undefined');
  }
  // Note: prf.results may be undefined/null here. We intentionally do NOT
  // require them at the boundary; internal callers that need PRF (e.g. key
  // derivation) will extract/compute them separately. Contract payloads must
  // not include PRF values.
  return cred;
}

function validateVrfChallengeMaybe(input: unknown): VRFChallenge | undefined {
  if (input == null) return undefined;
  return validateVRFChallenge(input as Parameters<typeof validateVRFChallenge>[0]);
}

export function parseAndValidateRegistrationCredentialConfirmationPayload(payload: unknown): RegistrationCredentialConfirmationPayload {
  if (!isObject(payload)) throw new Error('Invalid response payload: expected object');
  const confirmed = !!(payload as { confirmed?: unknown }).confirmed;
  const requestId = assertString((payload as { requestId?: unknown }).requestId, 'requestId');
  // intentDigest is only used for TX signing requests, not registration or link device requests
  const intentDigest = (payload as { intentDigest?: unknown }).intentDigest == null ? '' : assertString((payload as { intentDigest?: unknown }).intentDigest, 'intentDigest');

  const credential = (payload as { credential?: unknown }).credential != null ? validateCredentialMaybe((payload as { credential?: unknown }).credential) : undefined;
  const prfOutput = (payload as { prfOutput?: unknown }).prfOutput == null ? undefined : assertString((payload as { prfOutput?: unknown }).prfOutput, 'prfOutput');
  const vrfChallenge = (payload as { vrfChallenge?: unknown }).vrfChallenge != null ? validateVrfChallengeMaybe((payload as { vrfChallenge?: unknown }).vrfChallenge) : undefined;
  const transactionContext = (payload as { transactionContext?: unknown }).transactionContext != null ? validateTransactionContextMaybe((payload as { transactionContext?: unknown }).transactionContext) : undefined;
  const error = (payload as { error?: unknown }).error == null ? undefined : assertString((payload as { error?: unknown }).error, 'error');

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
