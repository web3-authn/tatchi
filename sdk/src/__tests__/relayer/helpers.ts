import type { Server } from 'node:http';
import http from 'node:http';
import expressImport from 'express';
import type { AuthService } from '../../server/core/AuthService';
import type { SessionAdapter } from '../../server/router/express-adaptor';
import type { CfEnv, CfExecutionContext } from '../../server/router/cloudflare-adaptor';

type ExpressMiddleware = (req: unknown, res: unknown, next: (err?: unknown) => void) => unknown;
type ExpressAppLike = ((req: unknown, res: unknown) => unknown) & {
  use: (...args: unknown[]) => unknown;
};

// In TS `moduleResolution: bundler`, CommonJS packages like `express` can type as a
// namespace object (non-callable). Normalize to a callable factory for tests.
type ExpressLike = { (): ExpressAppLike; json: (options?: unknown) => ExpressMiddleware };

const express: ExpressLike = (() => {
  const maybeDefault = (expressImport as unknown as { default?: unknown }).default;
  if (typeof maybeDefault === 'function') return maybeDefault as ExpressLike;
  return expressImport as unknown as ExpressLike;
})();

export async function startExpressRouter(router: unknown): Promise<{
  baseUrl: string;
  close: () => Promise<void>;
}> {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use(router);

  const server: Server = http.createServer(app);

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Failed to bind express test server');
  }

  const baseUrl = `http://127.0.0.1:${address.port}`;

  return {
    baseUrl,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

export async function fetchJson(
  url: string,
  init?: RequestInit
): Promise<{ status: number; headers: Headers; json: Record<string, unknown> | null; text: string }> {
  const res = await fetch(url, init);
  const text = await res.text();
  let json: Record<string, unknown> | null = null;
  try {
    const parsed: unknown = text ? JSON.parse(text) : null;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      json = parsed as Record<string, unknown>;
    } else {
      json = null;
    }
  } catch {
    json = null;
  }
  return { status: res.status, headers: res.headers, json, text };
}

export function makeCfCtx(): {
  ctx: CfExecutionContext;
  waited: Array<Promise<unknown>>;
} {
  const waited: Array<Promise<unknown>> = [];
  const ctx: CfExecutionContext = {
    waitUntil(p: Promise<unknown>) {
      waited.push(p);
    },
    passThroughOnException() { },
  };
  return { ctx, waited };
}

export async function callCf(
  handler: (request: Request, env?: CfEnv, ctx?: CfExecutionContext) => Promise<Response>,
  input: {
    method: string;
    path: string;
    origin?: string;
    headers?: Record<string, string>;
    body?: unknown;
    env?: CfEnv;
    ctx?: CfExecutionContext;
  }
): Promise<{ status: number; headers: Headers; json: Record<string, unknown> | null; text: string }> {
  const url = new URL(input.path, 'https://relay.test');
  const headers = new Headers(input.headers || {});
  if (input.origin) headers.set('Origin', input.origin);
  let body: string | undefined;
  if (input.body !== undefined) {
    headers.set('Content-Type', headers.get('Content-Type') || 'application/json');
    body = typeof input.body === 'string' ? input.body : JSON.stringify(input.body);
  }

  const req = new Request(url.toString(), {
    method: input.method,
    headers,
    body,
  });

  const res = await handler(req, input.env, input.ctx);
  const text = await res.text();
  let json: Record<string, unknown> | null = null;
  try {
    const parsed: unknown = text ? JSON.parse(text) : null;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      json = parsed as Record<string, unknown>;
    } else {
      json = null;
    }
  } catch {
    json = null;
  }
  return { status: res.status, headers: res.headers, json, text };
}

