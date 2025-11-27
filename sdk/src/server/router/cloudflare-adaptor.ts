import type { AuthService } from '../core/AuthService';
import { buildCorsOrigins } from '../core/SessionService';
import type { SessionAdapter } from './express-adaptor';
import type { CreateAccountAndRegisterRequest } from '../core/types';
import { setShamirWasmModuleOverride } from '../core/shamirWorker';
import type { InitInput as ShamirInitInput } from '../../wasm_vrf_worker/pkg/wasm_vrf_worker.js';
import type { ForwardableEmailPayload } from '../email-recovery/zkEmail';
import { normalizeForwardableEmailPayload, parseAccountIdFromSubject } from '../email-recovery/zkEmail';

export interface RelayRouterOptions {
  healthz?: boolean;
  // Optional list(s) of CORS origins (CSV strings or literal origins).
  // Pass raw strings; the router normalizes/merges internally.
  corsOrigins?: Array<string | undefined>;
  // Optional: customize session route paths
  sessionRoutes?: { auth?: string; logout?: string };
  // Optional: pluggable session adapter
  session?: SessionAdapter | null;
}

// Minimal Worker runtime types (avoid adding @cloudflare/workers-types dependency here)
export interface CfEnv { [key: string]: string | undefined }
export interface CfExecutionContext { waitUntil(promise: Promise<unknown>): void; passThroughOnException(): void }
export interface CfScheduledEvent { scheduledTime?: number; cron?: string }

export type FetchHandler = (request: Request, env?: CfEnv, ctx?: CfExecutionContext) => Promise<Response>;
export type ScheduledHandler = (event: CfScheduledEvent, env?: CfEnv, ctx?: CfExecutionContext) => Promise<void>;

type ShamirModuleSupplier =
  | ShamirInitInput
  | Promise<ShamirInitInput>
  | (() => ShamirInitInput | Promise<ShamirInitInput>);

/**
 * Log Cloudflare WASM module configuration details for debugging
 */
function logCloudflareWasmConfig(override: ShamirModuleSupplier | null): void {
  try {
    const kind = override === null ? 'null' : typeof override;
    const isModule = override instanceof WebAssembly.Module;
    const isResponse = override instanceof Response;
    const isArrayBuffer = override instanceof ArrayBuffer;
    const isTypedArray = ArrayBuffer.isView(override);
    const toStringTag = Object.prototype.toString.call(override);

    // eslint-disable-next-line no-console
    console.log(`[CloudflareRouter] configureCloudflareShamirWasm called:
    • kind: ${kind}
    • isWebAssembly.Module: ${isModule}
    • isResponse: ${isResponse}
    • isArrayBuffer: ${isArrayBuffer}
    • isTypedArray: ${isTypedArray}
    • toString: ${toStringTag}`);
  } catch (err) {
    console.error('[CloudflareRouter] Error logging override details:', err);
  }
}

/**
 * Configure Shamir WASM module for Cloudflare Workers
 *
 * @deprecated This function is deprecated. Pass the WASM module via
 * `AuthService` config instead: `shamir: { moduleOrPath: shamirWasmModule }`
 *
 * This ensures proper module initialization in Cloudflare Workers where
 * module-level global state doesn't work reliably due to bundler isolation.
 */
export function configureCloudflareShamirWasm(
  override: ShamirModuleSupplier | null
): void {
  logCloudflareWasmConfig(override);
  setShamirWasmModuleOverride(override);
}

function json(body: unknown, init?: ResponseInit, extraHeaders?: Record<string, string>): Response {
  const headers = new Headers({ 'Content-Type': 'application/json; charset=utf-8' });
  if (extraHeaders) {
    for (const [k, v] of Object.entries(extraHeaders)) headers.set(k, v);
  }
  return new Response(JSON.stringify(body), { status: 200, ...init, headers });
}

