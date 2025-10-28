import { test, expect } from '@playwright/test';

// Verifies that the wallet-service page served by the dev plugin under
// strict CSP renders without inline <style> tags or style="…" attributes.
// CI sets VITE_WALLET_DEV_CSP=strict for these tests.
test('wallet-service under strict CSP has no inline style tags or style attributes', async ({ page, baseURL }) => {
  if (process.env.VITE_WALLET_DEV_CSP !== 'strict') {
    test.skip(true, 'Strict dev CSP not enabled');
  }
  const url = new URL('/wallet-service/', baseURL!).toString();
  const resp = await page.goto(url, { waitUntil: 'domcontentloaded' });
  expect(resp).toBeTruthy();
  const csp = resp!.headers()['content-security-policy'] || '';
  expect(csp).toContain("style-src 'self'");
  expect(csp).toContain("style-src-attr 'none'");

  // Ensure no <style> tags are present
  const styleTagCount = await page.evaluate(() => document.querySelectorAll('style').length);
  expect(styleTagCount).toBe(0);

  // Ensure no elements have a style="…" attribute
  const styleAttrCount = await page.evaluate(() => document.querySelectorAll('[style]').length);
  expect(styleAttrCount).toBe(0);
});
