import { Page, type Route } from '@playwright/test';
import { printStepLine } from './logging';
import { installWalletSdkCorsShim } from './cross-origin-headers';
import type { PasskeyTestConfig } from './types';
import { DEFAULT_TEST_CONFIG } from './config';

async function setupWebAuthnVirtualAuthenticator(page: Page): Promise<string> {

  const client = await page.context().newCDPSession(page);
  await client.send('WebAuthn.enable');

  // Add virtual authenticator with configuration based on
  // https://www.corbado.com/blog/passkeys-e2e-playwright-testing-webauthn-virtual-authenticator
  const authenticator = await client.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal', // Platform authenticator (like Touch ID/Face ID)
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });

  const authenticatorId = authenticator.authenticatorId;
  printStepLine(2, `virtual authenticator ready (${authenticatorId})`);
  return authenticatorId;
}

/**
 * Step 2: IMPORT MAP INJECTION
 * Add module resolution mappings to the page
 */
export async function injectImportMap(page: Page): Promise<void>;
export async function injectImportMap(page: Page, options: { frontendUrl: string }): Promise<void>;
export async function injectImportMap(page: Page, options?: { frontendUrl: string }): Promise<void> {
  const imports = {
    bs58: 'https://esm.sh/bs58@6.0.0',
    idb: 'https://esm.sh/idb@8.0.0',
    'js-sha256': 'https://esm.sh/js-sha256@0.11.1',
    '@noble/ed25519': 'https://esm.sh/@noble/ed25519@3.0.0',
    qrcode: 'https://esm.sh/qrcode@1.5.4',
    jsqr: 'https://esm.sh/jsqr@1.4.0',
    '@near-js/types': 'https://esm.sh/@near-js/types@2.0.1',
    tslib: 'https://esm.sh/tslib@2.8.1',
    buffer: 'https://esm.sh/buffer@6.0.3',
    lit: 'https://esm.sh/lit@3.1.0',
    'lit/decorators.js': 'https://esm.sh/lit@3.1.0/decorators.js',
    'lit/directive.js': 'https://esm.sh/lit@3.1.0/directive.js',
    'lit/directive-helpers.js': 'https://esm.sh/lit@3.1.0/directive-helpers.js',
    'lit/async-directive.js': 'https://esm.sh/lit@3.1.0/async-directive.js',
    'lit/directives/when.js': 'https://esm.sh/lit@3.1.0/directives/when.js',
    'lit/directives/if-defined.js': 'https://esm.sh/lit@3.1.0/directives/if-defined.js',
    'lit/directives/class-map.js': 'https://esm.sh/lit@3.1.0/directives/class-map.js',
    'lit/directives/style-map.js': 'https://esm.sh/lit@3.1.0/directives/style-map.js',
    'lit/directives/repeat.js': 'https://esm.sh/lit@3.1.0/directives/repeat.js',
    'lit/directives/guard.js': 'https://esm.sh/lit@3.1.0/directives/guard.js',
    'lit/directives/cache.js': 'https://esm.sh/lit@3.1.0/directives/cache.js',
    'lit/directives/until.js': 'https://esm.sh/lit@3.1.0/directives/until.js',
    'lit/directives/ref.js': 'https://esm.sh/lit@3.1.0/directives/ref.js',
    'lit/directives/live.js': 'https://esm.sh/lit@3.1.0/directives/live.js',
    'lit/directives/unsafe-html.js': 'https://esm.sh/lit@3.1.0/directives/unsafe-html.js',
    'lit/directives/unsafe-svg.js': 'https://esm.sh/lit@3.1.0/directives/unsafe-svg.js',
    'lit/static-html.js': 'https://esm.sh/lit@3.1.0/static-html.js',
    'lit/html.js': 'https://esm.sh/lit@3.1.0/html.js',
    'lit/css.js': 'https://esm.sh/lit@3.1.0/css.js',
    'lit/lit-element.js': 'https://esm.sh/lit@3.1.0/lit-element.js',
    'lit/reactive-element.js': 'https://esm.sh/lit@3.1.0/reactive-element.js',
  } as const;

  // Import maps must be present in the HTML during parsing (before any module scripts run).
  // The Vite example app includes `<script type="module" src="/src/main.tsx">`, so we inject
  // the import map by rewriting the top-level document HTML during the initial navigation.
  const importMapAttr = 'data-w3a-importmap';
  const importMapMarker = `${importMapAttr}="1"`;
  const importMapHtml = `<script type="importmap" ${importMapMarker}>${JSON.stringify({ imports })}</script>`;

  const handler = async (route: Route) => {
    const req = route.request();
    // Safety: only touch top-level documents (never iframe documents like wallet-service).
    try {
      if (req.resourceType() !== 'document') return route.fallback();
      if (req.frame().parentFrame()) return route.fallback();
    } catch {
      return route.fallback();
    }

    const fetched = await route.fetch();
    const headers = fetched.headers();
    const ct = headers['content-type'] || headers['Content-Type'] || '';
    if (!String(ct).toLowerCase().includes('text/html')) {
      return route.fulfill({ status: fetched.status(), headers, body: await fetched.body() });
    }

    const html = await fetched.text();
    if (html.includes(importMapMarker)) {
      return route.fulfill({ status: fetched.status(), headers, body: html });
    }

    const patched = html.includes('</head>')
      ? html.replace(/<\/head>/i, `${importMapHtml}</head>`)
      : `${importMapHtml}${html}`;

    // Avoid stale content-length; Playwright will compute it.
    const nextHeaders = { ...headers };
    delete (nextHeaders as any)['content-length'];
    delete (nextHeaders as any)['Content-Length'];
    return route.fulfill({ status: fetched.status(), headers: nextHeaders, body: patched });
  };

  const ensureUrl = (raw: string): string => {
    const u = new URL(raw);
    u.hash = '';
    u.search = '';
    return u.toString();
  };

  const currentUrlRaw = page.url();
  const currentUrl = (() => {
    try {
      return new URL(currentUrlRaw);
    } catch {
      return null;
    }
  })();

  // Route-only mode (pre-navigation): used by executeSequentialSetup() to patch the initial HTML response.
  if (options?.frontendUrl) {
    const frontendUrl = ensureUrl(options.frontendUrl);
    const indexUrl = new URL('/index.html', frontendUrl).toString();

    await page.unroute(frontendUrl).catch(() => undefined);
    await page.route(frontendUrl, handler);
    await page.unroute(indexUrl).catch(() => undefined);
    await page.route(indexUrl, handler);

    printStepLine(3, 'import map route installed (document rewrite)');
    return;
  }

  // If the current document already has the import map, do nothing.
  try {
    const alreadyInjected = await page.evaluate((attr) => {
      return !!document.querySelector(`script[type="importmap"][${attr}="1"]`);
    }, importMapAttr);
    if (alreadyInjected) {
      return;
    }
  } catch {}

  // If we're on a non-http(s) URL (about:blank, data:), we can't rewrite network HTML.
  // Use setContent() to create a fresh document that includes the import map during parsing.
  if (!currentUrl || (currentUrl.protocol !== 'http:' && currentUrl.protocol !== 'https:')) {
    const baseHref = ensureUrl(DEFAULT_TEST_CONFIG.frontendUrl);
    const html = `<!DOCTYPE html><html><head><base href="${baseHref}">${importMapHtml}</head><body></body></html>`;
    await page.setContent(html, { waitUntil: 'domcontentloaded' });
    return;
  }

  // Reload once to apply import map injection to the current document.
  const docUrl = ensureUrl(currentUrl.toString());
  const indexUrl = new URL('/index.html', docUrl).toString();

  await page.unroute(docUrl).catch(() => undefined);
  await page.route(docUrl, handler);
  await page.unroute(indexUrl).catch(() => undefined);
  await page.route(indexUrl, handler);

  await page.reload({ waitUntil: 'domcontentloaded' });
}

