import { test, expect } from '@playwright/test';
import { setupBasicPasskeyTest } from '../setup';
import { buildWalletServiceHtml, registerWalletServiceRoute } from '../wallet-iframe/harness';

const WALLET_ORIGIN = 'https://wallet.example.localhost';
const WALLET_SERVICE_ROUTE = '**://wallet.example.localhost/wallet-service*';

// Extend the default wallet-service stub so initWalletIframe() can complete.
// initWalletIframe() triggers router.init() + getLoginSession() paths that await
// responses for PM_SET_CONFIG, PM_GET_LOGIN_SESSION, and PM_PREFETCH_BLOCKHEIGHT.
// The base stub logs these but doesn't reply, so we patch in canned responses.
const WALLET_STUB_RESPONSE_SCRIPT = String.raw`
  const originalAdoptPort = adoptPort;
  adoptPort = function patchedAdoptPort(port) {
    originalAdoptPort(port);
    if (!adoptedPort) return;

    const originalHandler = adoptedPort.onmessage;
    adoptedPort.onmessage = (event) => {
      originalHandler?.(event);
      const data = event.data || {};
      if (!data || typeof data !== 'object') return;
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

      // Router init posts PM_SET_CONFIG and expects a response.
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
        respond({ behavior: 'requireClick', uiMode: 'modal' });
      }

      if (data.type === 'PM_GET_SIGNER_MODE') {
        respond({ mode: 'local-signer' });
      }
    };
  };
`;

test.describe('Wallet iframe duplicate guardrails', () => {
  test.beforeEach(async ({ page }) => {
    await setupBasicPasskeyTest(page);
    await registerWalletServiceRoute(
      page,
      buildWalletServiceHtml({ extraScript: WALLET_STUB_RESPONSE_SCRIPT }),
      WALLET_SERVICE_ROUTE,
    );
  });

  test.afterEach(async ({ page }) => {
    await page.unroute(WALLET_SERVICE_ROUTE).catch(() => {});
    await page.unroute(WALLET_SERVICE_ROUTE.replace('wallet-service', 'service')).catch(() => {});
  });

  test('does not accumulate multiple wallet overlay iframes across multiple instances', async ({ page }) => {
    const result = await page.evaluate(async ({ walletOrigin }) => {
      const mod = await import('/sdk/esm/core/TatchiPasskey/index.js');
      const { TatchiPasskey } = mod as any;

      for (const el of Array.from(document.querySelectorAll('iframe.w3a-wallet-overlay'))) {
        try { el.remove(); } catch {}
      }

      const cfg = {
        relayer: { url: 'http://localhost:3000' },
        iframeWallet: {
          walletOrigin,
          walletServicePath: '/wallet-service',
          sdkBasePath: '/sdk',
        },
      };

      const a = new TatchiPasskey(cfg);
      await a.initWalletIframe();
      const countAfterFirst = document.querySelectorAll('iframe.w3a-wallet-overlay').length;

      const b = new TatchiPasskey(cfg);
      await b.initWalletIframe();
      const countAfterSecond = document.querySelectorAll('iframe.w3a-wallet-overlay').length;

      return {
        countAfterFirst,
        countAfterSecond,
        secondRouterReady: (() => {
          try { return !!b.getWalletIframeClient?.()?.isReady?.(); } catch { return false; }
        })(),
      };
    }, { walletOrigin: WALLET_ORIGIN });

    expect(result.countAfterFirst, JSON.stringify(result)).toBe(1);
    expect(result.countAfterSecond, JSON.stringify(result)).toBe(1);
    expect(result.secondRouterReady, JSON.stringify(result)).toBe(true);
  });
});
