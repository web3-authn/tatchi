import { Page, expect } from '@playwright/test';
import { buildPermissionsPolicy, buildWalletCsp } from '../../plugins/headers';
import { DEFAULT_TEST_CONFIG } from './config';
import { formatLog, printLog, printStepLine } from './logging';

export interface ContractBypassOptions {
  nearRpcUrl?: string;
}

export async function bypassContractVerification(
  page: Page,
  options: ContractBypassOptions = {}
): Promise<void> {
  const rpcUrl = options.nearRpcUrl ?? DEFAULT_TEST_CONFIG.nearRpcUrl;

  await page.route(rpcUrl, async (route) => {
    try {
      const request = route.request();
      if (request.method() !== 'POST') {
        return route.fallback();
      }

      const bodyText = request.postData() || '';
      let body: any = {};
      try {
        body = JSON.parse(bodyText);
      } catch {
        return route.fallback();
      }

      const method = body?.method;
      const params = body?.params || {};
      const methodName = params?.method_name;
      if (
        method !== 'query' ||
        params?.request_type !== 'call_function' ||
        methodName !== 'verify_authentication_response'
      ) {
        return route.fallback();
      }

      const contentType = request.headers()['content-type'] || '';
      expect(contentType).toContain('application/json');

      let userId = 'unknown.user';
      let rpId = 'example.localhost';
      try {
        const argsB64 = params?.args_base64 || '';
        const argsJsonStr = Buffer.from(argsB64, 'base64').toString('utf8');
        const args = JSON.parse(argsJsonStr);
        userId = args?.vrf_data?.user_id || userId;
        rpId = args?.vrf_data?.rp_id || rpId;
      } catch {
        // ignore decode failures
      }

      const contractResponse = JSON.stringify({ verified: true });
      const resultBytes = Array.from(Buffer.from(contractResponse, 'utf8'));

      const rpcResponse = {
        jsonrpc: '2.0',
        id: body?.id || 'verify_from_wasm',
        result: {
          result: resultBytes,
          logs: [
            'VRF Authentication: Verifying VRF proof + WebAuthn authentication',
            `  - User ID: ${userId}`,
            `  - RP ID (domain): ${rpId}`,
          ],
        },
      };

      printLog('intercept', `contract verification bypass responded for ${userId}`, {
        scope: 'contract',
        indent: 1,
      });

      await route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rpcResponse),
      });
    } catch (error) {
      printLog('intercept', `contract bypass fell back (${(error as Error).message})`, {
        scope: 'contract',
        indent: 1,
      });
      return route.fallback();
    }
  });

  printLog('intercept', `contract verification bypass installed at ${rpcUrl}`, {
    scope: 'contract',
    step: 'ready',
  });
}

export interface RelayMockOptions {
  relayUrl?: string;
  success?: boolean;
}

export async function mockRelayServer(
  page: Page,
  options: RelayMockOptions = {}
): Promise<void> {
  const relayBase = (options.relayUrl ?? DEFAULT_TEST_CONFIG.relayer?.url ?? 'https://relay-server.localhost').replace(/\/$/, '');
  const endpoint = `${relayBase}/create_account_and_register_user`;

  await page.unroute(endpoint).catch(() => undefined);

  await page.route(endpoint, async (route) => {
    const success = options.success ?? true;
    const request = route.request();
    let accountId = 'unknown';
    try {
      const payload = JSON.parse(request.postData() || '{}');
      accountId = payload?.account_id || payload?.accountId || accountId;
    } catch {
      // ignore parse errors
    }

    if (success) {
      printLog('intercept', `relay mock fulfilled for ${accountId}`, {
        scope: 'relay',
        indent: 1,
      });
      await route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          success: true,
          transactionHash: `mock_atomic_transaction_${Date.now()}`,
          message: 'Account created and registered successfully via relay-server (mock)',
        }),
      });
      return;
    }

    printLog('intercept', `relay mock forced failure for ${accountId}`, {
      scope: 'relay',
      indent: 1,
    });
    await route.fulfill({
      status: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: false,
        error: 'Mock relay failure',
      }),
    });
  });

  printLog('intercept', `relay server mock installed`, {
    scope: 'relay',
    step: 'ready',
  });
}

export interface FaucetMockOptions {
  faucetUrl?: string;
  success?: boolean;
}

export async function mockTestnetFaucet(
  page: Page,
  options: FaucetMockOptions = {}
): Promise<void> {
  const faucetBase = (options.faucetUrl ?? 'https://helper.testnet.near.org').replace(/\/$/, '');
  const endpointPattern = new RegExp(`^${faucetBase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}.*`);

  await page.unroute(endpointPattern).catch(() => undefined);

  await page.route(endpointPattern, async (route) => {
    const success = options.success ?? true;
    if (success) {
      printLog('intercept', 'faucet mock fulfilled request', {
        scope: 'faucet',
        indent: 1,
      });
      await route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok: true }),
      });
      return;
    }

    printLog('intercept', 'faucet mock forced 429 throttling', {
      scope: 'faucet',
      indent: 1,
    });
    await route.fulfill({
      status: 429,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Mock testnet faucet throttling' }),
    });
  });

  printLog('intercept', 'faucet mock installed', {
    scope: 'faucet',
    step: 'ready',
  });
}

export interface AccessKeyMockOptions {
  nearRpcUrl?: string;
  accountId?: string;
  publicKey?: string;
}

