import { test, expect } from '@playwright/test';
import { setupBasicPasskeyTest } from '../setup';

const IMPORT_PATHS = {
  indexedDBManager: '/sdk/esm/core/IndexedDBManager/index.js',
  userPreferences: '/sdk/esm/core/WebAuthnManager/userPreferences.js',
} as const;

test.describe('UserPreferences when IndexedDB is disabled', () => {
  test.beforeEach(async ({ page }) => {
    await setupBasicPasskeyTest(page);
  });

  test('setCurrentUser does not cause unhandledrejection', async ({ page }) => {
    const result = await page.evaluate(async ({ paths }) => {
      const { IndexedDBManager } = await import(paths.indexedDBManager);
      const userPreferences = (await import(paths.userPreferences)).default as any;

      // Simulate app-origin wallet-iframe mode where IndexedDB is intentionally disabled.
      IndexedDBManager.clientDB.setDisabled(true);

      const unhandled: string[] = [];
      const onUnhandled = (e: PromiseRejectionEvent) => {
        try {
          const reason: any = (e as any).reason;
          unhandled.push(String(reason?.message || reason || e));
        } catch {
          unhandled.push('unknown');
        }
      };
      window.addEventListener('unhandledrejection', onUnhandled);

      try {
        userPreferences.setCurrentUser('alice.testnet' as any);
        await new Promise((r) => setTimeout(r, 0));
      } finally {
        window.removeEventListener('unhandledrejection', onUnhandled);
      }

      return { unhandled };
    }, { paths: IMPORT_PATHS });

    expect(result.unhandled).toEqual([]);
  });
});
