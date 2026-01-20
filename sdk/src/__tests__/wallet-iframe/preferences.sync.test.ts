import { test, expect } from '@playwright/test';
import { setupBasicPasskeyTest, handleInfrastructureErrors } from '../setup';
import { buildWalletServiceHtml, registerWalletServiceRoute, waitFor } from './harness';

const WALLET_ORIGIN = 'https://wallet.example.localhost';
const WALLET_SERVICE_ROUTE = '**://wallet.example.localhost/wallet-service*';
const WAIT_FOR_SOURCE = `(${waitFor.toString()})`;

const PREFERENCES_PUSH_STUB = `
  // Extend the base wallet-service stub with preference RPCs + push updates.
  (function installPreferencesPushStub() {
    const nearAccountId = 'alice.testnet';
    let confirmationConfig = { behavior: 'requireClick', uiMode: 'modal', autoProceedDelay: 0 };
    const signerMode = { mode: 'local-signer' };

    const makeLoginSession = () => ({
      login: {
        isLoggedIn: true,
        nearAccountId,
        publicKey: null,
        userData: null,
        vrfActive: true,
        vrfSessionDuration: 60,
      },
      signingSession: null,
    });

    const respond = (requestId, result) => {
      if (!requestId) return;
      try {
        adoptedPort.postMessage({ type: 'PM_RESULT', requestId, payload: { ok: true, result } });
      } catch (err) {
        console.error('[wallet-stub] failed to post PM_RESULT', err);
      }
    };

    const pushPreferencesChanged = () => {
      try {
        adoptedPort.postMessage({
          type: 'PREFERENCES_CHANGED',
          payload: {
            nearAccountId,
            confirmationConfig,
            signerMode,
            updatedAt: Date.now(),
          }
        });
      } catch (err) {
        console.error('[wallet-stub] failed to post PREFERENCES_CHANGED', err);
      }
    };

    const wrapPort = () => {
      if (!adoptedPort || adoptedPort.__w3aPrefsWrapped) return;
      adoptedPort.__w3aPrefsWrapped = true;
      const original = adoptedPort.onmessage;
      adoptedPort.onmessage = (event) => {
        const message = event.data || {};
        if (!message || typeof message !== 'object') return original && original(event);
        const { type, requestId } = message;

        if (type === 'PM_PREFETCH_BLOCKHEIGHT') {
          respond(requestId, undefined);
          return;
        }

        if (type === 'PM_GET_LOGIN_SESSION') {
          respond(requestId, makeLoginSession());
          return;
        }

        if (type === 'PM_GET_CONFIRMATION_CONFIG') {
          respond(requestId, confirmationConfig);
          return;
        }

        if (type === 'PM_SET_CONFIRMATION_CONFIG') {
          const config = message?.payload?.config || {};
          confirmationConfig = { ...confirmationConfig, ...config };
          respond(requestId, undefined);
          pushPreferencesChanged();
          return;
        }

        if (type === 'PM_SET_THEME') {
          const theme = message?.payload?.theme;
          if (theme === 'dark' || theme === 'light') {
            window.__lastSetTheme = theme;
          }
          respond(requestId, undefined);
          return;
        }

        return original && original(event);
      };
      pushPreferencesChanged();
    };

    const __origAdoptPort = adoptPort;
    adoptPort = (port) => {
      __origAdoptPort(port);
      wrapPort();
    };
  })();
`;

