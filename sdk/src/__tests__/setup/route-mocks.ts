import { Page } from '@playwright/test';
import { DEFAULT_TEST_CONFIG } from './config';
import { formatLog, printLog } from './logging';

// ============================
// Route-level server-side mocks
// ============================

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
          account_id: accountId,
          public_key: 'ed25519:mockpublickey',
          key_type: 'ed25519',
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
