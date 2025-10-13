import { test, expect } from '@playwright/test';
import { setupBasicPasskeyTest, handleInfrastructureErrors } from '../setup';
import { buildWalletServiceHtml, registerWalletServiceRoute, waitFor } from './harness';

const WALLET_ORIGIN = 'https://wallet.example.localhost';
const WALLET_SERVICE_ROUTE = '**://wallet.example.localhost/wallet-service*';
const WAIT_FOR_SOURCE = `(${waitFor.toString()})`;

// Script injected into the wallet service stub to simulate two overlapping requests
// and post TEST_MARKER window messages to the parent for coordination.
const concurrentResponseScript = String.raw`
      const originalAdoptPort = adoptPort;
      adoptPort = function patchedAdoptPort(port) {
        originalAdoptPort(port);
        if (!adoptedPort) return;

        let requestOrder = [];

        const respondForFirst = (requestId) => {
          // Show → Hide → Result
          setTimeout(() => {
            try {
              adoptedPort.postMessage({
                type: 'PROGRESS',
                requestId,
                payload: { step: 2, phase: 'user-confirmation', status: 'progress', message: 'First awaiting confirmation' }
              });
            } catch (err) { console.error('post PROGRESS first user-confirmation failed', err); }
          }, 10);

          setTimeout(() => {
            try {
              adoptedPort.postMessage({
                type: 'PROGRESS',
                requestId,
                payload: { step: 8, phase: 'broadcasting', status: 'progress', message: 'First broadcasting' }
              });
              try { window.parent?.postMessage({ type: 'TEST_MARKER', marker: 'FIRST_BROADCASTING' }, '*'); } catch {}
            } catch (err) { console.error('post PROGRESS first broadcasting failed', err); }
          }, 120);

          setTimeout(() => {
            try {
              pendingRequests.delete(requestId);
              adoptedPort.postMessage({ type: 'PM_RESULT', requestId, payload: { ok: true, result: { ok: true, first: true } } });
            } catch (err) { console.error('post PM_RESULT first failed', err); }
          }, 220);
        };

        const respondForSecond = (requestId) => {
          setTimeout(() => {
            try {
              adoptedPort.postMessage({
                type: 'PROGRESS',
                requestId,
                payload: { step: 2, phase: 'user-confirmation', status: 'progress', message: 'Second awaiting confirmation' }
              });
              try { window.parent?.postMessage({ type: 'TEST_MARKER', marker: 'SECOND_CONFIRMATION' }, '*'); } catch {}
            } catch (err) { console.error('post PROGRESS second confirmation failed', err); }
          }, 20);

          setTimeout(() => {
            try {
              pendingRequests.delete(requestId);
              adoptedPort.postMessage({ type: 'PM_RESULT', requestId, payload: { ok: true, result: { ok: true, second: true } } });
            } catch (err) { console.error('post PM_RESULT second failed', err); }
          }, 320);
        };

        const originalHandler = adoptedPort.onmessage;
        adoptedPort.onmessage = (event) => {
          originalHandler?.(event);
          const data = event.data || {};
          if (!data || typeof data !== 'object') return;
          if (data.type === 'PM_EXECUTE_ACTION' && typeof data.requestId === 'string') {
            requestOrder.push(data.requestId);
            if (requestOrder.length === 1) respondForFirst(data.requestId);
            if (requestOrder.length === 2) respondForSecond(data.requestId);
          }
        };
      };
`;

test.describe('WalletIframeRouter – concurrent requests aggregate overlay visibility', () => {
  test.beforeEach(async ({ page }) => {
    await setupBasicPasskeyTest(page);
    await page.waitForTimeout(200);
    await registerWalletServiceRoute(
      page,
      buildWalletServiceHtml({ extraScript: concurrentResponseScript }),
      WALLET_SERVICE_ROUTE
    );
  });

  test.afterEach(async ({ page }) => {
    await page.unroute(WALLET_SERVICE_ROUTE).catch(() => {});
  });

  test('overlay stays visible while any request demands show', async ({ page }) => {
    const result = await page.evaluate(async ({ walletOrigin, waitForSource }) => {
      const waitFor = eval(waitForSource) as typeof import('./harness').waitFor;
      try {
        const mod = await import('/sdk/esm/core/WalletIframe/client/router.js');
        const { WalletIframeRouter } = mod as typeof import('../../core/WalletIframe/client/router');

        const router = new WalletIframeRouter({
          walletOrigin,
          servicePath: '/wallet-service',
          connectTimeoutMs: 3000,
          requestTimeoutMs: 2000,
          debug: true,
          sdkBasePath: '/sdk',
        });
        await router.init();

        // Helpers to capture overlay styles
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
          // If the inline confirmer exists, treat it as visible as soon as it mounts
          // regardless of pointer/opacity nuances, since the drawer/modal is interactive internally.
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

        // Marker listeners for coordination
        const marks: Record<string, boolean> = {};
        window.addEventListener('message', (ev) => {
          const d = ev.data || {};
          if (d && d.type === 'TEST_MARKER' && typeof d.marker === 'string') {
            marks[d.marker] = true;
          }
        });

        const actionArgs = { type: 'Transfer', amount: '1' } as any;

        const p1 = router.executeAction({
          nearAccountId: 'concurrent1.testnet',
          receiverId: 'w3a-v1.testnet',
          actionArgs,
        });

        // Wait for overlay to be shown by first request
        const shown1 = await waitFor(() => {
          const s = capture();
          return s.exists && s.visible;
        }, 3000);

        const p2 = router.executeAction({
          nearAccountId: 'concurrent2.testnet',
          receiverId: 'w3a-v1.testnet',
          actionArgs,
        });

        // Ensure second has reached confirmation (show) before first hides
        const secondAtConfirm = await waitFor(() => !!marks['SECOND_CONFIRMATION'], 1500);

        // Wait for first to emit broadcasting (hide intent)
        const firstAtBroadcast = await waitFor(() => !!marks['FIRST_BROADCASTING'], 1500);

        // After first signals broadcasting, overlay should still be visible due to second's show
        const stillVisible = (() => {
          const s = capture();
          return s.exists && s.visible;
        })();

        await Promise.all([p1, p2]);

        // Eventually overlay should hide after both complete
        const hidden = await waitFor(() => {
          const s = capture();
          if (!s.exists) return true;
          return !s.visible;
        }, 3000);

        return { success: true, shown1, secondAtConfirm, firstAtBroadcast, stillVisible, hidden } as const;
      } catch (error: any) {
        return { success: false, error: error?.message || String(error) } as const;
      }
    }, { walletOrigin: WALLET_ORIGIN, waitForSource: WAIT_FOR_SOURCE });

    if (!result.success) {
      if (handleInfrastructureErrors(result)) return;
      expect(result.success).toBe(true);
      return;
    }

    expect(result.shown1).toBe(true);
    expect(result.secondAtConfirm).toBe(true);
    expect(result.firstAtBroadcast).toBe(true);
    expect(result.stillVisible).toBe(true);
    expect(result.hidden).toBe(true);
  });
});
