import { test, expect, type Page } from '@playwright/test';
import { injectImportMap } from '../setup/bootstrap';

const IMPORT_PATHS = {
  provider: '/sdk/esm/react/context/TatchiPasskeyProvider.js',
  theme: '/sdk/esm/react/components/theme/ThemeProvider.js',
  context: '/sdk/esm/react/context/index.js',
  accountMenu: '/sdk/esm/react/components/AccountMenuButton/index.js',
} as const;

async function getColorBackgroundVar(page: Page, scopeSelector: string): Promise<string> {
  return await page.evaluate((sel: string) => {
    const el = document.querySelector(sel) as HTMLElement | null;
    if (!el) return '';
    // Prefer inline style since some global token sheets can override computed values.
    const inline = el.style.getPropertyValue('--w3a-colors-colorBackground').trim();
    if (inline) return inline;
    return window.getComputedStyle(el).getPropertyValue('--w3a-colors-colorBackground').trim();
  }, scopeSelector);
}

test.describe('React Theme integration', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      try { (window as any).global ||= window; } catch {}
      try { (window as any).process ||= { env: {} }; } catch {}
    });
    await page.goto('about:blank');
    await injectImportMap(page);
  });

  test('Theme scope follows the controlled theme prop', async ({ page }) => {
    const mountId = 'w3a-theme-harness-scope';
    const scopeSelector = `#${mountId} .w3a-theme-provider`;

    await page.evaluate(async ({ paths, mountId }) => {
      const mount = document.createElement('div');
      mount.id = mountId;
      document.body.appendChild(mount);

      const React = await import('react');
      const ReactDOMClient = await import('react-dom/client');
      const ReactDOM = await import('react-dom');

      const themeMod: any = await import(paths.theme);
      const Theme = themeMod.Theme;

      const App: React.FC = () => {
        const [theme, setTheme] = React.useState<'light' | 'dark'>('light');
        return React.createElement(
          'div',
          null,
          React.createElement('button', { id: `${mountId}-dark`, onClick: () => setTheme('dark') }, 'dark'),
          React.createElement('button', { id: `${mountId}-light`, onClick: () => setTheme('light') }, 'light'),
          React.createElement(Theme, { theme }, React.createElement('div', { id: `${mountId}-content` }, theme)),
        );
      };

      const root = ReactDOMClient.createRoot(mount);
      ReactDOM.flushSync(() => {
        root.render(React.createElement(App, null));
      });
    }, { paths: IMPORT_PATHS, mountId });

    const scope = page.locator(scopeSelector);
    await expect(scope).toHaveAttribute('data-w3a-theme', 'light');

    const initialBg = await getColorBackgroundVar(page, scopeSelector);
    expect(initialBg).not.toBe('');

    await page.locator(`#${mountId}-dark`).click();
    await expect(scope).toHaveAttribute('data-w3a-theme', 'dark');

    const nextBg = await getColorBackgroundVar(page, scopeSelector);
    expect(nextBg).not.toBe('');
    expect(nextBg).not.toBe(initialBg);
  });

  test('TatchiPasskeyProvider syncs theme and proxies tatchi.setTheme to host', async ({ page }) => {
    const mountId = 'w3a-theme-harness-provider';
    const scopeSelector = `#${mountId} .w3a-theme-provider`;

    await page.evaluate(async ({ paths, mountId }) => {
      const mount = document.createElement('div');
      mount.id = mountId;
      document.body.appendChild(mount);

      const React = await import('react');
      const ReactDOMClient = await import('react-dom/client');
      const ReactDOM = await import('react-dom');

      const providerMod: any = await import(paths.provider);
      const themeMod: any = await import(paths.theme);
      const ctxMod: any = await import(paths.context);

      const Provider = providerMod.TatchiPasskeyProvider || providerMod.default;
      const useTheme = themeMod.useTheme;
      const useTatchi = ctxMod.useTatchi;

      const Harness: React.FC<{ theme: 'light' | 'dark' }> = ({ theme }) => {
        const { theme: reactTheme } = useTheme();
        const { tatchi } = useTatchi();
        return React.createElement(
          'div',
          null,
          React.createElement('button', { id: `${mountId}-set-dark`, onClick: () => tatchi.setTheme('dark') }, 'set-dark'),
          React.createElement('div', { id: `${mountId}-react-theme` }, reactTheme),
          React.createElement('div', { id: `${mountId}-host-theme` }, theme),
          React.createElement('div', { id: `${mountId}-sdk-theme` }, tatchi.theme),
        );
      };

      const config = {
        nearNetwork: 'testnet',
        nearRpcUrl: 'https://test.rpc.fastnear.com',
        contractId: 'w3a-v1.testnet',
        relayer: { url: 'https://relay-server.localhost' },
        iframeWallet: { walletOrigin: '' },
      };

      const ControlledApp: React.FC = () => {
        const [theme, setTheme] = React.useState<'light' | 'dark'>('light');
        return React.createElement(
          Provider,
          { config, theme: { theme, setTheme } },
          React.createElement(Harness, { theme }),
        );
      };

      const root = ReactDOMClient.createRoot(mount);
      ReactDOM.flushSync(() => {
        root.render(React.createElement(ControlledApp, null));
      });
    }, { paths: IMPORT_PATHS, mountId });

    const scope = page.locator(scopeSelector);
    const reactTheme = page.locator(`#${mountId}-react-theme`);
    const hostTheme = page.locator(`#${mountId}-host-theme`);
    const sdkTheme = page.locator(`#${mountId}-sdk-theme`);

    await expect(scope).toHaveAttribute('data-w3a-theme', 'light');
    await expect(reactTheme).toHaveText('light');
    await expect(hostTheme).toHaveText('light');
    await expect(sdkTheme).toHaveText('light');

    await page.locator(`#${mountId}-set-dark`).click();

    await expect(scope).toHaveAttribute('data-w3a-theme', 'dark');
    await expect(reactTheme).toHaveText('dark');
    await expect(hostTheme).toHaveText('dark');
    await expect(sdkTheme).toHaveText('dark');
  });

  test('AccountMenuButton toggle calls host setTheme', async ({ page }) => {
    const mountId = 'w3a-theme-harness-account-menu';

    await page.evaluate(async ({ paths, mountId }) => {
      const mount = document.createElement('div');
      mount.id = mountId;
      document.body.appendChild(mount);

      const React = await import('react');
      const ReactDOMClient = await import('react-dom/client');
      const ReactDOM = await import('react-dom');

      const providerMod: any = await import(paths.provider);
      const accountMod: any = await import(paths.accountMenu);
      const themeMod: any = await import(paths.theme);

      const Provider = providerMod.TatchiPasskeyProvider || providerMod.default;
      const AccountMenuButton = accountMod.AccountMenuButton || accountMod.default;
      const useTheme = themeMod.useTheme;

      const ThemeReadout: React.FC = () => {
        const { theme } = useTheme();
        return React.createElement('div', { id: `${mountId}-theme` }, theme);
      };

      const config = {
        nearNetwork: 'testnet',
        nearRpcUrl: 'https://test.rpc.fastnear.com',
        contractId: 'w3a-v1.testnet',
        relayer: { url: 'https://relay-server.localhost' },
        iframeWallet: { walletOrigin: '' },
      };

      const ControlledApp: React.FC = () => {
        const [theme, setTheme] = React.useState<'light' | 'dark'>('light');
        return React.createElement(
          Provider,
          { config, theme: { theme, setTheme } },
          React.createElement(ThemeReadout, null),
          React.createElement(AccountMenuButton, { username: 'alice' }),
        );
      };

      const root = ReactDOMClient.createRoot(mount);
      ReactDOM.flushSync(() => {
        root.render(React.createElement(ControlledApp, null));
      });
    }, { paths: IMPORT_PATHS, mountId });

    const themeReadout = page.locator(`#${mountId}-theme`);
    await expect(themeReadout).toHaveText('light');

    const trigger = page.locator(`#${mountId} .w3a-user-account-button-trigger`);
    await trigger.click();

    const toggleItem = page.locator(`#${mountId} .w3a-dropdown-menu-item:has-text("Toggle Theme")`);
    await expect(toggleItem).toBeVisible();
    await toggleItem.click();

    await expect(themeReadout).toHaveText('dark');
  });
});
