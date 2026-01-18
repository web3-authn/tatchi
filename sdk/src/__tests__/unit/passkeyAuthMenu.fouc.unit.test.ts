import { test, expect } from '@playwright/test';
import { setupBasicPasskeyTest } from '../setup';

const IMPORT_PATHS = {
  provider: '/sdk/esm/react/context/TatchiPasskeyProvider.js',
  passkeyAuthMenu: '/sdk/esm/react/components/PasskeyAuthMenu/passkeyAuthMenuCompat.js',
} as const;

test.describe('PasskeyAuthMenu FOUC guard', () => {
  test.beforeEach(async ({ page }) => {
    await setupBasicPasskeyTest(page, { skipPasskeyManagerInit: true });
  });

  test('does not render client UI until CSS sentinel is ready', async ({ page }) => {
    await page.evaluate(async ({ paths }) => {
      const mount = document.createElement('div');
      mount.id = 'pam2-test-mount';
      document.body.appendChild(mount);

      (window as any).__W3A_TEST_PAM2_CSS_READY__ = false;
      (window as any).__W3A_TEST_PAM2_STYLE_CHECKS__ = 0;

      const originalGetComputedStyle = window.getComputedStyle.bind(window);
      window.getComputedStyle = ((el: Element, pseudoElt?: string | null) => {
        const cs = originalGetComputedStyle(el, pseudoElt as any);
        try {
          const shouldPatch =
            mount.contains(el) &&
            el.classList?.contains('w3a-signup-menu-root') &&
            el.classList?.contains('w3a-skeleton');
          if (!shouldPatch) return cs;

          (window as any).__W3A_TEST_PAM2_STYLE_CHECKS__ =
            ((window as any).__W3A_TEST_PAM2_STYLE_CHECKS__ || 0) + 1;

          const getPropertyValue = cs.getPropertyValue.bind(cs);
          return new Proxy(cs, {
            get(target, prop) {
              if (prop === 'getPropertyValue') {
                return (name: string) => {
                  if (name === '--w3a-pam2-css-ready') {
                    return (window as any).__W3A_TEST_PAM2_CSS_READY__ ? '1' : '';
                  }
                  return getPropertyValue(name);
                };
              }
              // Ensure the shell cannot "accidentally" pass via the heuristic fallback
              // (border/radius checks) while the sentinel is forced off.
              if (prop === 'borderTopStyle') return 'none';
              if (prop === 'borderTopWidth') return '0px';
              if (prop === 'borderTopLeftRadius') return '0px';

              const value = (target as any)[prop as any];
              return typeof value === 'function' ? value.bind(target) : value;
            },
          });
        } catch {
          return cs;
        }
      }) as any;

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
    await mount.locator('.w3a-signup-menu-root.w3a-skeleton').waitFor({ state: 'attached' });

    // Ensure the shell is actively polling styles (i.e., our no-FOUC gate is in control).
    await page.waitForFunction(() => (window as any).__W3A_TEST_PAM2_STYLE_CHECKS__ > 0);

    // While the CSS sentinel reports "not ready", the client UI should not mount.
    await expect(mount.locator('.w3a-signup-menu-root:not(.w3a-skeleton)')).toHaveCount(0);
    await expect(mount.locator('.w3a-arrow-btn')).toHaveCount(0);

    // Flip the sentinel to "ready" and ensure the shell switches to the client implementation.
    await page.evaluate(() => {
      (window as any).__W3A_TEST_PAM2_CSS_READY__ = true;
    });

    await mount.locator('.w3a-signup-menu-root:not(.w3a-skeleton)').waitFor({ state: 'attached' });
    await expect(mount.locator('.w3a-seg')).toHaveCount(1);
    await expect(mount.locator('.w3a-arrow-btn')).toHaveCount(1);
  });
});