function withCors(headers: Headers, opts?: RelayRouterOptions, request?: Request): void {
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

export function createCloudflareRouter(service: AuthService, opts: RelayRouterOptions = {}): FetchHandler {
  const notFound = () => new Response('Not Found', { status: 404 });
  const mePath = opts.sessionRoutes?.auth || '/session/auth';
  const logoutPath = opts.sessionRoutes?.logout || '/session/logout';

  return async function handler(request: Request, env?: CfEnv): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;
    const method = request.method.toUpperCase();

    // Preflight CORS
    if (method === 'OPTIONS') {
      const res = new Response(null, { status: 204 });
      withCors(res.headers, opts, request);
      return res;
    }

    // Helper to adapt AuthService HTTP-like handlers to Response
    const toResponse = (out: { status: number; headers: Record<string, string>; body: string }) => {
      const res = new Response(out.body, { status: out.status, headers: out.headers });
      withCors(res.headers, opts, request);
      return res;
    };

    const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

    try {
      // ROR well-known manifest; allow override via env (optional)
      if (method === 'GET' && (pathname === '/.well-known/webauthn' || pathname === '/.well-known/webauthn/')) {
        const contractId = (env?.ROR_CONTRACT_ID || env?.WEBAUTHN_CONTRACT_ID || '').toString().trim() || undefined;
        const methodName = (env?.ROR_METHOD || '').toString().trim() || undefined;
        const origins = await service.getRorOrigins({ contractId, method: methodName });
        const res = json({ origins }, { status: 200, headers: { 'Cache-Control': 'max-age=60, stale-while-revalidate=600' } });
        withCors(res.headers, opts, request);
        return res;
      }

      if (method === 'POST' && pathname === '/create_account_and_register_user') {
        let body: unknown;
        try { body = await request.json(); } catch { body = null; }
        if (!isObject(body)) {
          const res = json({ code: 'invalid_body', message: 'JSON body required' }, { status: 400 });
          withCors(res.headers, opts, request);
          return res;
        }

        const new_account_id = typeof body.new_account_id === 'string' ? body.new_account_id : '';
        const new_public_key = typeof body.new_public_key === 'string' ? body.new_public_key : '';
        const vrf_data = isObject(body.vrf_data) ? body.vrf_data : null;
        const webauthn_registration = isObject(body.webauthn_registration) ? body.webauthn_registration : null;
        const deterministic_vrf_public_key = (body as Record<string, unknown>).deterministic_vrf_public_key;
        const authenticator_options = isObject((body as Record<string, unknown>).authenticator_options)
          ? (body as Record<string, unknown>).authenticator_options
          : undefined;

        if (!new_account_id) {
          const res = json({ code: 'invalid_body', message: 'Missing or invalid new_account_id' }, { status: 400 });
          withCors(res.headers, opts, request);
          return res;
        }
        if (!new_public_key) {
          const res = json({ code: 'invalid_body', message: 'Missing or invalid new_public_key' }, { status: 400 });
          withCors(res.headers, opts, request);
          return res;
        }
        if (!vrf_data) {
          const res = json({ code: 'invalid_body', message: 'Missing or invalid vrf_data' }, { status: 400 });
          withCors(res.headers, opts, request);
          return res;
        }
        if (!webauthn_registration) {
          const res = json({ code: 'invalid_body', message: 'Missing or invalid webauthn_registration' }, { status: 400 });
          withCors(res.headers, opts, request);
          return res;
        }

        const input = {
          new_account_id,
          new_public_key,
          vrf_data,
          webauthn_registration,
          deterministic_vrf_public_key,
          authenticator_options,
        } as unknown as CreateAccountAndRegisterRequest;

        const result = await service.createAccountAndRegisterUser(input);
        const res = json(result, { status: result.success ? 200 : 400 });
        withCors(res.headers, opts, request);
        return res;
      }

      if (method === 'POST' && pathname === '/vrf/apply-server-lock') {
        if (!(await service.ensureShamirReady())) {
          const res = json({ code: 'shamir_disabled', message: 'Shamir 3-pass is not configured on this server' }, { status: 503 });
          withCors(res.headers, opts, request);
          return res;
        }
        let body: unknown; try { body = await request.json(); } catch { body = null; }
        const valid = isObject(body) && typeof body.kek_c_b64u === 'string' && body.kek_c_b64u.length > 0;
        if (!valid) {
          const res = json({ code: 'invalid_body', message: 'kek_c_b64u is required' }, { status: 400 });
          withCors(res.headers, opts, request);
          return res;
        }
        const out = await service.handleApplyServerLock({ body: { kek_c_b64u: String((body as Record<string, unknown>).kek_c_b64u) } });
        return toResponse(out);
      }

      if (method === 'POST' && pathname === '/verify-authentication-response') {
        let body: unknown; try { body = await request.json(); } catch { body = null; }
        const valid = isObject(body)
          && isObject((body as any).vrf_data)
          && isObject((body as any).webauthn_authentication);
        if (!valid) {
          const res = json({ code: 'invalid_body', message: 'vrf_data and webauthn_authentication are required' }, { status: 400 });
          withCors(res.headers, opts, request);
          return res;
        }
        try {
          const sessionKind = ((body as any)?.sessionKind || (body as any)?.session_kind) === 'cookie' ? 'cookie' : 'jwt';
          const result = await service.verifyAuthenticationResponse(body as any);
          const status = result.success ? 200 : 400;
          if (status !== 200) {
            const res = json({ code: 'not_verified', message: result.message || 'Authentication verification failed' }, { status });
            withCors(res.headers, opts, request);
            return res;
          }
          const res = json(result, { status: 200 });
          const session = opts.session;
          if (session && result.verified) {
            try {
              const userId = String((body as any).vrf_data?.user_id || '');
              const token = await session.signJwt(userId, { rpId: (body as any).vrf_data?.rp_id, blockHeight: (body as any).vrf_data?.block_height });
              try {
                // Cloudflare Workers log to console too
                console.log(`[relay] creating ${sessionKind === 'cookie' ? 'HttpOnly session' : 'JWT'} for`, userId);
              } catch {}
              if (sessionKind === 'cookie') {
                res.headers.set('Set-Cookie', session.buildSetCookie(token));
              } else {
                const payload = await res.clone().json();
                return new Response(JSON.stringify({ ...payload, jwt: token }), { status: 200, headers: res.headers });
              }
            } catch {}
          }
          withCors(res.headers, opts, request);
          return res;
        } catch (e: any) {
          const res = json({ code: 'internal', message: e?.message || 'Internal error' }, { status: 500 });
          withCors(res.headers, opts, request);
          return res;
        }
      }

      if (method === 'GET' && pathname === mePath) {
        try {
          const headersObj: Record<string, string> = {};
          request.headers.forEach((v, k) => { headersObj[k] = v; });
          const session = opts.session;
          if (!session) {
            const res = json({ authenticated: false, code: 'sessions_disabled', message: 'Sessions are not configured' }, { status: 501 });
            withCors(res.headers, opts, request);
            return res;
          }
          const parsed = await session.parse(headersObj);
          const res = json(parsed.ok ? { authenticated: true, claims: (parsed as any).claims } : { authenticated: false }, { status: parsed.ok ? 200 : 401 });
          withCors(res.headers, opts, request);
          return res;
        } catch (e: any) {
          const res = json({ authenticated: false, code: 'internal', message: e?.message || 'Internal error' }, { status: 500 });
          withCors(res.headers, opts, request);
          return res;
        }
      }

      if (method === 'POST' && pathname === logoutPath) {
        const res = json({ success: true }, { status: 200 });
        const session = opts.session;
        if (session) {
          // Clear cookie with Max-Age=0
          res.headers.set('Set-Cookie', session.buildClearCookie());
        }
        withCors(res.headers, opts, request);
        return res;
      }

      if (method === 'POST' && pathname === '/session/refresh') {
        let body: unknown; try { body = await request.json(); } catch { body = null; }
        const sessionKind = ((body as any)?.sessionKind || (body as any)?.session_kind) === 'cookie' ? 'cookie' : 'jwt';
        const session = opts.session;
        if (!session) {
          const res = json({ code: 'sessions_disabled', message: 'Sessions are not configured' }, { status: 501 });
          withCors(res.headers, opts, request);
          return res;
        }
        const out = await session.refresh(Object.fromEntries(request.headers.entries()));
        if (!out.ok || !out.jwt) {
          const res = json({ code: out.code || 'not_eligible', message: out.message || 'Refresh not eligible' }, { status: (out.code === 'unauthorized') ? 401 : 400 });
          withCors(res.headers, opts, request);
          return res;
        }
        const res = json(sessionKind === 'cookie' ? { ok: true } : { ok: true, jwt: out.jwt }, { status: 200 });
        if (sessionKind === 'cookie' && out.jwt) {
          try {
            res.headers.set('Set-Cookie', session.buildSetCookie(out.jwt));
          } catch {}
        }
        withCors(res.headers, opts, request);
        return res;
      }

      if (method === 'POST' && pathname === '/reset-email') {
        let rawBody: unknown; try { rawBody = await request.json(); } catch { rawBody = null; }
        const normalized = normalizeForwardableEmailPayload(rawBody);
        if (!normalized.ok) {
          const res = json({ code: normalized.code, message: normalized.message }, { status: 400 });
          withCors(res.headers, opts, request);
          return res;
        }

        const payload = normalized.payload as ForwardableEmailPayload;
        const emailBlob = payload.raw || '';
        const headers = payload.headers || {};

        const subjectHeader = headers['subject'];
        const parsedAccountId = parseAccountIdFromSubject(subjectHeader || emailBlob);
        const headerAccountId = String(headers['x-near-account-id'] || headers['x-account-id'] || '').trim();
        const accountId = (parsedAccountId || headerAccountId || '').trim();

        if (!accountId) {
          const res = json({ code: 'missing_account', message: 'x-near-account-id header is required' }, { status: 400 });
          withCors(res.headers, opts, request);
          return res;
        }
        if (!emailBlob) {
          const res = json({ code: 'missing_email', message: 'raw email blob is required' }, { status: 400 });
          withCors(res.headers, opts, request);
          return res;
        }

        const result = await service.recoverAccountFromEmailDKIMVerifier({ accountId, emailBlob });
        const res = json(result, { status: result.success ? 202 : 400 });
        withCors(res.headers, opts, request);
        return res;
      }

      if (method === 'POST' && pathname === '/vrf/remove-server-lock') {
        if (!(await service.ensureShamirReady())) {
          const res = json({ code: 'shamir_disabled', message: 'Shamir 3-pass is not configured on this server' }, { status: 503 });
          withCors(res.headers, opts, request);
          return res;
        }
        let body: unknown; try { body = await request.json(); } catch { body = null; }
        const valid = isObject(body)
          && typeof body.kek_cs_b64u === 'string' && body.kek_cs_b64u.length > 0
          && typeof (body as Record<string, unknown>).keyId === 'string'
          && String((body as Record<string, unknown>).keyId).length > 0;
        if (!valid) {
          const res = json({ code: 'invalid_body', message: 'kek_cs_b64u and keyId are required' }, { status: 400 });
          withCors(res.headers, opts, request);
          return res;
        }
        const out = await service.handleRemoveServerLock({
          body: {
            kek_cs_b64u: String((body as Record<string, unknown>).kek_cs_b64u),
            keyId: String((body as Record<string, unknown>).keyId),
          }
        });
        return toResponse(out);
      }

      if (method === 'GET' && pathname === '/shamir/key-info') {
        if (!(await service.ensureShamirReady())) {
          const res = json({ code: 'shamir_disabled', message: 'Shamir 3-pass is not configured on this server' }, { status: 503 });
          withCors(res.headers, opts, request);
          return res;
        }
        const out = await service.handleGetShamirKeyInfo();
        return toResponse(out);
      }

      if (opts.healthz && method === 'GET' && pathname === '/healthz') {
        // Surface simple CORS info for diagnostics (normalized)
        const allowed = buildCorsOrigins(...(opts.corsOrigins || []));
        const corsAllowed = allowed === '*' ? '*' : allowed;
        try {
          const { currentKeyId } = JSON.parse((await service.handleGetShamirKeyInfo()).body) as { currentKeyId?: string };
          const res = json({ ok: true, currentKeyId: currentKeyId || null, cors: { allowedOrigins: corsAllowed } }, { status: 200 });
          withCors(res.headers, opts, request);
          return res;
        } catch {
          const res = json({ ok: true, cors: { allowedOrigins: corsAllowed } }, { status: 200 });
          withCors(res.headers, opts, request);
          return res;
        }
      }

      return notFound();
    } catch (e: unknown) {
      const res = json({ code: 'internal', message: e instanceof Error ? e.message : String(e) }, { status: 500 });
      withCors(res.headers, opts, request);
      return res;
    }
  };
}

