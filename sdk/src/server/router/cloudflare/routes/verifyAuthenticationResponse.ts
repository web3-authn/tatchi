import { parseSessionKind } from '../../sessionKind';
import type { CloudflareRelayContext } from '../createCloudflareRouter';
import { isObject, json, readJson } from '../http';

export async function handleVerifyAuthenticationResponse(ctx: CloudflareRelayContext): Promise<Response | null> {
  if (ctx.method !== 'POST' || ctx.pathname !== '/verify-authentication-response') return null;

  const body = await readJson(ctx.request);
  const valid = isObject(body)
    && isObject((body as any).vrf_data)
    && isObject((body as any).webauthn_authentication);
  if (!valid) {
    return json({ code: 'invalid_body', message: 'vrf_data and webauthn_authentication are required' }, { status: 400 });
  }

  try {
    const sessionKind = parseSessionKind(body);
    const result = await ctx.service.verifyAuthenticationResponse(body as any);
    const status = result.success ? 200 : 400;
    if (status !== 200) {
      return json({ code: 'not_verified', message: result.message || 'Authentication verification failed' }, { status });
    }

    const res = json(result, { status: 200 });
    const session = ctx.opts.session;
    if (session && result.verified) {
      try {
        const userId = String((body as any).vrf_data?.user_id || '');
        const token = await session.signJwt(userId, { rpId: (body as any).vrf_data?.rp_id, blockHeight: (body as any).vrf_data?.block_height });
        ctx.logger.info(`[relay] creating ${sessionKind === 'cookie' ? 'HttpOnly session' : 'JWT'} for`, userId);
        if (sessionKind === 'cookie') {
          res.headers.set('Set-Cookie', session.buildSetCookie(token));
        } else {
          const payload = await res.clone().json();
          return new Response(JSON.stringify({ ...payload, jwt: token }), { status: 200, headers: res.headers });
        }
      } catch { }
    }

    return res;
  } catch (e: any) {
    return json({ code: 'internal', message: e?.message || 'Internal error' }, { status: 500 });
  }
}
