import { test, expect } from '@playwright/test';
import { setupBasicPasskeyTest } from '../setup';
import { buildWalletServiceHtml, registerWalletServiceRoute } from '../wallet-iframe/harness';

const WALLET_ORIGIN = 'https://wallet.example.localhost';
const WALLET_SERVICE_ROUTE = '**://wallet.example.localhost/wallet-service*';

const WALLET_STUB_CAPTURE_SCRIPT = String.raw`
  const originalAdoptPort = adoptPort;
  adoptPort = function patchedAdoptPort(port) {
    originalAdoptPort(port);
    if (!adoptedPort) return;

    const originalHandler = adoptedPort.onmessage;
    adoptedPort.onmessage = (event) => {
      originalHandler?.(event);
      const data = event.data || {};
      if (!data || typeof data !== 'object') return;

      if (data.type === 'PM_SET_CONFIG') {
        try {
          window.__capturedAssetsBaseUrl = (data.payload && typeof data.payload === 'object')
            ? data.payload.assetsBaseUrl
            : undefined;
        } catch {}
      }

      const requestId = data.requestId;
      if (typeof requestId !== 'string') return;

      const respond = (result) => {
        try {
          pendingRequests.delete(requestId);
          adoptedPort.postMessage({ type: 'PM_RESULT', requestId, payload: { ok: true, result } });
        } catch (err) {
          console.error('post PM_RESULT failed', err);
        }
      };

      if (data.type === 'PM_SET_CONFIG') {
        respond(null);
      }
      if (data.type === 'PM_PREFETCH_BLOCKHEIGHT') {
        respond(null);
      }
      if (data.type === 'PM_GET_LOGIN_SESSION') {
        respond({
          login: {
            isLoggedIn: false,
            nearAccountId: null,
            publicKey: null,
            vrfActive: false,
            userData: null,
            vrfSessionDuration: 0,
          },
          signingSession: null,
        });
      }
      if (data.type === 'PM_GET_CONFIRMATION_CONFIG') {
        respond({ theme: 'dark', behavior: 'requireClick', uiMode: 'modal' });
      }

      if (data.type === 'PM_GET_SIGNER_MODE') {
        respond({ mode: 'local-signer' });
      }
    };
  };
`;

test.describe('Wallet iframe assetsBaseUrl normalization', () => {
  test.beforeEach(async ({ page }) => {
    await setupBasicPasskeyTest(page);
    await registerWalletServiceRoute(
      page,
      buildWalletServiceHtml({ extraScript: WALLET_STUB_CAPTURE_SCRIPT }),
      WALLET_SERVICE_ROUTE,
    );
  });

  test.afterEach(async ({ page }) => {
    await page.unroute(WALLET_SERVICE_ROUTE).catch(() => {});
    await page.unroute(WALLET_SERVICE_ROUTE.replace('wallet-service', 'service')).catch(() => {});
  });

  test('uses /sdk/ when sdkBasePath is an empty string', async ({ page }) => {
    await page.evaluate(async ({ walletOrigin }) => {
      const mod = await import('/sdk/esm/core/TatchiPasskey/index.js');
      const { TatchiPasskey } = mod as any;

      const pm = new TatchiPasskey({
        relayer: { url: 'http://localhost:3000' },
        iframeWallet: {
          walletOrigin,
          walletServicePath: '/wallet-service',
          sdkBasePath: '',
        },
      });

      await pm.initWalletIframe();
    }, { walletOrigin: WALLET_ORIGIN });

    const walletFrame = page.frames().find((frame) => {
      const url = frame.url();
      return url.startsWith(WALLET_ORIGIN) && url.includes('/wallet-service');
    });
    expect(walletFrame, 'wallet iframe should be mounted').toBeTruthy();

    const capturedAssetsBaseUrl = await walletFrame!.evaluate(() => {
      return (window as any).__capturedAssetsBaseUrl ?? null;
    });
    expect(capturedAssetsBaseUrl).toBe(`${WALLET_ORIGIN}/sdk/`);
  });
});

