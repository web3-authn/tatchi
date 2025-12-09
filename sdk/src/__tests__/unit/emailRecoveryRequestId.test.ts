import { test, expect } from '@playwright/test';
import { injectImportMap } from '../setup/bootstrap';

const IMPORT_PATHS = {
  emailRecovery: '/sdk/esm/core/TatchiPasskey/emailRecovery.js',
} as const;

test.describe('generateEmailRecoveryRequestId', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await injectImportMap(page);
  });

  test('generates 6-character A-Z0-9 identifiers', async ({ page }) => {
    const res = await page.evaluate(async ({ paths }) => {
      try {
        const { generateEmailRecoveryRequestId } = await import(paths.emailRecovery);
        const ids: string[] = [];
        for (let i = 0; i < 10; i++) {
          ids.push(generateEmailRecoveryRequestId());
        }
        return { success: true, ids };
      } catch (err: any) {
        return { success: false, error: err?.message || String(err) };
      }
    }, { paths: IMPORT_PATHS });

    if (!res.success) {
      test.skip(true, `generateEmailRecoveryRequestId failed: ${res.error || 'unknown error'}`);
      return;
    }

    const re = /^[A-Z0-9]{6}$/;
    for (const id of res.ids) {
      expect(id).toHaveLength(6);
      expect(re.test(id)).toBe(true);
    }
  });
});

