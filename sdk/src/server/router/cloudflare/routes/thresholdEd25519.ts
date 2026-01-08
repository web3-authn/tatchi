import type { CloudflareRelayContext } from '../createCloudflareRouter';
import { json, readJson } from '../http';
import { thresholdEd25519StatusCode } from '../../../threshold/statusCodes';
import type {
  ThresholdEd25519AuthorizeResponse,
  ThresholdEd25519KeygenRequest,
  ThresholdEd25519PeerSignFinalizeRequest,
  ThresholdEd25519PeerSignInitRequest,
  ThresholdEd25519SignFinalizeRequest,
  ThresholdEd25519SignInitRequest,
  ThresholdEd25519SessionRequest,
} from '../../../core/types';
import { parseSessionKind } from '../../relay';
import {
  summarizeVrfData,
  validateThresholdEd25519AuthorizeInputs,
} from '../../commonRouterUtils';

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
    && pathname !== '/threshold-ed25519/session'
    && pathname !== '/threshold-ed25519/authorize'
    && pathname !== '/threshold-ed25519/sign/init'
    && pathname !== '/threshold-ed25519/sign/finalize'
    && pathname !== '/threshold-ed25519/internal/sign/init'
    && pathname !== '/threshold-ed25519/internal/sign/finalize'
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
        registrationTxHash: ('registrationTxHash' in b && typeof b.registrationTxHash === 'string') ? b.registrationTxHash : undefined,
        vrf_data: summarizeVrfData((b as unknown as { vrf_data?: unknown }).vrf_data),
      });
      const result = await threshold.thresholdEd25519Keygen(b);
      ctx.logger.info('[threshold-ed25519] response', {
        route: pathname,
        status: thresholdEd25519StatusCode(result),
        ok: result.ok,
        ...(result.code ? { code: result.code } : {}),
      });
      return json(result, { status: thresholdEd25519StatusCode(result) });
    }
    case '/threshold-ed25519/session': {
      if (!threshold) {
        ctx.logger.warn('[threshold-ed25519] request', { route: pathname, method: ctx.method, configured: false });
        return json({ ok: false, code: 'threshold_disabled', message: 'Threshold signing is not configured on this server' }, { status: 503 });
      }
      const session = ctx.opts.session;
      if (!session) {
        ctx.logger.warn('[threshold-ed25519] request', { route: pathname, method: ctx.method, sessions: false });
        return json({ ok: false, code: 'sessions_disabled', message: 'Sessions are not configured on this server' }, { status: 501 });
      }

      const b = (body || {}) as ThresholdEd25519SessionRequest;
      ctx.logger.info('[threshold-ed25519] request', {
        route: pathname,
        method: ctx.method,
        relayerKeyId: typeof b.relayerKeyId === 'string' ? b.relayerKeyId : undefined,
        clientVerifyingShareB64u_len: typeof b.clientVerifyingShareB64u === 'string' ? b.clientVerifyingShareB64u.length : undefined,
        sessionPolicy: b.sessionPolicy ? { version: b.sessionPolicy.version } : undefined,
        vrf_data: summarizeVrfData((b as unknown as { vrf_data?: unknown }).vrf_data),
      });

      const result = await threshold.thresholdEd25519Session(b);
      const status = thresholdEd25519StatusCode(result);
      ctx.logger.info('[threshold-ed25519] response', { route: pathname, status, ok: result.ok, ...(result.code ? { code: result.code } : {}) });
      if (!result.ok) return json(result, { status });

      const sessionId = String(result.sessionId || '').trim();
      const userId = b.vrf_data.user_id;
      const rpId = b.vrf_data.rp_id;
      const relayerKeyId = b.relayerKeyId;
      const token = await session.signJwt(userId, { kind: 'threshold_ed25519_session_v1', sessionId, relayerKeyId, rpId });
      const sessionKind = parseSessionKind(b);

      const res = json(sessionKind === 'cookie' ? { ...result, jwt: undefined } : { ...result, jwt: token }, { status: 200 });
      if (sessionKind === 'cookie') {
        res.headers.set('Set-Cookie', session.buildSetCookie(token));
      }
      return res;
    }
    case '/threshold-ed25519/authorize': {
      if (!threshold) {
        ctx.logger.warn('[threshold-ed25519] request', { route: pathname, method: ctx.method, configured: false });
        return json({ ok: false, code: 'threshold_disabled', message: 'Threshold signing is not configured on this server' }, { status: 503 });
      }
      const b = (body || {}) as Record<string, unknown>;
      ctx.logger.info('[threshold-ed25519] request', {
        route: pathname,
        method: ctx.method,
        relayerKeyId: typeof b.relayerKeyId === 'string' ? b.relayerKeyId : undefined,
        clientVerifyingShareB64u_len: typeof b.clientVerifyingShareB64u === 'string' ? b.clientVerifyingShareB64u.length : undefined,
        purpose: typeof b.purpose === 'string' ? b.purpose : undefined,
        signing_digest_32_len: Array.isArray(b.signing_digest_32) ? b.signing_digest_32.length : undefined,
        vrf_data: summarizeVrfData((b as unknown as { vrf_data?: unknown }).vrf_data),
      });

      const respond = (result: ThresholdEd25519AuthorizeResponse): Response => {
        ctx.logger.info('[threshold-ed25519] response', {
          route: pathname,
          status: thresholdEd25519StatusCode(result),
          ok: result.ok,
          ...(result.code ? { code: result.code } : {}),
        });
        return json(result, { status: thresholdEd25519StatusCode(result) });
      };

      const validated = await validateThresholdEd25519AuthorizeInputs({
        body,
        headers: Object.fromEntries(ctx.request.headers.entries()),
        session: ctx.opts.session,
      });
      if (!validated.ok) return respond(validated);

      const result = validated.mode === 'webauthn'
        ? await threshold.authorizeThresholdEd25519(validated.request)
        : await threshold.authorizeThresholdEd25519WithSession({
          sessionId: validated.sessionId,
          userId: validated.userId,
          request: validated.request,
        });
      return respond(result);

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
      const result = await threshold.thresholdEd25519SignInit(b);
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
      const result = await threshold.thresholdEd25519SignFinalize(b);
      ctx.logger.info('[threshold-ed25519] response', {
        route: pathname,
        status: thresholdEd25519StatusCode(result),
        ok: result.ok,
        ...(result.code ? { code: result.code } : {}),
      });
      return json(result, { status: thresholdEd25519StatusCode(result) });
    }
    case '/threshold-ed25519/internal/sign/init': {
      if (!threshold) {
        ctx.logger.warn('[threshold-ed25519] request', { route: pathname, method: ctx.method, configured: false });
        return json({ ok: false, code: 'threshold_disabled', message: 'Threshold signing is not configured on this server' }, { status: 503 });
      }
      if (!threshold.thresholdEd25519PeerSignInit) {
        const result = { ok: false, code: 'not_found', message: 'threshold-ed25519 peer endpoints are not enabled on this server' };
        return json(result, { status: thresholdEd25519StatusCode(result) });
      }
      const b = (body || {}) as ThresholdEd25519PeerSignInitRequest;
      ctx.logger.info('[threshold-ed25519] request', {
        route: pathname,
        method: ctx.method,
        coordinatorGrant_len: typeof b.coordinatorGrant === 'string' ? b.coordinatorGrant.length : undefined,
      });
      const result = await threshold.thresholdEd25519PeerSignInit(b);
      ctx.logger.info('[threshold-ed25519] response', {
        route: pathname,
        status: thresholdEd25519StatusCode(result),
        ok: result.ok,
        ...(result.code ? { code: result.code } : {}),
      });
      return json(result, { status: thresholdEd25519StatusCode(result) });
    }
    case '/threshold-ed25519/internal/sign/finalize': {
      if (!threshold) {
        ctx.logger.warn('[threshold-ed25519] request', { route: pathname, method: ctx.method, configured: false });
        return json({ ok: false, code: 'threshold_disabled', message: 'Threshold signing is not configured on this server' }, { status: 503 });
      }
      if (!threshold.thresholdEd25519PeerSignFinalize) {
        const result = { ok: false, code: 'not_found', message: 'threshold-ed25519 peer endpoints are not enabled on this server' };
        return json(result, { status: thresholdEd25519StatusCode(result) });
      }
      const b = (body || {}) as ThresholdEd25519PeerSignFinalizeRequest;
      ctx.logger.info('[threshold-ed25519] request', {
        route: pathname,
        method: ctx.method,
        coordinatorGrant_len: typeof b.coordinatorGrant === 'string' ? b.coordinatorGrant.length : undefined,
        signingSessionId: typeof b.signingSessionId === 'string' ? b.signingSessionId : undefined,
        clientSignatureShareB64u_len: typeof b.clientSignatureShareB64u === 'string' ? b.clientSignatureShareB64u.length : undefined,
      });
      const result = await threshold.thresholdEd25519PeerSignFinalize(b);
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
