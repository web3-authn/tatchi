import type { AuthService } from '../core/AuthService';
import {
  handleApplyServerLock,
  handleRemoveServerLock,
  handleGetShamirKeyInfo,
} from '../core/shamirHandlers';
import { buildCorsOrigins } from '../core/SessionService';
import type { SessionAdapter } from './express-adaptor';
import type { CreateAccountAndRegisterRequest } from '../core/types';
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
  // Optional: customize session route paths
  sessionRoutes?: { auth?: string; logout?: string };
  // Optional: pluggable session adapter
  session?: SessionAdapter | null;
  // Optional logger; defaults to silent.
  logger?: RouterLogger | null;
}

// Minimal Worker runtime types (avoid adding @cloudflare/workers-types dependency here)
export interface CfEnv {
  // Optional env overrides for `/.well-known/webauthn` (ROR origins list).
  //
  // Note: Do not add an index signature here. Cloudflare env bindings can include
  // KV namespaces, Durable Objects, etc., and requiring `[key: string]: string`
  // makes real-world `Env` types not assignable.
  ROR_CONTRACT_ID?: string;
  WEBAUTHN_CONTRACT_ID?: string;
  ROR_METHOD?: string;
}

/**
 * Convenience env shape matching the `examples/relay-cloudflare-worker` configuration.
 * This is optional — you can define your own `Env` type with different binding names.
 */
export interface RelayCloudflareWorkerEnv {
  RELAYER_ACCOUNT_ID: string;
  RELAYER_PRIVATE_KEY: string;
  // Optional overrides (SDK provides defaults when omitted)
  NEAR_RPC_URL?: string;
  NETWORK_ID?: string;
  WEBAUTHN_CONTRACT_ID: string;
  ACCOUNT_INITIAL_BALANCE?: string;
  CREATE_ACCOUNT_AND_REGISTER_GAS?: string;
  ZK_EMAIL_PROVER_BASE_URL?: string;
  ZK_EMAIL_PROVER_TIMEOUT_MS?: string;
  SHAMIR_P_B64U: string;
  SHAMIR_E_S_B64U: string;
  SHAMIR_D_S_B64U: string;
  EXPECTED_ORIGIN?: string;
  EXPECTED_WALLET_ORIGIN?: string;
  ENABLE_ROTATION?: string;
  RECOVER_EMAIL_RECIPIENT?: string;
}

export interface CfExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void
}
export interface CfScheduledEvent {
  scheduledTime?: number;
  cron?: string
}
export interface CfEmailMessage {
  from: string;
  to: string;
  // Cloudflare uses `Headers`, but keep this flexible for userland tests.
  headers: Headers | Iterable<[string, string]> | Record<string, string>;
  raw: ReadableStream | ArrayBuffer | string;
  rawSize?: number;
  setReject(reason: string): void;
}

export type FetchHandler = (request: Request, env?: CfEnv, ctx?: CfExecutionContext) => Promise<Response>;
export type ScheduledHandler = (event: CfScheduledEvent, env?: CfEnv, ctx?: CfExecutionContext) => Promise<void>;
export type EmailHandler = (message: CfEmailMessage, env?: CfEnv, ctx?: CfExecutionContext) => Promise<void>;

