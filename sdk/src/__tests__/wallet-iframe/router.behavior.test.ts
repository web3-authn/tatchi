import { test, expect } from '@playwright/test';
import { setupBasicPasskeyTest, handleInfrastructureErrors } from '../setup';
import { buildWalletServiceHtml, registerWalletServiceRoute, waitFor } from './harness';

const WALLET_ORIGIN = 'https://wallet.example.localhost';
const WALLET_SERVICE_ROUTE = '**://wallet.example.localhost/wallet-service*';
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
          servicePath: '/wallet-service',
          connectTimeoutMs: 3000,
          requestTimeoutMs: 200, // short timeout to exercise cleanup
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

        // Fire-and-forget request that will time out since the stub never replies with PM_RESULT
        const p = router.executeAction({
          nearAccountId: 'e2e_router_timeout.testnet',
          receiverId: 'w3a-v1.testnet',
          actionArgs: { type: 'Transfer', amount: '1' } as any,
          options: {}
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

});
