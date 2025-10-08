import { test, expect } from '@playwright/test';
import { setupBasicPasskeyTest, handleInfrastructureErrors } from '../setup';
import { buildWalletServiceHtml, registerWalletServiceRoute, waitFor } from './harness';

const WALLET_ORIGIN = 'https://wallet.example.localhost';
const WALLET_SERVICE_ROUTE = '**://wallet.example.localhost/service*';
const WAIT_FOR_SOURCE = `(${waitFor.toString()})`;

const stickyResponseScript = String.raw`
      const originalAdoptPort = adoptPort;
      adoptPort = function patchedAdoptPort(port) {
        originalAdoptPort(port);
        if (!adoptedPort) return;

        const respondSticky = (requestId) => {
          setTimeout(() => {
            try {
              adoptedPort.postMessage({
                type: 'PROGRESS',
                requestId,
                payload: {
                  step: 3,
                  phase: 'authorization',
                  status: 'progress',
                  message: 'Awaiting authorization (sticky test)'
                }
              });
            } catch (err) {
              console.error('Failed to post PROGRESS for sticky test', err);
            }
          }, 20);

          setTimeout(() => {
            pendingRequests.delete(requestId);
            try {
              adoptedPort.postMessage({
                type: 'PM_RESULT',
                requestId,
                payload: {
                  ok: true,
                  result: {
                    qrData: {
                      accountId: 'sticky.testnet',
                      device2PublicKey: 'ed25519:stickyTestKey',
                      timestamp: Date.now(),
                      version: '1'
                    },
                    qrCodeDataURL: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"></svg>'
                  }
                }
              });
            } catch (err) {
              console.error('Failed to post PM_RESULT for sticky test', err);
            }
          }, 60);
        };

        const originalHandler = adoptedPort.onmessage;
        adoptedPort.onmessage = (event) => {
          originalHandler?.(event);
          const data = event.data || {};
          if (!data || typeof data !== 'object') return;
          if (data.type === 'PM_START_DEVICE2_LINKING_FLOW' && typeof data.requestId === 'string') {
            respondSticky(data.requestId);
          }
        };
      };
`;

test.describe('WalletIframeRouter – sticky overlay lifecycle', () => {
  test.beforeEach(async ({ page }) => {
    await setupBasicPasskeyTest(page);
    await page.waitForTimeout(200);
    await registerWalletServiceRoute(
      page,
      buildWalletServiceHtml({ extraScript: stickyResponseScript }),
      WALLET_SERVICE_ROUTE
    );
  });

  test.afterEach(async ({ page }) => {
    await page.unroute(WALLET_SERVICE_ROUTE).catch(() => {});
  });

  test('sticky requests keep overlay visible until explicit cancel', async ({ page }) => {
    const result = await page.evaluate(async ({ walletOrigin, waitForSource }) => {
      const waitFor = eval(waitForSource) as typeof import('./harness').waitFor;
      try {
        const mod = await import('/sdk/esm/core/WalletIframe/client/router.js');
        const { WalletIframeRouter } = mod as typeof import('../../core/WalletIframe/client/router');

        const router = new WalletIframeRouter({
          walletOrigin,
          servicePath: '/service',
          connectTimeoutMs: 3000,
          requestTimeoutMs: 1200,
          debug: true,
          sdkBasePath: '/sdk',
        });
        await router.init();

        const getIframe = () => {
          const iframes = Array.from(document.querySelectorAll('iframe')) as HTMLIFrameElement[];
          return iframes.find((f) => (f.getAttribute('allow') || '').includes('publickey-credentials')) || null;
        };

        const capture = () => {
          const iframe = getIframe();
          if (!iframe) return { exists: false } as const;
          const cs = getComputedStyle(iframe);
          return {
            exists: true,
            pointerEvents: cs.pointerEvents,
            ariaHidden: iframe.getAttribute('aria-hidden'),
            width: cs.width,
            height: cs.height,
            opacity: cs.opacity,
          } as const;
        };

        const stickyPromise = router.startDevice2LinkingFlow({
          accountId: 'sticky.testnet',
          ui: 'modal',
        });

        const shown = await waitFor(() => {
          const state = capture();
          return state.exists && state.pointerEvents === 'auto' && state.ariaHidden === 'false';
        }, 3000);

        await stickyPromise;
        const afterResult = capture();
        const stillVisible = afterResult.exists && afterResult.pointerEvents === 'auto' && afterResult.ariaHidden === 'false';

        await router.cancelAll();
        const hidden = await waitFor(() => {
          const state = capture();
          return state.exists && state.ariaHidden === 'true' && state.width === '0px' && state.height === '0px' && state.opacity === '0';
        }, 3000);

        return {
          success: true,
          shown,
          stillVisible,
          hidden,
          afterResult,
        } as const;
      } catch (error: any) {
        return { success: false, error: error?.message || String(error) } as const;
      }
    }, { walletOrigin: WALLET_ORIGIN, waitForSource: WAIT_FOR_SOURCE });

    if (!result.success) {
      if (handleInfrastructureErrors(result)) return;
      expect(result.success).toBe(true);
      return;
    }

    expect(result.shown).toBe(true);
    expect(result.stillVisible).toBe(true);
    expect(result.hidden).toBe(true);
  });
});
