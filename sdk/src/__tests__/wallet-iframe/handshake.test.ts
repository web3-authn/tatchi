import { test, expect } from '@playwright/test';
import {
  buildWalletServiceHtml,
  initRouter,
  registerWalletServiceRoute,
} from './harness';

const WALLET_ORIGIN = 'https://wallet.example.localhost';
const WALLET_SERVICE_ROUTE = '**://wallet.example.localhost/wallet-service';

test.describe('Wallet iframe handshake', () => {
  test.beforeEach(async ({ page }) => {
    page.on('console', (msg) => {
      console.log(`[browser] ${msg.type().toUpperCase()}: ${msg.text()}`);
    });
    // Use a blank document so the example app doesn't mount its own TatchiPasskeyProvider,
    // which would race the test harness router and produce noisy iframe-handshake warnings.
    await page.goto('about:blank');
  });

  test.afterEach(async ({ page }) => {
    await page.unroute(WALLET_SERVICE_ROUTE).catch(() => {});
  });

  // verifies the CONNECT→READY handshake succeeds and exposes a ready router
  test('resolves when the wallet host replies with READY', async ({ page }) => {
    await registerWalletServiceRoute(page, buildWalletServiceHtml(), WALLET_SERVICE_ROUTE);
    await initRouter(page, { walletOrigin: WALLET_ORIGIN });

    const readyState = await page.evaluate(async () => {
      const router = (window as any).__walletRouter;
      await router.init();
      return router.isReady();
    });

    expect(readyState).toBe(true);

    const iframeAttributes = await page.evaluate(() => {
      const iframeEl = document.querySelector('iframe[data-w3a-owner="tests"]') || document.querySelector('iframe');
      if (!iframeEl) return null;
      const cs = window.getComputedStyle(iframeEl as HTMLIFrameElement);
      return {
        src: iframeEl.getAttribute('src'),
        allow: iframeEl.getAttribute('allow'),
        sandbox: iframeEl.getAttribute('sandbox'),
        pointerEvents: cs.pointerEvents,
        opacity: cs.opacity,
      };
    });

    expect(iframeAttributes?.src).toBe(new URL('/wallet-service', WALLET_ORIGIN).toString());
    expect(iframeAttributes?.allow).toContain('publickey-credentials-get');
    expect(iframeAttributes?.sandbox).toBeNull();
    expect(iframeAttributes?.pointerEvents).toBe('none');
    expect(iframeAttributes?.opacity).toBe('0');
  });

  // asserts init() times out if the wallet host never acknowledges READY
  test('rejects when READY never arrives within the timeout budget', async ({ page }) => {
    await registerWalletServiceRoute(page, buildWalletServiceHtml({ respondReady: false }), WALLET_SERVICE_ROUTE);
    await initRouter(page, { walletOrigin: WALLET_ORIGIN, connectTimeoutMs: 200 });

    const result = await page.evaluate(async () => {
      const router = (window as any).__walletRouter;
      try {
        await router.init();
        return { ok: true };
      } catch (err: any) {
        return { ok: false, message: err?.message };
      }
    });

    expect(result.ok).toBe(false);
    expect(result.message).toBe('Wallet iframe READY timeout');

    const readyState = await page.evaluate(() => {
      const router = (window as any).__walletRouter;
      return router.isReady();
    });

    expect(readyState).toBe(false);
  });
});
