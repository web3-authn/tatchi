import type { Page, Route } from '@playwright/test';
import bs58 from 'bs58';
import { setupBasicPasskeyTest } from '../setup';
import { DEFAULT_TEST_CONFIG } from '../setup/config';
import { AuthService } from '../../server/core/AuthService';
import { createThresholdSigningService } from '../../server/core/ThresholdService';
import type { VerifyAuthenticationRequest, VerifyAuthenticationResponse } from '../../server/core/types';
import type { ThresholdEd25519KeyStoreConfigInput } from '../../server/core/types';
import { makeSessionAdapter } from '../relayer/helpers';
import { base64UrlDecode, base64UrlEncode } from '../../utils/encoders';

export async function setupThresholdE2ePage(page: Page): Promise<void> {
  const blankPageUrl = new URL('/__test_blank.html', DEFAULT_TEST_CONFIG.frontendUrl).toString();
  await setupBasicPasskeyTest(page, {
    frontendUrl: blankPageUrl,
    skipPasskeyManagerInit: true,
  });

  await page.evaluate(async () => {
    const { base64UrlEncode, base64UrlDecode } = await import('/sdk/esm/utils/base64.js');
    (window as any).base64UrlEncode = base64UrlEncode;
    (window as any).base64UrlDecode = base64UrlDecode;
  });
}

export function makeAuthServiceForThreshold(
  keysOnChain: Set<string>,
  thresholdEd25519KeyStore?: ThresholdEd25519KeyStoreConfigInput | null,
): {
  service: AuthService;
  threshold: ReturnType<typeof createThresholdSigningService>;
} {
  const svc = new AuthService({
    relayerAccountId: 'relayer.testnet',
    relayerPrivateKey: 'ed25519:dummy',
    webAuthnContractId: DEFAULT_TEST_CONFIG.contractId,
    nearRpcUrl: DEFAULT_TEST_CONFIG.nearRpcUrl,
    networkId: DEFAULT_TEST_CONFIG.nearNetwork,
    accountInitialBalance: '1',
    createAccountAndRegisterGas: '1',
    logger: null,
  });

  (svc as unknown as {
    verifyAuthenticationResponse: (req: VerifyAuthenticationRequest) => Promise<VerifyAuthenticationResponse>;
  }).verifyAuthenticationResponse = async (_req: VerifyAuthenticationRequest) => ({ success: true, verified: true });

  (svc as unknown as { nearClient: { viewAccessKeyList: (accountId: string) => Promise<unknown> } }).nearClient.viewAccessKeyList =
    async (_accountId: string) => {
      const keys = Array.from(keysOnChain).map((publicKey) => ({
        public_key: publicKey,
        access_key: { nonce: 0, permission: 'FullAccess' as const },
      }));
      return { keys };
    };

  const threshold = createThresholdSigningService({
    authService: svc,
    thresholdEd25519KeyStore: thresholdEd25519KeyStore ?? { THRESHOLD_NODE_ROLE: 'coordinator' },
    logger: null,
  });

  return { service: svc, threshold };
}

export function createInMemoryJwtSessionAdapter(): ReturnType<typeof makeSessionAdapter> {
  const issuedTokens = new Map<string, Record<string, unknown>>();
  return makeSessionAdapter({
    signJwt: async (sub: string, extra?: Record<string, unknown>) => {
      const id = typeof globalThis.crypto?.randomUUID === 'function'
        ? globalThis.crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const token = `testjwt-${id}`;
      issuedTokens.set(token, { sub, ...(extra || {}) });
      return token;
    },
    parse: async (headers: Record<string, string | string[] | undefined>) => {
      const authHeaderRaw = headers['authorization'] ?? headers['Authorization'];
      const authHeader = Array.isArray(authHeaderRaw) ? authHeaderRaw[0] : authHeaderRaw;
      const token = typeof authHeader === 'string'
        ? authHeader.replace(/^Bearer\s+/i, '').trim()
        : '';
      const claims = token ? issuedTokens.get(token) : undefined;
      return claims ? { ok: true as const, claims } : { ok: false as const };
    },
  });
}

export function corsHeadersForRoute(route: Route): Record<string, string> {
  const req = route.request();
  const origin = req.headers()['origin'] || req.headers()['Origin'] || '';
  return {
    ...(origin ? { 'Access-Control-Allow-Origin': origin } : { 'Access-Control-Allow-Origin': '*' }),
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  };
}

