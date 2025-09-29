import { test, expect } from '@playwright/test';
import { setupBasicPasskeyTest, handleInfrastructureErrors } from '../setup';
import { buildWalletServiceHtml, registerWalletServiceRoute, waitFor } from './harness';

const WALLET_ORIGIN = 'https://wallet.example.localhost';
const WALLET_SERVICE_ROUTE = '**://wallet.example.localhost/service*';
const WAIT_FOR_SOURCE = `(${waitFor.toString()})`;

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
    const result = await page.evaluate(async ({ walletOrigin, waitForSource }) => {
      const waitFor = eval(waitForSource) as typeof import('./harness').waitFor;
      try {
        // Dynamically import the router from built ESM
        const mod = await import('/sdk/esm/core/WalletIframe/client/router.js');
        const { WalletIframeRouter } = mod as typeof import('../../core/WalletIframe/client/router');

        const router = new WalletIframeRouter({
          walletOrigin,
          servicePath: '/service',
          connectTimeoutMs: 3000,
          requestTimeoutMs: 200, // short timeout to exercise cleanup
          debug: true,
          sdkBasePath: '/sdk',
        });
        await router.init();

        // Helper to find iframe and capture overlay state
        const getIframe = () => {
          const iframes = Array.from(document.querySelectorAll('iframe')) as HTMLIFrameElement[];
          // Transport sets a permissive allow attribute including publickey-credentials permissions
          return (
            iframes.find((f) => (f.getAttribute('allow') || '').includes('publickey-credentials')) ||
            null
          );
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

        // Fire-and-forget request that will time out since the stub never replies with PM_RESULT
        const p = router.executeAction({
          nearAccountId: 'e2e_router_timeout.testnet',
          receiverId: 'web3-authn-v5.testnet',
          actionArgs: { type: 'Transfer', amount: '1' } as any,
          options: {}
        }).catch((e) => ({ ok: false, error: String(e?.message || e) }));

        // Expect overlay to become visible soon after posting
        const shown = await waitFor(() => {
          const s = capture();
          return s.exists && s.pointerEvents === 'auto' && s.ariaHidden === 'false';
        }, 1000);

        // Wait for timeout path and cleanup
        await p;
        // Wait for overlay to contract (hide) after timeout cleanup
        const hidden = await waitFor(() => {
          const s = capture();
          if (!s.exists) return true; // iframe removed entirely counts as hidden
          const width = Number.parseFloat(s.width || '0');
          const height = Number.parseFloat(s.height || '0');
          const opacity = Number.parseFloat(s.opacity || '1');
          const ariaHidden = s.ariaHidden === 'true';
          const pointerNone = s.pointerEvents === 'none';
          const notInteractive = pointerNone || width === 0 || height === 0;
          const notVisible = ariaHidden || opacity === 0 || width === 0 || height === 0;
          return notInteractive && notVisible;
        }, 3000);
        const after = capture();

        return { success: true, shown, hidden, after };
      } catch (error: any) {
        return { success: false, error: error?.message || String(error) };
      }
    }, { walletOrigin: WALLET_ORIGIN, waitForSource: WAIT_FOR_SOURCE });

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

  test('anchored overlay via setAnchoredOverlayBounds + registerPasskey', async ({ page }) => {
    const result = await page.evaluate(async ({ walletOrigin, waitForSource }) => {
      const waitFor = eval(waitForSource) as typeof import('./harness').waitFor;
      try {
        const mod = await import('/sdk/esm/core/WalletIframe/client/router.js');
        const { WalletIframeRouter } = mod as typeof import('../../core/WalletIframe/client/router');
        const router = new WalletIframeRouter({ walletOrigin, servicePath: '/service', connectTimeoutMs: 3000, requestTimeoutMs: 1000, sdkBasePath: '/sdk' });
        await router.init();

        // Provide an anchor rect, then call registerPasskey which pre-shows overlay via showFrameForActivation()
        router.setAnchoredOverlayBounds({ top: 40, left: 60, width: 200, height: 100 });
        const p = router.registerPasskey({ nearAccountId: 'e2e_anchor.testnet' }).catch(() => undefined);
        // Wait for overlay to become visible in anchored mode
        const anchored = await waitFor(() => {
          const iframes = Array.from(document.querySelectorAll('iframe')) as HTMLIFrameElement[];
          const iframe = iframes.find((f) =>
            (f.getAttribute('allow') || '').includes('publickey-credentials')
          ) || null;
          if (!iframe) return false;
          const cs = getComputedStyle(iframe);
          return cs.pointerEvents === 'auto' &&
            cs.top === '40px' &&
            cs.left === '60px' &&
            cs.width === '200px' &&
            cs.height === '100px';
        }, 2000);
        try { await p; } catch {}
        return { success: true, anchored };
      } catch (error: any) {
        return { success: false, error: error?.message || String(error) };
      }
    }, { walletOrigin: WALLET_ORIGIN, waitForSource: WAIT_FOR_SOURCE });

    if (!result.success) {
      if (handleInfrastructureErrors(result)) return;
      expect(result.success).toBe(true);
      return;
    }
    expect(result.anchored).toBe(true);
  });
});
