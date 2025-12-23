import { test, expect } from '@playwright/test';
import { setupBasicPasskeyTest } from '../setup';
import { ensureComponentModule, mountComponent } from './harness';

const COMPONENT_MODULE = '/sdk/w3a-button-with-tooltip.js';
const COMPONENT_TAG = 'w3a-button-with-tooltip';

test('COEP strict: app is crossOriginIsolated and Lit components mount', async ({ page }) => {
  if (process.env.VITE_COEP_MODE !== 'strict') {
    test.skip(true, 'VITE_COEP_MODE is not strict');
  }

  await setupBasicPasskeyTest(page);

  const origin = (() => {
    try { return new URL(page.url()).origin; } catch { return ''; }
  })();
  expect(origin).not.toBe('');

  const docResp = await page.request.get(`${origin}/`);
  expect(docResp.ok()).toBeTruthy();
  const headers = docResp.headers();
  expect(headers['cross-origin-embedder-policy']).toBe('require-corp');
  expect(headers['cross-origin-opener-policy']).toBe('same-origin');

  const isolated = await page.evaluate(() => window.crossOriginIsolated);
  expect(isolated).toBe(true);

  await ensureComponentModule(page, { modulePath: COMPONENT_MODULE, tagName: COMPONENT_TAG });
  await mountComponent(page, {
    tagName: COMPONENT_TAG,
    props: {
      nearAccountId: 'demo.testnet',
      txSigningRequests: [],
      tooltip: {
        width: '360px',
        height: 'auto',
        position: 'top-center',
        offset: '8px',
      },
    },
  });

  await page.waitForFunction(() => {
    const host = document.querySelector('w3a-button-with-tooltip');
    return !!host && !!host.shadowRoot;
  });
});

