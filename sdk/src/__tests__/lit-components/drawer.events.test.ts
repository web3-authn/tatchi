import { test, expect } from '@playwright/test';
import { setupBasicPasskeyTest } from '../setup';
import { ensureComponentModule, mountComponent } from './harness';

// We load the wrapper module which includes the drawer variant and its internals
const WRAPPER_MODULE = '/sdk/w3a-tx-confirmer.js';
const WRAPPER_TAG = 'w3a-tx-confirmer';

test.describe('Lit component – drawer events', () => {
  test.beforeEach(async ({ page }) => {
    await setupBasicPasskeyTest(page);
    await ensureComponentModule(page, {
      modulePath: WRAPPER_MODULE,
      tagName: WRAPPER_TAG,
    });
  });

  test('emits open/close lifecycle events', async ({ page }) => {
    // Mount the wrapper in drawer variant (renders <w3a-drawer> internally)
    await mountComponent(page, {
      tagName: WRAPPER_TAG,
      props: {
        variant: 'drawer',
        nearAccountId: 'demo.testnet',
        txSigningRequests: [],
        theme: 'dark',
      },
    });

    // Attach listeners to the inner <w3a-drawer>
    const counters = await page.evaluate(async () => {
      const wrapper = document.querySelector('w3a-tx-confirmer') as HTMLElement | null;
      if (!wrapper) throw new Error('wrapper not found');
      // Wait a tick for the child to render
      await new Promise((r) => setTimeout(r, 0));
      const child = wrapper.querySelector('w3a-drawer-tx-confirmer') as HTMLElement | null;
      if (!child) throw new Error('drawer variant element not found');
      const drawerRoot = (child as any).shadowRoot || child;
      const drawer = drawerRoot.querySelector('w3a-drawer') as HTMLElement | null;
      if (!drawer) throw new Error('w3a-drawer not found');

      const counts = { os: 0, oe: 0, cs: 0, ce: 0 };
      drawer.addEventListener('w3a:drawer-open-start', () => counts.os++);
      drawer.addEventListener('w3a:drawer-open-end', () => counts.oe++);
      drawer.addEventListener('w3a:drawer-close-start', () => counts.cs++);
      drawer.addEventListener('w3a:drawer-close-end', () => counts.ce++);

      // Return handles for later interaction
      (window as any).__drawerTestRefs = { wrapper, child, drawer, counts };
      return counts;
    });

    // Expect at least an open-start (viewer opens after styles/rAF)
    await expect.poll(async () => (await page.evaluate(() => (window as any).__drawerTestRefs?.counts?.os || 0))).toBeGreaterThan(0);

    // Simulate overlay click to close
    await page.evaluate(() => {
      const refs = (window as any).__drawerTestRefs;
      const root = refs.drawer.shadowRoot || refs.drawer;
      const overlay = root.querySelector('.overlay') as HTMLElement | null;
      overlay?.click();
    });

    await expect.poll(async () => (await page.evaluate(() => (window as any).__drawerTestRefs?.counts?.cs || 0))).toBeGreaterThan(0);
    await expect.poll(async () => (await page.evaluate(() => (window as any).__drawerTestRefs?.counts?.ce || 0))).toBeGreaterThan(0);
  });
});
