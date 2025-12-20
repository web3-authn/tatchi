import { test, expect } from '@playwright/test';

test.describe('signer worker JS guards – PRF/vrf_sk rejection', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
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

        const combined = () => [...errors, ...messages.map((m: any) => JSON.stringify(m))].join(' ');
        const waitFor = async (predicate: () => boolean, timeoutMs: number = 5000): Promise<void> => {
          const start = Date.now();
          while (Date.now() - start < timeoutMs) {
            if (predicate()) return;
            await new Promise((resolve) => setTimeout(resolve, 20));
          }
        };

        await waitFor(() => messages.some((m: any) => m?.type === 'WORKER_READY'), 5000);
        worker.postMessage({
          type: 0, // WorkerRequestType.DeriveNearKeypairAndEncrypt (numeric)
          payload: {
            prfOutput: 'leaked-prf',
          },
        });
        await waitFor(() => combined().includes('Forbidden secret field'), 5000);
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

        const combined = () => [...errors, ...messages.map((m: any) => JSON.stringify(m))].join(' ');
        const waitFor = async (predicate: () => boolean, timeoutMs: number = 5000): Promise<void> => {
          const start = Date.now();
          while (Date.now() - start < timeoutMs) {
            if (predicate()) return;
            await new Promise((resolve) => setTimeout(resolve, 20));
          }
        };

        await waitFor(() => messages.some((m: any) => m?.type === 'WORKER_READY'), 5000);
        worker.postMessage({
          type: 4, // WorkerRequestType.SignTransactionsWithActions (numeric)
          payload: {
            vrf_sk: 'deadbeef',
          },
        });
        await waitFor(() => combined().includes('Forbidden secret field'), 5000);
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