/**
 * Step 3: STABILIZATION WAIT
 * Allow browser environment to settle
 */
async function waitForEnvironmentStabilization(page: Page): Promise<void> {

  await page.waitForLoadState('domcontentloaded');
  await page.waitForFunction(() => document.readyState === 'complete' || document.readyState === 'interactive');

  printStepLine(4, 'environment stabilized');
}

/**
 * Step 4: DYNAMIC IMPORTS
 * Load TatchiPasskey only after environment is ready
 *
 * NOTE (VRF v2):
 * - The dynamically loaded TatchiPasskey instance now wires:
 *   - VRF worker as the sole owner of WebAuthn PRF + SecureConfirm
 *     (via awaitSecureConfirmationV2 in the VRF worker).
 *   - Signer worker as a WrapKeySeed/KEK/NEAR‑signature enclave that only ever
 *     sees WrapKeySeed over the internal MessagePort channel (no PRF/vrf_sk).
 */
async function loadPasskeyManagerDynamically(page: Page, configs: PasskeyTestConfig): Promise<void> {
  // Wait for the page to be ready before attempting imports.
  // Note: `networkidle` is unreliable on Vite dev pages due to HMR/WebSocket connections.
  await page.waitForLoadState('domcontentloaded');
  await page.waitForFunction(() => document.readyState === 'complete' || document.readyState === 'interactive');

  // Robust error handling + retry logic
  const maxRetries = 3;
  let lastError: any = null;
  const attemptTimeoutMs = 15_000;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      printStepLine(5, `importing TatchiPasskey: attempt ${attempt}/${maxRetries}`, 1);

      const loadHandle = await page.waitForFunction(async (setupOptions) => {
        try {
          const { TatchiPasskey } = await import('/sdk/esm/core/TatchiPasskey/index.js');

          if (!TatchiPasskey) {
            throw new Error('TatchiPasskey not found in SDK module');
          }

          // Create and validate configuration
          const runtimeConfigs = {
            nearNetwork: setupOptions.nearNetwork as 'testnet',
            relayerAccount: setupOptions.relayerAccount,
            contractId: setupOptions.contractId,
            nearRpcUrl: setupOptions.nearRpcUrl,
            useRelayer: setupOptions.useRelayer || false,
            relayServerUrl: setupOptions.relayServerUrl,
            relayer: setupOptions.relayer,
            // Ensure VRF worker has relay server for Shamir3Pass operations
            vrfWorkerConfigs: {
              shamir3pass: {
                relayServerUrl: (setupOptions.relayServerUrl || (setupOptions.relayer && (setupOptions.relayer as any).url) || 'http://localhost:3000'),
                applyServerLockRoute: '/vrf/apply-server-lock',
                removeServerLockRoute: '/vrf/remove-server-lock',
              }
            },
            // Additional centralized configuration
            frontendUrl: setupOptions.frontendUrl,
            rpId: setupOptions.rpId,
            testReceiverAccountId: setupOptions.testReceiverAccountId
          };

          // Validate required configs
          if (!runtimeConfigs.nearRpcUrl) throw new Error('nearRpcUrl is required but not provided');
          if (!runtimeConfigs.contractId) throw new Error('contractId is required but not provided');
          if (!runtimeConfigs.relayerAccount) throw new Error('relayerAccount is required but not provided');

          // Create TatchiPasskey instance
          const passkeyManager = new TatchiPasskey(runtimeConfigs);

          // Store in window for test access
          (window as any).TatchiPasskey = TatchiPasskey;
          (window as any).passkeyManager = passkeyManager;
          (window as any).configs = runtimeConfigs;

          return { success: true, message: 'TatchiPasskey loaded successfully' };
        } catch (error: any) {
          const message = error?.message ? String(error.message) : String(error);
          return { success: false, error: message };
        }
      }, configs, {
        timeout: attemptTimeoutMs,
        polling: 1000
      });

      const loadResult = await loadHandle.jsonValue().catch(() => ({ success: true }));
      await loadHandle.dispose();

      if (!loadResult?.success) {
        const message = (loadResult && typeof loadResult === 'object' && 'error' in loadResult && typeof (loadResult as { error?: unknown }).error === 'string')
          ? (loadResult as { error: string }).error
          : 'Unknown error loading TatchiPasskey';
        throw new Error(message);
      }

      printStepLine(5, `TatchiPasskey ready (attempt ${attempt})`, 2);
      return;

    } catch (error: any) {
      lastError = error;
      printStepLine(5, `attempt ${attempt} failed: ${error.message}`, 3);

      if (attempt < maxRetries) {
        printStepLine(5, `retrying in 0.5 seconds (${maxRetries - attempt} retries remaining)`, 3);
        await new Promise(resolve => setTimeout(resolve, 500));
        // Wait for page to be stable again before retry
        await page.waitForLoadState('domcontentloaded');
      }
    }
  }

  // All retries failed
  throw new Error(`Failed to load TatchiPasskey after ${maxRetries} attempts. Last error: ${lastError?.message}`);
}

