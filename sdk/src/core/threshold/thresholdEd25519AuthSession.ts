import { base64UrlDecode } from '@/utils/encoders';
import { stripTrailingSlashes, toTrimmedString } from '@/utils/validation';
import { removePrfOutputGuard } from '../WebAuthnManager/credentialsHelpers';
import type { VRFChallenge } from '../types/vrf-worker';
import type { ThresholdEd25519SessionPolicy } from './thresholdSessionPolicy';
import type { WebAuthnAuthenticationCredential } from '../types/webauthn';
import { normalizeThresholdEd25519ParticipantIds } from '../../threshold/participants';

export type ThresholdEd25519SessionKind = 'jwt' | 'cookie';

export type ThresholdEd25519AuthSession = {
  sessionKind: ThresholdEd25519SessionKind;
  policy: ThresholdEd25519SessionPolicy;
  policyJson: string;
  sessionPolicyDigest32: string;
  jwt?: string;
  expiresAtMs?: number;
  createdAtMs?: number;
};

type ThresholdEd25519AuthSessionCacheEntry = ThresholdEd25519AuthSession;

const authSessionCache = new Map<string, ThresholdEd25519AuthSessionCacheEntry>();

export function makeThresholdEd25519AuthSessionCacheKey(args: {
  nearAccountId: string;
  rpId: string;
  relayerUrl: string;
  relayerKeyId: string;
  participantIds?: number[];
}): string {
  const relayerUrl = stripTrailingSlashes(toTrimmedString(args.relayerUrl));
  const participantIds = normalizeThresholdEd25519ParticipantIds(args.participantIds);
  return [
    String(args.nearAccountId || '').trim(),
    String(args.rpId || '').trim(),
    relayerUrl,
    String(args.relayerKeyId || '').trim(),
    ...(participantIds ? [participantIds.join(',')] : []),
  ].join('|');
}

export function getCachedThresholdEd25519AuthSession(cacheKey: string): ThresholdEd25519AuthSession | null {
  const entry = authSessionCache.get(cacheKey);
  if (!entry) return null;

  const policy = entry.policy;
  const ttlMs = Math.floor(Number(policy?.ttlMs) || 0);
  const remainingUses = Math.floor(Number(policy?.remainingUses) || 0);
  if (ttlMs <= 0 || remainingUses <= 0) {
    authSessionCache.delete(cacheKey);
    return null;
  }

  const now = Date.now();
  const expiresAtMs = (() => {
    const raw = entry.expiresAtMs;
    if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
    const createdAtMs = entry.createdAtMs;
    if (typeof createdAtMs === 'number' && Number.isFinite(createdAtMs)) {
      return createdAtMs + ttlMs;
    }
    return undefined;
  })();

  if (expiresAtMs === undefined) {
    // Avoid using non-expiring cached tokens; treat as not cacheable.
    authSessionCache.delete(cacheKey);
    return null;
  }

  if (now >= expiresAtMs) {
    authSessionCache.delete(cacheKey);
    return null;
  }

  return entry;
}

export function putCachedThresholdEd25519AuthSession(cacheKey: string, entry: ThresholdEd25519AuthSession): void {
  const createdAtMs = typeof entry.createdAtMs === 'number' && Number.isFinite(entry.createdAtMs)
    ? entry.createdAtMs
    : Date.now();
  authSessionCache.set(cacheKey, { ...entry, createdAtMs });
}

export function clearCachedThresholdEd25519AuthSession(cacheKey: string): void {
  authSessionCache.delete(cacheKey);
}

export function clearAllCachedThresholdEd25519AuthSessions(): void {
  authSessionCache.clear();
}

export function getCachedThresholdEd25519AuthSessionJwt(cacheKey: string): string | undefined {
  const cached = getCachedThresholdEd25519AuthSession(cacheKey);
  const jwt = cached?.jwt;
  if (typeof jwt === 'string') {
    const trimmed = jwt.trim();
    if (trimmed) return trimmed;
  }
  if (cached) clearCachedThresholdEd25519AuthSession(cacheKey);
  return undefined;
}

