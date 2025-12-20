import type { Server } from 'node:http';
import http from 'node:http';
import express from 'express';

export async function startExpressRouter(router: any): Promise<{
  baseUrl: string;
  close: () => Promise<void>;
}> {
  const app = express();
  app.use(express.json({ limit: '2mb' }));
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
): Promise<{ status: number; headers: Headers; json: any; text: string }> {
  const res = await fetch(url, init);
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: res.status, headers: res.headers, json, text };
}

export function makeCfCtx(): { ctx: any; waited: Array<Promise<unknown>> } {
  const waited: Array<Promise<unknown>> = [];
  const ctx = {
    waitUntil(p: Promise<unknown>) {
      waited.push(p);
    },
    passThroughOnException() { },
  };
  return { ctx, waited };
}

export async function callCf(
  handler: (request: Request, env?: any, ctx?: any) => Promise<Response>,
  input: {
    method: string;
    path: string;
    origin?: string;
    headers?: Record<string, string>;
    body?: any;
    env?: any;
    ctx?: any;
  }
): Promise<{ status: number; headers: Headers; json: any; text: string }> {
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
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: res.status, headers: res.headers, json, text };
}

export function makeSessionAdapter(overrides?: Partial<{
  signJwt: (sub: string, extra?: Record<string, unknown>) => Promise<string>;
  parse: (headers: Record<string, string>) => Promise<{ ok: boolean; claims?: any }>;
  buildSetCookie: (token: string) => string;
  buildClearCookie: () => string;
  refresh: (headers: Record<string, string>) => Promise<{ ok: boolean; jwt?: string; code?: string; message?: string }>;
}>): any {
  return {
    signJwt: overrides?.signJwt || (async (sub: string) => `jwt-for:${sub}`),
    parse: overrides?.parse || (async () => ({ ok: false })),
    buildSetCookie: overrides?.buildSetCookie || ((token: string) => `w3a_session=${token}; Path=/; HttpOnly; Secure; SameSite=Lax`),
    buildClearCookie: overrides?.buildClearCookie || (() => `w3a_session=; Path=/; Max-Age=0`),
    refresh: overrides?.refresh || (async () => ({ ok: false, code: 'not_eligible', message: 'not eligible' })),
  };
}

export function makeShamirServiceStub(overrides?: Partial<{
  hasShamir: () => boolean;
  ensureReady: () => Promise<boolean>;
  getCurrentShamirKeyId: () => string | null;
  getGraceKeyIds: () => string[];
  hasGraceKey: (keyId: string) => boolean;
  getShamirConfig: () => { shamir_p_b64u?: string } | undefined;
  applyServerLock: (kek_c_b64u: string) => Promise<any>;
  removeServerLock: (kek_cs_b64u: string) => Promise<any>;
  removeGraceServerLockWithKey: (keyId: string, request: any) => Promise<any>;
}>): any {
  const currentKeyId = overrides?.getCurrentShamirKeyId?.() ?? 'current-key';
  const graceKeyIds = overrides?.getGraceKeyIds?.() ?? ['grace-1'];
  return {
    hasShamir: overrides?.hasShamir || (() => true),
    ensureReady: overrides?.ensureReady || (async () => true),
    getCurrentShamirKeyId: overrides?.getCurrentShamirKeyId || (() => currentKeyId),
    getGraceKeyIds: overrides?.getGraceKeyIds || (() => graceKeyIds),
    hasGraceKey: overrides?.hasGraceKey || ((id: string) => graceKeyIds.includes(id)),
    getShamirConfig: overrides?.getShamirConfig || (() => ({ shamir_p_b64u: 'p_b64u' })),
    applyServerLock: overrides?.applyServerLock || (async () => ({ ok: true, kek_cs_b64u: 'locked' })),
    removeServerLock: overrides?.removeServerLock || (async () => ({ ok: true, removed: true })),
    removeGraceServerLockWithKey: overrides?.removeGraceServerLockWithKey || (async () => ({ ok: true, removed: true, key: 'grace' })),
  };
}

export function makeFakeAuthService(overrides?: Partial<{
  verifyAuthenticationResponse: (body: any) => Promise<any>;
  createAccountAndRegisterUser: (body: any) => Promise<any>;
  getRorOrigins: (opts?: any) => Promise<string[]>;
  shamirService: any;
  emailRecovery: any;
}>): any {
  return {
    verifyAuthenticationResponse: overrides?.verifyAuthenticationResponse || (async () => ({ success: false, verified: false, message: 'not implemented' })),
    createAccountAndRegisterUser: overrides?.createAccountAndRegisterUser || (async () => ({ success: false, error: 'not implemented' })),
    getRorOrigins: overrides?.getRorOrigins || (async () => []),
    shamirService: overrides?.shamirService ?? null,
    emailRecovery: overrides?.emailRecovery ?? null,
  };
}

