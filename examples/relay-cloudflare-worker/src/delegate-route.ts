import type { AuthService } from '@tatchi-xyz/sdk/server';
import type { CfEnv, RelayRouterOptions } from '@tatchi-xyz/sdk/server/router/cloudflare';
import { buildCorsOrigins } from '@tatchi-xyz/sdk/server';


function json(body: unknown, init?: ResponseInit, extraHeaders?: Record<string, string>): Response {
  const headers = new Headers({ 'Content-Type': 'application/json; charset=utf-8' });
  if (extraHeaders) {
    for (const [k, v] of Object.entries(extraHeaders)) headers.set(k, v);
  }
  return new Response(JSON.stringify(body), { status: 200, ...init, headers });
}

function withCors(headers: Headers, opts?: RelayRouterOptions, request?: Request): void {
  if (!opts?.corsOrigins) return;
  const origins = buildCorsOrigins(...(opts.corsOrigins || []));
  if (origins === '*') {
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Content-Type,Authorization');
    return;
  }
  if (Array.isArray(origins)) {
    const origin = request?.headers.get('Origin') || '';
    if (origin && origins.includes(origin)) {
      headers.set('Access-Control-Allow-Origin', origin);
      headers.append('Vary', 'Origin');
      headers.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
      headers.set('Access-Control-Allow-Headers', 'Content-Type,Authorization');
      headers.set('Access-Control-Allow-Credentials', 'true');
    }
  }
}

export async function handleSignedDelegateRoute(
  service: AuthService,
  request: Request,
  opts: RelayRouterOptions = {},
): Promise<Response> {
  if (request.method === 'OPTIONS') {
    const headers = new Headers();
    withCors(headers, opts, request);
    // 204 with no body for CORS preflight
    return new Response(null, { status: 204, headers });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    const res = json({ ok: false, code: 'invalid_body', message: 'Body must be valid JSON' }, { status: 400 });
    withCors(res.headers, opts, request);
    return res;
  }

  const hash = typeof (body as any)?.hash === 'string' ? (body as any).hash : '';
  const signedDelegate = (body as any)?.signedDelegate;

  if (!hash || !signedDelegate) {
    const res = json(
      { ok: false, code: 'invalid_body', message: 'Expected { hash, signedDelegate }' },
      { status: 400 },
    );
    withCors(res.headers, opts, request);
    return res;
  }

  try {
    const result = await (service as any).executeSignedDelegate?.({
      hash,
      signedDelegate,
    });

    if (!result || !result.ok) {
      const res = json(
        {
          ok: false,
          code: result?.code || 'delegate_execution_failed',
          message: result?.error || 'Failed to execute delegate action',
        },
        { status: 400 },
      );
      withCors(res.headers, opts, request);
      return res;
    }

    const res = json(
      {
        ok: true,
        relayerTxHash: result.transactionHash || null,
        status: 'submitted',
        outcome: result.outcome ?? null,
      },
      { status: 200 },
    );
    withCors(res.headers, opts, request);
    return res;
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    const res = json({ ok: false, code: 'internal', message }, { status: 500 });
    withCors(res.headers, opts, request);
    return res;
  }
}
