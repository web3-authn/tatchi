import { buildCorsOrigins } from '../../core/SessionService';
import type { RelayRouterOptions } from '../relayTypes';

export function json(body: unknown, init?: ResponseInit, extraHeaders?: Record<string, string>): Response {
  const headers = new Headers({ 'Content-Type': 'application/json; charset=utf-8' });

  // Merge init.headers into our base headers (ResponseInit headers are otherwise overwritten).
  const initHeaders = (init as any)?.headers as HeadersInit | undefined;
  if (initHeaders) {
    try {
      new Headers(initHeaders).forEach((v, k) => headers.set(k, v));
    } catch { }
  }

  if (extraHeaders) {
    for (const [k, v] of Object.entries(extraHeaders)) headers.set(k, v);
  }

  const { headers: _omit, ...rest } = init || {};
  return new Response(JSON.stringify(body), { status: 200, ...rest, headers });
}

export function withCors(headers: Headers, opts?: RelayRouterOptions, request?: Request): void {
  if (!opts?.corsOrigins) return;
  let allowedOrigin: string | '*' | undefined;
  const normalized = buildCorsOrigins(...(opts.corsOrigins || []));
  if (normalized === '*') {
    allowedOrigin = '*';
    headers.set('Access-Control-Allow-Origin', '*');
  } else if (Array.isArray(normalized)) {
    const origin = request?.headers.get('Origin') || '';
    if (origin && normalized.includes(origin)) {
      allowedOrigin = origin;
      headers.set('Access-Control-Allow-Origin', origin);
      headers.append('Vary', 'Origin');
    }
  }
  headers.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  // Only advertise credentials when we echo back a specific origin (not '*')
  if (allowedOrigin && allowedOrigin !== '*') {
    headers.set('Access-Control-Allow-Credentials', 'true');
  }
}

export function toResponse(out: { status: number; headers: Record<string, string>; body: string }): Response {
  return new Response(out.body, { status: out.status, headers: out.headers });
}

export function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export function headersToRecord(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((v, k) => { out[k] = v; });
  return out;
}
