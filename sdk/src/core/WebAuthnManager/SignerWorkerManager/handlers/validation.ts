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
  credential: WebAuthnRegistrationCredential; // serialized PublicKeyCredential (no methods)
  prfOutput?: string; // base64url string (ChaCha20 PRF)
  vrfChallenge: VRFChallenge;
  transactionContext?: TransactionContext;
  error?: string;
}

function validateTransactionContextMaybe(input: unknown): TransactionContext | undefined {
  if (input == null) return undefined;
  if (!isObject(input)) {
    throw new Error('Invalid transactionContext: expected object');
  }

  const {
    nearPublicKeyStr,
    nextNonce,
    txBlockHeight,
    txBlockHash,
    accessKeyInfo,
  } = input as {
    nearPublicKeyStr?: unknown;
    nextNonce?: unknown;
    txBlockHeight?: unknown;
    txBlockHash?: unknown;
    accessKeyInfo?: unknown;
  };

  // Minimal structural validation; AccessKeyView is complex. Be tolerant because the WASM struct omits it.
  const normalizedNearPublicKeyStr = assertString(
    nearPublicKeyStr,
    'transactionContext.nearPublicKeyStr',
  );
  const normalizedNextNonce = assertString(nextNonce, 'transactionContext.nextNonce');
  const normalizedTxBlockHeight = assertString(
    txBlockHeight,
    'transactionContext.txBlockHeight',
  );
  const normalizedTxBlockHash = assertString(txBlockHash, 'transactionContext.txBlockHash');

  let normalizedAccessKeyInfo = accessKeyInfo as TransactionContext['accessKeyInfo'] | undefined;
  if (normalizedAccessKeyInfo != null && !isObject(normalizedAccessKeyInfo)) {
    throw new Error('Invalid transactionContext.accessKeyInfo: expected object');
  }
  if (normalizedAccessKeyInfo == null) {
    // Synthesize a minimal placeholder; not used by registration flows consuming this payload
    normalizedAccessKeyInfo = { nonce: 0 } as unknown as TransactionContext['accessKeyInfo'];
  }

  return {
    nearPublicKeyStr: normalizedNearPublicKeyStr,
    nextNonce: normalizedNextNonce,
    txBlockHeight: normalizedTxBlockHeight,
    txBlockHash: normalizedTxBlockHash,
    accessKeyInfo: normalizedAccessKeyInfo,
  };
}

function validateCredentialMaybe(input: unknown): WebAuthnRegistrationCredential | undefined {
  if (input == null) return undefined;

  const cred = normalizeRegistrationCredential(input);
  if (cred.type !== 'public-key') {
    throw new Error('Invalid credential.type: expected "public-key"');
  }

  const { id, rawId, response, authenticatorAttachment } = cred as {
    id?: unknown;
    rawId?: unknown;
    response?: unknown;
    authenticatorAttachment?: unknown;
  };

  // Core field/type validation (serialized shapes should be base64url strings)
  assertString(id, 'credential.id');
  assertString(rawId, 'credential.rawId');

  if (!isObject(response)) {
    throw new Error('Invalid credential.response: expected object');
  }

  const {
    clientDataJSON,
    attestationObject,
    transports,
  } = response as {
    clientDataJSON?: unknown;
    attestationObject?: unknown;
    transports?: unknown;
  };

  assertString(clientDataJSON, 'credential.response.clientDataJSON');
  assertString(attestationObject, 'credential.response.attestationObject');

  if (!Array.isArray(transports)) {
    throw new Error('Invalid credential.response.transports: expected string[]');
  }
  for (const t of transports) {
    if (typeof t !== 'string') {
      throw new Error('Invalid credential.response.transports item: expected string');
    }
  }

  if (authenticatorAttachment != null && typeof authenticatorAttachment !== 'string') {
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

export function parseAndValidateRegistrationCredentialConfirmationPayload(
  payload: unknown,
): RegistrationCredentialConfirmationPayload {

  if (!isObject(payload)) {
    throw new Error('Invalid response payload: expected object');
  }

  const {
    confirmed,
    requestId,
    intentDigest,
    credential,
    prfOutput,
    vrfChallenge,
    transactionContext,
    error,
  } = payload as {
    confirmed?: unknown;
    requestId?: unknown;
    intentDigest?: unknown;
    credential?: unknown;
    prfOutput?: unknown;
    vrfChallenge?: unknown;
    transactionContext?: unknown;
    error?: unknown;
  };

  const normalizedRequestId = assertString(requestId, 'requestId');

  // intentDigest is only used for TX signing requests, not registration or link device requests
  const normalizedIntentDigest =
    intentDigest == null ? '' : assertString(intentDigest, 'intentDigest');

  const normalizedCredential =
    credential != null ? validateCredentialMaybe(credential) : undefined;

  if (!normalizedCredential) {
    throw new Error('Missing registration credential');
  }

  const normalizedPrfOutput =
    prfOutput == null ? undefined : assertString(prfOutput, 'prfOutput');

  const normalizedVrfChallenge =
    vrfChallenge != null ? validateVrfChallengeMaybe(vrfChallenge) : undefined;

  if (!normalizedVrfChallenge) {
    throw new Error('Missing VRF Challenge');
  }

  const normalizedTransactionContext =
    transactionContext != null ? validateTransactionContextMaybe(transactionContext) : undefined;

  const normalizedError =
    error == null ? undefined : assertString(error, 'error');

  return {
    confirmed: !!confirmed,
    requestId: normalizedRequestId,
    intentDigest: normalizedIntentDigest,
    credential: normalizedCredential,
    prfOutput: normalizedPrfOutput,
    vrfChallenge: normalizedVrfChallenge,
    transactionContext: normalizedTransactionContext,
    error: normalizedError,
  };
}
