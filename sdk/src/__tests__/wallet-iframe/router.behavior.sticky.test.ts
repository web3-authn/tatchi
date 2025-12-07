import { test, expect } from '@playwright/test';
import { setupBasicPasskeyTest, handleInfrastructureErrors } from '../setup';
import { buildWalletServiceHtml, registerWalletServiceRoute, waitFor, captureOverlay } from './harness';

const WALLET_ORIGIN = 'https://wallet.example.localhost';
const WALLET_SERVICE_ROUTE = '**://wallet.example.localhost/wallet-service*';
const WAIT_FOR_SOURCE = `(${waitFor.toString()})`;
const CAPTURE_OVERLAY_SOURCE = `(${captureOverlay.toString()})`;

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
    const result = await page.evaluate(async ({ walletOrigin, waitForSource, captureOverlaySource }) => {
      const waitFor = eval(waitForSource) as typeof import('./harness').waitFor;
      const capture = eval(captureOverlaySource) as typeof import('./harness').captureOverlay;
      try {
        const mod = await import('/sdk/esm/core/WalletIframe/client/router.js');
        const { WalletIframeRouter } = mod as typeof import('../../core/WalletIframe/client/router');

        const router = new WalletIframeRouter({
          walletOrigin,
          servicePath: '/wallet-service',
          connectTimeoutMs: 3000,
          requestTimeoutMs: 1200,
          debug: true,
          sdkBasePath: '/sdk',
        });
        await router.init();


        const stickyPromise = router.startDevice2LinkingFlow({
          ui: 'modal',
        });

        const shown = await waitFor(() => {
          const state = capture();
          return state.exists && state.visible;
        }, 3000);

        await stickyPromise;
        const afterResult = capture();
        const stillVisible = afterResult.exists && afterResult.visible;

        await router.cancelAll();
        const hidden = await waitFor(() => {
          const state = capture();
          if (!state.exists) return true;
          return !state.visible;
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
    }, { walletOrigin: WALLET_ORIGIN, waitForSource: WAIT_FOR_SOURCE, captureOverlaySource: CAPTURE_OVERLAY_SOURCE });

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
