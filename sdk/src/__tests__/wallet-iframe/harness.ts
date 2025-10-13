import type { Page } from '@playwright/test';

export interface WalletServiceHtmlOptions {
  respondReady?: boolean;
  handshakeDelayMs?: number;
  extraScript?: string;
}

const baseWalletServiceTemplate = (script: string): string => `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Wallet Service Test Harness</title>
    <style>
      body { font-family: sans-serif; background: #111; color: #eee; }
    </style>
  </head>
  <body>
    <main>
      <h1>Wallet Service Harness</h1>
    </main>
    <script>
      (() => {
        ${script}
      })();
    </script>
  </body>
</html>`;

export const buildWalletServiceHtml = (options: WalletServiceHtmlOptions = {}): string => {
  const { respondReady = true, handshakeDelayMs = 0, extraScript = '' } = options;
  const config = JSON.stringify({ respondReady, handshakeDelayMs });

  const script = `
    const CONFIG = ${config};
    console.log('[wallet-stub] script booted with config', CONFIG);
    let adoptedPort = null;
    const pendingRequests = new Map();

    function adoptPort(port) {
      if (adoptedPort) return;
      adoptedPort = port;
      console.log('[wallet-stub] adopting MessagePort');
      try { adoptedPort.start?.(); } catch {}
      try {
        adoptedPort.onmessage = (event) => {
          const message = event.data || {};
          console.log('[wallet-stub] port message received', message);
          if (!message || typeof message !== 'object') return;
          const { type, requestId } = message;

          if (type === 'PM_SET_CONFIG') {
            try {
              adoptedPort.postMessage({ type: 'PONG', requestId });
            } catch (err) {
              console.error('Failed to respond to PM_SET_CONFIG', err);
            }
            return;
          }

          if (type === 'PM_CANCEL') {
            const targetId = (message.payload && typeof message.payload === 'object') ? message.payload.requestId : undefined;
            const targets = targetId ? [targetId] : Array.from(pendingRequests.keys());
            for (const id of targets) {
              if (!pendingRequests.has(id)) continue;
              pendingRequests.delete(id);
              try {
                adoptedPort.postMessage({
                  type: 'ERROR',
                  requestId: id,
                  payload: { code: 'CANCELLED', message: 'Cancelled by test harness' }
                });
              } catch (err) {
                console.error('Failed to post ERROR for cancelled request', err);
              }
            }
            if (requestId) {
              try {
                adoptedPort.postMessage({ type: 'PM_RESULT', requestId, payload: { ok: true, result: undefined } });
              } catch (err) {
                console.error('Failed to acknowledge PM_CANCEL', err);
              }
            }
            return;
          }

          if (typeof requestId === 'string') {
            pendingRequests.set(requestId, true);
            if (type === 'PM_EXECUTE_ACTION') {
              try {
                adoptedPort.postMessage({
                  type: 'PROGRESS',
                  requestId,
                  payload: {
                    step: 2,
                    phase: 'user-confirmation',
                    status: 'progress',
                    message: 'Awaiting user confirmation (test stub)'
                  }
                });
              } catch (err) {
                console.error('Failed to post PROGRESS for executeAction', err);
              }
            }
          }
        };
      } catch (err) {
        console.warn('Failed to attach port message handler', err);
      }
      const sendReady = () => {
        if (!CONFIG.respondReady) return;
        console.log('[wallet-stub] posting READY');
        try { adoptedPort.postMessage({ type: 'READY' }); } catch (err) {
          console.error('Failed to post READY', err);
        }
      };
      if (CONFIG.handshakeDelayMs > 0) {
        setTimeout(sendReady, CONFIG.handshakeDelayMs);
      } else {
        sendReady();
      }
    }

    window.addEventListener('message', (event) => {
      const hasPort = !!(event.ports && event.ports[0]);
      console.log('[wallet-stub] message received', { type: event?.data?.type, origin: event.origin, hasPort });
      const data = event.data || {};
      if (!data || typeof data !== 'object') return;
      if (data.type !== 'CONNECT') return;
      const port = event.ports && event.ports[0];
      if (!port) {
        console.warn('[wallet-stub] CONNECT message without port');
      }
      if (!port) return;
      adoptPort(port);
    });

    try {
      window.parent?.postMessage({ type: 'SERVICE_HOST_BOOTED' }, '*');
      console.log('[wallet-stub] posted SERVICE_HOST_BOOTED');
    } catch (err) {
      console.warn('Unable to post SERVICE_HOST_BOOTED', err);
    }

    ${extraScript}
  `;

  return baseWalletServiceTemplate(script);
};

export interface RouterHarnessOptions {
  walletOrigin?: string;
  servicePath?: string;
  connectTimeoutMs?: number;
  requestTimeoutMs?: number;
}

export const initRouter = async (
  page: Page,
  options: RouterHarnessOptions = {}
): Promise<void> => {
  const opts = {
    walletOrigin: 'https://wallet.test',
    servicePath: '/wallet-service',
    ...options,
  };

  await page.evaluate(async (routerOptions) => {
    // @ts-ignore - runtime import resolved by dev server during tests
    const base = window.location.origin === 'null' ? 'https://example.localhost' : window.location.origin;
    const module = await import(new URL('/sdk/esm/core/WalletIframe/client/router.js', base).toString());
    const { WalletIframeRouter } = module as typeof import('../../core/WalletIframe/client/router');
    const router = new WalletIframeRouter(routerOptions);
    (window as any).__walletRouter = router;
  }, opts);
};

export const waitFor = async (
  predicate: () => boolean,
  timeoutMs: number = 2000
): Promise<boolean> => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  return predicate();
};

export const registerWalletServiceRoute = async (
  page: Page,
  html: string,
  urlPattern: string = 'https://wallet.test/wallet-service*'
): Promise<void> => {
  const patterns = [urlPattern];
  // Include legacy /service pattern for compatibility with older configs/tests
  if (urlPattern.includes('wallet-service')) {
    patterns.push(urlPattern.replace('wallet-service', 'service'));
  }

  for (const pattern of patterns) {
    await page.route(pattern, (route) => {
      console.log(`[wallet-stub] fulfilling ${route.request().url()}`);
      return route.fulfill({
        status: 200,
        headers: {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'no-store',
          'cross-origin-resource-policy': 'cross-origin',
          'cross-origin-embedder-policy': 'require-corp',
          'cross-origin-opener-policy': 'same-origin-allow-popups',
        },
        body: html,
      });
    });
  }
};
