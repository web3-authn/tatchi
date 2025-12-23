import type { Request, Response, Router as ExpressRouter } from 'express';
import express from 'express';
import type { AuthService } from '../core/AuthService';
import { buildCorsOrigins } from '../core/SessionService';
import {
  handleApplyServerLock,
  handleRemoveServerLock,
  handleGetShamirKeyInfo,
  handleListGraceKeys,
  handleAddGraceKey,
  handleRemoveGraceKey,
} from '../core/shamirHandlers';
import { parseRecoverEmailRequest } from '../email-recovery/emailParsers';
import type { DelegateActionPolicy } from '../delegateAction';
import type { RouterLogger } from './logger';
import { normalizeRouterLogger } from './logger';

export interface RelayRouterOptions {
  healthz?: boolean;
  readyz?: boolean;
  // Optional list(s) of CORS origins (CSV strings or literal origins).
  // Pass raw strings; the router normalizes/merges internally.
  corsOrigins?: Array<string | undefined>;
  /**
   * Optional route for submitting NEP-461 SignedDelegate meta-transactions.
   *
   * - When omitted: disabled.
   * - When set: enabled at `route`.
   *
   * `policy` is server-controlled and is never read from the request body.
   */
  signedDelegate?: {
    route: string;
    policy?: DelegateActionPolicy;
  };
  sessionRoutes?: { auth?: string; logout?: string };
  session?: SessionAdapter | null;
  // Optional logger; defaults to silent.
  logger?: RouterLogger | null;
}

