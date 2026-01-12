import { base64UrlDecode, base64UrlEncode } from '../../../utils/encoders';
import { toOptionalTrimmedString } from '../../../utils/validation';
import { bytesEqual32, isObject, parseThresholdEd25519MpcSessionRecord } from './validation';
import { normalizeThresholdEd25519ParticipantId } from '../../../threshold/participants';

export type ThresholdEd25519CosignerGrantV1 = {
  v: 1;
  typ: 'threshold_ed25519_cosigner_grant_v1';
  iat: number;
  exp: number;
  mpcSessionId: string;
  cosignerId: number;
  mpcSession: unknown;
};

export type ParsedThresholdEd25519MpcSession = NonNullable<ReturnType<typeof parseThresholdEd25519MpcSessionRecord>>;

function toArrayBufferCopy(bytes: Uint8Array): ArrayBuffer {
  const ab = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(ab).set(bytes);
  return ab;
}

async function signHmacJsonToken(input: {
  secretBytes: Uint8Array | null;
  keyPromise: Promise<CryptoKey> | null;
  payload: unknown;
}): Promise<{ token: string | null; keyPromise: Promise<CryptoKey> | null }> {
  const { key, keyPromise } = await ensureCoordinatorHmacKey({ secretBytes: input.secretBytes, keyPromise: input.keyPromise });
  if (!key) return { token: null, keyPromise };
  const payloadBytes = new TextEncoder().encode(JSON.stringify(input.payload));
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, toArrayBufferCopy(payloadBytes)));
  return { token: `${base64UrlEncode(payloadBytes)}.${base64UrlEncode(sig)}`, keyPromise };
}

