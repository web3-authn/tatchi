import type { Request, Response, Router as ExpressRouter } from 'express';
import express from 'express';
import type { AuthService } from '../core/AuthService';
import type { ForwardableEmailPayload } from '../email-recovery/zkEmail';
import { normalizeForwardableEmailPayload, parseAccountIdFromSubject } from '../email-recovery/zkEmail';

export interface RelayRouterOptions {
  healthz?: boolean;
  sessionRoutes?: { auth?: string; logout?: string };
  session?: SessionAdapter | null;
}

// Minimal session adapter interface expected by the routers
export interface SessionAdapter {
  signJwt(sub: string, extra?: Record<string, unknown>): Promise<string>;
  parse(headers: Record<string, string | string[] | undefined>): Promise<{ ok: boolean; claims?: any } | { ok: false }>;
  buildSetCookie(token: string): string;
  buildClearCookie(): string;
  refresh(headers: Record<string, string | string[] | undefined>): Promise<{ ok: boolean; jwt?: string; code?: string; message?: string }>;
}

export function createRelayRouter(service: AuthService, opts: RelayRouterOptions = {}): ExpressRouter {
  const router = express.Router();
  const mePath = opts.sessionRoutes?.auth || '/session/auth';
  const logoutPath = opts.sessionRoutes?.logout || '/session/logout';

  router.post(
    '/create_account_and_register_user',
    async (req: any, res: any) => {
      try {
        const {
          new_account_id,
          new_public_key,
          vrf_data,
          webauthn_registration,
          deterministic_vrf_public_key,
          authenticator_options
        } = req.body || ({} as any);

        if (!new_account_id || typeof new_account_id !== 'string') throw new Error('Missing or invalid new_account_id');
        if (!new_public_key || typeof new_public_key !== 'string') throw new Error('Missing or invalid new_public_key');
        if (!vrf_data || typeof vrf_data !== 'object') throw new Error('Missing or invalid vrf_data');
        if (!webauthn_registration || typeof webauthn_registration !== 'object') throw new Error('Missing or invalid webauthn_registration');

        const result = await service.createAccountAndRegisterUser({
          new_account_id,
          new_public_key,
          vrf_data,
          webauthn_registration,
          deterministic_vrf_public_key,
          authenticator_options
        });

        if (result.success) res.status(200).json(result);
        else res.status(400).json(result);
      } catch (error: any) {
        res.status(500).json({ success: false, error: error?.message || 'internal error' });
      }
    }
  );

  router.post('/vrf/apply-server-lock', async (req: any, res: any) => {
    if (typeof (service as any).hasShamir === 'function' && !service.hasShamir()) {
      return res.status(503).json({ error: 'shamir_disabled', message: 'Shamir 3-pass is not configured on this server' });
    }
    try {
      const serverResponse = await service.handleApplyServerLock({ body: req.body });
      Object.entries(serverResponse.headers).forEach(([k, v]) => res.set(k, v as any));
      res.status(serverResponse.status);
      res.send(JSON.parse(serverResponse.body));
    } catch (e: any) {
      res.status(500).json({ error: 'internal', details: e?.message });
    }
  });

  router.post('/vrf/remove-server-lock', async (req: any, res: any) => {
    if (typeof (service as any).hasShamir === 'function' && !service.hasShamir()) {
      return res.status(503).json({ error: 'shamir_disabled', message: 'Shamir 3-pass is not configured on this server' });
    }
    try {
      const serverResponse = await service.handleRemoveServerLock({ body: req.body });
      Object.entries(serverResponse.headers).forEach(([k, v]) => res.set(k, v as any));
      res.status(serverResponse.status);
      res.send(JSON.parse(serverResponse.body));
    } catch (e: any) {
      res.status(500).json({ error: 'internal', details: e?.message });
    }
  });

  // VRF + WebAuthn session verification (VIEW call) + optional session issuance
  router.post('/verify-authentication-response', async (req: any, res: any) => {
    try {
      if (!req?.body) {
        res.status(400).json({ code: 'invalid_body', message: 'Request body is required' });
        return;
      }
      const body = req.body;
      const valid = body && body.vrf_data && body.webauthn_authentication;
      if (!valid) {
        res.status(400).json({ code: 'invalid_body', message: 'vrf_data and webauthn_authentication are required' });
        return;
      }
      const result = await service.verifyAuthenticationResponse(body);
      const status = result.success ? 200 : 400;
      if (status !== 200) {
        res.status(status).json({ code: 'not_verified', message: result.message || 'Authentication verification failed' });
        return;
      }
      const sessionKind = ((body?.sessionKind || body?.session_kind) === 'cookie') ? 'cookie' : 'jwt';
      const session = opts.session;
      if (session && result.verified) {
        try {
          const sub = String(body.vrf_data.user_id || '');
          const token = await session.signJwt(sub, { rpId: body.vrf_data.rp_id, blockHeight: body.vrf_data.block_height });
          try {
            // Best-effort server log without sensitive data
            console.log(`[relay] creating ${sessionKind === 'cookie' ? 'HttpOnly session' : 'JWT'} for`, sub);
          } catch {}
          if (sessionKind === 'cookie') {
            res.set('Set-Cookie', session.buildSetCookie(token));
            const { jwt: _omit, ...rest } = result as any;
            res.status(200).json(rest);
            return;
          }
          res.status(200).json({ ...result, jwt: token });
          return;
        } catch (e: any) {
          // If session issuance fails, still return verification result
        }
      }
      res.status(200).json(result);
    } catch (e: any) {
      res.status(500).json({ code: 'internal', message: e?.message || 'Internal error' });
    }
  });

  // Session: read current claims via bearer token or cookie
  router.get(mePath, async (req: any, res: any) => {
    try {
      const session = opts.session;
      if (!session) {
        res.status(501).json({ authenticated: false, code: 'sessions_disabled', message: 'Sessions are not configured' });
        return;
      }
      const parsed = await session.parse(req.headers || {});
      if (!parsed.ok) {
        res.status(401).json({ authenticated: false, code: 'unauthorized', message: 'No valid session' });
        return;
      }
      res.status(200).json({ authenticated: true, claims: (parsed as any).claims });
    } catch (e: any) {
      res.status(500).json({ authenticated: false, code: 'internal', message: e?.message || 'Internal error' });
    }
  });

  // Session: logout clears cookie (best-effort)
  router.post(logoutPath, async (_req: any, res: any) => {
    try {
      const session = opts.session;
      if (session) res.set('Set-Cookie', session.buildClearCookie());
      res.status(200).json({ success: true });
    } catch (e: any) {
      res.status(500).json({ success: false, error: 'internal', details: e?.message });
    }
  });

  // Session: refresh (sliding expiration)
  router.post('/session/refresh', async (req: any, res: any) => {
    try {
      const sessionKind = ((req.body || {}).sessionKind === 'cookie') ? 'cookie' : ((req.body || {}).session_kind === 'cookie' ? 'cookie' : 'jwt');
      const session = opts.session;
      if (!session) {
        res.status(501).json({ code: 'sessions_disabled', message: 'Sessions are not configured' });
        return;
      }
      const out = await session.refresh(req.headers || {});
      if (!out.ok || !out.jwt) {
        const code = out.code || 'not_eligible';
        const message = out.message || 'Refresh not eligible';
        res.status(code === 'unauthorized' ? 401 : 400).json({ code, message });
        return;
      }
      if (sessionKind === 'cookie') {
        res.set('Set-Cookie', session.buildSetCookie(out.jwt));
        res.status(200).json({ ok: true });
      } else {
        res.status(200).json({ ok: true, jwt: out.jwt });
      }
    } catch (e: any) {
      res.status(500).json({ code: 'internal', message: e?.message || 'Internal error' });
    }
  });

  // Email recovery hook (DKIM/TEE flow):
  // Accept a ForwardableEmailPayload from the email worker and call the
  // per-user email-recoverer contract deployed on `accountId`.
  router.post('/recover-email', async (req: any, res: any) => {
    try {
      const normalized = normalizeForwardableEmailPayload(req.body as unknown);
      if (!normalized.ok) {
        res.status(400).json({ code: normalized.code, message: normalized.message });
        return;
      }

      const payload = normalized.payload as ForwardableEmailPayload;
      const emailBlob = payload.raw || '';
      const headers = payload.headers || {};

      // Primary: parse accountId from Subject (header or raw)
      const subjectHeader = headers['subject'];
      const parsedAccountId = parseAccountIdFromSubject(subjectHeader || emailBlob);
      // Fallback: header-based account id if provided
      const headerAccountId = String(headers['x-near-account-id'] || headers['x-account-id'] || '').trim();
      const accountId = (parsedAccountId || headerAccountId || '').trim();

      if (!accountId) {
        res.status(400).json({ code: 'missing_account', message: 'x-near-account-id header is required' });
        return;
      }
      if (!emailBlob) {
        res.status(400).json({ code: 'missing_email', message: 'raw email blob is required' });
        return;
      }

      const result = await service.recoverAccountFromEmailDKIMVerifier({ accountId, emailBlob });
      const status = result.success ? 202 : 400;
      res.status(status).json(result);
    } catch (e: any) {
      res.status(500).json({ code: 'internal', message: e?.message || 'Internal error' });
    }
  });

  router.get('/shamir/key-info', async (_req: any, res: any) => {
    if (typeof (service as any).hasShamir === 'function' && !service.hasShamir()) {
      return res.status(503).json({ error: 'shamir_disabled', message: 'Shamir 3-pass is not configured on this server' });
    }
    try {
      const serverResponse = await service.handleGetShamirKeyInfo();
      Object.entries(serverResponse.headers).forEach(([k, v]) => res.set(k, v as any));
      res.status(serverResponse.status);
      res.send(JSON.parse(serverResponse.body));
    } catch (e: any) {
      res.status(500).json({ error: 'internal', details: e?.message });
    }
  });

  if (opts.healthz) {
    router.get('/healthz', async (_req: Request, res: Response) => {
      try {
        const { currentKeyId } = JSON.parse((await service.handleGetShamirKeyInfo()).body) as { currentKeyId?: string };
        res.status(200).json({ ok: true, currentKeyId: currentKeyId || null });
      } catch {
        res.status(200).json({ ok: true });
      }
    });
  }

  // ROR manifest for Related Origin Requests (wallet-scoped credentials)
  const wellKnownPaths = ['/.well-known/webauthn', '/.well-known/webauthn/'];
  for (const p of wellKnownPaths) {
    router.get(p, async (_req: Request, res: Response) => {
      try {
        const origins = await service.getRorOrigins();
        res.set('Content-Type', 'application/json; charset=utf-8');
        // Short TTL + SWR so updates propagate while staying cache-friendly
        res.set('Cache-Control', 'max-age=60, stale-while-revalidate=600');
        res.status(200).send(JSON.stringify({ origins }));
      } catch (e: any) {
        res.status(200).json({ origins: [] });
      }
    });
  }

  return router;
}
