import type { CloudflareRelayContext } from '../createCloudflareRouter';
import { json, readJson } from '../http';
import { thresholdEd25519StatusCode } from '../../../threshold/statusCodes';
import type {
  ThresholdEd25519AuthorizeRequest,
  ThresholdEd25519KeygenRequest,
  ThresholdEd25519SignFinalizeRequest,
  ThresholdEd25519SignInitRequest,
} from '../../../core/types';

function isObject(input: unknown): input is Record<string, unknown> {
  return !!input && typeof input === 'object' && !Array.isArray(input);
}

function summarizeVrfData(input: unknown): Record<string, unknown> | undefined {
  if (!isObject(input)) return undefined;
  const user_id = typeof input.user_id === 'string' ? input.user_id : undefined;
  const rp_id = typeof input.rp_id === 'string' ? input.rp_id : undefined;
  const block_height = typeof input.block_height === 'number' ? input.block_height : undefined;
  const has_intent_digest_32 = Array.isArray(input.intent_digest_32) ? true : undefined;
  const intent_digest_32_len = Array.isArray(input.intent_digest_32) ? input.intent_digest_32.length : undefined;
  return {
    ...(user_id ? { user_id } : {}),
    ...(rp_id ? { rp_id } : {}),
    ...(block_height != null ? { block_height } : {}),
    ...(has_intent_digest_32 != null ? { has_intent_digest_32 } : {}),
    ...(intent_digest_32_len != null ? { intent_digest_32_len } : {}),
  };
}

export async function handleThresholdEd25519(ctx: CloudflareRelayContext): Promise<Response | null> {
  if (ctx.method === 'GET' && ctx.pathname === '/threshold-ed25519/healthz') {
    const threshold = ctx.opts.threshold;
    if (!threshold) {
      return json({
        ok: false,
        configured: false,
        code: 'threshold_disabled',
        message: 'Threshold signing is not configured on this server',
      }, { status: 503 });
    }
    return json({ ok: true, configured: true }, { status: 200 });
  }

  if (ctx.method !== 'POST') return null;

  const pathname = ctx.pathname;
  if (
    pathname !== '/threshold-ed25519/keygen'
    && pathname !== '/threshold-ed25519/authorize'
    && pathname !== '/threshold-ed25519/sign/init'
    && pathname !== '/threshold-ed25519/sign/finalize'
  ) {
    return null;
  }

  const body = await readJson(ctx.request);
  const threshold = ctx.opts.threshold;

  switch (pathname) {
    case '/threshold-ed25519/keygen': {
      if (!threshold) {
        ctx.logger.warn('[threshold-ed25519] request', { route: pathname, method: ctx.method, configured: false });
        return json({ ok: false, code: 'threshold_disabled', message: 'Threshold signing is not configured on this server' }, { status: 503 });
      }
      const b = (body || {}) as ThresholdEd25519KeygenRequest;
      ctx.logger.info('[threshold-ed25519] request', {
        route: pathname,
        method: ctx.method,
        nearAccountId: typeof b.nearAccountId === 'string' ? b.nearAccountId : undefined,
        clientVerifyingShareB64u_len: typeof b.clientVerifyingShareB64u === 'string' ? b.clientVerifyingShareB64u.length : undefined,
        vrf_data: summarizeVrfData((b as unknown as { vrf_data?: unknown }).vrf_data),
      });
      const result = await threshold.thresholdEd25519Keygen(body as ThresholdEd25519KeygenRequest);
      ctx.logger.info('[threshold-ed25519] response', {
        route: pathname,
        status: thresholdEd25519StatusCode(result),
        ok: result.ok,
        ...(result.code ? { code: result.code } : {}),
      });
      return json(result, { status: thresholdEd25519StatusCode(result) });
    }
    case '/threshold-ed25519/authorize': {
      if (!threshold) {
        ctx.logger.warn('[threshold-ed25519] request', { route: pathname, method: ctx.method, configured: false });
        return json({ ok: false, code: 'threshold_disabled', message: 'Threshold signing is not configured on this server' }, { status: 503 });
      }
      const b = (body || {}) as ThresholdEd25519AuthorizeRequest;
      ctx.logger.info('[threshold-ed25519] request', {
        route: pathname,
        method: ctx.method,
        relayerKeyId: typeof b.relayerKeyId === 'string' ? b.relayerKeyId : undefined,
        purpose: typeof b.purpose === 'string' ? b.purpose : undefined,
        signing_digest_32_len: Array.isArray(b.signing_digest_32) ? b.signing_digest_32.length : undefined,
        vrf_data: summarizeVrfData((b as unknown as { vrf_data?: unknown }).vrf_data),
      });
      const result = await threshold.authorizeThresholdEd25519(body as ThresholdEd25519AuthorizeRequest);
      ctx.logger.info('[threshold-ed25519] response', {
        route: pathname,
        status: thresholdEd25519StatusCode(result),
        ok: result.ok,
        ...(result.code ? { code: result.code } : {}),
      });
      return json(result, { status: thresholdEd25519StatusCode(result) });
    }
    case '/threshold-ed25519/sign/init': {
      if (!threshold) {
        ctx.logger.warn('[threshold-ed25519] request', { route: pathname, method: ctx.method, configured: false });
        return json({ ok: false, code: 'threshold_disabled', message: 'Threshold signing is not configured on this server' }, { status: 503 });
      }
      const b = (body || {}) as ThresholdEd25519SignInitRequest;
      ctx.logger.info('[threshold-ed25519] request', {
        route: pathname,
        method: ctx.method,
        mpcSessionId: typeof b.mpcSessionId === 'string' ? b.mpcSessionId : undefined,
        relayerKeyId: typeof b.relayerKeyId === 'string' ? b.relayerKeyId : undefined,
        nearAccountId: typeof b.nearAccountId === 'string' ? b.nearAccountId : undefined,
        signingDigestB64u_len: typeof b.signingDigestB64u === 'string' ? b.signingDigestB64u.length : undefined,
      });
      const result = await threshold.thresholdEd25519SignInit(body as ThresholdEd25519SignInitRequest);
      ctx.logger.info('[threshold-ed25519] response', {
        route: pathname,
        status: thresholdEd25519StatusCode(result),
        ok: result.ok,
        ...(result.code ? { code: result.code } : {}),
      });
      return json(result, { status: thresholdEd25519StatusCode(result) });
    }
    case '/threshold-ed25519/sign/finalize': {
      if (!threshold) {
        ctx.logger.warn('[threshold-ed25519] request', { route: pathname, method: ctx.method, configured: false });
        return json({ ok: false, code: 'threshold_disabled', message: 'Threshold signing is not configured on this server' }, { status: 503 });
      }
      const b = (body || {}) as ThresholdEd25519SignFinalizeRequest;
      ctx.logger.info('[threshold-ed25519] request', {
        route: pathname,
        method: ctx.method,
        signingSessionId: typeof b.signingSessionId === 'string' ? b.signingSessionId : undefined,
        clientSignatureShareB64u_len: typeof b.clientSignatureShareB64u === 'string' ? b.clientSignatureShareB64u.length : undefined,
      });
      const result = await threshold.thresholdEd25519SignFinalize(body as ThresholdEd25519SignFinalizeRequest);
      ctx.logger.info('[threshold-ed25519] response', {
        route: pathname,
        status: thresholdEd25519StatusCode(result),
        ok: result.ok,
        ...(result.code ? { code: result.code } : {}),
      });
      return json(result, { status: thresholdEd25519StatusCode(result) });
    }
    default:
      return null;
  }
}