test.describe('Wallet iframe preferences sync', () => {
  test.beforeEach(async ({ page }) => {
    await setupBasicPasskeyTest(page);
    await page.waitForTimeout(200);
    await registerWalletServiceRoute(
      page,
      buildWalletServiceHtml({ extraScript: PREFERENCES_PUSH_STUB }),
      WALLET_SERVICE_ROUTE
    );
  });

  test.afterEach(async ({ page }) => {
    await page.unroute(WALLET_SERVICE_ROUTE).catch(() => {});
  });

  test('app-origin mirrors wallet-host confirmation config via PREFERENCES_CHANGED', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    const result = await page.evaluate(async ({ walletOrigin, waitForSource }) => {
      const waitFor = eval(waitForSource) as typeof import('./harness').waitFor;
      try {
        const base = window.location.origin === 'null' ? 'https://example.localhost' : window.location.origin;
        const mod = await import(new URL('/sdk/esm/core/TatchiPasskey/index.js', base).toString());
        const { TatchiPasskey } = mod as typeof import('../../core/TatchiPasskey');

        const tatchi = new TatchiPasskey({
          nearRpcUrl: 'https://test.rpc.fastnear.com',
          nearNetwork: 'testnet',
          contractId: 'w3a-v1.testnet',
          relayer: { url: 'http://localhost:3000' },
          iframeWallet: {
            walletOrigin,
            walletServicePath: '/wallet-service',
            sdkBasePath: '/sdk',
          },
        });

        await tatchi.initWalletIframe();
        const seeded = await waitFor(() => tatchi.getConfirmationConfig().uiMode === 'modal', 3000);
        const initialTheme = tatchi.theme;
        const initialConfig = tatchi.getConfirmationConfig();

        // Flip confirmation config on the wallet host and ensure the app-origin mirrors it via PREFERENCES_CHANGED.
        const router = await (tatchi as any).requireWalletIframeRouter();
        await router.setConfirmationConfig({ uiMode: 'drawer', behavior: 'autoProceed', autoProceedDelay: 5 });
        const mirrored = await waitFor(() => tatchi.getConfirmationConfig().uiMode === 'drawer', 3000);

        return {
          success: true,
          initialTheme,
          finalTheme: tatchi.theme,
          initialConfig,
          finalConfig: tatchi.getConfirmationConfig(),
          currentUser: String(tatchi.userPreferences.getCurrentUserAccountId?.() || ''),
          seeded,
          mirrored,
        };
      } catch (error: any) {
        return { success: false, error: error?.message || String(error) };
      }
    }, { walletOrigin: WALLET_ORIGIN, waitForSource: WAIT_FOR_SOURCE });

    if (!result.success) {
      if (handleInfrastructureErrors(result)) return;
      expect(result.success, result.error).toBe(true);
      return;
    }

    expect(result.initialTheme).toBe('dark');
    expect(result.mirrored).toBe(true);
    expect(result.finalTheme).toBe('dark');
    expect(result.initialConfig).toEqual({ behavior: 'requireClick', uiMode: 'modal', autoProceedDelay: 0 });
    expect(result.finalConfig).toEqual({ behavior: 'autoProceed', uiMode: 'drawer', autoProceedDelay: 5 });
    expect(result.currentUser).toBe('alice.testnet');

    const indexedDbNoise = consoleErrors.find((m) =>
      m.includes('PasskeyClientDBManager') || m.includes('IndexedDB is disabled in this environment')
    );
    expect(indexedDbNoise).toBeUndefined();
  });

  test('tatchi.setTheme forwards updates to the wallet host', async ({ page }) => {
    const result = await page.evaluate(async ({ walletOrigin }) => {
      try {
        const base = window.location.origin === 'null' ? 'https://example.localhost' : window.location.origin;
        const mod = await import(new URL('/sdk/esm/core/TatchiPasskey/index.js', base).toString());
        const { TatchiPasskey } = mod as typeof import('../../core/TatchiPasskey');

        const tatchi = new TatchiPasskey({
          nearRpcUrl: 'https://test.rpc.fastnear.com',
          nearNetwork: 'testnet',
          contractId: 'w3a-v1.testnet',
          relayer: { url: 'http://localhost:3000' },
          iframeWallet: {
            walletOrigin,
            walletServicePath: '/wallet-service',
            sdkBasePath: '/sdk',
          },
        });

        await tatchi.initWalletIframe();
        tatchi.setTheme('light');

        return { success: true, currentTheme: tatchi.theme };
      } catch (error: any) {
        return { success: false, error: error?.message || String(error) };
      }
    }, { walletOrigin: WALLET_ORIGIN });

    if (!result.success) {
      if (handleInfrastructureErrors(result)) return;
      expect(result.success, result.error).toBe(true);
      return;
    }

    expect(result.currentTheme).toBe('light');

    const walletFrame = page.frames().find((frame) => {
      const url = frame.url();
      return url.startsWith(WALLET_ORIGIN) && url.includes('/wallet-service');
    });
    expect(walletFrame, 'wallet iframe should be mounted').toBeTruthy();

    await walletFrame!.waitForFunction(() => (window as any).__lastSetTheme === 'light', null, { timeout: 3000 });
  });
});
