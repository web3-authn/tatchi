import { Page } from '@playwright/test';
import { buildPermissionsPolicy, buildWalletCsp } from '../../plugins/headers';
import { printLog, printStepLine } from './logging';

/**
 * Installs Playwright routes that simulate production cross-origin headers for
 * wallet SDK assets (/sdk/*) and the wallet-service surface. This enables
 * cross-origin workers and WASM to load during tests without same-origin hacks.
 *
 * Logging can be emitted in two styles:
 *  - 'intercept' (default): intercepted category logs
 *  - 'setup': prints as setup step 1 lines for nicer sequence
 *  - 'silent': no logs
 */
export async function installWalletSdkCorsShim(
  page: Page,
  options: { walletOrigin?: string; appOrigin?: string; logStyle?: 'intercept' | 'setup' | 'silent'; mirror?: boolean } = {}
): Promise<void> {
  const walletOrigin = options.walletOrigin ?? 'https://wallet.example.localhost';
  const appOrigin = options.appOrigin ?? 'https://example.localhost';
  const logStyle = options.logStyle ?? 'silent';
  const mirror = options.mirror !== false; // default true to support NO_CADDY

  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Prefer BrowserContext glob patterns to ensure reliable matching across transports
  const walletHost = (() => { try { return new URL(walletOrigin).host } catch { return 'wallet.example.localhost' } })();
  const sdkPattern: string = `**://${walletHost}/sdk/**`;
  const walletServicePattern: string = `**://${walletHost}/wallet-service*`;

  const buildAssetHeaders = (orig: Record<string, string>, url: string): Record<string, string> => {
    const headers: Record<string, string> = { ...orig };
    // Match dev plugin behavior so COEP documents can import module workers and WASM
    headers['cross-origin-embedder-policy'] = 'require-corp';
    headers['cross-origin-resource-policy'] = 'cross-origin';
    headers['access-control-allow-origin'] = appOrigin;
    headers['access-control-allow-credentials'] = 'true';
    headers['access-control-allow-methods'] = 'GET,OPTIONS';
    headers['access-control-allow-headers'] = 'Content-Type,Authorization';
    headers['access-control-expose-headers'] = [
      'Cross-Origin-Resource-Policy',
      'Cross-Origin-Embedder-Policy',
      'Access-Control-Allow-Origin',
      'Content-Type'
    ].join(', ');
    headers['vary'] = 'Origin';
    if (/\.wasm(\?|$)/i.test(url)) headers['content-type'] = 'application/wasm';
    return headers;
  };

  // Install at BrowserContext level so worker/iframe requests are covered too
  const ctx = page.context();

  // Ensure previous routes are cleared
  await ctx.unroute(sdkPattern as any).catch(() => undefined);
  await ctx.route(sdkPattern as any, async (route) => {
    const req = route.request();
    const url = req.url();
    const method = (req.method() || 'GET').toUpperCase();

    if (method === 'OPTIONS') {
      if (logStyle === 'intercept') {
        printLog('intercept', `sdk preflight OPTIONS ${url}`, { scope: 'cors' });
      }
      return route.fulfill({
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': appOrigin,
          'Access-Control-Allow-Methods': 'GET,OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type,Authorization',
          'Access-Control-Allow-Credentials': 'true',
        },
        body: '',
      });
    }

    try {
      if (logStyle === 'intercept') {
        printLog('intercept', `sdk ${method} ${url} [mirror=${mirror ? 'on' : 'off'}]`, { scope: 'cors' });
      }
      const upstreamUrl = mirror ? url.replace(walletOrigin, appOrigin) : url;
      const fetched = await route.fetch({ url: upstreamUrl });
      const body = await fetched.body();
      const originalHeaders = fetched.headers();
      const lower: Record<string, string> = {};
      for (const [k, v] of Object.entries(originalHeaders)) if (typeof v === 'string') lower[k] = v;
      const headers = buildAssetHeaders(lower, url);
      await route.fulfill({ status: fetched.status(), headers, body });
      if (logStyle === 'intercept') {
        printLog('intercept', `sdk fulfilled ${url} ← ${upstreamUrl} (status ${fetched.status()})`, { scope: 'cors', indent: 1 });
      }
    } catch (error) {
      printLog('intercept', `cors shim fell back (${(error as Error).message})`, { scope: 'cors', indent: 1 });
      return route.fallback();
    }
  });
  if (logStyle === 'intercept') {
    printLog('intercept', `wallet SDK CORS/CORP shim installed for ${walletOrigin}/sdk/*`, { scope: 'cors', step: 'ready' });
  } else if (logStyle === 'setup') {
    printStepLine(1, `wallet SDK CORS/CORP headers installed for ${walletOrigin}/sdk/*`);
  }

  await ctx.unroute(walletServicePattern as any).catch(() => undefined);
  await ctx.route(walletServicePattern as any, async (route) => {
    try {
      const req = route.request();
      const url = req.url();
      const upstreamUrl = mirror ? url.replace(walletOrigin, appOrigin) : url;
      if (logStyle === 'intercept') {
        printLog('intercept', `wallet-service GET ${url} [mirror=${mirror ? 'on' : 'off'}]`, { scope: 'cors' });
      }
      const fetched = await route.fetch({ url: upstreamUrl });
      const body = await fetched.body();
      const headers: Record<string, string> = {
        'cross-origin-opener-policy': 'unsafe-none',
        'cross-origin-embedder-policy': 'require-corp',
        'cross-origin-resource-policy': 'cross-origin',
        'permissions-policy': buildPermissionsPolicy(walletOrigin),
        'content-security-policy': buildWalletCsp({ mode: 'strict' }),
      };
      await route.fulfill({ status: fetched.status(), headers, body });
      if (logStyle === 'intercept') {
        printLog('intercept', `wallet-service fulfilled ${url} ← ${upstreamUrl} (status ${fetched.status()})`, { scope: 'cors', indent: 1 });
      }
    } catch (error) {
      printLog('intercept', `wallet-service shim fell back (${(error as Error).message})`, { scope: 'cors', indent: 1 });
      return route.fallback();
    }
  });
  if (logStyle === 'intercept') {
    printLog('intercept', `wallet service headers shim installed for ${walletOrigin}/wallet-service/*`, { scope: 'cors', step: 'ready' });
  } else if (logStyle === 'setup') {
    printStepLine(1, `wallet service headers shim installed for ${walletOrigin}/wallet-service/*`, 2);
  }

  // Also emit a browser‑console breadcrumb so logs appear in Playwright console capture
  try {
    if (logStyle === 'intercept') {
      await page.evaluate((args) => {
        const { walletOrigin, appOrigin, mirror } = args;
        console.log(`[cors] shim ready sdk: ${walletOrigin}/sdk/* (mirror=${mirror ? 'on' : 'off'}) → upstream: ${mirror ? appOrigin : walletOrigin}`);
        console.log(`[cors] shim ready wallet-service: ${walletOrigin}/wallet-service/*`);
      }, { walletOrigin, appOrigin, mirror });
    }
  } catch {}
}
