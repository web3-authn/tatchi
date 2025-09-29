import { test, expect } from '@playwright/test';
import { setupBasicPasskeyTest } from '../setup';

const WORKER_PATH = '/sdk/workers/web3authn-signer.worker.js';

test.describe('awaitSecureConfirmationV2 - error handling', () => {
  test.beforeEach(async ({ page }) => {
    await setupBasicPasskeyTest(page);
  });

  test('rejects on invalid JSON and missing fields', async ({ page }) => {
    const result = await page.evaluate(async ({ workerPath }) => {
      // Load the signer worker bundle; it exposes awaitSecureConfirmationV2 on globalThis
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
        await awaitV2(JSON.stringify({ schemaVersion: 2, requestId: 'id-3', type: 'signTransaction', payload: {} }), { timeoutMs: 50 });
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
          data: { type: 'USER_PASSKEY_CONFIRM_RESPONSE', data: { requestId: 'DIFFERENT', confirmed: true } }
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
});
