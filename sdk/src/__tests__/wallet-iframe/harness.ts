import type { Page } from '@playwright/test';
import { injectImportMap } from '../setup/bootstrap';

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
  // Ensure bare module specifiers used by the built ESM bundle
  // (e.g., "bs58") resolve in the browser by installing the
  // shared import map used across Playwright tests.
  await injectImportMap(page);

  const opts = {
    walletOrigin: 'https://wallet.test',
    servicePath: '/wallet-service',
    testOptions: { ownerTag: 'tests' },
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

// Browser-executed helper to locate and summarize the wallet overlay state.
// Prefer the test-owned iframe when present; otherwise choose the interactive
// wallet iframe (pointer-enabled, opacity>0, not aria-hidden). Falls back to
// the latest candidate when none are yet interactive. If the inline confirmer
// host exists, treat it as visible.
export const captureOverlay = () => {
  const iframeEls = Array.from(document.querySelectorAll('iframe')) as HTMLIFrameElement[];
  const testOwned = iframeEls.filter((f) => f.getAttribute('data-w3a-owner') === 'tests');
  const overlayCandidates = (testOwned.length ? testOwned : iframeEls).filter((f) => {
    const allow = f.getAttribute('allow') || '';
    const src = f.getAttribute('src') || '';
    return allow.includes('publickey-credentials') || /wallet\.example\.localhost/.test(src);
  });

  const pickOverlay = (): HTMLIFrameElement | undefined => {
    for (const candidate of overlayCandidates) {
      const style = getComputedStyle(candidate);
      const opacity = Number.parseFloat(style.opacity || '1');
      const pointerEnabled = style.pointerEvents !== 'none';
      const ariaHidden = candidate.getAttribute('aria-hidden') === 'true';
      if (pointerEnabled && !ariaHidden && opacity > 0) {
        return candidate;
      }
    }
    return overlayCandidates.length ? overlayCandidates[overlayCandidates.length - 1] : undefined;
  };

  const overlayIframe = pickOverlay();
  if (overlayIframe) {
    const cs = getComputedStyle(overlayIframe);
    const rect = overlayIframe.getBoundingClientRect();
    const ariaHidden = overlayIframe.getAttribute('aria-hidden') === 'true';
    const opacity = Number.parseFloat(cs.opacity || '1');
    const pointerEnabled = cs.pointerEvents !== 'none';
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

export const registerWalletServiceRoute = async (
  page: Page,
  html: string,
  urlPattern: string = 'https://wallet.test/wallet-service*'
): Promise<void> => {
  await page.route(urlPattern, (route) => {
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
};
