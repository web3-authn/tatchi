import { test, expect } from '@playwright/test';
import { createRelayRouter } from '../../server/router/express-adaptor';
import { createCloudflareRouter } from '../../server/router/cloudflare-adaptor';
import { callCf, fetchJson, makeFakeAuthService, makeShamirServiceStub, startExpressRouter } from './helpers';

test.describe('relayer Shamir endpoints', () => {
  test('express: shamir disabled returns 503', async () => {
    const shamirService = makeShamirServiceStub({ hasShamir: () => false });
    const service = makeFakeAuthService({ shamirService });
    const router = createRelayRouter(service, {});
    const srv = await startExpressRouter(router);
    try {
      const res = await fetchJson(`${srv.baseUrl}/vrf/apply-server-lock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kek_c_b64u: 'abc' }),
      });
      expect(res.status).toBe(503);
      expect(res.json?.error).toBe('shamir_disabled');
    } finally {
      await srv.close();
    }
  });

  test('express: apply-server-lock validates body and includes keyId on success', async () => {
    const shamirService = makeShamirServiceStub({
      hasShamir: () => true,
      getCurrentShamirKeyId: () => 'k1',
      applyServerLock: async () => ({ ok: true, kek_cs_b64u: 'locked' }),
    });
    const service = makeFakeAuthService({ shamirService });
    const router = createRelayRouter(service, {});
    const srv = await startExpressRouter(router);
    try {
      const bad = await fetchJson(`${srv.baseUrl}/vrf/apply-server-lock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(bad.status).toBe(400);
      expect(String(bad.json?.error || '')).toContain('kek_c_b64u');

      const ok = await fetchJson(`${srv.baseUrl}/vrf/apply-server-lock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kek_c_b64u: 'abc' }),
      });
      expect(ok.status).toBe(200);
      expect(ok.json?.keyId).toBe('k1');
      expect(ok.json?.kek_cs_b64u).toBe('locked');
    } finally {
      await srv.close();
    }
  });

  test('express: remove-server-lock dispatches by keyId (current vs grace) and rejects unknown', async () => {
    const shamirService = makeShamirServiceStub({
      hasShamir: () => true,
      getCurrentShamirKeyId: () => 'current-key',
      getGraceKeyIds: () => ['grace-1'],
      removeServerLock: async () => ({ path: 'current' }),
      removeGraceServerLockWithKey: async () => ({ path: 'grace' }),
    });
    const service = makeFakeAuthService({ shamirService });
    const router = createRelayRouter(service, {});
    const srv = await startExpressRouter(router);
    try {
      const unknown = await fetchJson(`${srv.baseUrl}/vrf/remove-server-lock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kek_cs_b64u: 'abc', keyId: 'nope' }),
      });
      expect(unknown.status).toBe(400);
      expect(unknown.json?.error).toBe('unknown keyId');

      const current = await fetchJson(`${srv.baseUrl}/vrf/remove-server-lock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kek_cs_b64u: 'abc', keyId: 'current-key' }),
      });
      expect(current.status).toBe(200);
      expect(current.json?.path).toBe('current');

      const grace = await fetchJson(`${srv.baseUrl}/vrf/remove-server-lock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kek_cs_b64u: 'abc', keyId: 'grace-1' }),
      });
      expect(grace.status).toBe(200);
      expect(grace.json?.path).toBe('grace');
    } finally {
      await srv.close();
    }
  });

  test('express: shamir key-info surfaces currentKeyId + p_b64u + graceKeyIds', async () => {
    const shamirService = makeShamirServiceStub({
      hasShamir: () => true,
      getCurrentShamirKeyId: () => 'current-key',
      getShamirConfig: () => ({ shamir_p_b64u: 'p_b64u' }),
      getGraceKeyIds: () => ['grace-1', 'grace-2'],
    });
    const service = makeFakeAuthService({ shamirService });
    const router = createRelayRouter(service, {});
    const srv = await startExpressRouter(router);
    try {
      const res = await fetchJson(`${srv.baseUrl}/shamir/key-info`, { method: 'GET' });
      expect(res.status).toBe(200);
      expect(res.json?.currentKeyId).toBe('current-key');
      expect(res.json?.p_b64u).toBe('p_b64u');
      expect(res.json?.graceKeyIds).toEqual(['grace-1', 'grace-2']);
    } finally {
      await srv.close();
    }
  });

  test('cloudflare: apply-server-lock validates body and returns 503 when ensureReady false', async () => {
    const shamirService = makeShamirServiceStub({
      ensureReady: async () => false,
    });
    const service = makeFakeAuthService({ shamirService });
    const handler = createCloudflareRouter(service, { corsOrigins: ['https://example.localhost'] });

    const disabled = await callCf(handler, {
      method: 'POST',
      path: '/vrf/apply-server-lock',
      origin: 'https://example.localhost',
      body: { kek_c_b64u: 'abc' },
    });
    expect(disabled.status).toBe(503);
    expect(disabled.json?.code).toBe('shamir_disabled');

    const readyShamir = makeShamirServiceStub({
      ensureReady: async () => true,
      applyServerLock: async () => ({ ok: true, kek_cs_b64u: 'locked' }),
      getCurrentShamirKeyId: () => 'k1',
    });
    const handler2 = createCloudflareRouter(makeFakeAuthService({ shamirService: readyShamir }), { corsOrigins: ['https://example.localhost'] });

    const bad = await callCf(handler2, {
      method: 'POST',
      path: '/vrf/apply-server-lock',
      origin: 'https://example.localhost',
      body: {},
    });
    expect(bad.status).toBe(400);
    expect(bad.json?.code).toBe('invalid_body');

    const ok = await callCf(handler2, {
      method: 'POST',
      path: '/vrf/apply-server-lock',
      origin: 'https://example.localhost',
      body: { kek_c_b64u: 'abc' },
    });
    expect(ok.status).toBe(200);
    expect(ok.json?.keyId).toBe('k1');
    expect(ok.json?.kek_cs_b64u).toBe('locked');
  });

  test('cloudflare: remove-server-lock returns 400 unknown keyId via core handler', async () => {
    const shamirService = makeShamirServiceStub({
      ensureReady: async () => true,
      getCurrentShamirKeyId: () => 'current-key',
      getGraceKeyIds: () => [],
    });
    const service = makeFakeAuthService({ shamirService });
    const handler = createCloudflareRouter(service, { corsOrigins: ['https://example.localhost'] });

    const res = await callCf(handler, {
      method: 'POST',
      path: '/vrf/remove-server-lock',
      origin: 'https://example.localhost',
      body: { kek_cs_b64u: 'abc', keyId: 'nope' },
    });

    expect(res.status).toBe(400);
    expect(res.json?.error).toBe('unknown keyId');
  });
});