export function getPath(
  json: Record<string, unknown> | null,
  ...path: Array<string | number>
): unknown {
  let cursor: unknown = json;
  for (const key of path) {
    if (typeof key === 'number') {
      if (!Array.isArray(cursor)) return undefined;
      cursor = cursor[key];
      continue;
    }
    if (!cursor || typeof cursor !== 'object') return undefined;
    cursor = (cursor as Record<string, unknown>)[key];
  }
  return cursor;
}

export function makeSessionAdapter(overrides: Partial<SessionAdapter> = {}): SessionAdapter {
  const adapter: SessionAdapter = {
    signJwt: overrides.signJwt || (async (sub: string) => `jwt-for:${sub}`),
    parse: overrides.parse || (async () => ({ ok: false } as const)),
    buildSetCookie: overrides.buildSetCookie || ((token: string) => `w3a_session=${token}; Path=/; HttpOnly; Secure; SameSite=Lax`),
    buildClearCookie: overrides.buildClearCookie || (() => `w3a_session=; Path=/; Max-Age=0`),
    refresh: overrides.refresh || (async () => ({ ok: false, code: 'not_eligible', message: 'not eligible' })),
  };
  return adapter;
}

export type ShamirServiceStub = {
  hasShamir(): boolean;
  ensureReady(): Promise<boolean>;
  getCurrentShamirKeyId(): string | null;
  getGraceKeyIds(): string[];
  hasGraceKey(keyId: string): boolean;
  getShamirConfig(): { shamir_p_b64u?: string } | undefined;
  applyServerLock(kek_c_b64u: string): Promise<unknown>;
  removeServerLock(kek_cs_b64u: string): Promise<unknown>;
  removeGraceServerLockWithKey(keyId: string, request: unknown): Promise<unknown>;
};

export function makeShamirServiceStub(overrides: Partial<ShamirServiceStub> = {}): ShamirServiceStub {
  const currentKeyId = overrides.getCurrentShamirKeyId?.() ?? 'current-key';
  const graceKeyIds = overrides.getGraceKeyIds?.() ?? ['grace-1'];

  return {
    hasShamir: overrides.hasShamir || (() => true),
    ensureReady: overrides.ensureReady || (async () => true),
    getCurrentShamirKeyId: overrides.getCurrentShamirKeyId || (() => currentKeyId),
    getGraceKeyIds: overrides.getGraceKeyIds || (() => graceKeyIds),
    hasGraceKey: overrides.hasGraceKey || ((id: string) => graceKeyIds.includes(id)),
    getShamirConfig: overrides.getShamirConfig || (() => ({ shamir_p_b64u: 'p_b64u' })),
    applyServerLock: overrides.applyServerLock || (async () => ({ ok: true, kek_cs_b64u: 'locked' })),
    removeServerLock: overrides.removeServerLock || (async () => ({ ok: true, removed: true })),
    removeGraceServerLockWithKey: overrides.removeGraceServerLockWithKey || (async () => ({ ok: true, removed: true, key: 'grace' })),
  };
}

export function makeFakeAuthService(overrides: Partial<{
  verifyAuthenticationResponse: AuthService['verifyAuthenticationResponse'];
  createAccountAndRegisterUser: AuthService['createAccountAndRegisterUser'];
  getRorOrigins: AuthService['getRorOrigins'];
  getThresholdSigningService: AuthService['getThresholdSigningService'];
  shamirService: unknown;
  emailRecovery: unknown;
}> = {}): AuthService {
  const service = {
    verifyAuthenticationResponse: overrides.verifyAuthenticationResponse
      || (async () => ({ success: false, verified: false, message: 'not implemented' })),
    createAccountAndRegisterUser: overrides.createAccountAndRegisterUser
      || (async () => ({ success: false, error: 'not implemented' })),
    getRorOrigins: overrides.getRorOrigins || (async () => []),
    getThresholdSigningService: overrides.getThresholdSigningService || (() => null),
    shamirService: overrides.shamirService ?? null,
    emailRecovery: overrides.emailRecovery ?? null,
  };
  return service as unknown as AuthService;
}