/**
 * Step 5: GLOBAL FALLBACK
 * Ensure base64UrlEncode is available as safety measure
 */
async function ensureGlobalFallbacks(page: Page): Promise<void> {
  await page.waitForFunction(async () => {
    try {
      // Defense in depth: Ensure base64UrlEncode is globally available
      // This prevents "base64UrlEncode is not defined" errors even if timing issues occur
      if (typeof (window as any).base64UrlEncode === 'undefined') {
        try {
          const { base64UrlEncode } = await import('/sdk/esm/utils/base64.js');
          (window as any).base64UrlEncode = base64UrlEncode;
          console.log('[setup:browser] base64UrlEncode made available globally as fallback');
        } catch (encoderError) {
          console.error('[setup:browser] Failed to import base64UrlEncode fallback:', encoderError);
        }
      }

      // Also ensure base64UrlDecode is available for credential ID decoding
      if (typeof (window as any).base64UrlDecode === 'undefined') {
        try {
          const { base64UrlDecode } = await import('/sdk/esm/utils/base64.js');
          (window as any).base64UrlDecode = base64UrlDecode;
        } catch (encoderError) {
          console.error('[setup:browser - step 5] Failed to import base64UrlDecode fallback:', encoderError);
        }
      }

      // Ensure toAccountId is available globally for tests
      if (typeof (window as any).toAccountId === 'undefined') {
        try {
          const { toAccountId } = await import('/sdk/esm/core/types/accountIds.js');
          (window as any).toAccountId = toAccountId;
        } catch (accountIdError) {
          console.error('[setup:browser - step 5] Failed to import toAccountId fallback:', accountIdError);
        }
      }

      return true; // Success indicator
    } catch (error) {
      console.error('Global fallbacks setup failed:', error);
      return false;
    }
  }, {
    timeout: 15000, // 15 second timeout
    polling: 500    // Check every 500ms
  });

  printStepLine(6, 'global fallbacks ready');
}

