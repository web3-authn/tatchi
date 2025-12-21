import { test, expect } from '@playwright/test';
import { createCloudflareRouter } from '../../server/router/cloudflare-adaptor';
import { callCf, makeCfCtx, makeFakeAuthService, makeSessionAdapter, makeShamirServiceStub } from './helpers';

function validVerifyBody(overrides?: Partial<any>): any {
  return {
    sessionKind: 'jwt',
    vrf_data: { user_id: 'bob.testnet', rp_id: 'example.localhost', block_height: 123, ...(overrides?.vrf_data || {}) },
    webauthn_authentication: { ok: true, ...(overrides?.webauthn_authentication || {}) },
    ...overrides,
  };
}

test.describe('relayer router (cloudflare) – P0', () => {
  test('CORS preflight: allowlist echoes Origin + allows credentials', async () => {
    const service = makeFakeAuthService();
    const handler = createCloudflareRouter(service, { corsOrigins: ['https://example.localhost'] });

    const res = await callCf(handler, {
      method: 'OPTIONS',
      path: '/verify-authentication-response',
      origin: 'https://example.localhost',
    });

    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe('https://example.localhost');
    expect(res.headers.get('access-control-allow-credentials')).toBe('true');
    expect(res.headers.get('access-control-allow-methods')).toContain('OPTIONS');
    expect(res.headers.get('access-control-allow-headers')).toContain('Authorization');
    expect(res.headers.get('vary')).toContain('Origin');
  });

  test('CORS preflight: "*" allows origin but not credentials', async () => {
    const service = makeFakeAuthService();
    const handler = createCloudflareRouter(service, { corsOrigins: [] });

    const res = await callCf(handler, {
      method: 'OPTIONS',
      path: '/verify-authentication-response',
      origin: 'https://example.localhost',
    });

    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    expect(res.headers.get('access-control-allow-credentials')).toBe(null);
  });

  test('POST /verify-authentication-response: invalid body', async () => {
    const service = makeFakeAuthService();
    const handler = createCloudflareRouter(service, { corsOrigins: ['https://example.localhost'] });

    const res = await callCf(handler, {
      method: 'POST',
      path: '/verify-authentication-response',
      origin: 'https://example.localhost',
      body: {},
    });

    expect(res.status).toBe(400);
    expect(res.json?.code).toBe('invalid_body');
  });

  test('POST /verify-authentication-response: not verified maps to { code: not_verified }', async () => {
    const service = makeFakeAuthService({
      verifyAuthenticationResponse: async () => ({ success: false, verified: false, message: 'nope' }),
    });
    const handler = createCloudflareRouter(service, { corsOrigins: ['https://example.localhost'] });

    const res = await callCf(handler, {
      method: 'POST',
      path: '/verify-authentication-response',
      origin: 'https://example.localhost',
      body: validVerifyBody(),
    });

    expect(res.status).toBe(400);
    expect(res.json).toEqual({ code: 'not_verified', message: 'nope' });
  });

  test('POST /verify-authentication-response: verified + sessionKind=jwt returns jwt', async () => {
    const session = makeSessionAdapter({ signJwt: async () => 'jwt-123' });
    const service = makeFakeAuthService({
      verifyAuthenticationResponse: async () => ({ success: true, verified: true, sessionCredential: { userId: 'bob.testnet' } }),
    });
    const handler = createCloudflareRouter(service, { corsOrigins: ['https://example.localhost'], session });

    const res = await callCf(handler, {
      method: 'POST',
      path: '/verify-authentication-response',
      origin: 'https://example.localhost',
      body: validVerifyBody({ sessionKind: 'jwt' }),
    });

    expect(res.status).toBe(200);
    expect(res.json?.jwt).toBe('jwt-123');
  });

  test('POST /verify-authentication-response: verified + sessionKind=cookie sets Set-Cookie and does not include jwt', async () => {
    const session = makeSessionAdapter({
      signJwt: async () => 'cookie-456',
      buildSetCookie: (t) => `w3a_session=${t}; Path=/; HttpOnly`,
    });
    const service = makeFakeAuthService({
      verifyAuthenticationResponse: async () => ({ success: true, verified: true, sessionCredential: { userId: 'bob.testnet' } }),
    });
    const handler = createCloudflareRouter(service, { corsOrigins: ['https://example.localhost'], session });

    const res = await callCf(handler, {
      method: 'POST',
      path: '/verify-authentication-response',
      origin: 'https://example.localhost',
      body: validVerifyBody({ sessionKind: 'cookie' }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('set-cookie')).toContain('w3a_session=cookie-456');
    expect(res.json?.jwt).toBeUndefined();
  });

  test('POST /verify-authentication-response: session failures are best-effort (still 200)', async () => {
    const session = makeSessionAdapter({
      signJwt: async () => { throw new Error('boom'); },
    });
    const service = makeFakeAuthService({
      verifyAuthenticationResponse: async () => ({ success: true, verified: true, sessionCredential: { userId: 'bob.testnet' } }),
    });
    const handler = createCloudflareRouter(service, { corsOrigins: ['https://example.localhost'], session });

    const res = await callCf(handler, {
      method: 'POST',
      path: '/verify-authentication-response',
      origin: 'https://example.localhost',
      body: validVerifyBody({ sessionKind: 'jwt' }),
    });

    expect(res.status).toBe(200);
    expect(res.json?.verified).toBe(true);
    expect(res.json?.jwt).toBeUndefined();
  });

  test('GET /session/auth: sessions disabled -> 501', async () => {
    const service = makeFakeAuthService();
    const handler = createCloudflareRouter(service, { corsOrigins: ['https://example.localhost'] });

    const res = await callCf(handler, {
      method: 'GET',
      path: '/session/auth',
      origin: 'https://example.localhost',
    });

    expect(res.status).toBe(501);
    expect(res.json?.code).toBe('sessions_disabled');
    expect(res.json?.authenticated).toBe(false);
  });

  test('GET /session/auth: invalid session -> 401', async () => {
    const session = makeSessionAdapter({ parse: async () => ({ ok: false }) });
    const service = makeFakeAuthService();
    const handler = createCloudflareRouter(service, { corsOrigins: ['https://example.localhost'], session });

    const res = await callCf(handler, { method: 'GET', path: '/session/auth', origin: 'https://example.localhost' });

    expect(res.status).toBe(401);
    expect(res.json?.authenticated).toBe(false);
  });

  test('POST /session/refresh: unauthorized maps to 401', async () => {
    const session = makeSessionAdapter({ refresh: async () => ({ ok: false, code: 'unauthorized', message: 'no token' }) });
    const service = makeFakeAuthService();
    const handler = createCloudflareRouter(service, { corsOrigins: ['https://example.localhost'], session });

    const res = await callCf(handler, {
      method: 'POST',
      path: '/session/refresh',
      origin: 'https://example.localhost',
      body: { sessionKind: 'jwt' },
    });

    expect(res.status).toBe(401);
    expect(res.json?.code).toBe('unauthorized');
  });

  test('POST /session/logout: sets clear cookie when sessions enabled', async () => {
    const session = makeSessionAdapter({
      buildClearCookie: () => 'w3a_session=; Path=/; Max-Age=0',
    });
    const service = makeFakeAuthService();
    const handler = createCloudflareRouter(service, { corsOrigins: ['https://example.localhost'], session });

    const res = await callCf(handler, {
      method: 'POST',
      path: '/session/logout',
      origin: 'https://example.localhost',
    });

    expect(res.status).toBe(200);
    expect(res.json?.success).toBe(true);
    expect(res.headers.get('set-cookie')).toContain('Max-Age=0');
  });

  test('POST /recover-email: async mode uses ctx.waitUntil and returns 202 queued', async () => {
    const { ctx, waited } = makeCfCtx();
    const emailRecovery = {
      requestEmailRecovery: async () => ({ success: true, transactionHash: 'tx' }),
    };
    const service = makeFakeAuthService({ emailRecovery });
    const handler = createCloudflareRouter(service, { corsOrigins: ['https://example.localhost'] });

    const res = await callCf(handler, {
      method: 'POST',
      path: '/recover-email?async=1',
      origin: 'https://example.localhost',
      body: {
        from: 'sender@example.com',
        to: 'recover@web3authn.org',
        headers: { Subject: 'recover-ABC123 bob.testnet ed25519:pk' },
        raw: 'Subject: recover-ABC123 bob.testnet ed25519:pk\r\n\r\nzk-email',
        rawSize: 1,
      },
      ctx,
    });

    expect(res.status).toBe(202);
    expect(res.json?.queued).toBe(true);
    expect(waited.length).toBe(1);
  });

  test('POST /vrf/remove-server-lock: unknown keyId -> 400', async () => {
    const shamirService = makeShamirServiceStub({
      getCurrentShamirKeyId: () => 'current-key',
      getGraceKeyIds: () => [],
    });
    const service = makeFakeAuthService({ shamirService });
    const handler = createCloudflareRouter(service, { corsOrigins: ['https://example.localhost'] });

    const res = await callCf(handler, {
      method: 'POST',
      path: '/vrf/remove-server-lock',
      origin: 'https://example.localhost',
      body: { kek_cs_b64u: 'abc', keyId: 'nonexistent' },
    });

    expect(res.status).toBe(400);
    expect(res.json?.error || res.json?.code).toBeTruthy();
  });
});
