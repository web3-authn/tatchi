import { test, expect } from '@playwright/test';
import { setupBasicPasskeyTest } from '../setup';

// In the VRF-centric architecture, awaitSecureConfirmationV2 is exposed
// from the VRF worker bundle, not the signer worker.
const WORKER_PATH = '/sdk/workers/web3authn-vrf.worker.js';

test.describe('awaitSecureConfirmationV2 - error handling', () => {
  test.beforeEach(async ({ page }) => {
    await setupBasicPasskeyTest(page);
  });

  test('rejects on invalid JSON and missing fields', async ({ page }) => {
    const result = await page.evaluate(async ({ workerPath }) => {
      // Load the VRF worker bundle; it exposes awaitSecureConfirmationV2 on globalThis
      await import(workerPath);
      const awaitV2 = (globalThis as any).awaitSecureConfirmationV2 as (json: string, opts?: any) => Promise<any>;
      const errors: string[] = [];
      try { await awaitV2('not-json'); } catch (e: any) { errors.push(String(e?.message || e)); }
      try { await awaitV2(JSON.stringify({ schemaVersion: 1 })); } catch (e: any) { errors.push(String(e?.message || e)); }
      try { await awaitV2(JSON.stringify({ schemaVersion: 2, type: 'signTransaction', payload: {} })); } catch (e: any) { errors.push(String(e?.message || e)); }
      try { await awaitV2(JSON.stringify({ schemaVersion: 2, requestId: 'id-1', payload: {} })); } catch (e: any) { errors.push(String(e?.message || e)); }
      return { errors };
    }, { workerPath: WORKER_PATH });
    expect(result.errors.length).toBe(4);
    expect(result.errors.join(' ')).toContain('invalid V2 request JSON');
  });

  test('rejects immediately when aborted', async ({ page }) => {
    const result = await page.evaluate(async ({ workerPath }) => {
      await import(workerPath);
      const awaitV2 = (globalThis as any).awaitSecureConfirmationV2 as (json: string, opts?: any) => Promise<any>;
      const controller = new AbortController();
      controller.abort();
      try {
        await awaitV2(JSON.stringify({ schemaVersion: 2, requestId: 'id-2', type: 'signTransaction', payload: {} }), { signal: controller.signal });
        return { ok: true };
      } catch (e: any) {
        return { ok: false, message: String(e?.message || e) };
      }
    }, { workerPath: WORKER_PATH });
    expect(result.ok).toBe(false);
    expect(result.message).toContain('confirmation aborted');
  });

  test('times out when no matching response is received', async ({ page }) => {
    const result = await page.evaluate(async ({ workerPath }) => {
      await import(workerPath);
      const awaitV2 = (globalThis as any).awaitSecureConfirmationV2 as (json: string, opts?: any) => Promise<any>;
      const originalPost = (self as any).postMessage;
      // Stub to avoid Window.postMessage signature issues when used by worker-style code
      (self as any).postMessage = (_msg: unknown) => {};
      try {
        await awaitV2(JSON.stringify({
          schemaVersion: 2,
          requestId: 'id-3',
          type: 'signTransaction',
          payload: {}
        }), { timeoutMs: 50 });
        return { ok: true };
      } catch (e: any) {
        return { ok: false, message: String(e?.message || e) };
      } finally {
        (self as any).postMessage = originalPost;
      }
    }, { workerPath: WORKER_PATH });
    expect(result.ok).toBe(false);
    expect(result.message).toContain('confirmation timed out');
  });

  test('ignores mismatched response requestId', async ({ page }) => {
    const result = await page.evaluate(async ({ workerPath }) => {
      await import(workerPath);
      const awaitV2 = (globalThis as any).awaitSecureConfirmationV2 as (json: string, opts?: any) => Promise<any>;
      const originalPost = (self as any).postMessage;
      (self as any).postMessage = (_msg: unknown) => {};
      const payload = { schemaVersion: 2, requestId: 'id-4', type: 'signTransaction', payload: {} };
      setTimeout(() => {
        // Dispatch a message event with a mismatched requestId; listener should ignore it
        self.dispatchEvent(new MessageEvent('message', {
          data: {
            type: 'USER_PASSKEY_CONFIRM_RESPONSE',
            data: { requestId: 'DIFFERENT', confirmed: true }
          }
        }));
      }, 10);
      try {
        await awaitV2(JSON.stringify(payload), { timeoutMs: 60 });
        return { ok: true };
      } catch (e: any) {
        return { ok: false, message: String(e?.message || e) };
      } finally {
        (self as any).postMessage = originalPost;
      }
    }, { workerPath: WORKER_PATH });
    expect(result.ok).toBe(false);
    expect(result.message).toContain('confirmation timed out');
  });

  test('happy path: LocalOnly decrypt shorthand returns confirmation response', async ({ page }) => {
    const result = await page.evaluate(async ({ workerPath }) => {
      await import(workerPath);
      const awaitV2 = (globalThis as any).awaitSecureConfirmationV2 as (json: string, opts?: any) => Promise<any>;

      const request = {
        type: 'decryptPrivateKeyWithPrf',
        sessionId: 'sess-1',
        nearAccountId: 'alice.testnet',
      };

      const originalAdd = self.addEventListener.bind(self);
      // Intercept PROMPT_USER_CONFIRM_IN_JS_MAIN_THREAD and synthesize a matching response
      self.addEventListener = ((type: string, listener: any, options?: any) => {
        if (type === 'message') {
          const wrapped = (ev: MessageEvent) => {
            const data: any = ev.data;
            if (data?.type === 'PROMPT_USER_CONFIRM_IN_JS_MAIN_THREAD') {
              self.dispatchEvent(new MessageEvent('message', {
                data: {
                  type: 'USER_PASSKEY_CONFIRM_RESPONSE',
                  data: {
                    requestId: data.data.requestId,
                    confirmed: true,
                  },
                },
              }));
            }
            listener(ev);
          };
          return originalAdd(type, wrapped, options);
        }
        return originalAdd(type, listener, options);
      }) as any;

      const resp = await awaitV2(JSON.stringify(request), { timeoutMs: 250 });
      return {
        requestId: resp?.request_id,
        confirmed: resp?.confirmed,
      };
    }, { workerPath: WORKER_PATH });

    expect(result.requestId).toBe('sess-1');
    expect(result.confirmed).toBe(true);
  });
});