async function ensureCoordinatorHmacKey(input: {
  secretBytes: Uint8Array | null;
  keyPromise: Promise<CryptoKey> | null;
}): Promise<{ key: CryptoKey | null; keyPromise: Promise<CryptoKey> | null }> {
  if (!input.secretBytes) return { key: null, keyPromise: input.keyPromise };
  const keyPromise = input.keyPromise ?? crypto.subtle.importKey(
    'raw',
    toArrayBufferCopy(input.secretBytes),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return { key: await keyPromise, keyPromise };
}

export async function signThresholdEd25519CosignerGrantV1(input: {
  secretBytes: Uint8Array | null;
  keyPromise: Promise<CryptoKey> | null;
  payload: ThresholdEd25519CosignerGrantV1;
}): Promise<{ token: string | null; keyPromise: Promise<CryptoKey> | null }> {
  return await signHmacJsonToken(input);
}

async function verifyHmacJsonToken(input: {
  secretBytes: Uint8Array | null;
  keyPromise: Promise<CryptoKey> | null;
  token: unknown;
  missingSecretMessage: string;
  expectedTyp: string;
}): Promise<
  | {
      ok: true;
      keyPromise: Promise<CryptoKey> | null;
      payload: Record<string, unknown>;
      iat: number;
      exp: number;
      mpcSessionId: string;
      mpcSession: ParsedThresholdEd25519MpcSession;
    }
  | {
      ok: false;
      keyPromise: Promise<CryptoKey> | null;
      code: string;
      message: string;
    }
> {
  const { key, keyPromise } = await ensureCoordinatorHmacKey({ secretBytes: input.secretBytes, keyPromise: input.keyPromise });
  if (!key) {
    return { ok: false, keyPromise, code: 'not_found', message: input.missingSecretMessage };
  }

  const raw = toOptionalTrimmedString(input.token);
  if (!raw) return { ok: false, keyPromise, code: 'unauthorized', message: 'Missing coordinatorGrant' };
  const parts = raw.split('.');
  if (parts.length !== 2) {
    return { ok: false, keyPromise, code: 'unauthorized', message: 'Invalid coordinatorGrant format' };
  }

  let payloadBytes: Uint8Array;
  let sigBytes: Uint8Array;
  try {
    payloadBytes = base64UrlDecode(parts[0]);
    sigBytes = base64UrlDecode(parts[1]);
  } catch {
    return { ok: false, keyPromise, code: 'unauthorized', message: 'Invalid coordinatorGrant encoding' };
  }
  if (sigBytes.length !== 32) {
    return { ok: false, keyPromise, code: 'unauthorized', message: 'Invalid coordinatorGrant signature length' };
  }

  const expected = new Uint8Array(await crypto.subtle.sign('HMAC', key, toArrayBufferCopy(payloadBytes)));
  if (!bytesEqual32(expected, sigBytes)) {
    return { ok: false, keyPromise, code: 'unauthorized', message: 'Invalid coordinatorGrant signature' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(payloadBytes)) as unknown;
  } catch {
    return { ok: false, keyPromise, code: 'unauthorized', message: 'Invalid coordinatorGrant JSON' };
  }
  if (!isObject(parsed)) {
    return { ok: false, keyPromise, code: 'unauthorized', message: 'Invalid coordinatorGrant payload' };
  }

  const g = parsed as Record<string, unknown>;
  if (g.typ !== input.expectedTyp || g.v !== 1) {
    return { ok: false, keyPromise, code: 'unauthorized', message: 'Invalid coordinatorGrant type' };
  }
  const iat = Number(g.iat);
  const exp = Number(g.exp);
  if (!Number.isFinite(iat) || !Number.isFinite(exp) || exp <= 0 || exp < iat) {
    return { ok: false, keyPromise, code: 'unauthorized', message: 'Invalid coordinatorGrant timestamps' };
  }
  const now = Math.floor(Date.now() / 1000);
  if (now >= exp) {
    return { ok: false, keyPromise, code: 'unauthorized', message: 'coordinatorGrant expired' };
  }

  const mpcSessionId = toOptionalTrimmedString(g.mpcSessionId);
  if (!mpcSessionId) {
    return { ok: false, keyPromise, code: 'unauthorized', message: 'Invalid coordinatorGrant mpcSessionId' };
  }

  const mpcSession = parseThresholdEd25519MpcSessionRecord(g.mpcSession);
  if (!mpcSession) {
    return { ok: false, keyPromise, code: 'unauthorized', message: 'Invalid coordinatorGrant mpcSession payload' };
  }
  if (Date.now() > mpcSession.expiresAtMs) {
    return { ok: false, keyPromise, code: 'unauthorized', message: 'coordinatorGrant mpcSession expired' };
  }

  return { ok: true, keyPromise, payload: g, iat, exp, mpcSessionId, mpcSession };
}

export async function verifyThresholdEd25519CosignerGrantV1(input: {
  secretBytes: Uint8Array | null;
  keyPromise: Promise<CryptoKey> | null;
  token: unknown;
}): Promise<
  { ok: true; keyPromise: Promise<CryptoKey> | null; grant: ThresholdEd25519CosignerGrantV1; mpcSession: ParsedThresholdEd25519MpcSession }
  | { ok: false; keyPromise: Promise<CryptoKey> | null; code: string; message: string }
> {
  const verified = await verifyHmacJsonToken({
    secretBytes: input.secretBytes,
    keyPromise: input.keyPromise,
    token: input.token,
    missingSecretMessage: 'threshold-ed25519 cosigner grants are not enabled on this server',
    expectedTyp: 'threshold_ed25519_cosigner_grant_v1',
  });
  if (!verified.ok) return verified;
  const { payload: g, iat, exp, mpcSessionId, mpcSession, keyPromise } = verified;

  const cosignerId = normalizeThresholdEd25519ParticipantId(g.cosignerId);
  if (!cosignerId) {
    return { ok: false, keyPromise, code: 'unauthorized', message: 'Invalid coordinatorGrant cosignerId' };
  }

  return {
    ok: true,
    keyPromise,
    grant: {
      v: 1,
      typ: 'threshold_ed25519_cosigner_grant_v1',
      iat,
      exp,
      mpcSessionId,
      cosignerId,
      mpcSession: g.mpcSession,
    },
    mpcSession,
  };
}
