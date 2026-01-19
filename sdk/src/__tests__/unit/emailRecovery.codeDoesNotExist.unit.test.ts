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
} as const;

test.describe('EmailRecovery: contract not deployed', () => {
  test.beforeEach(async ({ page }) => {
    await setupBasicPasskeyTest(page);
  });

  test('returns a user-facing error when CodeDoesNotExist is seen while polling', async ({ page }) => {
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

      const codeDoesNotExistErr = {
        message: 'View Function failed at action 0 (ActionError: FunctionCallError)',
        details: {
          TxExecutionError: {
            ActionError: {
              kind: {
                FunctionCallError: {
                  CompilationError: {
                    CodeDoesNotExist: {
                      accountId: 'test-nerp6.w3a-v1.testnet',
                    },
                  },
                },
              },
              index: 0,
            },
          },
        },
      };

      const nearClient = {
        view: async () => {
          throw codeDoesNotExistErr;
        },
      };

      const flow = new EmailRecoveryFlow({
        configs: config,
        nearClient,
        webAuthnManager: {},
      });

      const rec = {
        accountId: 'test-nerp6.w3a-v1.testnet',
        requestId: 'REQ1',
        nearPublicKey: 'ed25519:abc',
      };

      return await (flow as any).checkViaEmailRecovererAttempt(rec);
    }, { paths: IMPORT_PATHS, config: CONFIG });

    expect(result?.completed).toBe(true);
    expect(result?.success).toBe(false);
    expect(String(result?.errorMessage || '')).toContain('Email Recoverer contract');
  });
});

