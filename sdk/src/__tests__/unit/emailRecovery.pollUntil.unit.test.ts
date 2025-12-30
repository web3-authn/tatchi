import { test, expect } from '@playwright/test';
import { setupBasicPasskeyTest } from '../setup';

const IMPORT_PATHS = {
  emailRecovery: '/sdk/esm/core/TatchiPasskey/emailRecovery.js',
} as const;

const CONFIG = {
  relayer: {
    emailRecovery: {
      minBalanceYocto: '0',
      pollingIntervalMs: 10,
      maxPollingDurationMs: 1000,
      pendingTtlMs: 60_000,
      mailtoAddress: 'recovery@example.com',
    },
  },
  contractId: 'contract.testnet',
  nearRpcUrl: 'https://rpc.testnet',
};

test.describe('EmailRecoveryFlow.pollUntil', () => {
  test.beforeEach(async ({ page }) => {
    await setupBasicPasskeyTest(page);
  });

  test('completes when tick resolves done', async ({ page }) => {
    const result = await page.evaluate(async ({ paths, config }) => {
      const mod = await import(paths.emailRecovery);
      if (mod.init_emailRecovery) {
        mod.init_emailRecovery();
      }
      const EmailRecoveryFlow =
        mod.EmailRecoveryFlow ?? mod.emailRecovery_exports?.EmailRecoveryFlow;
      if (!EmailRecoveryFlow) {
        throw new Error('EmailRecoveryFlow export missing');
      }
      const flow = new EmailRecoveryFlow({
        configs: config,
        nearClient: {},
        webAuthnManager: {},
      });

      let now = 0;
      const ticks: Array<{ elapsedMs: number; pollCount: number }> = [];
      const pollUntil = (flow as any).pollUntil.bind(flow);
      const res = await pollUntil({
        intervalMs: 10,
        timeoutMs: 100,
        isCancelled: () => false,
        now: () => now,
        sleep: async (ms: number) => { now += ms; },
        tick: async ({ elapsedMs, pollCount }: { elapsedMs: number; pollCount: number }) => {
          ticks.push({ elapsedMs, pollCount });
          if (pollCount === 2) {
            return { done: true, value: 'ok' };
          }
          return { done: false };
        },
      });

      return { res, ticks };
    }, { paths: IMPORT_PATHS, config: CONFIG });

    expect(result.res.status).toBe('completed');
    expect(result.res.value).toBe('ok');
    expect(result.res.pollCount).toBe(2);
    expect(result.ticks.map((t) => t.pollCount)).toEqual([1, 2]);
  });

  test('times out when elapsed exceeds timeout', async ({ page }) => {
    const result = await page.evaluate(async ({ paths, config }) => {
      const mod = await import(paths.emailRecovery);
      if (mod.init_emailRecovery) {
        mod.init_emailRecovery();
      }
      const EmailRecoveryFlow =
        mod.EmailRecoveryFlow ?? mod.emailRecovery_exports?.EmailRecoveryFlow;
      if (!EmailRecoveryFlow) {
        throw new Error('EmailRecoveryFlow export missing');
      }
      const flow = new EmailRecoveryFlow({
        configs: config,
        nearClient: {},
        webAuthnManager: {},
      });

      let now = 0;
      const pollUntil = (flow as any).pollUntil.bind(flow);
      const res = await pollUntil({
        intervalMs: 10,
        timeoutMs: 15,
        isCancelled: () => false,
        now: () => now,
        sleep: async (ms: number) => { now += ms; },
        tick: async () => ({ done: false }),
      });

      return { res };
    }, { paths: IMPORT_PATHS, config: CONFIG });

    expect(result.res.status).toBe('timedOut');
    expect(result.res.pollCount).toBe(3);
  });
});
