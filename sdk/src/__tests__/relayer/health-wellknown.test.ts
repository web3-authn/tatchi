import { test, expect } from '@playwright/test';
import { createRelayRouter } from '../../server/router/express-adaptor';
import { createCloudflareRouter } from '../../server/router/cloudflare-adaptor';
import { callCf, fetchJson, getPath, makeFakeAuthService, makeShamirServiceStub, startExpressRouter } from './helpers';

test.describe('relayer health/ready + well-known', () => {
  test('express: GET /healthz includes shamir + zkEmail hints when enabled', async () => {
    const shamirService = makeShamirServiceStub({
      hasShamir: () => true,
      getCurrentShamirKeyId: () => 'current-key',
      getShamirConfig: () => ({ shamir_p_b64u: 'p_b64u' }),
      getGraceKeyIds: () => ['grace-1'],
    });
    const emailRecovery = {
      getZkEmailProverBaseUrl: () => 'https://prover.example',
      checkZkEmailProverHealth: async () => ({ configured: true, baseUrl: 'https://prover.example', healthy: true }),
    };
    const service = makeFakeAuthService({ shamirService, emailRecovery });
    const router = createRelayRouter(service, { healthz: true, readyz: true });
    const srv = await startExpressRouter(router);
    try {
      const res = await fetchJson(`${srv.baseUrl}/healthz`, { method: 'GET' });
      expect(res.status).toBe(200);
      expect(res.json?.ok).toBe(true);
      expect(getPath(res.json, 'shamir', 'configured')).toBe(true);
      expect(getPath(res.json, 'shamir', 'currentKeyId')).toBe('current-key');
      expect(getPath(res.json, 'zkEmail', 'configured')).toBe(true);
      expect(getPath(res.json, 'zkEmail', 'proverBaseUrl')).toBe('https://prover.example');
    } finally {
      await srv.close();
    }
  });

  test('express: GET /readyz returns 503 when zk-email prover is unhealthy', async () => {
    const shamirService = makeShamirServiceStub({ hasShamir: () => false });
    const emailRecovery = {
      getZkEmailProverBaseUrl: () => 'https://prover.example',
      checkZkEmailProverHealth: async () => ({
        configured: true,
        baseUrl: 'https://prover.example',
        healthy: false,
        errorCode: 'unreachable',
        message: 'down',
      }),
    };
    const service = makeFakeAuthService({ shamirService, emailRecovery });
    const router = createRelayRouter(service, { readyz: true });
    const srv = await startExpressRouter(router);
    try {
      const res = await fetchJson(`${srv.baseUrl}/readyz`, { method: 'GET' });
      expect(res.status).toBe(503);
      expect(res.json?.ok).toBe(false);
      expect(getPath(res.json, 'zkEmail', 'healthy')).toBe(false);
    } finally {
      await srv.close();
    }
  });

  test('express: GET /.well-known/webauthn sets Cache-Control and returns origins', async () => {
    const service = makeFakeAuthService({
      getRorOrigins: async () => ['https://wallet.example.localhost', 'https://example.localhost'],
    });
    const router = createRelayRouter(service, {});
    const srv = await startExpressRouter(router);
    try {
      const res = await fetchJson(`${srv.baseUrl}/.well-known/webauthn`, { method: 'GET' });
      expect(res.status).toBe(200);
      expect(res.headers.get('cache-control')).toContain('max-age=60');
      expect(res.json?.origins).toEqual(['https://wallet.example.localhost', 'https://example.localhost']);
    } finally {
      await srv.close();
    }
  });

  test('cloudflare: GET /healthz includes cors.allowedOrigins when enabled', async () => {
    const service = makeFakeAuthService();
    const handler = createCloudflareRouter(service, { healthz: true, corsOrigins: ['https://example.localhost'] });

    const res = await callCf(handler, {
      method: 'GET',
      path: '/healthz',
      origin: 'https://example.localhost',
    });

    expect(res.status).toBe(200);
    expect(res.json?.ok).toBe(true);
    expect(getPath(res.json, 'cors', 'allowedOrigins')).toEqual(['https://example.localhost']);
    expect(res.headers.get('access-control-allow-credentials')).toBe('true');
  });

  test('cloudflare: GET /readyz returns 503 when shamir is configured but not ready', async () => {
    const shamirService = makeShamirServiceStub({
      hasShamir: () => true,
      ensureReady: async () => {
        throw new Error('init failed');
      },
    });
    const service = makeFakeAuthService({ shamirService });
    const handler = createCloudflareRouter(service, { readyz: true, corsOrigins: ['https://example.localhost'] });

    const res = await callCf(handler, {
      method: 'GET',
      path: '/readyz',
      origin: 'https://example.localhost',
    });

    expect(res.status).toBe(503);
    expect(res.json?.ok).toBe(false);
    expect(getPath(res.json, 'shamir', 'configured')).toBe(true);
    expect(getPath(res.json, 'shamir', 'ready')).toBe(false);
  });

  test('cloudflare: GET /.well-known/webauthn supports env overrides and sets Cache-Control', async () => {
    const calls: any[] = [];
    const service = makeFakeAuthService({
      getRorOrigins: async (opts?: any) => {
        calls.push(opts);
        return ['https://example.localhost'];
      },
    });
    const handler = createCloudflareRouter(service, { corsOrigins: ['https://example.localhost'] });

    const res = await callCf(handler, {
      method: 'GET',
      path: '/.well-known/webauthn',
      origin: 'https://example.localhost',
      env: { ROR_CONTRACT_ID: 'c.testnet', ROR_METHOD: 'm' },
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toContain('max-age=60');
    expect(res.json?.origins).toEqual(['https://example.localhost']);
    expect(calls.length).toBe(1);
    expect(calls[0]).toEqual({ contractId: 'c.testnet', method: 'm' });
  });
});
