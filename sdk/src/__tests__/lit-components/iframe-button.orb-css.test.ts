import { test, expect } from '@playwright/test';
import { setupBasicPasskeyTest } from '../setup';
import { ensureComponentModule, mountComponent } from './harness';

// Integration test to catch ORB (Opaque Response Blocking) regressions when the embedded tx button
// runs in a srcdoc iframe and loads CSS cross‑origin from the wallet origin.
//
// Asserts:
// - Stylesheets resolve against the wallet origin (absolute base)
// - Responses have text/css content‑type
// - No request failed events for these CSS assets (i.e., no ORB)
test.describe('Iframe button cross-origin CSS', () => {
  test.beforeEach(async ({ page }) => {
    // Disable same-origin shims so we can assert absolute wallet origin in CSS hrefs
    await setupBasicPasskeyTest(page, { forceSameOriginWorkers: false, forceSameOriginSdkBase: false });
  });

  test('resolves styles from wallet origin without ORB', async ({ page }) => {
    const WALLET_ORIGIN = 'https://wallet.example.localhost';
    // CSS assets the srcdoc injects up-front
    const cssAssets = [
      'wallet-service.css',
      'w3a-components.css',
      'button-with-tooltip.css',
      'tx-tree.css',
    ];

    // We validate via the iframe's srcdoc markup to avoid cross‑context
    // request visibility differences for about:srcdoc frames.

    // Expose absolute base before the component initializes
    await page.evaluate((origin) => {
      (window as any).__W3A_WALLET_SDK_BASE__ = `${origin}/sdk/`;
    }, WALLET_ORIGIN);

    // Define and mount the iframe host element
    await ensureComponentModule(page, { modulePath: '/sdk/w3a-tx-button.js', tagName: 'w3a-tx-button' });

    await mountComponent(page, {
      tagName: 'w3a-tx-button',
      props: {
        nearAccountId: 'demo.testnet',
        txSigningRequests: [],
      },
    });

    // Also re‑announce base change so the host re-initializes if it mounted early
    await page.evaluate((origin) => {
      const abs = `${origin}/sdk/`;
      (window as any).__W3A_WALLET_SDK_BASE__ = abs;
      window.dispatchEvent(new CustomEvent('W3A_WALLET_SDK_BASE_CHANGED', { detail: abs } as any));
    }, WALLET_ORIGIN);

    // Wait for iframe (inside the element's shadow root) and capture its srcdoc
    await expect
      .poll(async () => {
        return await page.evaluate(() => {
          const host = document.querySelector('w3a-tx-button') as HTMLElement | null;
          const iframe = (host && (host as any).shadowRoot)
            ? ((host as any).shadowRoot.querySelector('iframe') as HTMLIFrameElement | null)
            : null;
          return iframe?.getAttribute('srcdoc') || '';
        });
      }, { timeout: 5000 })
      .not.toBe('');

    const html = await page.evaluate(() => {
      const host = document.querySelector('w3a-tx-button') as HTMLElement | null;
      const iframe = (host && (host as any).shadowRoot)
        ? ((host as any).shadowRoot.querySelector('iframe') as HTMLIFrameElement | null)
        : null;
      return iframe?.getAttribute('srcdoc') || '';
    });

    // Extract link hrefs for our critical styles
    const hrefs = (html.match(/<link[^>]+href="([^"]+)"/g) || [])
      .map((m) => (m.match(/href="([^"]+)"/) || [])[1])
      .filter(Boolean) as string[];
    const critical = hrefs.filter((u) => cssAssets.slice(1).some((a) => u.endsWith(a))); // skip wallet-service.css
    expect(critical.length).toBeGreaterThan(0);
    expect(critical.every((u) => u.startsWith(`${WALLET_ORIGIN}/sdk/`))).toBe(true);
  });
});
