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
    let confirmationConfig = { theme: 'light', behavior: 'requireClick', uiMode: 'modal' };

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

        if (type === 'PM_SET_THEME') {
          const theme = message?.payload?.theme;
          if (theme === 'dark' || theme === 'light') {
            confirmationConfig = { ...confirmationConfig, theme };
          }
          respond(requestId, undefined);
          pushPreferencesChanged();
          return;
        }

        return original && original(event);
      };
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

  test('app-origin mirrors wallet-host theme via PREFERENCES_CHANGED', async ({ page }) => {
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
        const initialTheme = tatchi.userPreferences.getUserTheme();

        const observedThemes: Array<'dark' | 'light'> = [];
        tatchi.userPreferences.onThemeChange((t) => observedThemes.push(t));

        tatchi.setUserTheme('dark');
        const mirrored = await waitFor(() => tatchi.userPreferences.getUserTheme() === 'dark', 3000);

        return {
          success: true,
          initialTheme,
          finalTheme: tatchi.userPreferences.getUserTheme(),
          currentUser: String(tatchi.userPreferences.getCurrentUserAccountId?.() || ''),
          observedThemes,
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

    expect(result.initialTheme).toBe('light');
    expect(result.mirrored).toBe(true);
    expect(result.finalTheme).toBe('dark');
    expect(result.currentUser).toBe('alice.testnet');
    expect(result.observedThemes).toContain('dark');

    const indexedDbNoise = consoleErrors.find((m) =>
      m.includes('PasskeyClientDBManager') || m.includes('IndexedDB is disabled in this environment')
    );
    expect(indexedDbNoise).toBeUndefined();
  });
});
