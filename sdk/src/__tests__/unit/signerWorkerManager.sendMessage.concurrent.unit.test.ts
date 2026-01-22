import { test, expect } from '@playwright/test';
import { setupBasicPasskeyTest } from '../setup';

test.describe('SignerWorkerManager.sendMessage', () => {
  test.beforeEach(async ({ page }) => {
    await setupBasicPasskeyTest(page);
  });

  test('serializes concurrent calls per worker to avoid hangs', async ({ page }) => {
    const res = await page.evaluate(async () => {
      const { WorkerRequestType, WorkerResponseType } = await import('/sdk/esm/core/types/signer-worker.js');
      const { WorkerControlMessage } = await import('/sdk/esm/core/workerControlMessages.js');
      const { SignerWorkerManager } = await import('/sdk/esm/core/WebAuthnManager/SignerWorkerManager/index.js');

      const progressType = WorkerResponseType.ExecuteActionsProgress;
      const successType = WorkerResponseType.SignTransactionsWithActionsSuccess;

      const code = `
        const ATTACH = ${JSON.stringify(WorkerControlMessage.ATTACH_WRAP_KEY_SEED_PORT)};
        const ATTACH_OK = ${JSON.stringify(WorkerControlMessage.ATTACH_WRAP_KEY_SEED_PORT_OK)};
        const PROGRESS_TYPE = ${progressType};
        const SUCCESS_TYPE = ${successType};

        let chain = Promise.resolve();
        self.onmessage = (event) => {
          const data = event?.data || {};
          if (data.type === ATTACH) {
            const sessionId = String(data.sessionId || 'unknown');
            try { self.postMessage({ type: ATTACH_OK, sessionId }); } catch {}
            return;
          }

          chain = chain
            .catch(() => undefined)
            .then(() => new Promise((resolve) => {
              try {
                self.postMessage({
                  type: PROGRESS_TYPE,
                  payload: { step: 0, phase: 'transaction-signing-progress', status: 'progress', message: 'progress' },
                });
              } catch {}
              setTimeout(() => {
                try { self.postMessage({ type: SUCCESS_TYPE, payload: { success: true } }); } catch {}
                resolve();
              }, 10);
            }));
        };
      `;

      const blobUrl = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));

      // Patch to avoid depending on the real signer worker bundle for this unit test.
      (SignerWorkerManager as any).prototype.createSecureWorker = function () {
        return new Worker(blobUrl, { type: 'module', name: 'SignerWorkerManagerTestWorker' });
      };

      const manager = new SignerWorkerManager(null, null, null, null, 'https://relayer.invalid');
      const sessionId = `sess-${crypto.randomUUID()}`;

      await manager.reserveSignerWorkerSession(sessionId);
      const sendMessage = manager.getContext().sendMessage;

      const [r1, r2] = await Promise.all([
        sendMessage({
          sessionId,
          timeoutMs: 1000,
          message: { type: WorkerRequestType.SignTransactionsWithActions, payload: {} },
        }),
        sendMessage({
          sessionId,
          timeoutMs: 1000,
          message: { type: WorkerRequestType.SignTransactionsWithActions, payload: {} },
        }),
      ]);

      manager.reset();
      URL.revokeObjectURL(blobUrl);

      return { r1Type: r1?.type, r2Type: r2?.type, successType };
    });

    expect(res.r1Type).toBe(res.successType);
    expect(res.r2Type).toBe(res.successType);
  });
});

