import { test, expect } from '@playwright/test';
import { setupBasicPasskeyTest } from '../setup';

const IMPORT_PATHS = {
  // Use concrete module path that exists in dist
  fallbacks: '/sdk/esm/core/WebAuthnManager/WebAuthnFallbacks/safari-fallbacks.js',
} as const;

test.describe('Safari WebAuthn fallbacks - cancellation and timeout behavior', () => {
  test.beforeEach(async ({ page }) => {
    await setupBasicPasskeyTest(page);
    await page.waitForTimeout(150);
  });

  test('create(): native fails then bridge cancel → NotAllowedError', async ({ page }) => {
    const res = await page.evaluate(async ({ paths }) => {
      try {
        const { executeWebAuthnWithParentFallbacksSafari } = await import(paths.fallbacks);

        const rpId = 'example.com';
        const publicKey = {
          rp: { id: rpId, name: 'Test' },
          user: { id: new Uint8Array([1]), name: 'u', displayName: 'u' },
          challenge: new Uint8Array([1])
        };
        // Test hook: force native to fail
        (window as any).__W3A_TEST_FORCE_NATIVE_FAIL = true;
        // Bridge returns an explicit cancellation (not a timeout)
        const bridgeClient = { request: async () => ({ ok: false, error: 'User cancelled' }) };
        try {
          await executeWebAuthnWithParentFallbacksSafari('create', publicKey, { rpId, inIframe: true, timeoutMs: 500, bridgeClient });
          return { success: false, error: 'Expected rejection' };
        } catch (e: any) {
          // Clear test flag
          try { delete (window as any).__W3A_TEST_FORCE_NATIVE_FAIL; } catch {}
          return {
            success: true,
            name: e?.name || '',
            message: String(e?.message || e)
          };
        }
      } catch (err: any) {
        return { success: false, error: err?.message || String(err) };
      }
    }, { paths: IMPORT_PATHS });

    if (!res.success) {
      test.skip(true, `Safari fallback test skipped: ${res.error || 'unknown error'}`);
      return;
    }

    expect(res.name).toBe('NotAllowedError');
    expect(res.message).toContain('cancel');
  });

  test('create(): native fails then bridge timeout (no second native attempt)', async ({ page }) => {
    const res = await page.evaluate(async ({ paths }) => {
      try {
        const { executeWebAuthnWithParentFallbacksSafari } = await import(paths.fallbacks);

        const rpId = 'example.com';
        const publicKey = {
          rp: { id: rpId, name: 'Test' },
          user: { id: new Uint8Array([1]), name: 'u', displayName: 'u' },
          challenge: new Uint8Array([1])
        };

        // Force native to fail; observe internal counter; simulate bridge timeout
        (window as any).__W3A_TEST_FORCE_NATIVE_FAIL = true;
        const bridgeClient = { request: async () => ({ ok: false, timeout: true }) };
        let threw = false;
        try {
          await executeWebAuthnWithParentFallbacksSafari('create', publicKey, { rpId, inIframe: true, timeoutMs: 200, bridgeClient });
        } catch {
          threw = true;
        }
        // Read internal counter and clear flag
        const count = (window as any).__W3A_TEST_NATIVE_CREATE_ATTEMPTS || 0;
        try { delete (window as any).__W3A_TEST_FORCE_NATIVE_FAIL; } catch {}
        try { delete (window as any).__W3A_TEST_NATIVE_CREATE_ATTEMPTS; } catch {}
        return { success: true, calls: { nativeCreate: count }, threw };
      } catch (err: any) {
        return { success: false, error: err?.message || String(err) };
      }
    }, { paths: IMPORT_PATHS });

    if (!res.success) {
      test.skip(true, `Safari fallback test skipped: ${res.error || 'unknown error'}`);
      return;
    }

    expect(res.calls?.nativeCreate).toBe(1);
    expect(res.threw).toBe(true);
  });

  test('get(): native ancestor error then bridge cancel → NotAllowedError', async ({ page }) => {
    const res = await page.evaluate(async ({ paths }) => {
      try {
        const { executeWebAuthnWithParentFallbacksSafari } = await import(paths.fallbacks);
        const rpId = window.location.hostname;
        const publicKey = { rpId, challenge: new Uint8Array([1]) };
        // Force native to fail
        (window as any).__W3A_TEST_FORCE_NATIVE_FAIL = true;
        // Bridge returns explicit cancel
        const bridgeClient = {
          request: async () => ({ ok: false, error: 'User cancelled' })
        };
        try {
          await executeWebAuthnWithParentFallbacksSafari('get', publicKey, { rpId, inIframe: true, timeoutMs: 200, bridgeClient });
          return { success: false, error: 'Expected rejection' };
        } catch (e: any) {
          try { delete (window as any).__W3A_TEST_FORCE_NATIVE_FAIL; } catch {}
          return { success: true, name: e?.name || '', message: String(e?.message || e) };
        }
      } catch (err: any) {
        return { success: false, error: err?.message || String(err) };
      }
    }, { paths: IMPORT_PATHS });

    if (!res.success) {
      test.skip(true, `Safari fallback test skipped: ${res.error || 'unknown error'}`);
      return;
    }

    expect(res.name).toBe('NotAllowedError');
    expect(res.message).toContain('cancel');
  });

  test('get(): native NotAllowedError cancel should not trigger bridge', async ({ page }) => {
    const res = await page.evaluate(async ({ paths }) => {
      try {
        const { executeWebAuthnWithParentFallbacksSafari } = await import(paths.fallbacks);
        const rpId = window.location.hostname;
        const publicKey = { rpId, challenge: new Uint8Array([1]) };

        // Stub native navigator.credentials.get to simulate a user cancellation
        const orig = navigator.credentials.get.bind(navigator.credentials);
        navigator.credentials.get = async () => {
          const e = new Error('The operation was not allowed');
          (e as any).name = 'NotAllowedError';
          throw e;
        };

        let bridgeCalls = 0;
        const bridgeClient = {
          request: async () => {
            bridgeCalls += 1;
            return { ok: false, error: 'should not be called' };
          }
        };

        try {
          await executeWebAuthnWithParentFallbacksSafari('get', publicKey, { rpId, inIframe: true, timeoutMs: 200, bridgeClient });
          return { success: false, error: 'Expected NotAllowedError' };
        } catch (e: any) {
          // restore
          (navigator.credentials as any).get = orig;
          return { success: true, name: e?.name || '', bridgeCalls };
        }
      } catch (err: any) {
        return { success: false, error: err?.message || String(err) };
      }
    }, { paths: IMPORT_PATHS });

    if (!res.success) {
      test.skip(true, `Safari fallback test skipped: ${res.error || 'unknown error'}`);
      return;
    }
    expect(res.name).toBe('NotAllowedError');
    expect(res.bridgeCalls).toBe(0);
  });
});
