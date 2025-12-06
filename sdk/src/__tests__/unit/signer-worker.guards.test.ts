import { test, expect } from '@playwright/test';
import { setupBasicPasskeyTest } from '../setup';

test.describe('signer worker JS guards – PRF/vrf_sk rejection', () => {
  test.beforeEach(async ({ page }) => {
    await setupBasicPasskeyTest(page);
  });

  test('rejects payloads containing prfOutput', async ({ page }) => {
    const res = await page.evaluate(async () => {
      try {
        // Load the signer worker as a module and create a Worker instance
        const workerUrl = new URL('/sdk/workers/web3authn-signer.worker.js', window.location.origin).toString();
        const worker = new Worker(workerUrl, { type: 'module', name: 'GuardTestSignerWorker' });

        const messages: any[] = [];
        const errors: any[] = [];

        worker.onmessage = (ev: MessageEvent) => messages.push(ev.data);
        worker.onerror = (ev: ErrorEvent) => errors.push(ev.message || ev.error);

        worker.postMessage({
          type: 0, // WorkerRequestType.DeriveNearKeypairAndEncrypt (numeric)
          payload: {
            prfOutput: 'leaked-prf',
          },
        });

        // Wait a bit for the worker to process the message
        await new Promise(resolve => setTimeout(resolve, 200));
        worker.terminate();

        return { messages, errors };
      } catch (err: any) {
        return { messages: [], errors: [err?.message || String(err)] };
      }
    });

    // Either we get an error event or a failure message containing the guard text.
    const combined = [...res.errors, ...res.messages.map((m: any) => JSON.stringify(m))].join(' ');
    expect(combined).toContain('Forbidden secret field');
  });

  test('rejects payloads containing vrf_sk', async ({ page }) => {
    const res = await page.evaluate(async () => {
      try {
        const workerUrl = new URL('/sdk/workers/web3authn-signer.worker.js', window.location.origin).toString();
        const worker = new Worker(workerUrl, { type: 'module', name: 'GuardTestSignerWorkerVRF' });

        const messages: any[] = [];
        const errors: any[] = [];

        worker.onmessage = (ev: MessageEvent) => messages.push(ev.data);
        worker.onerror = (ev: ErrorEvent) => errors.push(ev.message || ev.error);

        worker.postMessage({
          type: 4, // WorkerRequestType.SignTransactionsWithActions (numeric)
          payload: {
            vrf_sk: 'deadbeef',
          },
        });

        await new Promise(resolve => setTimeout(resolve, 200));
        worker.terminate();

        return { messages, errors };
      } catch (err: any) {
        return { messages: [], errors: [err?.message || String(err)] };
      }
    });

    const combined = [...res.errors, ...res.messages.map((m: any) => JSON.stringify(m))].join(' ');
    expect(combined).toContain('Forbidden secret field');
  });
});
