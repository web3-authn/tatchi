import type { AccessKeyList } from '../../../core/NearClient';
import { alphabetizeStringify, sha256BytesUtf8 } from '../../../utils/digests';

export type ThresholdValidationOk = { ok: true };
export type ThresholdValidationErr = { ok: false; code: string; message: string };
export type ThresholdValidationResult = ThresholdValidationOk | ThresholdValidationErr;

export function normalizeOptionalString(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

export function isObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

export function isValidNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

export function normalizePrefix(prefix: unknown, defaultPrefix: string): string {
  const p = normalizeOptionalString(prefix);
  if (!p) return defaultPrefix;
  return p.endsWith(':') ? p : `${p}:`;
}

export function normalizeThresholdEd25519KeyPrefix(prefix: unknown): string {
  return normalizePrefix(prefix, 'w3a:threshold-ed25519:key:');
}

export function normalizeThresholdEd25519SessionPrefix(prefix: unknown): string {
  return normalizePrefix(prefix, 'w3a:threshold-ed25519:sess:');
}

export function normalizeThresholdEd25519AuthPrefix(prefix: unknown): string {
  return normalizePrefix(prefix, 'w3a:threshold-ed25519:auth:');
}

export type ParsedThresholdEd25519KeyRecord = {
  publicKey: string;
  relayerSigningShareB64u: string;
  relayerVerifyingShareB64u: string;
};

export function parseThresholdEd25519KeyRecord(raw: unknown): ParsedThresholdEd25519KeyRecord | null {
  if (!isObject(raw)) return null;
  const publicKey = normalizeOptionalString(raw.publicKey);
  const relayerSigningShareB64u = normalizeOptionalString(raw.relayerSigningShareB64u);
  const relayerVerifyingShareB64u = normalizeOptionalString(raw.relayerVerifyingShareB64u);
  if (!publicKey || !relayerSigningShareB64u || !relayerVerifyingShareB64u) return null;
  return { publicKey, relayerSigningShareB64u, relayerVerifyingShareB64u };
}

export type ParsedThresholdEd25519Commitments = { hiding: string; binding: string };

export function parseThresholdEd25519Commitments(raw: unknown): ParsedThresholdEd25519Commitments | null {
  if (!isObject(raw)) return null;
  const hiding = normalizeOptionalString(raw.hiding);
  const binding = normalizeOptionalString(raw.binding);
  if (!hiding || !binding) return null;
  return { hiding, binding };
}

export type ParsedThresholdEd25519MpcSessionRecord = {
  expiresAtMs: number;
  relayerKeyId: string;
  purpose: string;
  intentDigestB64u: string;
  signingDigestB64u: string;
  userId: string;
  rpId: string;
  clientVerifyingShareB64u: string;
};

export function parseThresholdEd25519MpcSessionRecord(raw: unknown): ParsedThresholdEd25519MpcSessionRecord | null {
  if (!isObject(raw)) return null;
  const expiresAtMs = raw.expiresAtMs;
  const relayerKeyId = normalizeOptionalString(raw.relayerKeyId);
  const purpose = normalizeOptionalString(raw.purpose);
  const intentDigestB64u = normalizeOptionalString(raw.intentDigestB64u);
  const signingDigestB64u = normalizeOptionalString(raw.signingDigestB64u);
  const userId = normalizeOptionalString(raw.userId);
  const rpId = normalizeOptionalString(raw.rpId);
  const clientVerifyingShareB64u = normalizeOptionalString(raw.clientVerifyingShareB64u);
  if (!isValidNumber(expiresAtMs)) return null;
  if (
    !relayerKeyId ||
    !purpose ||
    !intentDigestB64u ||
    !signingDigestB64u ||
    !userId ||
    !rpId ||
    !clientVerifyingShareB64u
  ) return null;
  return { expiresAtMs, relayerKeyId, purpose, intentDigestB64u, signingDigestB64u, userId, rpId, clientVerifyingShareB64u };
}

export type ParsedThresholdEd25519SigningSessionRecord = {
  expiresAtMs: number;
  mpcSessionId: string;
  relayerKeyId: string;
  signingDigestB64u: string;
  userId: string;
  rpId: string;
  clientVerifyingShareB64u: string;
  clientCommitments: ParsedThresholdEd25519Commitments;
  relayerCommitments: ParsedThresholdEd25519Commitments;
  relayerNoncesB64u: string;
};

export function parseThresholdEd25519SigningSessionRecord(raw: unknown): ParsedThresholdEd25519SigningSessionRecord | null {
  if (!isObject(raw)) return null;
  const expiresAtMs = raw.expiresAtMs;
  const mpcSessionId = normalizeOptionalString(raw.mpcSessionId);
  const relayerKeyId = normalizeOptionalString(raw.relayerKeyId);
  const signingDigestB64u = normalizeOptionalString(raw.signingDigestB64u);
  const userId = normalizeOptionalString(raw.userId);
  const rpId = normalizeOptionalString(raw.rpId);
  const clientVerifyingShareB64u = normalizeOptionalString(raw.clientVerifyingShareB64u);
  const clientCommitments = parseThresholdEd25519Commitments(raw.clientCommitments);
  const relayerCommitments = parseThresholdEd25519Commitments(raw.relayerCommitments);
  const relayerNoncesB64u = normalizeOptionalString(raw.relayerNoncesB64u);
  if (!isValidNumber(expiresAtMs)) return null;
  if (
    !mpcSessionId ||
    !relayerKeyId ||
    !signingDigestB64u ||
    !userId ||
    !rpId ||
    !clientVerifyingShareB64u ||
    !clientCommitments ||
    !relayerCommitments ||
    !relayerNoncesB64u
  ) {
    return null;
  }
  return {
    expiresAtMs,
    mpcSessionId,
    relayerKeyId,
    signingDigestB64u,
    userId,
    rpId,
    clientVerifyingShareB64u,
    clientCommitments,
    relayerCommitments,
    relayerNoncesB64u,
  };
}

export type ParsedThresholdEd25519AuthSessionRecord = {
  expiresAtMs: number;
  relayerKeyId: string;
  userId: string;
  rpId: string;
};

export function parseThresholdEd25519AuthSessionRecord(raw: unknown): ParsedThresholdEd25519AuthSessionRecord | null {
  if (!isObject(raw)) return null;
  const expiresAtMs = raw.expiresAtMs;
  const relayerKeyId = normalizeOptionalString(raw.relayerKeyId);
  const userId = normalizeOptionalString(raw.userId);
  const rpId = normalizeOptionalString(raw.rpId);
  if (!isValidNumber(expiresAtMs)) return null;
  if (!relayerKeyId || !userId || !rpId) return null;
  return { expiresAtMs, relayerKeyId, userId, rpId };
}

export type ThresholdEd25519SessionClaims = {
  sub: string;
  kind: 'threshold_ed25519_session_v1';
  sessionId: string;
  relayerKeyId: string;
  rpId: string;
};

export function parseThresholdEd25519SessionClaims(raw: unknown): ThresholdEd25519SessionClaims | null {
  if (!isObject(raw)) return null;
  const kind = normalizeOptionalString(raw.kind);
  if (kind !== 'threshold_ed25519_session_v1') return null;
  const sub = normalizeOptionalString(raw.sub);
  const sessionId = normalizeOptionalString(raw.sessionId);
  const relayerKeyId = normalizeOptionalString(raw.relayerKeyId);
  const rpId = normalizeOptionalString(raw.rpId);
  if (!sub || !sessionId || !relayerKeyId || !rpId) return null;
  return { sub, kind, sessionId, relayerKeyId, rpId };
}

export function normalizeByteArray32(input: unknown): Uint8Array | null {
  if (input instanceof Uint8Array) {
    return input.length === 32 ? input : null;
  }
  if (!Array.isArray(input) || input.length !== 32) return null;
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    const v = Number(input[i]);
    if (!Number.isFinite(v) || v < 0 || v > 255) return null;
    out[i] = v;
  }
  return out;
}

