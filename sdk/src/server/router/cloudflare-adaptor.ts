import type { AuthService } from '../core/AuthService';
import type { CreateAccountAndRegisterRequest } from '../core/types';
import { setShamirWasmModuleOverride } from '../core/shamirWorker';
import type { InitInput as ShamirInitInput } from '../../wasm_vrf_worker/pkg/wasm_vrf_worker.js';

export interface RelayRouterOptions {
  healthz?: boolean;
  // Optional: CORS allowed origins. If omitted, no CORS headers are added.
  corsOrigins?: string[] | '*';
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
  if (opts.corsOrigins === '*') {
    headers.set('Access-Control-Allow-Origin', '*');
  } else if (Array.isArray(opts.corsOrigins)) {
    const origin = request?.headers.get('Origin');
    if (origin && opts.corsOrigins.includes(origin)) {
      headers.set('Access-Control-Allow-Origin', origin);
      headers.append('Vary', 'Origin');
    }
  }
  headers.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  headers.set('Access-Control-Allow-Credentials', 'true');
}

export function createCloudflareRouter(service: AuthService, opts: RelayRouterOptions = {}): FetchHandler {
  const notFound = () => new Response('Not Found', { status: 404 });

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
          const res = json({ success: false, error: 'invalid_body' }, { status: 400 });
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
          const res = json({ success: false, error: 'Missing or invalid new_account_id' }, { status: 400 });
          withCors(res.headers, opts, request);
          return res;
        }
        if (!new_public_key) {
          const res = json({ success: false, error: 'Missing or invalid new_public_key' }, { status: 400 });
          withCors(res.headers, opts, request);
          return res;
        }
        if (!vrf_data) {
          const res = json({ success: false, error: 'Missing or invalid vrf_data' }, { status: 400 });
          withCors(res.headers, opts, request);
          return res;
        }
        if (!webauthn_registration) {
          const res = json({ success: false, error: 'Missing or invalid webauthn_registration' }, { status: 400 });
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
          const res = json({ error: 'shamir_disabled', message: 'Shamir 3-pass is not configured on this server' }, { status: 503 });
          withCors(res.headers, opts, request);
          return res;
        }
        let body: unknown; try { body = await request.json(); } catch { body = null; }
        const valid = isObject(body) && typeof body.kek_c_b64u === 'string' && body.kek_c_b64u.length > 0;
        if (!valid) {
          const res = json({ error: 'invalid_body' }, { status: 400 });
          withCors(res.headers, opts, request);
          return res;
        }
        const out = await service.handleApplyServerLock({ body: { kek_c_b64u: String((body as Record<string, unknown>).kek_c_b64u) } });
        return toResponse(out);
      }

      if (method === 'POST' && pathname === '/vrf/remove-server-lock') {
        if (!(await service.ensureShamirReady())) {
          const res = json({ error: 'shamir_disabled', message: 'Shamir 3-pass is not configured on this server' }, { status: 503 });
          withCors(res.headers, opts, request);
          return res;
        }
        let body: unknown; try { body = await request.json(); } catch { body = null; }
        const valid = isObject(body)
          && typeof body.kek_cs_b64u === 'string' && body.kek_cs_b64u.length > 0
          && typeof (body as Record<string, unknown>).keyId === 'string'
          && String((body as Record<string, unknown>).keyId).length > 0;
        if (!valid) {
          const res = json({ error: 'invalid_body' }, { status: 400 });
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
          const res = json({ error: 'shamir_disabled', message: 'Shamir 3-pass is not configured on this server' }, { status: 503 });
          withCors(res.headers, opts, request);
          return res;
        }
        const out = await service.handleGetShamirKeyInfo();
        return toResponse(out);
      }

      if (opts.healthz && method === 'GET' && pathname === '/healthz') {
        try {
          const { currentKeyId } = JSON.parse((await service.handleGetShamirKeyInfo()).body) as { currentKeyId?: string };
          const res = json({ ok: true, currentKeyId: currentKeyId || null }, { status: 200 });
          withCors(res.headers, opts, request);
          return res;
        } catch {
          const res = json({ ok: true }, { status: 200 });
          withCors(res.headers, opts, request);
          return res;
        }
      }

      return notFound();
    } catch (e: unknown) {
      const res = json({ error: 'internal', details: e instanceof Error ? e.message : String(e) }, { status: 500 });
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
