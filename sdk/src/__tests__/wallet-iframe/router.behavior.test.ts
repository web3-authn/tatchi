import { test, expect } from '@playwright/test';
import { setupBasicPasskeyTest, handleInfrastructureErrors } from '../setup';
import { buildWalletServiceHtml, registerWalletServiceRoute, waitFor, captureOverlay } from './harness';

const WALLET_ORIGIN = 'https://wallet.example.localhost';
const WALLET_SERVICE_ROUTE = '**://wallet.example.localhost/wallet-service*';
const WAIT_FOR_SOURCE = `(${waitFor.toString()})`;
const CAPTURE_OVERLAY_SOURCE = `(${captureOverlay.toString()})`;

test.describe('WalletIframeRouter – overlay + timeout behavior', () => {
  test.beforeEach(async ({ page }) => {
    await setupBasicPasskeyTest(page);
    await page.waitForTimeout(200);
    // Register wallet service route with default stub which sends READY and PROGRESS but no PM_RESULT
    await registerWalletServiceRoute(page, buildWalletServiceHtml(), WALLET_SERVICE_ROUTE);
  });

  test.afterEach(async ({ page }) => {
    await page.unroute(WALLET_SERVICE_ROUTE).catch(() => {});
  });

  test('executeAction shows overlay then hides it after request timeout', async ({ page }) => {
    const result = await page.evaluate(async ({ walletOrigin, waitForSource, captureOverlaySource }) => {
      const waitFor = eval(waitForSource) as typeof import('./harness').waitFor;
      const capture = eval(captureOverlaySource) as typeof import('./harness').captureOverlay;
      try {
        // Dynamically import the router from built ESM
        const mod = await import('/sdk/esm/core/WalletIframe/client/router.js');
        const { WalletIframeRouter } = mod as typeof import('../../core/WalletIframe/client/router');

        const router = new WalletIframeRouter({
          walletOrigin,
          servicePath: '/wallet-service',
          connectTimeoutMs: 3000,
          requestTimeoutMs: 200, // short timeout to exercise cleanup
          debug: true,
          sdkBasePath: '/sdk',
        });
        await router.init();

        

        // Fire-and-forget request that will time out since the stub never replies with PM_RESULT
	        const p = router.executeAction({
	          nearAccountId: 'e2e_router_timeout.testnet',
	          receiverId: 'w3a-v1.testnet',
	          actionArgs: { type: 'Transfer', amount: '1' } as any,
	          options: { signerMode: { mode: 'local-signer' } }
	        }).catch((e) => ({ ok: false, error: String(e?.message || e) }));

        // Expect overlay to become visible soon after posting
        const shown = await waitFor(() => {
          const s = capture();
          return s.exists && s.visible;
        }, 3000);

        // Wait for timeout path and cleanup
        await p;
        // Wait for overlay to contract (hide) after timeout cleanup
        const hidden = await waitFor(() => {
          const s = capture();
          if (!s.exists) return true; // entirely removed counts as hidden
          return !s.visible;
        }, 3000);
        const after = capture();

        return { success: true, shown, hidden, after };
      } catch (error: any) {
        return { success: false, error: error?.message || String(error) };
      }
    }, { walletOrigin: WALLET_ORIGIN, waitForSource: WAIT_FOR_SOURCE, captureOverlaySource: CAPTURE_OVERLAY_SOURCE });

    if (!result.success) {
      if (handleInfrastructureErrors(result)) return;
      expect(result.success).toBe(true);
      return;
    }

    expect(result.shown).toBe(true);
    // After timeout, overlay should contract and become inert
    if (!result.hidden) {
      console.log('[router.behavior] overlay state after timeout', result.after);
    }
    expect(result.hidden).toBe(true);
  });

});
