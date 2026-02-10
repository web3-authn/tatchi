import { test, expect } from '@playwright/test';
import { setupBasicPasskeyTest } from '../setup';

const IMPORT_PATHS = {
  emailRecovery: '/sdk/esm/core/TatchiPasskey/emailRecovery.js',
} as const;

const BASE_CONFIG = {
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
} as const;

test.describe('EmailRecoveryFlow mailto URL generation', () => {
  test.beforeEach(async ({ page }) => {
    await setupBasicPasskeyTest(page);
  });

  test('normalizes recipient list without percent-encoding separators', async ({ page }) => {
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

      const url = (flow as any).buildMailtoUrlInternal({
        requestId: 'ABC123',
        accountId: 'alice.testnet',
        nearPublicKey: 'ed25519:dummy',
      });

      return { url };
    }, {
      paths: IMPORT_PATHS,
      config: {
        ...BASE_CONFIG,
        relayer: {
          ...BASE_CONFIG.relayer,
          emailRecovery: {
            ...BASE_CONFIG.relayer.emailRecovery,
            mailtoAddress: 'mailto:recover+prod@example.com, second@example.com',
          },
        },
      },
    });

    expect(result.url.startsWith('mailto:recover+prod@example.com,second@example.com?subject=')).toBe(true);
    expect(result.url).not.toContain('mailto:mailto:');
    expect(result.url).not.toContain('%40');
    expect(result.url).not.toContain('%2C');
  });

  test('throws a clear error when mailtoAddress is blank', async ({ page }) => {
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

      try {
        (flow as any).buildMailtoUrlInternal({
          requestId: 'ABC123',
          accountId: 'alice.testnet',
          nearPublicKey: 'ed25519:dummy',
        });
        return { ok: true, message: '' };
      } catch (err: unknown) {
        return { ok: false, message: err instanceof Error ? err.message : String(err || '') };
      }
    }, {
      paths: IMPORT_PATHS,
      config: {
        ...BASE_CONFIG,
        relayer: {
          ...BASE_CONFIG.relayer,
          emailRecovery: {
            ...BASE_CONFIG.relayer.emailRecovery,
            mailtoAddress: '   ',
          },
        },
      },
    });

    expect(result.ok).toBe(false);
    expect(result.message).toContain('Email recovery mailbox is not configured');
  });
});

