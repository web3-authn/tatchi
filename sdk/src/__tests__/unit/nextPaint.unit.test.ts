import { test, expect } from '@playwright/test';
import { setupBasicPasskeyTest } from '../setup';

const IMPORT_PATHS = {
  nextPaint: '/sdk/esm/core/WebAuthnManager/LitComponents/common/nextPaint.js',
} as const;

test.describe('waitForNextPaint', () => {
  test.beforeEach(async ({ page }) => {
    await setupBasicPasskeyTest(page);
  });

  test('resolves via timeout when requestAnimationFrame never fires', async ({ page }) => {
    const result = await page.evaluate(async ({ paths }) => {
      const { waitForNextPaint } = await import(paths.nextPaint);
      const orig = window.requestAnimationFrame;
      try {
        (window as any).requestAnimationFrame = () => 0;
        const start = performance.now();
        await waitForNextPaint({ frames: 2, timeoutMs: 25 });
        const elapsedMs = performance.now() - start;
        return { elapsedMs };
      } finally {
        (window as any).requestAnimationFrame = orig;
      }
    }, { paths: IMPORT_PATHS });

    expect(result.elapsedMs).toBeLessThan(2000);
  });
});

