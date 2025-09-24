// Validates the iframe cancel path collapses the overlay reliably across flows without host responses
import { test, expect } from '@playwright/test';
import { setupBasicPasskeyTest, handleInfrastructureErrors } from '../setup';
import { buildWalletServiceHtml, registerWalletServiceRoute } from '../wallet-iframe/playwright/harness';

test.describe('Wallet iframe overlay contracts on cancel', () => {
  test.beforeEach(async ({ page }) => {
    await setupBasicPasskeyTest(page);
    await page.waitForTimeout(500);
    page.on('console', msg => {
      console.log(`[browser] ${msg.type().toUpperCase()}: ${msg.text()}`);
    });
    // Ensure wallet service iframe endpoint is available for handshake
    const WALLET_SERVICE_ROUTE = '**://wallet.example.localhost/wallet-service*';
    await registerWalletServiceRoute(page, buildWalletServiceHtml(), WALLET_SERVICE_ROUTE);
  });
  
  test.afterEach(async ({ page }) => {
    const WALLET_SERVICE_ROUTE = '**://wallet.example.localhost/wallet-service*';
    await page.unroute(WALLET_SERVICE_ROUTE).catch(() => {});
  });

  // confirms cancelAll clears overlay visibility for login/register/action flows
  test('Overlay shows then hides on cancel across core routes', async ({ page }) => {
    test.setTimeout(60000);

    const result = await page.evaluate(async () => {
      try {
        // Dynamically import the wallet iframe client
        // @ts-ignore - runtime import path resolved by SDK build served at /sdk
        const { WalletIframeRouter } = await import('/sdk/esm/core/WalletIframe/client/router.js');

        const cfg = (window as any).configs || {};

        const walletOrigin = cfg.walletOrigin || 'https://wallet.example.localhost';

        const router = new WalletIframeRouter({
          walletOrigin,
          servicePath: cfg.walletServicePath || '/wallet-service',
          sdkBasePath: '/sdk',
          connectTimeoutMs: 20000,
          requestTimeoutMs: 30000,
          debug: true,
          theme: 'light',
          nearRpcUrl: cfg.nearRpcUrl,
          nearNetwork: cfg.nearNetwork || 'testnet',
          contractId: cfg.contractId,
          relayer: cfg.useRelayer && cfg.relayServerUrl ? { accountId: cfg.relayerAccount, url: cfg.relayServerUrl } : undefined,
        });

        await router.init();

        // Helper: find the wallet service iframe
        const getIframe = (): HTMLIFrameElement | null => {
          const iframes = Array.from(document.querySelectorAll('iframe')) as HTMLIFrameElement[];
          // IframeTransport sets a permissive allow attribute including publickey-credentials-* permissions
          return (
            iframes.find((f) => (f.getAttribute('allow') || '').includes('publickey-credentials')) ||
            null
          );
        };

        const isOverlayVisible = (): boolean => {
          const iframe = getIframe();
          if (!iframe) return false;
          const cs = getComputedStyle(iframe);
          // Visible overlay: pointer-events enabled and aria-hidden=false
          return cs.pointerEvents === 'auto' && iframe.getAttribute('aria-hidden') === 'false';
        };

        const captureOverlayState = () => {
          const iframe = getIframe();
          if (!iframe) return { exists: false };
          const cs = getComputedStyle(iframe);
          return {
            exists: true,
            pointerEvents: cs.pointerEvents,
            ariaHidden: iframe.getAttribute('aria-hidden'),
            width: cs.width,
            height: cs.height,
            opacity: cs.opacity,
            zIndex: iframe.style.zIndex,
          };
        };

        const isOverlayHidden = (): boolean => {
          const iframe = getIframe();
          if (!iframe) return true; // treat missing as hidden
          const cs = getComputedStyle(iframe);
          // Hidden overlay: pointer-events none and aria-hidden=true and width 0px
          return (
            cs.pointerEvents === 'none' &&
            iframe.getAttribute('aria-hidden') === 'true' &&
            (cs.width === '0px' || iframe.style.width === '0px')
          );
        };

        const waitFor = async (pred: () => boolean, timeoutMs = 5000): Promise<boolean> => {
          const start = Date.now();
          while (Date.now() - start < timeoutMs) {
            if (pred()) return true;
            await new Promise((r) => setTimeout(r, 50));
          }
          return pred();
        };

        const nearAccountId = ((window as any).testUtils?.generateTestAccountId?.() as string) || `e2e_${Date.now()}`;
        const receiverId = (window as any).testUtils?.configs?.testReceiverAccountId || 'web3-authn-v5.testnet';

        const events: Record<string, any[]> = {};

        const flows: Array<{ name: string; run: () => Promise<unknown> }> = [
          {
            name: 'login',
            run: () => router.loginPasskey({
              nearAccountId,
              options: {
                onEvent: (evt: any) => {
                  (events.login ||= []).push({ phase: evt?.phase, status: evt?.status, type: evt?.type });
                }
              }
            }),
          },
          {
            name: 'register',
            run: () => router.registerPasskey({
              nearAccountId,
              options: {
                onEvent: (evt: any) => {
                  (events.register ||= []).push({ phase: evt?.phase, status: evt?.status, type: evt?.type });
                }
              }
            }),
          },
          {
            name: 'executeAction',
            run: () =>
              router.executeAction({
                nearAccountId,
                receiverId,
                actionArgs: { type: 'Transfer', amount: '1' } as any,
                options: {
                  onEvent: (evt: any) => {
                    (events.executeAction ||= []).push({ phase: evt?.phase, status: evt?.status, type: evt?.type });
                  }
                },
              }),
          },
        ];

        const results: Array<{ name: string; shown: boolean; hidden: boolean }> = [];
        const overlayStates: Record<string, { beforeCancel: ReturnType<typeof captureOverlayState>; afterCancel: ReturnType<typeof captureOverlayState> }> = {};

        for (const flow of flows) {
          // Start the flow; do not await — we intend to cancel
          const p = flow.run().catch(() => undefined);

          // Wait for overlay to become visible (due to showFrameForActivation or progress heuristic)
          const shown = await waitFor(isOverlayVisible, 8000);

           const beforeCancel = captureOverlayState();

          // Cancel everything (best-effort); host emits PROGRESS('cancelled') + ERROR, and router hides even without pending
          await router.cancelAll();

          // Ensure overlay contracts
          const hidden = await waitFor(isOverlayHidden, 8000);
          const afterCancel = captureOverlayState();

          overlayStates[flow.name] = { beforeCancel, afterCancel };

          results.push({ name: flow.name, shown, hidden });

          // Let any pending promise settle to avoid unhandled rejections
          try { await p; } catch {}
        }

        return { success: true, results, events, overlayStates };
      } catch (error: any) {
        return { success: false, error: error?.message || String(error) };
      }
    });

    if (!result.success) {
      console.log('overlay cancel failure', result);
      if (handleInfrastructureErrors(result as any)) return;
      expect(result.success).toBe(true);
      return;
    }

    console.log('overlay cancel results', JSON.stringify(result, null, 2));

    // Each flow should have shown and then hidden the overlay post-cancel
    for (const r of (result as any).results as Array<{ name: string; shown: boolean; hidden: boolean }>) {
      expect.soft(r.shown, `${r.name}: overlay did not become visible`).toBe(true);
      expect.soft(r.hidden, `${r.name}: overlay did not hide after cancel`).toBe(true);
    }
  });
});
