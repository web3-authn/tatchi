import { test, expect } from '@playwright/test';
import { setupBasicPasskeyTest } from '../setup';

const IMPORT_PATHS = {
  provider: '/sdk/esm/react/context/TatchiPasskeyProvider.js',
  passkeyAuthMenu: '/sdk/esm/react/components/PasskeyAuthMenu/passkeyAuthMenuCompat.js',
  reactStyles: '/sdk/esm/react/styles/styles.css',
} as const;

test.describe('PasskeyAuthMenu styles bootstrap', () => {
  test.beforeEach(async ({ page }) => {
    await setupBasicPasskeyTest(page, { skipPasskeyManagerInit: true });
  });

  test('renders styled UI when react/styles is loaded before mount', async ({ page }) => {
    await page.evaluate(async ({ paths }) => {
      // Simulate app bootstrap: load SDK styles once at the root before mounting any UI.
      await new Promise<void>((resolve, reject) => {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = paths.reactStyles;
        link.addEventListener('load', () => resolve());
        link.addEventListener('error', () => reject(new Error(`Failed to load: ${paths.reactStyles}`)));
        document.head.appendChild(link);
      });

      const mount = document.createElement('div');
      mount.id = 'pam2-test-mount';
      document.body.appendChild(mount);

      const React = await import('react');
      const ReactDOM = await import('react-dom/client');
      const providerMod: any = await import(paths.provider);
      const menuMod: any = await import(paths.passkeyAuthMenu);

      const Provider = providerMod.TatchiPasskeyProvider || providerMod.default;
      const PasskeyAuthMenu = menuMod.PasskeyAuthMenu || menuMod.default;

      const config = {
        nearNetwork: 'testnet',
        nearRpcUrl: 'https://test.rpc.fastnear.com',
        contractId: 'w3a-v1.testnet',
        relayer: { url: 'https://relay-server.localhost' },
        // Disable wallet iframe mode for this unit test (no iframe handshake / COEP concerns).
        iframeWallet: { walletOrigin: '' },
      };

      const root = ReactDOM.createRoot(mount);
      root.render(
        React.createElement(
          Provider,
          { config },
          React.createElement(PasskeyAuthMenu, null),
        ),
      );
    }, { paths: IMPORT_PATHS });

    const mount = page.locator('#pam2-test-mount');
    await mount.locator('.w3a-signup-menu-root:not(.w3a-skeleton)').waitFor({ state: 'attached' });
    await expect(mount.locator('.w3a-seg')).toHaveCount(1);
    await expect(mount.locator('.w3a-arrow-btn')).toHaveCount(1);

    const root = mount.locator('.w3a-signup-menu-root:not(.w3a-skeleton)');
    const sentinel = await root.evaluate((el) =>
      window.getComputedStyle(el).getPropertyValue('--w3a-pam2-css-ready').trim(),
    );
    expect(sentinel).toBe('1');

    const radius = await root.evaluate((el) => window.getComputedStyle(el).borderTopLeftRadius);
    expect(radius).not.toBe('0px');
  });
});
