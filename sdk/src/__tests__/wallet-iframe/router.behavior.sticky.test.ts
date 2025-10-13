import { test, expect } from '@playwright/test';
import { setupBasicPasskeyTest, handleInfrastructureErrors } from '../setup';
import { buildWalletServiceHtml, registerWalletServiceRoute, waitFor } from './harness';

const WALLET_ORIGIN = 'https://wallet.example.localhost';
const WALLET_SERVICE_ROUTE = '**://wallet.example.localhost/wallet-service*';
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
          servicePath: '/wallet-service',
          connectTimeoutMs: 3000,
          requestTimeoutMs: 1200,
          debug: true,
          sdkBasePath: '/sdk',
        });
        await router.init();

        const capture = () => {
          const iframe = Array.from(document.querySelectorAll('iframe')) as HTMLIFrameElement[];
          const overlayIframe = iframe.find((f) => {
            const allow = (f.getAttribute('allow') || '');
            const src = f.getAttribute('src') || '';
            return allow.includes('publickey-credentials') || /wallet\.example\.localhost/.test(src);
          });
          if (overlayIframe) {
            const cs = getComputedStyle(overlayIframe);
            const rect = overlayIframe.getBoundingClientRect();
            const ariaHidden = overlayIframe.getAttribute('aria-hidden') === 'true';
            const opacity = Number.parseFloat(cs.opacity || '1');
            const pointerEnabled = cs.pointerEvents !== 'none';
            const area = rect.width > 0 && rect.height > 0;
            return {
              exists: true,
              visible: pointerEnabled && !ariaHidden && opacity > 0,
              pointerEnabled,
              ariaHidden,
              width: rect.width,
              height: rect.height,
              opacity,
            } as const;
          }

          const portal = document.getElementById('w3a-confirm-portal');
          const host = portal?.firstElementChild as HTMLElement | null;
          if (!host) return { exists: false, visible: false } as const;
          const interactive = host.querySelector<HTMLElement>('w3a-drawer-tx-confirmer, w3a-modal-tx-confirmer, w3a-drawer, w3a-modal');
          const target = interactive || host;
          const style = getComputedStyle(target);
          const rect = target.getBoundingClientRect();
          const opacity = Number.parseFloat(style.opacity || '1');
          const pointerEnabled = style.pointerEvents !== 'none';
          const ariaHidden = target.getAttribute('aria-hidden') === 'true';
          const visibility = style.visibility !== 'hidden' && style.display !== 'none';
          const area = rect.width > 0 && rect.height > 0;
          if (interactive) {
            return {
              exists: true,
              visible: true,
              pointerEnabled,
              ariaHidden,
              width: rect.width,
              height: rect.height,
              opacity,
            } as const;
          }
          return {
            exists: true,
            visible: visibility && pointerEnabled && !ariaHidden && opacity > 0,
            pointerEnabled,
            ariaHidden,
            width: rect.width,
            height: rect.height,
            opacity,
          } as const;
        };

        const stickyPromise = router.startDevice2LinkingFlow({
          accountId: 'sticky.testnet',
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
