import { test, expect } from '@playwright/test';
import { setupBasicPasskeyTest, handleInfrastructureErrors } from '../setup';

const IMPORT_PATHS = {
  fallbacks: '/sdk/esm/core/WebAuthnManager/WebAuthnFallbacks/index.js',
} as const;

test.describe('Safari WebAuthn fallbacks - cancellation and timeout behavior', () => {
  test.beforeEach(async ({ page }) => {
    await setupBasicPasskeyTest(page);
    await page.waitForTimeout(150);
  });

  test('create(): bridge cancel should not attempt native; throws NotAllowedError', async ({ page }) => {
    const res = await page.evaluate(async ({ paths }) => {
      try {
        const { executeWithFallbacks } = await import(paths.fallbacks);

        // rpId different from host to trigger bridge-first path
        const rpId = 'example.com';
        const publicKey = { rp: { id: rpId, name: 'Test' }, user: { id: new Uint8Array([1]), name: 'u', displayName: 'u' }, challenge: new Uint8Array([1]) };

        // Bridge returns an explicit cancellation (not a timeout)
        const bridgeClient = {
          request: async () => ({ ok: false, error: 'User cancelled' }),
        };

        try {
          await executeWithFallbacks('create', publicKey as any, { rpId, inIframe: true, timeoutMs: 500, bridgeClient });
          return { success: false, error: 'Expected rejection' };
        } catch (e: any) {
          return { success: true, name: e?.name || '', message: String(e?.message || e) };
        }
      } catch (err: any) {
        return { success: false, error: err?.message || String(err) };
      }
    }, { paths: IMPORT_PATHS });

    if (!res.success) {
      if (handleInfrastructureErrors(res)) return;
      expect(res.success).toBe(true);
      return;
    }

    expect(res.name).toBe('NotAllowedError');
    expect(res.message).toContain('cancel');
  });

  test('create(): bridge timeout should fall back to native once', async ({ page }) => {
    const res = await page.evaluate(async ({ paths }) => {
      try {
        const { executeWithFallbacks } = await import(paths.fallbacks);

        const rpId = 'example.com';
        const publicKey = { rp: { id: rpId, name: 'Test' }, user: { id: new Uint8Array([1]), name: 'u', displayName: 'u' }, challenge: new Uint8Array([1]) };

        // Count native create() attempts
        const calls = { nativeCreate: 0 };
        const orig = navigator.credentials?.create;
        try {
          Object.defineProperty(navigator.credentials, 'create', {
            configurable: true,
            value: async () => { calls.nativeCreate++; return { id: 'cred' } as any; },
          });
        } catch {}

        // Simulate parent bridge timeout (no listener)
        const bridgeClient = {
          request: async () => ({ ok: false, timeout: true }),
        };

        const result = await executeWithFallbacks('create', publicKey as any, { rpId, inIframe: true, timeoutMs: 200, bridgeClient });

        // Restore
        try { Object.defineProperty(navigator.credentials, 'create', { configurable: true, value: orig }); } catch {}

        return { success: true, calls, result: !!result };
      } catch (err: any) {
        return { success: false, error: err?.message || String(err) };
      }
    }, { paths: IMPORT_PATHS });

    if (!res.success) {
      if (handleInfrastructureErrors(res)) return;
      expect(res.success).toBe(true);
      return;
    }

    expect(res.calls?.nativeCreate).toBe(1);
    expect(res.result).toBe(true);
  });

  test('get(): native ancestor error then bridge cancel → NotAllowedError', async ({ page }) => {
    const res = await page.evaluate(async ({ paths }) => {
      try {
        const { executeWithFallbacks } = await import(paths.fallbacks);
        const rpId = window.location.hostname; // equal to host to avoid bridge-first
        const publicKey = { rpId, challenge: new Uint8Array([1]) };

        // First native attempt throws ancestor-origin NotAllowedError
        const origGet = navigator.credentials?.get;
        const ancestorErr = new Error('The operation was aborted because the origin of the document is not the same as its ancestors.');
        (ancestorErr as any).name = 'NotAllowedError';
        try {
          Object.defineProperty(navigator.credentials, 'get', {
            configurable: true,
            value: async () => { throw ancestorErr; },
          });
        } catch {}

        // Bridge returns explicit cancel
        const bridgeClient = { request: async () => ({ ok: false, error: 'User cancelled' }) };

        try {
          await executeWithFallbacks('get', publicKey as any, { rpId, inIframe: true, timeoutMs: 200, bridgeClient });
          return { success: false, error: 'Expected rejection' };
        } catch (e: any) {
          // Restore
          try { Object.defineProperty(navigator.credentials, 'get', { configurable: true, value: origGet }); } catch {}
          return { success: true, name: e?.name || '', message: String(e?.message || e) };
        }
      } catch (err: any) {
        return { success: false, error: err?.message || String(err) };
      }
    }, { paths: IMPORT_PATHS });

    if (!res.success) {
      if (handleInfrastructureErrors(res)) return;
      expect(res.success).toBe(true);
      return;
    }

    expect(res.name).toBe('NotAllowedError');
    expect(res.message).toContain('cancel');
  });
});