function normalizePath(path: string): string {
  const trimmed = String(path || '').trim();
  if (!trimmed) return '';
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

function json(body: unknown, init?: ResponseInit, extraHeaders?: Record<string, string>): Response {
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

function normalizeEmailAddress(input: string): string {
  const trimmed = String(input || '').trim();
  const angleStart = trimmed.indexOf('<');
  const angleEnd = trimmed.indexOf('>');
  if (angleStart !== -1 && angleEnd > angleStart) {
    return trimmed.slice(angleStart + 1, angleEnd).trim().toLowerCase();
  }
  return trimmed.toLowerCase();
}

function normalizeRejectReason(input: unknown): string {
  return String(input || '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function toLowercaseHeaderRecord(input: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!input) return out;

  const maybeHeaders = input as any;
  if (typeof maybeHeaders.forEach === 'function') {
    try {
      maybeHeaders.forEach((v: unknown, k: unknown) => {
        out[String(k).toLowerCase()] = String(v);
      });
      return out;
    } catch { }
  }

  if (typeof maybeHeaders[Symbol.iterator] === 'function') {
    try {
      for (const entry of maybeHeaders as Iterable<unknown>) {
        if (!Array.isArray(entry)) continue;
        const [k, v] = entry as any[];
        out[String(k).toLowerCase()] = String(v);
      }
      return out;
    } catch { }
  }

  if (typeof input === 'object') {
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      out[String(k).toLowerCase()] = String(v);
    }
  }

  return out;
}

async function buildForwardableEmailPayloadFromCloudflareMessage(message: CfEmailMessage): Promise<{
  from: string;
  to: string;
  headers: Record<string, string>;
  raw: string;
  rawSize?: number;
}> {
  const from = String(message?.from || '');
  const to = String(message?.to || '');
  const headers = toLowercaseHeaderRecord((message as any)?.headers);

  let raw = '';
  try {
    raw = await new Response((message as any)?.raw).text();
  } catch { }

  const rawSize = typeof (message as any)?.rawSize === 'number' ? (message as any).rawSize : undefined;

  return { from, to, headers, raw, rawSize };
}

export interface CloudflareEmailHandlerOptions {
  /**
   * Optional recipient allowlist for emails processed by this handler (case-insensitive).
   * If unset, any `to` is accepted.
   */
  expectedRecipient?: string;
  /**
   * If true (default), unexpected recipients only log a warning (Cloudflare routing
   * is usually already scoped). If false, the handler rejects the email.
   */
  allowUnexpectedRecipient?: boolean;
  /**
   * When true, logs email metadata (from/to/subject). Defaults to false.
   */
  verbose?: boolean;
  // Optional logger; defaults to silent.
  logger?: RouterLogger | null;
}

export function createCloudflareEmailHandler(service: AuthService, opts: CloudflareEmailHandlerOptions = {}): EmailHandler {
  const logger = normalizeRouterLogger(opts.logger);
  const expectedRecipient = normalizeEmailAddress(opts.expectedRecipient || '');
  const allowUnexpectedRecipient = opts.allowUnexpectedRecipient !== false;
  const verbose = Boolean(opts.verbose);

  return async (message: CfEmailMessage): Promise<void> => {
    try {
      const payload = await buildForwardableEmailPayloadFromCloudflareMessage(message);

      const to = normalizeEmailAddress(payload.to);
      if (expectedRecipient) {
        if (to !== expectedRecipient) {
          logger.warn('[email] unexpected recipient', { to, expectedRecipient });
          if (!allowUnexpectedRecipient) {
            message.setReject('Email recovery relayer rejected email: unexpected recipient');
            return;
          }
        }
      }

      if (verbose) {
        logger.info('[email] from/to', { from: payload.from, to: payload.to, subject: payload.headers['subject'] });
      }

      const parsed = parseRecoverEmailRequest(payload as any, { headers: payload.headers });
      if (!parsed.ok) {
        logger.warn('[email] rejecting', { code: parsed.code, message: parsed.message });
        message.setReject(`Email recovery relayer rejected email: ${parsed.message}`);
        return;
      }

      if (!service.emailRecovery) {
        logger.warn('[email] rejecting: EmailRecoveryService not configured');
        message.setReject('Email recovery relayer rejected email: email recovery service unavailable');
        return;
      }

      const result = await service.emailRecovery.requestEmailRecovery({
        accountId: parsed.accountId,
        emailBlob: parsed.emailBlob,
        explicitMode: parsed.explicitMode,
      });

      if (!result?.success) {
        logger.warn('[email] recovery failed', {
          accountId: parsed.accountId,
          error: result?.error || 'unknown',
          message: result?.message,
        });
        const reason = normalizeRejectReason(result?.message || result?.error || 'recovery failed');
        message.setReject(`Email recovery relayer rejected email: ${reason}`);
        return;
      }

      logger.info('[email] recovery submitted', { accountId: parsed.accountId });
    } catch (e: any) {
      logger.error('[email] internal error', { message: e?.message || String(e) });
      message.setReject('Email recovery relayer rejected email: internal error');
    }
  };
}

export function createCloudflareRouter(service: AuthService, opts: RelayRouterOptions = {}): FetchHandler {
  const notFound = () => new Response('Not Found', { status: 404 });
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

  return async function handler(request: Request, env?: CfEnv, ctx?: CfExecutionContext): Promise<Response> {
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

      // SignedDelegate meta-tx submission (optional)
      if (signedDelegatePath && pathname === signedDelegatePath) {
        if (method === 'OPTIONS') {
          const res = new Response(null, { status: 204 });
          withCors(res.headers, opts, request);
          return res;
        }
        if (method !== 'POST') return notFound();

        let body: unknown;
        try { body = await request.json(); } catch { body = null; }
        const valid = isObject(body) && typeof (body as any).hash === 'string' && Boolean((body as any).hash) && Boolean((body as any).signedDelegate);
        if (!valid) {
          const res = json({ ok: false, code: 'invalid_body', message: 'Expected { hash, signedDelegate }' }, { status: 400 });
          withCors(res.headers, opts, request);
          return res;
        }

        const result = await service.executeSignedDelegate({
          hash: String((body as any).hash),
          signedDelegate: (body as any).signedDelegate,
          policy: signedDelegatePolicy,
        });

        if (!result || !result.ok) {
          const res = json({
            ok: false,
            code: result?.code || 'delegate_execution_failed',
            message: result?.error || 'Failed to execute delegate action',
          }, { status: 400 });
          withCors(res.headers, opts, request);
          return res;
        }

        const res = json({
          ok: true,
          relayerTxHash: result.transactionHash || null,
          status: 'submitted',
          outcome: result.outcome ?? null,
        }, { status: 200 });
        withCors(res.headers, opts, request);
        return res;
      }

      if (method === 'POST' && pathname === '/vrf/apply-server-lock') {
        const shamir = service.shamirService;
        if (!shamir || !(await shamir.ensureReady())) {
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
        const out = await handleApplyServerLock(shamir, {
          body: { kek_c_b64u: String((body as Record<string, unknown>).kek_c_b64u) },
        });
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
              logger.info(`[relay] creating ${sessionKind === 'cookie' ? 'HttpOnly session' : 'JWT'} for`, userId);
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

      if (method === 'POST' && pathname === '/recover-email') {
        const prefer = String(request.headers.get('prefer') || '').toLowerCase();
        const respondAsync =
          prefer.includes('respond-async') ||
          String(url.searchParams.get('async') || '').trim() === '1' ||
          String(url.searchParams.get('respond_async') || '').trim() === '1';

        let rawBody: unknown; try { rawBody = await request.json(); } catch { rawBody = null; }
        const parsed = parseRecoverEmailRequest(rawBody, { headers: request.headers });
        if (!parsed.ok) {
          const res = json({ code: parsed.code, message: parsed.message }, { status: parsed.status });
          withCors(res.headers, opts, request);
          return res;
        }
        const { accountId, emailBlob, explicitMode } = parsed;

        if (!service.emailRecovery) {
          const res = json(
            { code: 'email_recovery_unavailable', message: 'EmailRecoveryService is not configured on this server' },
            { status: 503 }
          );
          withCors(res.headers, opts, request);
          return res;
        }

        if (respondAsync && ctx && typeof ctx.waitUntil === 'function') {
          ctx.waitUntil(
            service.emailRecovery
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
              })
          );
          const res = json({ success: true, queued: true, accountId }, { status: 202 });
          withCors(res.headers, opts, request);
          return res;
        }

        const result = await service.emailRecovery.requestEmailRecovery({ accountId, emailBlob, explicitMode });
        const res = json(result, { status: result.success ? 202 : 400 });
        withCors(res.headers, opts, request);
        return res;
      }

      if (method === 'POST' && pathname === '/vrf/remove-server-lock') {
        const shamir = service.shamirService;
        if (!shamir || !(await shamir.ensureReady())) {
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
        const out = await handleRemoveServerLock(shamir, {
          body: {
            kek_cs_b64u: String((body as Record<string, unknown>).kek_cs_b64u),
            keyId: String((body as Record<string, unknown>).keyId),
          },
        });
        return toResponse(out);
      }

      if (method === 'GET' && pathname === '/shamir/key-info') {
        const shamir = service.shamirService;
        if (!shamir || !(await shamir.ensureReady())) {
          const res = json({ code: 'shamir_disabled', message: 'Shamir 3-pass is not configured on this server' }, { status: 503 });
          withCors(res.headers, opts, request);
          return res;
        }
        const out = await handleGetShamirKeyInfo(shamir);
        return toResponse(out);
      }

      if (opts.healthz && method === 'GET' && pathname === '/healthz') {
        // Surface simple CORS info for diagnostics (normalized)
        const allowed = buildCorsOrigins(...(opts.corsOrigins || []));
        const corsAllowed = allowed === '*' ? '*' : allowed;
        const shamir = service.shamirService;
        const shamirConfigured = Boolean(shamir && shamir.hasShamir());
        let currentKeyId: string | null = null;
        if (shamirConfigured && shamir) {
          try {
            const { currentKeyId: id } = JSON.parse((await handleGetShamirKeyInfo(shamir)).body) as { currentKeyId?: string };
            currentKeyId = id || null;
          } catch {}
        }

        const proverBaseUrl = service.emailRecovery?.getZkEmailProverBaseUrl?.() ?? null;
        const zkEmailConfigured = Boolean(proverBaseUrl);

        const res = json({
          ok: true,
          // Backwards-compatible field (was previously top-level).
          currentKeyId,
          shamir: { configured: shamirConfigured, currentKeyId },
          zkEmail: { configured: zkEmailConfigured, proverBaseUrl },
          cors: { allowedOrigins: corsAllowed },
        }, { status: 200 });
        withCors(res.headers, opts, request);
        return res;
      }

      if (opts.readyz && method === 'GET' && pathname === '/readyz') {
        const allowed = buildCorsOrigins(...(opts.corsOrigins || []));
        const corsAllowed = allowed === '*' ? '*' : allowed;

        const shamir = service.shamirService;
        const shamirConfigured = Boolean(shamir && shamir.hasShamir());

        let shamirReady: boolean | null = null;
        let shamirCurrentKeyId: string | null = null;
        let shamirError: string | undefined;
        if (shamirConfigured && shamir) {
          try {
            await shamir.ensureReady();
            shamirReady = true;
            const { currentKeyId } = JSON.parse((await handleGetShamirKeyInfo(shamir)).body) as { currentKeyId?: string };
            shamirCurrentKeyId = currentKeyId || null;
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

        const res = json({
          ok,
          shamir: {
            configured: shamirConfigured,
            ready: shamirConfigured ? shamirReady : null,
            currentKeyId: shamirCurrentKeyId,
            error: shamirError,
          },
          zkEmail: zk,
          cors: { allowedOrigins: corsAllowed },
        }, { status: ok ? 200 : 503 });
        withCors(res.headers, opts, request);
        return res;
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
  // Optional logger; defaults to silent.
  logger?: RouterLogger | null;
}

export function createCloudflareCron(service: AuthService, opts: CloudflareCronOptions = {}): ScheduledHandler {
  const logger = normalizeRouterLogger(opts.logger);
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
        const shamir = service.shamirService;
        if (!shamir) {
          logger.warn('[cloudflare-cron] Shamir not configured; skipping rotation');
        } else {
          const rotation = await shamir.rotateShamirServerKeypair();
          logger.info('[cloudflare-cron] rotated key', rotation.newKeyId, 'graceIds:', rotation.graceKeyIds);
        }
      } else {
        logger.info('[cloudflare-cron] enabled but rotate=false (no action)');
      }
    } catch (e: unknown) {
      logger.error('[cloudflare-cron] failed', e instanceof Error ? e.message : String(e));
    }
  };
}
