import type {
  ThresholdEd25519AuthorizeRequest,
  ThresholdEd25519AuthorizeWithSessionRequest,
} from '../core/types';
import { parseThresholdEd25519SessionClaims } from '../core/ThresholdService/validation';
import type { SessionAdapter } from './relay';

type PlainObject = Record<string, unknown>;
type AuthorizeErr = { ok: false; code: 'sessions_disabled' | 'unauthorized'; message: string };

function isPlainObject(input: unknown): input is PlainObject {
  return !!input && typeof input === 'object' && !Array.isArray(input);
}

export function summarizeVrfData(input: unknown): Record<string, unknown> | undefined {
  if (!isPlainObject(input)) return undefined;
  const user_id = typeof input.user_id === 'string' ? input.user_id : undefined;
  const rp_id = typeof input.rp_id === 'string' ? input.rp_id : undefined;
  const block_height = typeof input.block_height === 'number' ? input.block_height : undefined;
  const has_intent_digest_32 = Array.isArray(input.intent_digest_32) ? true : undefined;
  const intent_digest_32_len = Array.isArray(input.intent_digest_32) ? input.intent_digest_32.length : undefined;
  const has_session_policy_digest_32 = Array.isArray(input.session_policy_digest_32) ? true : undefined;
  const session_policy_digest_32_len = Array.isArray(input.session_policy_digest_32) ? input.session_policy_digest_32.length : undefined;
  return {
    ...(user_id ? { user_id } : {}),
    ...(rp_id ? { rp_id } : {}),
    ...(block_height != null ? { block_height } : {}),
    ...(has_intent_digest_32 != null ? { has_intent_digest_32 } : {}),
    ...(intent_digest_32_len != null ? { intent_digest_32_len } : {}),
    ...(has_session_policy_digest_32 != null ? { has_session_policy_digest_32 } : {}),
    ...(session_policy_digest_32_len != null ? { session_policy_digest_32_len } : {}),
  };
}

function looksLikeWebauthnAuthorizeBody(input: unknown): boolean {
  if (!isPlainObject(input)) return false;
  return isPlainObject(input.vrf_data) && isPlainObject(input.webauthn_authentication);
}

export type ThresholdEd25519AuthorizeInputs =
  | { ok: true; mode: 'webauthn'; request: ThresholdEd25519AuthorizeRequest }
  | {
      ok: true;
      mode: 'session';
      sessionId: string;
      userId: string;
      request: ThresholdEd25519AuthorizeWithSessionRequest;
    }
  | AuthorizeErr;

export async function validateThresholdEd25519AuthorizeInputs(input: {
  body: unknown;
  headers: Record<string, string | string[] | undefined>;
  session: SessionAdapter | null | undefined;
}): Promise<ThresholdEd25519AuthorizeInputs> {
  if (looksLikeWebauthnAuthorizeBody(input.body)) {
    return { ok: true, mode: 'webauthn', request: input.body as ThresholdEd25519AuthorizeRequest };
  }

  const session = input.session;
  if (!session) {
    return { ok: false, code: 'sessions_disabled', message: 'Sessions are not configured on this server' };
  }

  const parsed = await session.parse(input.headers);
  if (!parsed.ok) {
    return { ok: false, code: 'unauthorized', message: 'Missing or invalid threshold session token' };
  }

  const claims = parseThresholdEd25519SessionClaims(parsed.claims);
  if (!claims) {
    return { ok: false, code: 'unauthorized', message: 'Invalid threshold session token claims' };
  }

  const requestBody = isPlainObject(input.body) ? input.body : {};
  return {
    ok: true,
    mode: 'session',
    sessionId: claims.sessionId,
    userId: claims.sub,
    request: requestBody as unknown as ThresholdEd25519AuthorizeWithSessionRequest,
  };
}