export async function mockAccessKeyLookup(
  page: Page,
  options: AccessKeyMockOptions = {}
): Promise<void> {
  const rpcUrl = options.nearRpcUrl ?? DEFAULT_TEST_CONFIG.nearRpcUrl;
  const accountId = options.accountId ?? 'mock-account.testnet';
  const publicKey = options.publicKey ?? 'ed25519:mockpublickey';

  await page.route(rpcUrl, async (route) => {
    const request = route.request();
    if (request.method() !== 'POST') {
      return route.fallback();
    }

    const bodyText = request.postData() || '';
    let body: any = {};
    try {
      body = JSON.parse(bodyText);
    } catch {
      return route.fallback();
    }

    if (body?.method !== 'query') {
      return route.fallback();
    }

    const params = body?.params;
    if (params?.request_type !== 'view_access_key' || params?.account_id !== accountId) {
      return route.fallback();
    }

    printLog('intercept', `access key lookup mock responded for ${accountId}`, {
      scope: 'access-key',
      indent: 1,
    });

    await route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: body?.id ?? 'mock_view_access_key',
        result: {
          block_hash: 'mock-block-hash',
          block_height: 0,
          nonce: 1,
          permission: {
            FunctionCall: {
              allowance: null,
              method_names: [],
              receiver_id: accountId,
            },
          },
          public_key: publicKey,
        },
      }),
    });
  });

  printLog('intercept', 'access key lookup mock installed', {
    scope: 'access-key',
    step: 'ready',
  });
}

export function formatInterceptHeader(category: string, message: string): string {
  return formatLog('intercept', message, { scope: category });
}

// --- Send transaction mock (stabilizes broadcast in tests) ---
export interface SendTxMockOptions {
  nearRpcUrl?: string;
  success?: boolean;
}

export async function mockSendTransaction(
  page: Page,
  options: SendTxMockOptions = {}
): Promise<void> {
  const rpcUrl = options.nearRpcUrl ?? DEFAULT_TEST_CONFIG.nearRpcUrl;

  await page.route(rpcUrl, async (route) => {
    const request = route.request();
    if (request.method() !== 'POST') {
      return route.fallback();
    }
    let body: any = {};
    try {
      body = JSON.parse(request.postData() || '{}');
    } catch {
      return route.fallback();
    }

    if (body?.method !== 'send_tx') {
      return route.fallback();
    }

    const ok = options.success ?? true;
    if (!ok) {
      return route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: body?.id ?? 'mock_send_tx_fail',
          error: { code: -32000, message: 'Mock Server error' },
        }),
      });
    }

    const txHash = `mock-tx-${Date.now()}`;
    printLog('intercept', `send_tx mock fulfilled (${txHash})`, { scope: 'send-tx', indent: 1 });
    return route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: body?.id ?? 'mock_send_tx',
        result: {
          status: { SuccessValue: '' },
          transaction: { hash: txHash },
          transaction_outcome: { id: txHash },
          receipts_outcome: [],
        },
      }),
    });
  });

  printLog('intercept', 'send_tx mock installed', { scope: 'send-tx', step: 'ready' });
}

// --- Wallet SDK CORS/CORP shim ---
export async function installWalletSdkCorsShim(
  page: Page,
  options: { walletOrigin?: string; appOrigin?: string; logStyle?: 'intercept' | 'setup' | 'silent' } = {}
): Promise<void> {
  const walletOrigin = options.walletOrigin ?? 'https://wallet.example.localhost';
  const appOrigin = options.appOrigin ?? 'https://example.localhost';
  const logStyle = options.logStyle ?? 'intercept';

  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const sdkPattern = new RegExp(`^${escape(walletOrigin)}/sdk/.*`);
  const walletServicePattern = new RegExp(`^${escape(walletOrigin)}/wallet-service(?:/.*)?$`);

  const buildAssetHeaders = (orig: Record<string, string>, url: string): Record<string, string> => {
    const headers: Record<string, string> = { ...orig };
    headers['cross-origin-resource-policy'] = 'cross-origin';
    headers['access-control-allow-origin'] = appOrigin;
    headers['access-control-allow-credentials'] = 'true';
    headers['access-control-allow-methods'] = 'GET,OPTIONS';
    headers['access-control-allow-headers'] = 'Content-Type,Authorization';
    if (/\.wasm(\?|$)/i.test(url)) headers['content-type'] = 'application/wasm';
    return headers;
  };

  // Ensure previous routes are cleared
  await page.unroute(sdkPattern).catch(() => undefined);
  await page.route(sdkPattern, async (route) => {
    const req = route.request();
    const url = req.url();
    const method = (req.method() || 'GET').toUpperCase();

    if (method === 'OPTIONS') {
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
      const fetched = await route.fetch();
      const body = await fetched.body();
      const originalHeaders = fetched.headers();
      const lower: Record<string, string> = {};
      for (const [k, v] of Object.entries(originalHeaders)) if (typeof v === 'string') lower[k] = v;
      const headers = buildAssetHeaders(lower, url);
      await route.fulfill({ status: fetched.status(), headers, body });
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

  await page.unroute(walletServicePattern).catch(() => undefined);
  await page.route(walletServicePattern, async (route) => {
    try {
      const fetched = await route.fetch();
      const body = await fetched.body();
      const headers: Record<string, string> = {
        'cross-origin-opener-policy': 'unsafe-none',
        'cross-origin-embedder-policy': 'require-corp',
        'cross-origin-resource-policy': 'cross-origin',
        'permissions-policy': buildPermissionsPolicy(walletOrigin),
        'content-security-policy': buildWalletCsp({ mode: 'strict' }),
      };
      await route.fulfill({ status: fetched.status(), headers, body });
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
}
