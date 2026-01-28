import { test, expect } from '@playwright/test';
import { setupBasicPasskeyTest } from '../setup';

const IMPORT_PATHS = {
  transport: '/sdk/esm/core/WalletIframe/client/IframeTransport.js',
} as const;

test.describe('IframeTransport allow attribute', () => {
  test.beforeEach(async ({ page }) => {
    await setupBasicPasskeyTest(page);
  });

  test('uses wildcard delegation for chrome-extension origins', async ({ page }) => {
    const allow = await page.evaluate(async ({ paths }) => {
      const { IframeTransport } = await import(paths.transport);
      const transport = new IframeTransport({
        walletOrigin: 'chrome-extension://exampleextensionid',
        servicePath: '/wallet-service.html',
        connectTimeoutMs: 10,
      });
      const iframe = transport.ensureIframeMounted();
      const allowAttr = iframe.getAttribute('allow') || '';
      try { transport.dispose({ removeIframe: true }); } catch {}
      return allowAttr;
    }, { paths: IMPORT_PATHS });

    expect(allow).toContain('publickey-credentials-create *');
    expect(allow).toContain('publickey-credentials-get *');
  });

  test('allowlists https wallet origin', async ({ page }) => {
    const allow = await page.evaluate(async ({ paths }) => {
      const { IframeTransport } = await import(paths.transport);
      const transport = new IframeTransport({
        walletOrigin: 'https://wallet.example.localhost',
        servicePath: '/wallet-service',
        connectTimeoutMs: 10,
      });
      const iframe = transport.ensureIframeMounted();
      const allowAttr = iframe.getAttribute('allow') || '';
      try { transport.dispose({ removeIframe: true }); } catch {}
      return allowAttr;
    }, { paths: IMPORT_PATHS });

    expect(allow).toContain("publickey-credentials-create 'self' https://wallet.example.localhost");
    expect(allow).toContain("publickey-credentials-get 'self' https://wallet.example.localhost");
  });
});

