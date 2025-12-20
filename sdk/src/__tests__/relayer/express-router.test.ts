import { test, expect } from '@playwright/test';
import { createRelayRouter } from '../../server/router/express-adaptor';
import { fetchJson, makeFakeAuthService, makeSessionAdapter, startExpressRouter } from './helpers';

function validVerifyBody(overrides?: Partial<any>): any {
  return {
    sessionKind: 'jwt',
    vrf_data: { user_id: 'bob.testnet', rp_id: 'example.localhost', block_height: 123, ...(overrides?.vrf_data || {}) },
    webauthn_authentication: { ok: true, ...(overrides?.webauthn_authentication || {}) },
    ...overrides,
  };
}

test.describe('relayer router (express) – P0', () => {
  test('POST /verify-authentication-response: invalid body', async () => {
    const service = makeFakeAuthService();
    const router = createRelayRouter(service, {});
    const srv = await startExpressRouter(router);
    try {
      const res = await fetchJson(`${srv.baseUrl}/verify-authentication-response`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
      expect(res.json?.code).toBe('invalid_body');
    } finally {
      await srv.close();
    }
  });

  test('POST /verify-authentication-response: not verified maps to { code: not_verified }', async () => {
    const service = makeFakeAuthService({
      verifyAuthenticationResponse: async () => ({ success: false, verified: false, message: 'nope' }),
    });
    const router = createRelayRouter(service, {});
    const srv = await startExpressRouter(router);
    try {
      const res = await fetchJson(`${srv.baseUrl}/verify-authentication-response`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validVerifyBody()),
      });
      expect(res.status).toBe(400);
      expect(res.json).toEqual({ code: 'not_verified', message: 'nope' });
    } finally {
      await srv.close();
    }
  });

  test('POST /verify-authentication-response: verified + sessionKind=jwt returns jwt', async () => {
    const session = makeSessionAdapter({ signJwt: async () => 'jwt-123' });
    const service = makeFakeAuthService({
      verifyAuthenticationResponse: async () => ({ success: true, verified: true, sessionCredential: { userId: 'bob.testnet' } }),
    });
    const router = createRelayRouter(service, { session });
    const srv = await startExpressRouter(router);
    try {
      const res = await fetchJson(`${srv.baseUrl}/verify-authentication-response`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validVerifyBody({ sessionKind: 'jwt' })),
      });
      expect(res.status).toBe(200);
      expect(res.json?.jwt).toBe('jwt-123');
    } finally {
      await srv.close();
    }
  });

  test('POST /verify-authentication-response: verified + sessionKind=cookie sets Set-Cookie and omits jwt', async () => {
    const session = makeSessionAdapter({
      signJwt: async () => 'cookie-456',
      buildSetCookie: (t) => `w3a_session=${t}; Path=/; HttpOnly`,
    });
    const service = makeFakeAuthService({
      verifyAuthenticationResponse: async () => ({ success: true, verified: true, sessionCredential: { userId: 'bob.testnet' } }),
    });
    const router = createRelayRouter(service, { session });
    const srv = await startExpressRouter(router);
    try {
      const res = await fetchJson(`${srv.baseUrl}/verify-authentication-response`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validVerifyBody({ sessionKind: 'cookie' })),
      });
      expect(res.status).toBe(200);
      expect(res.headers.get('set-cookie')).toContain('w3a_session=cookie-456');
      expect(res.json?.jwt).toBeUndefined();
    } finally {
      await srv.close();
    }
  });

  test('POST /verify-authentication-response: session issuance failures are best-effort', async () => {
    const session = makeSessionAdapter({
      signJwt: async () => { throw new Error('boom'); },
    });
    const service = makeFakeAuthService({
      verifyAuthenticationResponse: async () => ({ success: true, verified: true, sessionCredential: { userId: 'bob.testnet' } }),
    });
    const router = createRelayRouter(service, { session });
    const srv = await startExpressRouter(router);
    try {
      const res = await fetchJson(`${srv.baseUrl}/verify-authentication-response`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validVerifyBody({ sessionKind: 'jwt' })),
      });
      expect(res.status).toBe(200);
      expect(res.json?.verified).toBe(true);
      expect(res.json?.jwt).toBeUndefined();
    } finally {
      await srv.close();
    }
  });

  test('GET /session/auth: sessions disabled -> 501', async () => {
    const service = makeFakeAuthService();
    const router = createRelayRouter(service, {});
    const srv = await startExpressRouter(router);
    try {
      const res = await fetchJson(`${srv.baseUrl}/session/auth`, { method: 'GET' });
      expect(res.status).toBe(501);
      expect(res.json?.code).toBe('sessions_disabled');
      expect(res.json?.authenticated).toBe(false);
    } finally {
      await srv.close();
    }
  });

  test('GET /session/auth: valid session -> 200 with claims', async () => {
    const session = makeSessionAdapter({
      parse: async () => ({ ok: true, claims: { sub: 'bob.testnet' } }),
    });
    const service = makeFakeAuthService();
    const router = createRelayRouter(service, { session });
    const srv = await startExpressRouter(router);
    try {
      const res = await fetchJson(`${srv.baseUrl}/session/auth`, { method: 'GET' });
      expect(res.status).toBe(200);
      expect(res.json?.authenticated).toBe(true);
      expect(res.json?.claims?.sub).toBe('bob.testnet');
    } finally {
      await srv.close();
    }
  });

  test('POST /session/refresh: cookie session sets Set-Cookie and returns { ok: true }', async () => {
    const session = makeSessionAdapter({
      refresh: async () => ({ ok: true, jwt: 'refreshed-999' }),
      buildSetCookie: (t) => `w3a_session=${t}; Path=/; HttpOnly`,
    });
    const service = makeFakeAuthService();
    const router = createRelayRouter(service, { session });
    const srv = await startExpressRouter(router);
    try {
      const res = await fetchJson(`${srv.baseUrl}/session/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionKind: 'cookie' }),
      });
      expect(res.status).toBe(200);
      expect(res.headers.get('set-cookie')).toContain('w3a_session=refreshed-999');
      expect(res.json?.ok).toBe(true);
      expect(res.json?.jwt).toBeUndefined();
    } finally {
      await srv.close();
    }
  });

  test('POST /session/refresh: unauthorized maps to 401', async () => {
    const session = makeSessionAdapter({
      refresh: async () => ({ ok: false, code: 'unauthorized', message: 'no token' }),
    });
    const service = makeFakeAuthService();
    const router = createRelayRouter(service, { session });
    const srv = await startExpressRouter(router);
    try {
      const res = await fetchJson(`${srv.baseUrl}/session/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionKind: 'jwt' }),
      });
      expect(res.status).toBe(401);
      expect(res.json?.code).toBe('unauthorized');
    } finally {
      await srv.close();
    }
  });

  test('POST /session/logout: sets clear cookie when sessions enabled', async () => {
    const session = makeSessionAdapter({
      buildClearCookie: () => 'w3a_session=; Path=/; Max-Age=0',
    });
    const service = makeFakeAuthService();
    const router = createRelayRouter(service, { session });
    const srv = await startExpressRouter(router);
    try {
      const res = await fetchJson(`${srv.baseUrl}/session/logout`, { method: 'POST' });
      expect(res.status).toBe(200);
      expect(res.json?.success).toBe(true);
      expect(res.headers.get('set-cookie')).toContain('Max-Age=0');
    } finally {
      await srv.close();
    }
  });

  test('custom sessionRoutes: auth/logout paths are honored', async () => {
    const session = makeSessionAdapter({
      parse: async () => ({ ok: true, claims: { sub: 'bob.testnet' } }),
      buildClearCookie: () => 'w3a_session=; Path=/; Max-Age=0',
    });
    const service = makeFakeAuthService();
    const router = createRelayRouter(service, { session, sessionRoutes: { auth: '/me', logout: '/bye' } });
    const srv = await startExpressRouter(router);
    try {
      const me = await fetchJson(`${srv.baseUrl}/me`, { method: 'GET' });
      expect(me.status).toBe(200);
      expect(me.json?.authenticated).toBe(true);

      const out = await fetchJson(`${srv.baseUrl}/bye`, { method: 'POST' });
      expect(out.status).toBe(200);
      expect(out.json?.success).toBe(true);
      expect(out.headers.get('set-cookie')).toContain('Max-Age=0');
    } finally {
      await srv.close();
    }
  });
});
