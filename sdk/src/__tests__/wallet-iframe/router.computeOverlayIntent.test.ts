import { test, expect } from '@playwright/test';
import { setupBasicPasskeyTest } from '../setup';

const WALLET_ORIGIN = 'https://wallet.example.localhost';

test.describe('WalletIframeRouter.computeOverlayIntent', () => {
  test.beforeEach(async ({ page }) => {
    await setupBasicPasskeyTest(page);
  });

  test('preflight fullscreen intent for activation-required requests', async ({ page }) => {
    const result = await page.evaluate(async ({ walletOrigin }) => {
      const mod = await import('/sdk/esm/core/WalletIframe/client/router.js');
      const { WalletIframeRouter } = mod as typeof import(
        '../../core/WalletIframe/client/router'
      );
      const router = new WalletIframeRouter({
        walletOrigin,
        servicePath: '/wallet-service',
        connectTimeoutMs: 1000,
        requestTimeoutMs: 1000,
        sdkBasePath: '/sdk'
      });
      const calls: Array<{ type: string; mode: string }> = [];
      const fullscreenTypes = [
        'PM_EXPORT_NEAR_KEYPAIR_UI',
        'PM_REGISTER',
        'PM_LOGIN',
        'PM_LINK_DEVICE_WITH_SCANNED_QR_DATA',
        'PM_SIGN_AND_SEND_TXS',
        'PM_EXECUTE_ACTION',
        'PM_SEND_TRANSACTION',
        'PM_SIGN_TXS_WITH_ACTIONS',
      ];
      const hiddenTypes = [
        'PM_GET_LOGIN_SESSION',
        'PM_SET_THEME',
        'PM_GET_CONFIRMATION_CONFIG',
        'PM_SET_CONFIRM_BEHAVIOR',
        'PM_SET_CONFIRMATION_CONFIG',
        'PM_PREFETCH_BLOCKHEIGHT',
        'PM_LOGOUT',
      ];

      const compute = (router as any).computeOverlayIntent.bind(router) as (t: string) => { mode: 'hidden' | 'fullscreen' };
      for (const t of fullscreenTypes) calls.push({ type: t, mode: compute(t).mode });
      for (const t of hiddenTypes) calls.push({ type: t, mode: compute(t).mode });
      return { calls };
    }, { walletOrigin: WALLET_ORIGIN });

    const byType = Object.fromEntries(result.calls.map(c => [c.type, c.mode]));
    // Fullscreen intents
    expect(byType['PM_EXPORT_NEAR_KEYPAIR_UI']).toBe('fullscreen');
    expect(byType['PM_REGISTER']).toBe('fullscreen');
    expect(byType['PM_LOGIN']).toBe('fullscreen');
    expect(byType['PM_LINK_DEVICE_WITH_SCANNED_QR_DATA']).toBe('fullscreen');
    expect(byType['PM_SIGN_AND_SEND_TXS']).toBe('fullscreen');
    expect(byType['PM_EXECUTE_ACTION']).toBe('fullscreen');
    expect(byType['PM_SEND_TRANSACTION']).toBe('fullscreen');
    expect(byType['PM_SIGN_TXS_WITH_ACTIONS']).toBe('fullscreen');
    // Hidden intents
    expect(byType['PM_GET_LOGIN_SESSION']).toBe('hidden');
    expect(byType['PM_SET_THEME']).toBe('hidden');
    expect(byType['PM_GET_CONFIRMATION_CONFIG']).toBe('hidden');
    expect(byType['PM_SET_CONFIRM_BEHAVIOR']).toBe('hidden');
    expect(byType['PM_SET_CONFIRMATION_CONFIG']).toBe('hidden');
    expect(byType['PM_PREFETCH_BLOCKHEIGHT']).toBe('hidden');
    expect(byType['PM_LOGOUT']).toBe('hidden');
  });
});
