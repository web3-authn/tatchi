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
      const ReactDOMClient = await import('react-dom/client');
      const ReactDOM = await import('react-dom');
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

      const root = ReactDOMClient.createRoot(mount);
      ReactDOM.flushSync(() => {
        root.render(
          React.createElement(
            Provider,
            { config },
            React.createElement(PasskeyAuthMenu, null),
          ),
        );
      });

      // Save refs so the test can unmount/remount and assert no fallback flash after the first load.
      (window as any).__w3a_pam2_root__ = root;
      (window as any).__w3a_pam2_config__ = config;
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

    const remount = await page.evaluate(async ({ paths }) => {
      const mount = document.getElementById('pam2-test-mount');
      if (!mount) throw new Error('missing #pam2-test-mount');

      const existingRoot = (window as any).__w3a_pam2_root__;
      if (existingRoot?.unmount) existingRoot.unmount();

      const React = await import('react');
      const ReactDOMClient = await import('react-dom/client');
      const ReactDOM = await import('react-dom');
      const providerMod: any = await import(paths.provider);
      const menuMod: any = await import(paths.passkeyAuthMenu);

      const Provider = providerMod.TatchiPasskeyProvider || providerMod.default;
      const PasskeyAuthMenu = menuMod.PasskeyAuthMenu || menuMod.default;

      const config = (window as any).__w3a_pam2_config__ || {
        nearNetwork: 'testnet',
        nearRpcUrl: 'https://test.rpc.fastnear.com',
        contractId: 'w3a-v1.testnet',
        relayer: { url: 'https://relay-server.localhost' },
        iframeWallet: { walletOrigin: '' },
      };

      const root = ReactDOMClient.createRoot(mount);
      ReactDOM.flushSync(() => {
        root.render(
          React.createElement(
            Provider,
            { config },
            React.createElement(PasskeyAuthMenu, null),
          ),
        );
      });
      (window as any).__w3a_pam2_root__ = root;

      const hadSkeletonAtFirstFrame = await new Promise<boolean>((resolve) => {
        requestAnimationFrame(() => {
          resolve(!!mount.querySelector('.w3a-signup-menu-root.w3a-skeleton'));
        });
      });

      const hasClientMenuAtFirstFrame = !!mount.querySelector('.w3a-signup-menu-root:not(.w3a-skeleton)');

      return { hadSkeletonAtFirstFrame, hasClientMenuAtFirstFrame };
    }, { paths: IMPORT_PATHS });

    expect(remount.hadSkeletonAtFirstFrame).toBe(false);
    expect(remount.hasClientMenuAtFirstFrame).toBe(true);
  });
});
