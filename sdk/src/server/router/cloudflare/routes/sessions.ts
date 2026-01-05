import { parseSessionKind } from '../../relay';
import type { CloudflareRelayContext } from '../createCloudflareRouter';
import { headersToRecord, json, readJson } from '../http';

export async function handleSessionAuth(ctx: CloudflareRelayContext): Promise<Response | null> {
  if (ctx.method !== 'GET' || ctx.pathname !== ctx.mePath) return null;

  try {
    const session = ctx.opts.session;
    if (!session) {
      return json({ authenticated: false, code: 'sessions_disabled', message: 'Sessions are not configured' }, { status: 501 });
    }

    const parsed = await session.parse(headersToRecord(ctx.request.headers));
    return json(
      parsed.ok
        ? { authenticated: true, claims: parsed.claims }
        : { authenticated: false },
      { status: parsed.ok ? 200 : 401 }
    );
  } catch (e: any) {
    return json({ authenticated: false, code: 'internal', message: e?.message || 'Internal error' }, { status: 500 });
  }
}

export async function handleSessionLogout(ctx: CloudflareRelayContext): Promise<Response | null> {
  if (ctx.method !== 'POST' || ctx.pathname !== ctx.logoutPath) return null;

  const res = json({ success: true }, { status: 200 });
  const session = ctx.opts.session;
  if (session) {
    // Clear cookie with Max-Age=0
    res.headers.set('Set-Cookie', session.buildClearCookie());
  }
  return res;
}

export async function handleSessionRefresh(ctx: CloudflareRelayContext): Promise<Response | null> {
  if (ctx.method !== 'POST' || ctx.pathname !== '/session/refresh') return null;

  const body = await readJson(ctx.request);
  const sessionKind = parseSessionKind(body);
  const session = ctx.opts.session;
  if (!session) {
    return json({ code: 'sessions_disabled', message: 'Sessions are not configured' }, { status: 501 });
  }
  const out = await session.refresh(Object.fromEntries(ctx.request.headers.entries()));
  if (!out.ok || !out.jwt) {
    return json(
      { code: out.code || 'not_eligible', message: out.message || 'Refresh not eligible' },
      { status: (out.code === 'unauthorized') ? 401 : 400 }
    );
  }
  const res = json(sessionKind === 'cookie' ? { ok: true } : { ok: true, jwt: out.jwt }, { status: 200 });
  if (sessionKind === 'cookie' && out.jwt) {
    try {
      res.headers.set('Set-Cookie', session.buildSetCookie(out.jwt));
    } catch { }
  }
  return res;
}
