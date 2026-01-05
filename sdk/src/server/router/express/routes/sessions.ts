import type { Router as ExpressRouter } from 'express';
import { parseSessionKind } from '../../relay';
import type { ExpressRelayContext } from '../createRelayRouter';

export function registerSessionRoutes(router: ExpressRouter, ctx: ExpressRelayContext): void {
  // Session: read current claims via bearer token or cookie
  router.get(ctx.mePath, async (req: any, res: any) => {
    try {
      const session = ctx.opts.session;
      if (!session) {
        res.status(501).json({ authenticated: false, code: 'sessions_disabled', message: 'Sessions are not configured' });
        return;
      }
      const parsed = await session.parse(req.headers || {});
      if (!parsed.ok) {
        res.status(401).json({ authenticated: false, code: 'unauthorized', message: 'No valid session' });
        return;
      }
      res.status(200).json({ authenticated: true, claims: parsed.claims });
    } catch (e: any) {
      res.status(500).json({ authenticated: false, code: 'internal', message: e?.message || 'Internal error' });
    }
  });

  // Session: logout clears cookie (best-effort)
  router.post(ctx.logoutPath, async (_req: any, res: any) => {
    try {
      const session = ctx.opts.session;
      if (session) res.set('Set-Cookie', session.buildClearCookie());
      res.status(200).json({ success: true });
    } catch (e: any) {
      res.status(500).json({ success: false, error: 'internal', details: e?.message });
    }
  });

  // Session: refresh (sliding expiration)
  router.post('/session/refresh', async (req: any, res: any) => {
    try {
      const sessionKind = parseSessionKind(req.body || {});
      const session = ctx.opts.session;
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
}