function normalizePath(path: string): string {
  const trimmed = String(path || '').trim();
  if (!trimmed) return '';
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

function withCors(res: Response, opts?: RelayRouterOptions, req?: Request): void {
  if (!opts?.corsOrigins) return;

  let allowedOrigin: string | '*' | undefined;
  const normalized = buildCorsOrigins(...(opts.corsOrigins || []));
  if (normalized === '*') {
    allowedOrigin = '*';
    res.set('Access-Control-Allow-Origin', '*');
  } else if (Array.isArray(normalized)) {
    const origin = String((req as any)?.headers?.origin || '').trim();
    if (origin && normalized.includes(origin)) {
      allowedOrigin = origin;
      res.set('Access-Control-Allow-Origin', origin);
      res.set('Vary', 'Origin');
    }
  }

  res.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  // Only advertise credentials when we echo back a specific origin (not '*')
  if (allowedOrigin && allowedOrigin !== '*') {
    res.set('Access-Control-Allow-Credentials', 'true');
  }
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
  const logger = normalizeRouterLogger(opts.logger);
  const signedDelegatePath = (() => {
    if (!opts.signedDelegate) return '';
    const raw = String(opts.signedDelegate.route || '').trim();
    if (!raw) throw new Error('RelayRouterOptions.signedDelegate.route is required');
    return normalizePath(raw);
  })();
  const signedDelegatePolicy = opts.signedDelegate?.policy;

  // Optional CORS: implemented here to keep setup simple for example relayers.
  // If you prefer custom CORS middleware, omit `corsOrigins` and wire your own.
  router.use((req: Request, res: Response, next: any) => {
    withCors(res, opts, req);
    const method = String((req as any)?.method || '').toUpperCase();
    if (opts.corsOrigins && method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }
    next();
  });

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

  if (signedDelegatePath) {
    router.options(signedDelegatePath, (_req: any, res: any) => {
      res.sendStatus(204);
    });

    router.post(signedDelegatePath, async (req: any, res: any) => {
      try {
        const { hash, signedDelegate } = req.body || {};
        if (typeof hash !== 'string' || !hash || !signedDelegate) {
          res.status(400).json({ ok: false, code: 'invalid_body', message: 'Expected { hash, signedDelegate }' });
          return;
        }

        const result = await service.executeSignedDelegate({
          hash,
          signedDelegate,
          policy: signedDelegatePolicy,
        });

        if (!result || !result.ok) {
          res.status(400).json({
            ok: false,
            code: result?.code || 'delegate_execution_failed',
            message: result?.error || 'Failed to execute delegate action',
          });
          return;
        }

        res.status(200).json({
          ok: true,
          relayerTxHash: result.transactionHash || null,
          status: 'submitted',
          outcome: result.outcome ?? null,
        });
      } catch (e: any) {
        res.status(500).json({
          ok: false,
          code: 'internal',
          message: e?.message || 'Internal error while executing delegate action',
        });
      }
    });
  }

  router.post('/vrf/apply-server-lock', async (req: any, res: any) => {
    const shamir = service.shamirService;
    if (!shamir || !shamir.hasShamir()) {
      return res.status(503).json({ error: 'shamir_disabled', message: 'Shamir 3-pass is not configured on this server' });
    }
    try {
      const serverResponse = await handleApplyServerLock(shamir, { body: req.body });
      Object.entries(serverResponse.headers).forEach(([k, v]) => res.set(k, v as any));
      res.status(serverResponse.status);
      res.send(JSON.parse(serverResponse.body));
    } catch (e: any) {
      res.status(500).json({ error: 'internal', details: e?.message });
    }
  });

  router.post('/vrf/remove-server-lock', async (req: any, res: any) => {
    const shamir = service.shamirService;
    if (!shamir || !shamir.hasShamir()) {
      return res.status(503).json({ error: 'shamir_disabled', message: 'Shamir 3-pass is not configured on this server' });
    }
    try {
      const serverResponse = await handleRemoveServerLock(shamir, { body: req.body });
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
          // Best-effort server log without sensitive data
          logger.info(`[relay] creating ${sessionKind === 'cookie' ? 'HttpOnly session' : 'JWT'} for`, sub);
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
      const prefer = String(req?.headers?.prefer || '').toLowerCase();
      const respondAsync =
        prefer.includes('respond-async') ||
        String((req?.query as any)?.async || '').trim() === '1' ||
        String((req?.query as any)?.respond_async || '').trim() === '1';

      const parsed = parseRecoverEmailRequest(req.body as unknown, { headers: req.headers as any });
      if (!parsed.ok) {
        res.status(parsed.status).json({ code: parsed.code, message: parsed.message });
        return;
      }
      const { accountId, emailBlob, explicitMode } = parsed;

      if (!service.emailRecovery) {
        res.status(503).json({ code: 'email_recovery_unavailable', message: 'EmailRecoveryService is not configured on this server' });
        return;
      }

      if (respondAsync) {
        void service.emailRecovery
          .requestEmailRecovery({ accountId, emailBlob, explicitMode })
          .then((result) => {
            logger.info('[recover-email] async complete', {
              success: result?.success === true,
              accountId,
              error: result?.success ? undefined : result?.error,
            });
          })
          .catch((err: any) => {
            logger.error('[recover-email] async error', {
              accountId,
              error: err?.message || String(err),
            });
          });

        res.status(202).json({ success: true, queued: true, accountId });
        return;
      }

      const result = await service.emailRecovery.requestEmailRecovery({ accountId, emailBlob, explicitMode });
      res.status(result.success ? 202 : 400).json(result);
    } catch (e: any) {
      res.status(500).json({ code: 'internal', message: e?.message || 'Internal error' });
    }
  });

  router.get('/shamir/key-info', async (_req: any, res: any) => {
    const shamir = service.shamirService;
    if (!shamir || !shamir.hasShamir()) {
      return res.status(503).json({ error: 'shamir_disabled', message: 'Shamir 3-pass is not configured on this server' });
    }
    try {
      const serverResponse = await handleGetShamirKeyInfo(shamir);
      Object.entries(serverResponse.headers).forEach(([k, v]) => res.set(k, v as any));
      res.status(serverResponse.status);
      res.send(JSON.parse(serverResponse.body));
    } catch (e: any) {
      res.status(500).json({ error: 'internal', details: e?.message });
    }
  });

  if (opts.healthz) {
    router.get('/healthz', async (_req: Request, res: Response) => {
      const shamir = service.shamirService;
      const shamirConfigured = Boolean(shamir && shamir.hasShamir());
      let currentKeyId: string | null = null;
      if (shamirConfigured && shamir) {
        try {
          const payload = JSON.parse((await handleGetShamirKeyInfo(shamir)).body) as { currentKeyId?: string };
          currentKeyId = payload.currentKeyId || null;
        } catch {}
      }

      const proverBaseUrl = service.emailRecovery?.getZkEmailProverBaseUrl?.() ?? null;
      const zkEmailConfigured = Boolean(proverBaseUrl);

      res.status(200).json({
        ok: true,
        // Backwards-compatible field (was previously top-level).
        currentKeyId,
        shamir: { configured: shamirConfigured, currentKeyId },
        zkEmail: { configured: zkEmailConfigured, proverBaseUrl },
      });
    });
  }

  if (opts.readyz) {
    router.get('/readyz', async (_req: Request, res: Response) => {
      const shamir = service.shamirService;
      const shamirConfigured = Boolean(shamir && shamir.hasShamir());

      let shamirReady: boolean | null = null;
      let shamirCurrentKeyId: string | null = null;
      let shamirError: string | undefined;
      if (shamirConfigured && shamir) {
        try {
          await shamir.ensureReady();
          shamirReady = true;
          const payload = JSON.parse((await handleGetShamirKeyInfo(shamir)).body) as { currentKeyId?: string };
          shamirCurrentKeyId = payload.currentKeyId || null;
        } catch (e: any) {
          shamirReady = false;
          shamirError = e?.message || String(e);
        }
      }

      const zk = service.emailRecovery
        ? await service.emailRecovery.checkZkEmailProverHealth()
        : { configured: false, baseUrl: null, healthy: null as boolean | null };

      const ok =
        (shamirConfigured ? shamirReady === true : true) &&
        (zk.configured ? zk.healthy === true : true);

      res.status(ok ? 200 : 503).json({
        ok,
        shamir: {
          configured: shamirConfigured,
          ready: shamirConfigured ? shamirReady : null,
          currentKeyId: shamirCurrentKeyId,
          error: shamirError,
        },
        zkEmail: zk,
      });
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

export interface KeyRotationCronOptions {
  enabled?: boolean;
  intervalMinutes?: number;
  maxGraceKeys?: number;
  logger?: RouterLogger | null;
}

export function startKeyRotationCronjob(
  service: AuthService,
  opts: KeyRotationCronOptions = {},
): { stop(): void } {
  const logger = normalizeRouterLogger(opts.logger);
  const enabled = Boolean(opts.enabled);
  const intervalMinutes = Math.max(1, Number(opts.intervalMinutes || 0) || 60);
  const maxGraceKeys = Math.max(0, Number(opts.maxGraceKeys ?? 0) || 0);

  let timer: any = null;
  let inFlight = false;

  const run = async () => {
    if (!enabled) return;
    if (inFlight) {
      logger.warn('[key-rotation-cron] previous rotation still running; skipping');
      return;
    }
    inFlight = true;
    try {
      const shamir = service.shamirService;
      if (!shamir || !shamir.hasShamir()) {
        logger.warn('[key-rotation-cron] Shamir not configured; skipping rotation');
        return;
      }

      const rotation = await shamir.rotateShamirServerKeypair();
      logger.info('[key-rotation-cron] rotated key', {
        newKeyId: rotation.newKeyId,
        previousKeyId: rotation.previousKeyId,
        graceKeyIds: rotation.graceKeyIds,
      });

      if (maxGraceKeys > 0) {
        const graceKeyIds = shamir.getGraceKeyIds();
        if (graceKeyIds.length > maxGraceKeys) {
          const toRemove = graceKeyIds.slice(0, graceKeyIds.length - maxGraceKeys);
          for (const keyId of toRemove) {
            try {
              const removed = await shamir.removeGraceKeyInternal(keyId, { persist: true });
              logger.info('[key-rotation-cron] pruned grace key', { keyId, removed });
            } catch (e: any) {
              logger.warn('[key-rotation-cron] failed to prune grace key', { keyId, error: e?.message || String(e) });
            }
          }
        }
      }
    } catch (e: any) {
      logger.error('[key-rotation-cron] rotation failed', { error: e?.message || String(e) });
    } finally {
      inFlight = false;
    }
  };

  if (enabled) {
    timer = setInterval(() => { void run(); }, intervalMinutes * 60_000);
  }

  return {
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
    },
  };
}