/**
 * Optional cron hook factory for Cloudflare Workers.
 * Default is inactive (no-op). Enable explicitly in your Worker entry.
 *
 * Example:
 *   const cron = createCloudflareCron(service, { enabled: env.ENABLE_ROTATION === '1', rotate: false });
 *   export default { fetch: router, scheduled: cron };
 */
export interface CloudflareCronOptions {
  enabled?: boolean;     // default false
  rotate?: boolean;      // if true, will attempt to rotate Shamir keypair (not persisted in Workers)
}

export function createCloudflareCron(service: AuthService, opts: CloudflareCronOptions = {}): ScheduledHandler {
  const enabled = Boolean(opts.enabled);
  const doRotate = Boolean(opts.rotate);
  if (!enabled) {
    return async () => { /* no-op by default */ };
  }
  return async (_event: CfScheduledEvent) => {
    try {
      if (doRotate) {
        // Rotation in Workers is ephemeral unless you persist keys externally.
        // This call rotates in-memory only and logs the result.
        const rotation = await service.rotateShamirServerKeypair();
        console.log('[cloudflare-cron] rotated key', rotation.newKeyId, 'graceIds:', rotation.graceKeyIds);
      } else {
        console.log('[cloudflare-cron] enabled but rotate=false (no action)');
      }
    } catch (e: unknown) {
      console.error('[cloudflare-cron] failed', e instanceof Error ? e.message : String(e));
    }
  };
}
