import { test, expect } from '@playwright/test';
import { setupBasicPasskeyTest } from '../setup';

const IMPORT_PATHS = {
  logout: '/sdk/esm/core/TatchiPasskey/login.js',
  signerWorkerManager: '/sdk/esm/core/WebAuthnManager/SignerWorkerManager/index.js',
  vrfWorkerManager: '/sdk/esm/core/WebAuthnManager/VrfWorkerManager/index.js',
} as const;

test.describe('logout teardown', () => {
  test.beforeEach(async ({ page }) => {
    await setupBasicPasskeyTest(page);
  });

  test('logoutAndClearSession resets ephemeral signing state', async ({ page }) => {
    const result = await page.evaluate(async ({ paths }) => {
      const mod = await import(paths.logout);
      const logoutAndClearSession = mod.logoutAndClearSession as (ctx: any) => Promise<void>;

      const calls = {
        clearVrfSession: 0,
        resetSigningState: 0,
        nonceClear: 0,
      };

      const context: any = {
        webAuthnManager: {
          clearVrfSession: async () => { calls.clearVrfSession++; },
          resetSigningState: () => { calls.resetSigningState++; },
          getNonceManager: () => ({ clear: () => { calls.nonceClear++; } }),
        },
      };

      await logoutAndClearSession(context);
      return calls;
    }, { paths: IMPORT_PATHS });

    expect(result.clearVrfSession).toBe(1);
    expect(result.resetSigningState).toBe(1);
    expect(result.nonceClear).toBe(1);
  });

  test('logoutAndClearSession does not block on stuck VRF clear', async ({ page }) => {
    const result = await page.evaluate(async ({ paths }) => {
      const mod = await import(paths.logout);
      const logoutAndClearSession = mod.logoutAndClearSession as (ctx: any) => Promise<void>;

      const calls = { reset: 0 };
      const context: any = {
        webAuthnManager: {
          clearVrfSession: async () => new Promise<void>(() => {}),
          resetSigningState: () => { calls.reset++; },
          getNonceManager: () => ({ clear: () => {} }),
        },
      };

      const originalSetTimeout = globalThis.setTimeout;
      // Force the logout "race" timer to resolve immediately to keep the test fast.
      (globalThis as any).setTimeout = (fn: (...args: any[]) => void) => originalSetTimeout(fn, 0);
      const start = performance.now();
      try {
        await logoutAndClearSession(context);
      } finally {
        (globalThis as any).setTimeout = originalSetTimeout;
      }
      const elapsedMs = performance.now() - start;
      return { calls, elapsedMs };
    }, { paths: IMPORT_PATHS });

    expect(result.calls.reset).toBe(1);
    expect(result.elapsedMs).toBeLessThan(200);
  });

  test('SignerWorkerManager.reset terminates sessions and pool', async ({ page }) => {
    const result = await page.evaluate(async ({ paths }) => {
      const mod = await import(paths.signerWorkerManager);
      const SignerWorkerManager = mod.SignerWorkerManager as any;

      const terminated: string[] = [];
      const closed: string[] = [];

      const makeWorker = (id: string) =>
        ({ terminate: () => terminated.push(id) }) as unknown as Worker;
      const makePort = (id: string) =>
        ({ close: () => closed.push(id) }) as unknown as MessagePort;

      const mgr = new SignerWorkerManager(
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        'https://relay.example.invalid',
      );

      (mgr as any).workerPool = [makeWorker('pool-1'), makeWorker('pool-2')];
      (mgr as any).signingSessions = new Map([
        ['s1', { worker: makeWorker('sess-1'), wrapKeySeedPort: makePort('port-1'), createdAt: Date.now() }],
      ]);

      mgr.reset();

      return {
        terminated,
        closed,
        poolSize: (mgr as any).workerPool.length,
        sessionsSize: (mgr as any).signingSessions.size,
      };
    }, { paths: IMPORT_PATHS });

    expect(result.closed).toEqual(['port-1']);
    expect(result.terminated.sort()).toEqual(['pool-1', 'pool-2', 'sess-1'].sort());
    expect(result.poolSize).toBe(0);
    expect(result.sessionsSize).toBe(0);
  });

  test('VrfWorkerManager.resetWorker clears worker state', async ({ page }) => {
    const result = await page.evaluate(async ({ paths }) => {
      const mod = await import(paths.vrfWorkerManager);
      const VrfWorkerManager = mod.VrfWorkerManager as any;

      let terminated = 0;
      const mgr = new VrfWorkerManager({}, {
        touchIdPrompt: {} as any,
        nearClient: {} as any,
        indexedDB: {} as any,
        userPreferencesManager: {} as any,
        nonceManager: {} as any,
      });

      (mgr as any).vrfWorker = ({ terminate: () => { terminated++; } } as unknown as Worker);
      (mgr as any).initializationPromise = Promise.resolve();
      (mgr as any).currentVrfAccountId = 'alice.testnet';

      mgr.resetWorker();

      return {
        terminated,
        hasWorker: !!(mgr as any).vrfWorker,
        hasInitPromise: !!(mgr as any).initializationPromise,
        currentVrfAccountId: (mgr as any).currentVrfAccountId,
      };
    }, { paths: IMPORT_PATHS });

    expect(result.terminated).toBe(1);
    expect(result.hasWorker).toBe(false);
    expect(result.hasInitPromise).toBe(false);
    expect(result.currentVrfAccountId).toBe(null);
  });
});

