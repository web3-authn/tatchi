import { test, expect } from '@playwright/test';
import { setupBasicPasskeyTest } from '../setup';

const IMPORT_PATHS = {
  cssLoader: '/sdk/esm/core/WebAuthnManager/LitComponents/css/css-loader.js',
} as const;

test.describe('css-loader shadow-root fallback', () => {
  test.beforeEach(async ({ page }) => {
    await setupBasicPasskeyTest(page);
  });

  test('injects a shadow-root <link> when constructable stylesheet fetch fails', async ({ page }) => {
    const result = await page.evaluate(async ({ paths }) => {
      const { ensureExternalStyles } = await import(paths.cssLoader);

      const host = document.createElement('div');
      const shadow = host.attachShadow({ mode: 'open' });
      document.body.appendChild(host);

      const origFetch = window.fetch;
      try {
        (window as any).fetch = async () => {
          throw new Error('fetch blocked');
        };
        await ensureExternalStyles(shadow, 'halo-border.css', 'data-test-halo-border');
        const link = shadow.querySelector('link[data-test-halo-border]') as HTMLLinkElement | null;
        return { href: link?.href || null };
      } finally {
        (window as any).fetch = origFetch;
        try { host.remove(); } catch {}
      }
    }, { paths: IMPORT_PATHS });

    expect(result.href).toContain('halo-border.css');
  });
});