export async function installCreateAccountAndRegisterUserMock(page: Page, input: {
  relayerBaseUrl: string;
  onNewPublicKey: (publicKey: string) => void;
}): Promise<void> {
  await page.route(`${input.relayerBaseUrl}/create_account_and_register_user`, async (route) => {
    const req = route.request();
    const method = req.method().toUpperCase();
    if (method === 'OPTIONS') {
      await route.fallback();
      return;
    }

    const corsHeaders = corsHeadersForRoute(route);
    const payload = JSON.parse(req.postData() || '{}');
    const localNearPublicKey = String(payload?.new_public_key || '');
    if (localNearPublicKey) input.onNewPublicKey(localNearPublicKey);

    await route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
      body: JSON.stringify({ success: true, transactionHash: `mock_atomic_tx_${Date.now()}` }),
    });
  });
}

export async function installFastNearRpcMock(page: Page, input: {
  keysOnChain: Set<string>;
  nonceByPublicKey: Map<string, number>;
  onSendTx?: () => void;
  strictAccessKeyLookup?: boolean;
}): Promise<void> {
  const strictAccessKeyLookup = input.strictAccessKeyLookup ?? true;

  await page.route('**://test.rpc.fastnear.com/**', async (route) => {
    const req = route.request();
    const method = req.method().toUpperCase();

    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (method === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: corsHeaders, body: '' });
      return;
    }
    if (method !== 'POST') {
      await route.fallback();
      return;
    }

    let body: any = {};
    try {
      body = JSON.parse(req.postData() || '{}');
    } catch { }

    const rpcMethod = body?.method;
    const params = body?.params || {};
    const id = body?.id ?? '1';

    const blockHash = bs58.encode(Buffer.alloc(32, 7));
    const blockHeight = 424242;

    if (rpcMethod === 'block') {
      await route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
        body: JSON.stringify({ jsonrpc: '2.0', id, result: { header: { hash: blockHash, height: blockHeight } } }),
      });
      return;
    }

    if (rpcMethod === 'query' && params?.request_type === 'call_function') {
      const resultBytes = Array.from(Buffer.from(JSON.stringify({ verified: true }), 'utf8'));
      await route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
        body: JSON.stringify({ jsonrpc: '2.0', id, result: { result: resultBytes, logs: [] } }),
      });
      return;
    }

    if (rpcMethod === 'query' && params?.request_type === 'view_access_key') {
      const publicKey = String(params?.public_key || '');
      if (strictAccessKeyLookup && publicKey && !input.keysOnChain.has(publicKey)) {
        await route.fulfill({
          status: 200,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id,
            error: {
              code: -32000,
              message: 'Unknown access key',
              data: { public_key: publicKey },
            },
          }),
        });
        return;
      }

      const nonce = input.nonceByPublicKey.get(publicKey) ?? 0;
      await route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id,
          result: {
            block_hash: blockHash,
            block_height: blockHeight,
            nonce,
            permission: 'FullAccess',
          },
        }),
      });
      return;
    }

    if (rpcMethod === 'query' && params?.request_type === 'view_access_key_list') {
      const keys: any[] = Array.from(input.keysOnChain).map((pk) => ({
        public_key: pk,
        access_key: { nonce: input.nonceByPublicKey.get(pk) ?? 0, permission: 'FullAccess' },
      }));
      await route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
        body: JSON.stringify({ jsonrpc: '2.0', id, result: { keys } }),
      });
      return;
    }

    if (rpcMethod === 'send_tx') {
      input.onSendTx?.();
      await route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id,
          result: {
            status: { SuccessValue: '' },
            transaction: { hash: `mock-tx-${Date.now()}` },
            transaction_outcome: { id: `mock-tx-outcome-${Date.now()}` },
            receipts_outcome: [],
          },
        }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
      body: JSON.stringify({ jsonrpc: '2.0', id, result: {} }),
    });
  });
}

export function flipFirstByteB64u(b64u: string): string {
  const bytes = base64UrlDecode(b64u);
  if (!bytes.length) return b64u;
  bytes[0] ^= 1;
  return base64UrlEncode(bytes);
}

export async function proxyPostJsonAndMutate(route: Route, mutate: (json: any) => any): Promise<void> {
  const req = route.request();
  const method = req.method().toUpperCase();
  if (method !== 'POST') {
    await route.fallback();
    return;
  }

  const origin = req.headers()['origin'] || req.headers()['Origin'] || '';
  const contentType = req.headers()['content-type'] || req.headers()['Content-Type'] || 'application/json';
  const body = req.postData() || '';

  const res = await fetch(req.url(), {
    method: 'POST',
    headers: {
      'Content-Type': contentType,
      ...(origin ? { Origin: origin } : {}),
    },
    body,
  });
  const text = await res.text();
  let outText = text;
  try {
    const json = JSON.parse(text || '{}');
    outText = JSON.stringify(mutate(json));
  } catch { }

  const headers = Object.fromEntries(res.headers.entries());
  delete (headers as Record<string, string>)['content-length'];
  delete (headers as Record<string, string>)['Content-Length'];

  await route.fulfill({
    status: res.status,
    headers,
    body: outText,
  });
}
