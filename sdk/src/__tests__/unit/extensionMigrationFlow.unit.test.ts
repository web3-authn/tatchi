import { test, expect } from '@playwright/test';
import { setupBasicPasskeyTest, handleInfrastructureErrors } from '../setup';

const IMPORT_PATHS = {
  migration: '/sdk/esm/core/TatchiPasskey/extensionMigration.js',
  actions: '/sdk/esm/core/types/actions.js',
} as const;

test.describe('ExtensionMigrationFlow', () => {
  test.beforeEach(async ({ page }) => {
    await setupBasicPasskeyTest(page);
  });

  test('links extension key and flips preference', async ({ page }) => {
    const result = await page.evaluate(async ({ paths }) => {
      try {
        const { ExtensionMigrationFlow } = await import(paths.migration);
        const { ActionType } = await import(paths.actions);

        const extensionPublicKey = 'ed25519:extension-key-1';
        const actions: string[] = [];
        const preferenceCalls: boolean[] = [];
        let accessKeyCalls = 0;
        const extensionPrepareCalls: any[] = [];

        const prefs = {
          setCurrentUser: () => {},
          setUseExtensionWallet: (value: boolean) => preferenceCalls.push(value),
        };

        const ctx: any = {
          webAuthnManager: {
            getUserPreferences: () => prefs,
          },
          configs: {
            signerMode: { mode: 'local-signer' },
            iframeWallet: {
              extensionWalletOrigin: 'chrome-extension://tatchi-test',
              walletOrigin: 'https://wallet.test',
            },
          },
          nearClient: null,
          theme: 'dark',
        };

        const webRouter: any = {
          init: async () => {},
          executeAction: async ({ actionArgs }: any) => {
            actions.push(actionArgs.type);
            if (actionArgs.type !== ActionType.AddKey) {
              return { success: false, error: 'unexpected action' };
            }
            return { success: true, transactionId: 'tx-add-key' };
          },
          viewAccessKeyList: async () => {
            accessKeyCalls += 1;
            return { keys: [{ public_key: extensionPublicKey }] };
          },
          getLoginSession: async () => ({ login: { publicKey: 'ed25519:web-key' } }),
          clearUserData: async () => {},
          dispose: () => {},
        };

        const flow = new ExtensionMigrationFlow(
          ctx,
          {},
          { getWebWalletRouter: async () => webRouter }
        );

        (flow as any).createExtensionRouter = async () => ({
          init: async () => {},
          ping: async () => {},
          getCapabilities: async () => ({ protocolVersion: 1, isChromeExtension: true, hasPrfExtension: true }),
          prepareExtensionMigration: async (args: any) => {
            extensionPrepareCalls.push(args);
            return {
              success: true,
              clientNearPublicKey: extensionPublicKey,
              nearAccountId: 'alice.testnet',
            };
          },
          finalizeExtensionMigration: async () => ({ success: true, transactionId: 'tx-device-register' }),
          dispose: () => {},
        });

        const res = await flow.start({ accountId: 'alice.testnet' });

        return {
          success: true,
          resSuccess: res?.success,
          actions,
          accessKeyCalls,
          preferenceCalls,
          extensionPrepareCalls,
        };
      } catch (error: any) {
        return { success: false, error: error?.message || String(error) };
      }
    }, { paths: IMPORT_PATHS });

    if (!result.success) {
      if (handleInfrastructureErrors(result)) return;
      expect(result.success, result.error || 'unknown error').toBe(true);
      return;
    }

    expect(result.resSuccess).toBe(true);
    expect(result.actions).toEqual(['AddKey']);
    expect(result.accessKeyCalls).toBeGreaterThan(0);
    expect(result.preferenceCalls).toEqual([true]);
    const extensionPrepareCalls = (result as any).extensionPrepareCalls as any[] | undefined;
    expect(extensionPrepareCalls?.length).toBe(1);
    expect(extensionPrepareCalls?.[0]?.accountId).toBe('alice.testnet');
  });

  test('does not attempt to remove extension key on verification failure', async ({ page }) => {
    const result = await page.evaluate(async ({ paths }) => {
      try {
        const { ExtensionMigrationFlow } = await import(paths.migration);

        const extensionPublicKey = 'ed25519:extension-key-2';
        const actions: string[] = [];
        const preferenceCalls: boolean[] = [];

        const prefs = {
          setCurrentUser: () => {},
          setUseExtensionWallet: (value: boolean) => preferenceCalls.push(value),
        };

        const ctx: any = {
          webAuthnManager: {
            getUserPreferences: () => prefs,
          },
          configs: {
            signerMode: { mode: 'local-signer' },
            iframeWallet: {
              extensionWalletOrigin: 'chrome-extension://tatchi-test',
              walletOrigin: 'https://wallet.test',
            },
          },
          nearClient: null,
          theme: 'dark',
        };

        const webRouter: any = {
          init: async () => {},
          executeAction: async ({ actionArgs }: any) => {
            actions.push(actionArgs.type);
            return { success: true, transactionId: 'tx' };
          },
          viewAccessKeyList: async () => ({ keys: [] }),
          getLoginSession: async () => ({ login: { publicKey: 'ed25519:web-key' } }),
          clearUserData: async () => {},
          dispose: () => {},
        };

        const flow = new ExtensionMigrationFlow(
          ctx,
          {},
          { getWebWalletRouter: async () => webRouter }
        );

        (flow as any).createExtensionRouter = async () => ({
          init: async () => {},
          ping: async () => {},
          getCapabilities: async () => ({ protocolVersion: 1, isChromeExtension: true }),
          prepareExtensionMigration: async () => ({
            success: true,
            clientNearPublicKey: extensionPublicKey,
            nearAccountId: 'alice.testnet',
          }),
          finalizeExtensionMigration: async () => ({ success: true, transactionId: 'tx-device-register' }),
          dispose: () => {},
        });

        (flow as any).verifyKeyOnChain = async () => false;

        try {
          await flow.start({ accountId: 'alice.testnet' });
          return { success: false, error: 'expected migration to fail' };
        } catch (err: any) {
          return {
            success: true,
            errorMessage: err?.message || String(err),
            actions,
            preferenceCalls,
          };
        }
      } catch (error: any) {
        return { success: false, error: error?.message || String(error) };
      }
    }, { paths: IMPORT_PATHS });

    if (!result.success) {
      if (handleInfrastructureErrors(result)) return;
      expect(result.success, result.error || 'unknown error').toBe(true);
      return;
    }

    expect(result.actions).toEqual(['AddKey']);
    expect(result.preferenceCalls).toEqual([]);
  });

  test('reverts preference when extension goes missing after migration', async ({ page }) => {
    const result = await page.evaluate(async ({ paths }) => {
      try {
        const { ExtensionMigrationFlow } = await import(paths.migration);

        const extensionPublicKey = 'ed25519:extension-key-3';
        const actions: string[] = [];
        const preferenceCalls: boolean[] = [];
        let extensionPingCalls = 0;

        const prefs = {
          setCurrentUser: () => {},
          setUseExtensionWallet: (value: boolean) => preferenceCalls.push(value),
        };

        const ctx: any = {
          webAuthnManager: {
            getUserPreferences: () => prefs,
          },
          configs: {
            signerMode: { mode: 'local-signer' },
            iframeWallet: {
              extensionWalletOrigin: 'chrome-extension://tatchi-test',
              walletOrigin: 'https://wallet.test',
            },
          },
          nearClient: null,
          theme: 'dark',
        };

        const webRouter: any = {
          init: async () => {},
          executeAction: async ({ actionArgs }: any) => {
            actions.push(actionArgs.type);
            return { success: true, transactionId: 'tx' };
          },
          viewAccessKeyList: async () => ({ keys: [{ public_key: extensionPublicKey }] }),
          getLoginSession: async () => ({ login: { publicKey: 'ed25519:web-key' } }),
          clearUserData: async () => {},
          dispose: () => {},
        };

        const flow = new ExtensionMigrationFlow(
          ctx,
          {},
          { getWebWalletRouter: async () => webRouter }
        );

        (flow as any).createExtensionRouter = async () => ({
          init: async () => {
          },
          ping: async () => {
            extensionPingCalls += 1;
            if (extensionPingCalls >= 2) {
              throw new Error('Extension unreachable after migration');
            }
          },
          getCapabilities: async () => ({ protocolVersion: 1, isChromeExtension: true }),
          prepareExtensionMigration: async () => ({
            success: true,
            clientNearPublicKey: extensionPublicKey,
            nearAccountId: 'alice.testnet',
          }),
          finalizeExtensionMigration: async () => ({ success: true, transactionId: 'tx-device-register' }),
          dispose: () => {},
        });

        try {
          await flow.start({ accountId: 'alice.testnet' });
          return { success: false, error: 'expected migration to fail' };
        } catch (err: any) {
          return {
            success: true,
            errorMessage: err?.message || String(err),
            actions,
            preferenceCalls,
            extensionPingCalls,
          };
        }
      } catch (error: any) {
        return { success: false, error: error?.message || String(error) };
      }
    }, { paths: IMPORT_PATHS });

    if (!result.success) {
      if (handleInfrastructureErrors(result)) return;
      expect(result.success, result.error || 'unknown error').toBe(true);
      return;
    }

    expect(result.actions).toEqual(['AddKey']);
    expect(result.preferenceCalls).toEqual([true, false]);
    expect(result.extensionPingCalls).toBeGreaterThanOrEqual(2);
  });
});