export function bytesEqual32(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== 32 || b.length !== 32) return false;
  for (let i = 0; i < 32; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export function normalizeNearPublicKeyStr(v: unknown): string {
  const s = normalizeOptionalString(v);
  if (!s) return '';
  return s.includes(':') ? s : `ed25519:${s}`;
}

export function normalizeActionForIntentDigest(a: unknown): Record<string, unknown> {
  if (!isObject(a)) return { action_type: '' };
  const actionType = normalizeOptionalString(a.action_type);
  switch (actionType) {
    case 'FunctionCall':
      return {
        action_type: actionType,
        args: normalizeOptionalString(a.args),
        deposit: normalizeOptionalString(a.deposit),
        gas: normalizeOptionalString(a.gas),
        method_name: normalizeOptionalString(a.method_name),
      };
    case 'Transfer':
      return { action_type: actionType, deposit: normalizeOptionalString(a.deposit) };
    case 'Stake':
      return { action_type: actionType, stake: normalizeOptionalString(a.stake), public_key: normalizeOptionalString(a.public_key) };
    case 'AddKey':
      return { action_type: actionType, public_key: normalizeOptionalString(a.public_key), access_key: normalizeOptionalString(a.access_key) };
    case 'DeleteKey':
      return { action_type: actionType, public_key: normalizeOptionalString(a.public_key) };
    case 'DeleteAccount':
      return { action_type: actionType, beneficiary_id: normalizeOptionalString(a.beneficiary_id) };
    case 'DeployContract':
      return { action_type: actionType, code: Array.isArray(a.code) ? a.code : [] };
    case 'DeployGlobalContract':
      return {
        action_type: actionType,
        code: Array.isArray(a.code) ? a.code : [],
        deploy_mode: normalizeOptionalString(a.deploy_mode),
      };
    case 'UseGlobalContract':
      return {
        action_type: actionType,
        account_id: normalizeOptionalString(a.account_id) || undefined,
        code_hash: normalizeOptionalString(a.code_hash) || undefined,
      };
    case 'CreateAccount':
    case 'SignedDelegate':
    default:
      return { action_type: actionType };
  }
}

export function extractAuthorizeSigningPublicKey(purpose: string, signingPayload: unknown): string {
  if (!isObject(signingPayload)) return '';
  if (purpose === 'near_tx') {
    const ctx = isObject(signingPayload.transactionContext) ? signingPayload.transactionContext : null;
    return normalizeNearPublicKeyStr(ctx?.nearPublicKeyStr);
  }
  if (purpose === 'nep461_delegate') {
    const delegate = isObject(signingPayload.delegate) ? signingPayload.delegate : null;
    return normalizeNearPublicKeyStr(delegate?.publicKey);
  }
  return '';
}

export async function ensureRelayerKeyIsActiveAccessKey(input: {
  nearAccountId: unknown;
  relayerPublicKey: unknown;
  expectedSigningPublicKey?: unknown;
  viewAccessKeyList: (accountId: string) => Promise<AccessKeyList>;
}): Promise<ThresholdValidationResult> {
  const nearAccountId = normalizeOptionalString(input.nearAccountId);
  const relayerPublicKey = normalizeNearPublicKeyStr(input.relayerPublicKey);
  const expectedSigningPublicKey = normalizeNearPublicKeyStr(input.expectedSigningPublicKey);
  if (!nearAccountId) return { ok: false, code: 'invalid_body', message: 'nearAccountId is required' };
  if (!relayerPublicKey) return { ok: false, code: 'internal', message: 'Missing relayer public key for relayerKeyId' };

  if (expectedSigningPublicKey && expectedSigningPublicKey !== relayerPublicKey) {
    return { ok: false, code: 'unauthorized', message: 'relayerKeyId does not match signingPayload public key' };
  }

  try {
    const list = await input.viewAccessKeyList(nearAccountId);
    const keys = list.keys || [];
    const found = keys.some((k) => normalizeNearPublicKeyStr(k.public_key) === relayerPublicKey);
    if (!found) {
      return { ok: false, code: 'unauthorized', message: 'relayerKeyId public key is not an active access key for nearAccountId' };
    }
    return { ok: true };
  } catch (e: unknown) {
    const msg = String((e && typeof e === 'object' && 'message' in e) ? (e as { message?: unknown }).message : e || 'Failed to query NEAR access keys');
    return { ok: false, code: 'internal', message: `Failed to verify access key scope: ${msg}` };
  }
}

type NearTxAuthorizeSigningPayload = {
  kind?: string;
  txSigningRequests: Array<{
    nearAccountId: string;
    receiverId: string;
    actions: unknown[];
  }>;
  transactionContext: {
    nearPublicKeyStr: string;
    nextNonce: string;
    txBlockHash: string;
    txBlockHeight?: string;
  };
};

type Nep461DelegateAuthorizeSigningPayload = {
  kind?: string;
  delegate: {
    senderId: string;
    receiverId: string;
    actions: unknown[];
    nonce: string;
    maxBlockHeight: string;
    publicKey: string;
  };
};

type Nep413AuthorizeSigningPayload = {
  kind?: string;
  nearAccountId: string;
  message: string;
  recipient: string;
  nonce: string;
  state?: string;
};

export async function verifyThresholdEd25519AuthorizeSigningPayload(input: {
  purpose: string;
  signingPayload: unknown;
  signingDigest32: Uint8Array;
  intentDigest32: Uint8Array;
  userId: string;
  ensureSignerWasm: () => Promise<void>;
  computeNearTxSigningDigests: (payload: unknown) => unknown;
  computeDelegateSigningDigest: (payload: unknown) => unknown;
  computeNep413SigningDigest: (payload: unknown) => unknown;
}): Promise<ThresholdValidationResult> {
  const purpose = input.purpose;
  const signingPayload = input.signingPayload;
  if (!isObject(signingPayload)) {
    return { ok: false, code: 'invalid_body', message: 'signingPayload (object) is required for threshold authorization' };
  }

  const kind = normalizeOptionalString(signingPayload.kind);
  const expectedKind = purpose;
  if (kind && kind !== expectedKind) {
    return { ok: false, code: 'invalid_body', message: `signingPayload.kind must match purpose (${expectedKind})` };
  }

  // 1) Recompute intent_digest_32 from signingPayload and compare to VRF-bound digest.
  let intentDigest32Computed: Uint8Array;
  try {
    if (purpose === 'near_tx') {
      const payload = signingPayload as Partial<NearTxAuthorizeSigningPayload>;
      const txs = payload.txSigningRequests;
      if (!Array.isArray(txs) || !txs.length) throw new Error('signingPayload.txSigningRequests is required');
      const nearAccountId = normalizeOptionalString(txs[0]?.nearAccountId);
      if (!nearAccountId) throw new Error('txSigningRequests[0].nearAccountId is required');
      for (const tx of txs) {
        if (normalizeOptionalString(tx?.nearAccountId) !== nearAccountId) {
          throw new Error('All txSigningRequests[].nearAccountId must match');
        }
      }
      if (nearAccountId !== input.userId) throw new Error('txSigningRequests[].nearAccountId must match vrf_data.user_id');
      const txInputs = txs.map((tx) => ({
        receiverId: normalizeOptionalString(tx?.receiverId),
        actions: Array.isArray(tx?.actions) ? tx.actions.map((a) => normalizeActionForIntentDigest(a)) : [],
      }));
      const json = alphabetizeStringify(txInputs);
      intentDigest32Computed = await sha256BytesUtf8(json);
    } else if (purpose === 'nep461_delegate') {
      const payload = signingPayload as Partial<Nep461DelegateAuthorizeSigningPayload>;
      const d = payload.delegate;
      if (!isObject(d)) throw new Error('signingPayload.delegate is required');
      const senderId = normalizeOptionalString(d.senderId);
      if (!senderId) throw new Error('delegate.senderId is required');
      if (senderId !== input.userId) throw new Error('delegate.senderId must match vrf_data.user_id');
      const txInputs = [{
        receiverId: normalizeOptionalString(d.receiverId),
        actions: Array.isArray(d.actions) ? d.actions.map((a) => normalizeActionForIntentDigest(a)) : [],
      }];
      const json = alphabetizeStringify(txInputs);
      intentDigest32Computed = await sha256BytesUtf8(json);
    } else if (purpose === 'nep413') {
      const payload = signingPayload as Partial<Nep413AuthorizeSigningPayload>;
      const nearAccountId = normalizeOptionalString(payload.nearAccountId);
      if (!nearAccountId) throw new Error('signingPayload.nearAccountId is required');
      if (nearAccountId !== input.userId) throw new Error('signingPayload.nearAccountId must match vrf_data.user_id');
      const recipient = normalizeOptionalString(payload.recipient);
      const message = normalizeOptionalString(payload.message);
      const json = alphabetizeStringify({ kind: 'nep413', nearAccountId, recipient, message });
      intentDigest32Computed = await sha256BytesUtf8(json);
    } else {
      throw new Error(`Unsupported purpose: ${purpose}`);
    }
  } catch (e: unknown) {
    const msg = String((e && typeof e === 'object' && 'message' in e) ? (e as { message?: unknown }).message : e || 'Failed to recompute intent digest');
    return { ok: false, code: 'invalid_body', message: msg };
  }

  if (intentDigest32Computed.length !== 32) {
    return { ok: false, code: 'internal', message: `Computed intent digest is not 32 bytes (got ${intentDigest32Computed.length})` };
  }
  if (!bytesEqual32(intentDigest32Computed, input.intentDigest32)) {
    return { ok: false, code: 'intent_digest_mismatch', message: 'signingPayload does not match vrf_data.intent_digest_32' };
  }

  // 2) Recompute signing_digest_32 from signingPayload and compare to requested signing digest.
  let signingDigest32Computed: Uint8Array[];
  try {
    await input.ensureSignerWasm();
    signingDigest32Computed = (() => {
      if (purpose === 'near_tx') {
        const digestsUnknown: unknown = input.computeNearTxSigningDigests(signingPayload);
        if (!Array.isArray(digestsUnknown)) throw new Error('near_tx digest recomputation failed');
        return digestsUnknown.map((d, i) => {
          const bytes = normalizeByteArray32(d);
          if (!bytes) throw new Error(`near_tx digest[${i}] is not 32 bytes`);
          return bytes;
        });
      }
      if (purpose === 'nep461_delegate') {
        const digestUnknown: unknown = input.computeDelegateSigningDigest(signingPayload);
        const bytes = normalizeByteArray32(digestUnknown);
        if (!bytes) throw new Error('nep461_delegate digest is not 32 bytes');
        return [bytes];
      }
      if (purpose === 'nep413') {
        const digestUnknown: unknown = input.computeNep413SigningDigest(signingPayload);
        const bytes = normalizeByteArray32(digestUnknown);
        if (!bytes) throw new Error('nep413 digest is not 32 bytes');
        return [bytes];
      }
      throw new Error(`Unsupported purpose: ${purpose}`);
    })();
  } catch (e: unknown) {
    const msg = String((e && typeof e === 'object' && 'message' in e) ? (e as { message?: unknown }).message : e || 'Failed to recompute signing digest');
    return { ok: false, code: 'invalid_body', message: msg };
  }

  const match = signingDigest32Computed.some((d) => bytesEqual32(d, input.signingDigest32));
  if (!match) {
    return { ok: false, code: 'signing_digest_mismatch', message: 'signingPayload does not match signing_digest_32' };
  }

  return { ok: true };
}

export type ThresholdAuthorizeSigningDigestOnlyOk = { ok: true; intentDigest32: Uint8Array };
export type ThresholdAuthorizeSigningDigestOnlyResult = ThresholdAuthorizeSigningDigestOnlyOk | ThresholdValidationErr;

export async function verifyThresholdEd25519AuthorizeSigningPayloadSigningDigestOnly(input: {
  purpose: string;
  signingPayload: unknown;
  signingDigest32: Uint8Array;
  userId: string;
  ensureSignerWasm: () => Promise<void>;
  computeNearTxSigningDigests: (payload: unknown) => unknown;
  computeDelegateSigningDigest: (payload: unknown) => unknown;
  computeNep413SigningDigest: (payload: unknown) => unknown;
}): Promise<ThresholdAuthorizeSigningDigestOnlyResult> {
  const purpose = input.purpose;
  const signingPayload = input.signingPayload;
  if (!isObject(signingPayload)) {
    return { ok: false, code: 'invalid_body', message: 'signingPayload (object) is required for threshold authorization' };
  }

  const kind = normalizeOptionalString(signingPayload.kind);
  const expectedKind = purpose;
  if (kind && kind !== expectedKind) {
    return { ok: false, code: 'invalid_body', message: `signingPayload.kind must match purpose (${expectedKind})` };
  }

  // 1) Recompute intent_digest_32 from signingPayload (not VRF-bound in session mode).
  let intentDigest32Computed: Uint8Array;
  try {
    if (purpose === 'near_tx') {
      const payload = signingPayload as Partial<NearTxAuthorizeSigningPayload>;
      const txs = payload.txSigningRequests;
      if (!Array.isArray(txs) || !txs.length) throw new Error('signingPayload.txSigningRequests is required');
      const nearAccountId = normalizeOptionalString(txs[0]?.nearAccountId);
      if (!nearAccountId) throw new Error('txSigningRequests[0].nearAccountId is required');
      for (const tx of txs) {
        if (normalizeOptionalString(tx?.nearAccountId) !== nearAccountId) {
          throw new Error('All txSigningRequests[].nearAccountId must match');
        }
      }
      if (nearAccountId !== input.userId) throw new Error('txSigningRequests[].nearAccountId must match session user');
      const txInputs = txs.map((tx) => ({
        receiverId: normalizeOptionalString(tx?.receiverId),
        actions: Array.isArray(tx?.actions) ? tx.actions.map((a) => normalizeActionForIntentDigest(a)) : [],
      }));
      const json = alphabetizeStringify(txInputs);
      intentDigest32Computed = await sha256BytesUtf8(json);
    } else if (purpose === 'nep461_delegate') {
      const payload = signingPayload as Partial<Nep461DelegateAuthorizeSigningPayload>;
      const d = payload.delegate;
      if (!isObject(d)) throw new Error('signingPayload.delegate is required');
      const senderId = normalizeOptionalString(d.senderId);
      if (!senderId) throw new Error('delegate.senderId is required');
      if (senderId !== input.userId) throw new Error('delegate.senderId must match session user');
      const txInputs = [{
        receiverId: normalizeOptionalString(d.receiverId),
        actions: Array.isArray(d.actions) ? d.actions.map((a) => normalizeActionForIntentDigest(a)) : [],
      }];
      const json = alphabetizeStringify(txInputs);
      intentDigest32Computed = await sha256BytesUtf8(json);
    } else if (purpose === 'nep413') {
      const payload = signingPayload as Partial<Nep413AuthorizeSigningPayload>;
      const nearAccountId = normalizeOptionalString(payload.nearAccountId);
      if (!nearAccountId) throw new Error('signingPayload.nearAccountId is required');
      if (nearAccountId !== input.userId) throw new Error('signingPayload.nearAccountId must match session user');
      const recipient = normalizeOptionalString(payload.recipient);
      const message = normalizeOptionalString(payload.message);
      const json = alphabetizeStringify({ kind: 'nep413', nearAccountId, recipient, message });
      intentDigest32Computed = await sha256BytesUtf8(json);
    } else {
      throw new Error(`Unsupported purpose: ${purpose}`);
    }
  } catch (e: unknown) {
    const msg = String((e && typeof e === 'object' && 'message' in e) ? (e as { message?: unknown }).message : e || 'Failed to recompute intent digest');
    return { ok: false, code: 'invalid_body', message: msg };
  }

  if (intentDigest32Computed.length !== 32) {
    return { ok: false, code: 'internal', message: `Computed intent digest is not 32 bytes (got ${intentDigest32Computed.length})` };
  }

  // 2) Recompute signing_digest_32 from signingPayload and compare to requested signing digest.
  let signingDigest32Computed: Uint8Array[];
  try {
    await input.ensureSignerWasm();
    signingDigest32Computed = (() => {
      if (purpose === 'near_tx') {
        const digestsUnknown: unknown = input.computeNearTxSigningDigests(signingPayload);
        if (!Array.isArray(digestsUnknown)) throw new Error('near_tx digest recomputation failed');
        return digestsUnknown.map((d, i) => {
          const bytes = normalizeByteArray32(d);
          if (!bytes) throw new Error(`near_tx digest[${i}] is not 32 bytes`);
          return bytes;
        });
      }
      if (purpose === 'nep461_delegate') {
        const digestUnknown: unknown = input.computeDelegateSigningDigest(signingPayload);
        const bytes = normalizeByteArray32(digestUnknown);
        if (!bytes) throw new Error('nep461_delegate digest is not 32 bytes');
        return [bytes];
      }
      if (purpose === 'nep413') {
        const digestUnknown: unknown = input.computeNep413SigningDigest(signingPayload);
        const bytes = normalizeByteArray32(digestUnknown);
        if (!bytes) throw new Error('nep413 digest is not 32 bytes');
        return [bytes];
      }
      throw new Error(`Unsupported purpose: ${purpose}`);
    })();
  } catch (e: unknown) {
    const msg = String((e && typeof e === 'object' && 'message' in e) ? (e as { message?: unknown }).message : e || 'Failed to recompute signing digest');
    return { ok: false, code: 'invalid_body', message: msg };
  }

  const match = signingDigest32Computed.some((d) => bytesEqual32(d, input.signingDigest32));
  if (!match) {
    return { ok: false, code: 'signing_digest_mismatch', message: 'signingPayload does not match signing_digest_32' };
  }

  return { ok: true, intentDigest32: intentDigest32Computed };
}