export async function mintThresholdEd25519AuthSession(args: {
  relayerUrl: string;
  sessionKind: ThresholdEd25519SessionKind;
  relayerKeyId: string;
  clientVerifyingShareB64u: string;
  sessionPolicy: ThresholdEd25519SessionPolicy;
  vrfChallenge: VRFChallenge;
  webauthnAuthentication: WebAuthnAuthenticationCredential;
}): Promise<{
  ok: boolean;
  sessionId?: string;
  expiresAtMs?: number;
  remainingUses?: number;
  jwt?: string;
  code?: string;
  message?: string;
}> {
  const relayerUrl = stripTrailingSlashes(toTrimmedString(args.relayerUrl));
  if (!relayerUrl) {
    return { ok: false, code: 'invalid_args', message: 'Missing relayerUrl for threshold session mint' };
  }

  if (typeof fetch !== 'function') {
    return { ok: false, code: 'unsupported', message: 'fetch is not available for threshold session mint' };
  }

  const toBytes = (b64u: string | undefined): number[] => {
    if (!b64u) return [];
    return Array.from(base64UrlDecode(b64u));
  };

  const intent_digest_32 = toBytes(args.vrfChallenge.intentDigest);
  if (intent_digest_32.length !== 32) {
    return { ok: false, code: 'invalid_args', message: 'Missing or invalid vrfChallenge.intentDigest (expected base64url 32 bytes)' };
  }

  const clientVerifyingShareBytes = toBytes(args.clientVerifyingShareB64u);
  if (clientVerifyingShareBytes.length !== 32) {
    return { ok: false, code: 'invalid_args', message: 'Missing or invalid clientVerifyingShareB64u (expected base64url 32 bytes)' };
  }

  const session_policy_digest_32 = toBytes(args.vrfChallenge.sessionPolicyDigest32);
  if (session_policy_digest_32.length !== 32) {
    return { ok: false, code: 'invalid_args', message: 'Missing vrfChallenge.sessionPolicyDigest32 (expected base64url 32 bytes) for threshold session mint' };
  }

  const vrf_data = {
    vrf_input_data: toBytes(args.vrfChallenge.vrfInput),
    vrf_output: toBytes(args.vrfChallenge.vrfOutput),
    vrf_proof: toBytes(args.vrfChallenge.vrfProof),
    public_key: toBytes(args.vrfChallenge.vrfPublicKey),
    user_id: args.vrfChallenge.userId,
    rp_id: args.vrfChallenge.rpId,
    block_height: Number(args.vrfChallenge.blockHeight || 0),
    block_hash: toBytes(args.vrfChallenge.blockHash),
    intent_digest_32,
    session_policy_digest_32,
  };

  // Never send PRF outputs to the relay.
  const webauthn_authentication = removePrfOutputGuard(args.webauthnAuthentication);

  type ThresholdEd25519SessionMintResponseBody = Partial<{
    ok: boolean;
    sessionId: string;
    expiresAt: string;
    remainingUses: number;
    jwt: string;
    code: string;
    message: string;
  }>;

  try {
    const url = `${relayerUrl}/threshold-ed25519/session`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: args.sessionKind === 'cookie' ? 'include' : 'omit',
      body: JSON.stringify({
        sessionKind: args.sessionKind,
        relayerKeyId: args.relayerKeyId,
        clientVerifyingShareB64u: args.clientVerifyingShareB64u,
        sessionPolicy: args.sessionPolicy,
        vrf_data,
        webauthn_authentication,
      }),
    });

    const data = (await response.json().catch(() => ({}))) as ThresholdEd25519SessionMintResponseBody;
    if (!response.ok) {
      return {
        ok: false,
        code: data.code || 'http_error',
        message: data.message || `HTTP ${response.status}`,
      };
    }

    const expiresAtMs = (() => {
      const raw = data.expiresAt ? Date.parse(data.expiresAt) : NaN;
      return Number.isFinite(raw) ? raw : undefined;
    })();

    return {
      ok: data.ok === true,
      sessionId: data.sessionId,
      expiresAtMs,
      remainingUses: data.remainingUses,
      jwt: data.jwt,
      ...(data.code ? { code: data.code } : {}),
      ...(data.message ? { message: data.message } : {}),
    };
  } catch (e: unknown) {
    const msg = String((e && typeof e === 'object' && 'message' in e) ? (e as { message?: unknown }).message : e || 'Failed to mint threshold session');
    return { ok: false, code: 'network_error', message: msg };
  }
}