/**
 * Orchestrator function that executes all 5 setup steps sequentially
 */
export async function executeSequentialSetup(
  page: Page,
  configs: PasskeyTestConfig,
  options: { skipPasskeyManagerInit?: boolean } = {}
): Promise<string> {
  printStepLine('bootstrap', 'starting 6-step sequential bootstrap', 0);

  // Step 1a: Log CORS/CORP headers installation (routes already installed pre-navigation)
  const appOrigin = new URL(configs.frontendUrl).origin;
  await installWalletSdkCorsShim(page, { appOrigin, logStyle: 'setup' });

  // Step 2: ENVIRONMENT SETUP
  const authenticatorId = await setupWebAuthnVirtualAuthenticator(page);

  // Step 3: IMPORT MAP INJECTION
  await injectImportMap(page, { frontendUrl: configs.frontendUrl });

  // Navigate after import map injection so the initial HTML parse can apply the map.
  try {
    const frontend = new URL(configs.frontendUrl);
    frontend.hash = '';
    frontend.search = '';
    await page.goto(frontend.toString(), { waitUntil: 'domcontentloaded' });
  } catch {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
  }

  // Step 4: STABILIZATION WAIT
  await waitForEnvironmentStabilization(page);

  if (!options.skipPasskeyManagerInit) {
    // Step 5: DYNAMIC IMPORTS
    await loadPasskeyManagerDynamically(page, configs);

    // Step 6: GLOBAL FALLBACK
    await ensureGlobalFallbacks(page);
  }

  // finished
  return authenticatorId;
}
