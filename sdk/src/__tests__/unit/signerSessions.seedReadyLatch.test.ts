import { test, expect } from '@playwright/test';
import { setupBasicPasskeyTest, handleInfrastructureErrors } from '../setup';

const IMPORT_PATHS = {
  manager: '/sdk/esm/core/WebAuthnManager/SignerWorkerManager/index.js',
  ctrl: '/sdk/esm/core/workerControlMessages.js',
} as const;

test.describe('Signer sessions – WRAP_KEY_SEED_READY latch', () => {
  test.beforeEach(async ({ page }) => {
    await setupBasicPasskeyTest(page);
  });

  test('waitForSeedReady resolves even if ready arrives before wait starts', async ({ page }) => {
    const result = await page.evaluate(async ({ paths }) => {
      try {
        const { SignerWorkerManager } = await import(paths.manager);
        const { WorkerControlMessage } = await import(paths.ctrl);

        const listeners = new Set<(ev: any) => void>();
        const worker: any = {
          addEventListener(type: string, handler: any) {
            if (type === 'message') listeners.add(handler);
          },
          removeEventListener(type: string, handler: any) {
            if (type === 'message') listeners.delete(handler);
          },
          postMessage(msg: any) {
            if (msg?.type === WorkerControlMessage.ATTACH_WRAP_KEY_SEED_PORT) {
              // Simulate a fast seed-ready message arriving before the session is
              // fully recorded in the SignerWorkerManager map.
              for (const fn of listeners) {
                fn({ data: { type: WorkerControlMessage.WRAP_KEY_SEED_READY, sessionId: msg.sessionId } });
              }
              for (const fn of listeners) {
                fn({ data: { type: WorkerControlMessage.ATTACH_WRAP_KEY_SEED_PORT_OK, sessionId: msg.sessionId } });
              }
            }
          },
          terminate() { },
        };

        const mgr: any = new SignerWorkerManager({} as any, {} as any, {} as any, {} as any);
        mgr.workerPool = [worker];
        // Avoid background replacement-worker creation in this unit test.
        mgr.terminateAndReplaceWorker = () => { };

        const sessionId = 'sess-seed-ready-early';
        await mgr.reserveSignerWorkerSession(sessionId);
        await mgr.waitForSeedReady(sessionId, 50);
        mgr.releaseSigningSession(sessionId);

        return { success: true };
      } catch (error: any) {
        return { success: false, error: error?.message ?? String(error), stack: error?.stack };
      }
    }, { paths: IMPORT_PATHS });

    if (!result.success) {
      if (handleInfrastructureErrors(result)) return;
      throw new Error(result.error || 'seedReadyLatch test failed');
    }

    expect(result.success).toBe(true);
  });
});
