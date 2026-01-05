import { test, expect } from '@playwright/test';
import bs58 from 'bs58';
import { setupBasicPasskeyTest } from '../setup';
import { DEFAULT_TEST_CONFIG } from '../setup/config';
import { AuthService } from '../../server/core/AuthService';
import { createThresholdEd25519ServiceFromAuthService } from '../../server/core/ThresholdService';
import type { VerifyAuthenticationRequest, VerifyAuthenticationResponse } from '../../server/core/types';
import { createRelayRouter } from '../../server/router/express-adaptor';
import { startExpressRouter } from '../relayer/helpers';

function makeAuthServiceForThreshold(keysOnChain: Set<string>): {
  service: AuthService;
  threshold: ReturnType<typeof createThresholdEd25519ServiceFromAuthService>;
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

  // Avoid network calls in threshold routes; we only want to test digest binding logic.
  (svc as unknown as {
    verifyAuthenticationResponse: (req: VerifyAuthenticationRequest) => Promise<VerifyAuthenticationResponse>;
  }).verifyAuthenticationResponse = async (_req: VerifyAuthenticationRequest) => ({ success: true, verified: true });

  // /authorize requires the relayer key be an active access key on-chain.
  // Model this with an in-memory set that we mutate in mocked NEAR RPC send_tx.
  (svc as unknown as { nearClient: { viewAccessKeyList: (accountId: string) => Promise<unknown> } }).nearClient.viewAccessKeyList =
    async (_accountId: string) => {
      const keys = Array.from(keysOnChain).map((publicKey) => ({
        public_key: publicKey,
        access_key: { nonce: 0, permission: 'FullAccess' as const },
      }));
      return { keys };
    };

  const threshold = createThresholdEd25519ServiceFromAuthService({
    authService: svc,
    thresholdEd25519KeyStore: { kind: 'in-memory' },
    logger: null,
  });

  return { service: svc, threshold };
}

test.describe('threshold-ed25519 digest binding', () => {
  test.setTimeout(180_000);

  test.beforeEach(async ({ page }) => {
    const blankPageUrl = new URL('/__test_blank.html', DEFAULT_TEST_CONFIG.frontendUrl).toString();
    await setupBasicPasskeyTest(page, {
      frontendUrl: blankPageUrl,
      skipPasskeyManagerInit: true,
    });

    // The WebAuthn mocks expect base64UrlEncode/base64UrlDecode to exist on window.
    await page.evaluate(async () => {
      const { base64UrlEncode, base64UrlDecode } = await import('/sdk/esm/utils/base64.js');
      (window as any).base64UrlEncode = base64UrlEncode;
      (window as any).base64UrlDecode = base64UrlDecode;
    });
  });

  test('rejects tampered signingPayload (intent_digest mismatch)', async ({ page }) => {
    const keysOnChain = new Set<string>();
    const nonceByPublicKey = new Map<string, number>();
    let localNearPublicKey = '';
    let thresholdPublicKeyFromKeygen = '';

    const { service, threshold } = makeAuthServiceForThreshold(keysOnChain);
    await service.getRelayerAccount();

    const frontendOrigin = new URL(DEFAULT_TEST_CONFIG.frontendUrl).origin;
    const router = createRelayRouter(service, { corsOrigins: [frontendOrigin], threshold });
    const srv = await startExpressRouter(router);

    const relayerCounts = { authorize: 0, init: 0, finalize: 0, keygen: 0 };

    try {
      // Capture threshold public key from /keygen so mocked NEAR RPC can "activate" it on send_tx.
      await page.route(`${srv.baseUrl}/threshold-ed25519/keygen`, async (route) => {
        const req = route.request();
        const method = req.method().toUpperCase();
        if (method !== 'POST') return route.fallback();
        relayerCounts.keygen += 1;

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
        try {
          const json = JSON.parse(text || '{}');
          thresholdPublicKeyFromKeygen = String(json?.publicKey || '');
        } catch { }

        await route.fulfill({
          status: res.status,
          headers: Object.fromEntries(res.headers.entries()),
          body: text,
        });
      });

      // Tamper the authorize body by mutating the signingPayload after it was VRF-bound.
      await page.route(`${srv.baseUrl}/threshold-ed25519/authorize`, async (route) => {
        const req = route.request();
        const method = req.method().toUpperCase();
        if (method !== 'POST') return route.fallback();
        relayerCounts.authorize += 1;

        const original = JSON.parse(req.postData() || '{}');
        const mutated = { ...original };
        try {
          const txs = mutated?.signingPayload?.txSigningRequests;
          if (Array.isArray(txs) && txs[0] && typeof txs[0] === 'object') {
            // Change receiverId so the recomputed intent digest differs from vrf_data.intent_digest_32.
            (txs[0] as any).receiverId = 'evil.w3a-v1.testnet';
          }
        } catch { }

        await route.continue({ postData: JSON.stringify(mutated) });
      });

      // These should NOT be reached if /authorize fails.
      await page.route(`${srv.baseUrl}/threshold-ed25519/sign/init`, async (route) => {
        const req = route.request();
        if (req.method().toUpperCase() === 'POST') relayerCounts.init += 1;
        await route.fallback();
      });
      await page.route(`${srv.baseUrl}/threshold-ed25519/sign/finalize`, async (route) => {
        const req = route.request();
        if (req.method().toUpperCase() === 'POST') relayerCounts.finalize += 1;
        await route.fallback();
      });

      await page.route(`${srv.baseUrl}/create_account_and_register_user`, async (route) => {
        const req = route.request();
        const method = req.method().toUpperCase();
        if (method === 'OPTIONS') return route.fallback();

        const origin = req.headers()['origin'] || req.headers()['Origin'] || '';
        const corsHeaders = {
          'Access-Control-Allow-Origin': origin || '*',
          'Access-Control-Allow-Methods': 'POST,OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        };

        const payload = JSON.parse(req.postData() || '{}');
        localNearPublicKey = String(payload?.new_public_key || '');
        if (localNearPublicKey) {
          keysOnChain.add(localNearPublicKey);
          nonceByPublicKey.set(localNearPublicKey, 0);
        }

        await route.fulfill({
          status: 200,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
          body: JSON.stringify({ success: true, transactionHash: `mock_atomic_tx_${Date.now()}` }),
        });
      });

      await page.route('**://test.rpc.fastnear.com/**', async (route) => {
        const req = route.request();
        const method = req.method().toUpperCase();
        const corsHeaders = {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST,OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        };
        if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: corsHeaders, body: '' });
        if (method !== 'POST') return route.fallback();

        let body: any = {};
        try { body = JSON.parse(req.postData() || '{}'); } catch { }
        const rpcMethod = body?.method;
        const params = body?.params || {};
        const id = body?.id ?? '1';

        const blockHash = bs58.encode(Buffer.alloc(32, 7));
        const blockHeight = 424242;

        if (rpcMethod === 'block') {
          return route.fulfill({
            status: 200,
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
            body: JSON.stringify({ jsonrpc: '2.0', id, result: { header: { hash: blockHash, height: blockHeight } } }),
          });
        }

        if (rpcMethod === 'query' && params?.request_type === 'call_function') {
          const resultBytes = Array.from(Buffer.from(JSON.stringify({ verified: true }), 'utf8'));
          return route.fulfill({
            status: 200,
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
            body: JSON.stringify({ jsonrpc: '2.0', id, result: { result: resultBytes, logs: [] } }),
          });
        }

        if (rpcMethod === 'query' && params?.request_type === 'view_access_key') {
          const publicKey = String(params?.public_key || '');
          const nonce = nonceByPublicKey.get(publicKey) ?? 0;
          return route.fulfill({
            status: 200,
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id,
              result: { block_hash: blockHash, block_height: blockHeight, nonce, permission: 'FullAccess' },
            }),
          });
        }

        if (rpcMethod === 'query' && params?.request_type === 'view_access_key_list') {
          const keys: any[] = Array.from(keysOnChain).map((pk) => ({
            public_key: pk,
            access_key: { nonce: nonceByPublicKey.get(pk) ?? 0, permission: 'FullAccess' },
          }));
          return route.fulfill({
            status: 200,
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
            body: JSON.stringify({ jsonrpc: '2.0', id, result: { keys } }),
          });
        }

        if (rpcMethod === 'send_tx') {
          // Enrollment activation AddKey(threshold pk).
          if (thresholdPublicKeyFromKeygen) {
            keysOnChain.add(thresholdPublicKeyFromKeygen);
            nonceByPublicKey.set(thresholdPublicKeyFromKeygen, 0);
            if (localNearPublicKey) {
              nonceByPublicKey.set(localNearPublicKey, (nonceByPublicKey.get(localNearPublicKey) ?? 0) + 1);
            }
          }
          return route.fulfill({
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
        }

        return route.fulfill({
          status: 200,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
          body: JSON.stringify({ jsonrpc: '2.0', id, result: {} }),
        });
      });

      const result = await page.evaluate(async ({ relayerUrl }) => {
        try {
          const { TatchiPasskey } = await import('/sdk/esm/core/TatchiPasskey/index.js');
          const { ActionType } = await import('/sdk/esm/core/types/actions.js');
          const suffix =
            (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
              ? crypto.randomUUID()
              : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
          const accountId = `e2edigest${suffix}.w3a-v1.testnet`;

          const pm = new TatchiPasskey({
            nearNetwork: 'testnet',
            nearRpcUrl: 'https://test.rpc.fastnear.com',
            contractId: 'w3a-v1.testnet',
            relayer: { url: relayerUrl },
            iframeWallet: { walletOrigin: '' },
          });

          const confirmConfig = { uiMode: 'skip', behavior: 'autoProceed', autoProceedDelay: 0, theme: 'dark' };

          const reg = await pm.registerPasskeyInternal(accountId, { signerMode: { mode: 'local-signer' } }, confirmConfig as any);
          if (!reg?.success) return { ok: false, error: reg?.error || 'registration failed' };

          const enrollment = await pm.enrollThresholdEd25519Key(accountId, { relayerUrl });
          if (!enrollment?.success) return { ok: false, error: enrollment?.error || 'threshold enrollment failed' };

          // Attempt a threshold sign. The test tampered /authorize, so this must fail.
          await pm.signTransactionsWithActions({
            nearAccountId: accountId,
            transactions: [{ receiverId: 'w3a-v1.testnet', actions: [{ type: ActionType.Transfer, amount: '1' }] }],
            options: { signerMode: { mode: 'threshold-signer' }, confirmationConfig: confirmConfig as any },
          });

          return { ok: false, error: 'expected signing to fail but it succeeded' };
        } catch (e: any) {
          return { ok: true, error: e?.message || String(e) };
        }
      }, { relayerUrl: srv.baseUrl });

      expect(result.ok).toBe(true);
      expect(String(result.error)).toContain('intent_digest_mismatch');
      expect(relayerCounts.keygen).toBeGreaterThanOrEqual(1);
      expect(relayerCounts.authorize).toBeGreaterThanOrEqual(1);
      expect(relayerCounts.init).toBe(0);
      expect(relayerCounts.finalize).toBe(0);
    } finally {
      await srv.close().catch(() => undefined);
    }
  });

  test('rejects tampered signing_digest_32 (signing_digest mismatch)', async ({ page }) => {
    const keysOnChain = new Set<string>();
    const nonceByPublicKey = new Map<string, number>();
    let localNearPublicKey = '';
    let thresholdPublicKeyFromKeygen = '';

    const { service, threshold } = makeAuthServiceForThreshold(keysOnChain);
    await service.getRelayerAccount();

    const frontendOrigin = new URL(DEFAULT_TEST_CONFIG.frontendUrl).origin;
    const router = createRelayRouter(service, { corsOrigins: [frontendOrigin], threshold });
    const srv = await startExpressRouter(router);

    const relayerCounts = { authorize: 0, init: 0, finalize: 0, keygen: 0 };

    try {
      await page.route(`${srv.baseUrl}/threshold-ed25519/keygen`, async (route) => {
        const req = route.request();
        const method = req.method().toUpperCase();
        if (method !== 'POST') return route.fallback();
        relayerCounts.keygen += 1;

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
        try {
          const json = JSON.parse(text || '{}');
          thresholdPublicKeyFromKeygen = String(json?.publicKey || '');
        } catch { }

        await route.fulfill({
          status: res.status,
          headers: Object.fromEntries(res.headers.entries()),
          body: text,
        });
      });

      // Tamper signing_digest_32 bytes while keeping signingPayload intact.
      await page.route(`${srv.baseUrl}/threshold-ed25519/authorize`, async (route) => {
        const req = route.request();
        const method = req.method().toUpperCase();
        if (method !== 'POST') return route.fallback();
        relayerCounts.authorize += 1;

        const original = JSON.parse(req.postData() || '{}');
        const mutated = { ...original };
        try {
          const bytes = mutated?.signing_digest_32;
          if (Array.isArray(bytes) && bytes.length === 32 && Number.isFinite(Number(bytes[0]))) {
            bytes[0] = (Number(bytes[0]) ^ 0xff) & 0xff;
          }
        } catch { }

        await route.continue({ postData: JSON.stringify(mutated) });
      });

      await page.route(`${srv.baseUrl}/threshold-ed25519/sign/init`, async (route) => {
        const req = route.request();
        if (req.method().toUpperCase() === 'POST') relayerCounts.init += 1;
        await route.fallback();
      });
      await page.route(`${srv.baseUrl}/threshold-ed25519/sign/finalize`, async (route) => {
        const req = route.request();
        if (req.method().toUpperCase() === 'POST') relayerCounts.finalize += 1;
        await route.fallback();
      });

      await page.route(`${srv.baseUrl}/create_account_and_register_user`, async (route) => {
        const req = route.request();
        const method = req.method().toUpperCase();
        if (method === 'OPTIONS') return route.fallback();

        const origin = req.headers()['origin'] || req.headers()['Origin'] || '';
        const corsHeaders = {
          'Access-Control-Allow-Origin': origin || '*',
          'Access-Control-Allow-Methods': 'POST,OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        };

        const payload = JSON.parse(req.postData() || '{}');
        localNearPublicKey = String(payload?.new_public_key || '');
        if (localNearPublicKey) {
          keysOnChain.add(localNearPublicKey);
          nonceByPublicKey.set(localNearPublicKey, 0);
        }

        await route.fulfill({
          status: 200,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
          body: JSON.stringify({ success: true, transactionHash: `mock_atomic_tx_${Date.now()}` }),
        });
      });

      await page.route('**://test.rpc.fastnear.com/**', async (route) => {
        const req = route.request();
        const method = req.method().toUpperCase();
        const corsHeaders = {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST,OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        };
        if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: corsHeaders, body: '' });
        if (method !== 'POST') return route.fallback();

        let body: any = {};
        try { body = JSON.parse(req.postData() || '{}'); } catch { }
        const rpcMethod = body?.method;
        const params = body?.params || {};
        const id = body?.id ?? '1';

        const blockHash = bs58.encode(Buffer.alloc(32, 7));
        const blockHeight = 424242;

        if (rpcMethod === 'block') {
          return route.fulfill({
            status: 200,
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
            body: JSON.stringify({ jsonrpc: '2.0', id, result: { header: { hash: blockHash, height: blockHeight } } }),
          });
        }

        if (rpcMethod === 'query' && params?.request_type === 'call_function') {
          const resultBytes = Array.from(Buffer.from(JSON.stringify({ verified: true }), 'utf8'));
          return route.fulfill({
            status: 200,
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
            body: JSON.stringify({ jsonrpc: '2.0', id, result: { result: resultBytes, logs: [] } }),
          });
        }

        if (rpcMethod === 'query' && params?.request_type === 'view_access_key') {
          const publicKey = String(params?.public_key || '');
          const nonce = nonceByPublicKey.get(publicKey) ?? 0;
          return route.fulfill({
            status: 200,
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id,
              result: { block_hash: blockHash, block_height: blockHeight, nonce, permission: 'FullAccess' },
            }),
          });
        }

        if (rpcMethod === 'query' && params?.request_type === 'view_access_key_list') {
          const keys: any[] = Array.from(keysOnChain).map((pk) => ({
            public_key: pk,
            access_key: { nonce: nonceByPublicKey.get(pk) ?? 0, permission: 'FullAccess' },
          }));
          return route.fulfill({
            status: 200,
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
            body: JSON.stringify({ jsonrpc: '2.0', id, result: { keys } }),
          });
        }

        if (rpcMethod === 'send_tx') {
          if (thresholdPublicKeyFromKeygen) {
            keysOnChain.add(thresholdPublicKeyFromKeygen);
            nonceByPublicKey.set(thresholdPublicKeyFromKeygen, 0);
            if (localNearPublicKey) {
              nonceByPublicKey.set(localNearPublicKey, (nonceByPublicKey.get(localNearPublicKey) ?? 0) + 1);
            }
          }
          return route.fulfill({
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
        }

        return route.fulfill({
          status: 200,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
          body: JSON.stringify({ jsonrpc: '2.0', id, result: {} }),
        });
      });

      const result = await page.evaluate(async ({ relayerUrl }) => {
        try {
          const { TatchiPasskey } = await import('/sdk/esm/core/TatchiPasskey/index.js');
          const { ActionType } = await import('/sdk/esm/core/types/actions.js');
          const suffix =
            (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
              ? crypto.randomUUID()
              : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
          const accountId = `e2edigest${suffix}.w3a-v1.testnet`;

          const pm = new TatchiPasskey({
            nearNetwork: 'testnet',
            nearRpcUrl: 'https://test.rpc.fastnear.com',
            contractId: 'w3a-v1.testnet',
            relayer: { url: relayerUrl },
            iframeWallet: { walletOrigin: '' },
          });

          const confirmConfig = { uiMode: 'skip', behavior: 'autoProceed', autoProceedDelay: 0, theme: 'dark' };

          const reg = await pm.registerPasskeyInternal(accountId, { signerMode: { mode: 'local-signer' } }, confirmConfig as any);
          if (!reg?.success) return { ok: false, error: reg?.error || 'registration failed' };

          const enrollment = await pm.enrollThresholdEd25519Key(accountId, { relayerUrl });
          if (!enrollment?.success) return { ok: false, error: enrollment?.error || 'threshold enrollment failed' };

          await pm.signTransactionsWithActions({
            nearAccountId: accountId,
            transactions: [{ receiverId: 'w3a-v1.testnet', actions: [{ type: ActionType.Transfer, amount: '1' }] }],
            options: { signerMode: { mode: 'threshold-signer' }, confirmationConfig: confirmConfig as any },
          });

          return { ok: false, error: 'expected signing to fail but it succeeded' };
        } catch (e: any) {
          return { ok: true, error: e?.message || String(e) };
        }
      }, { relayerUrl: srv.baseUrl });

      expect(result.ok).toBe(true);
      expect(String(result.error)).toContain('signing_digest_mismatch');
      expect(relayerCounts.keygen).toBeGreaterThanOrEqual(1);
      expect(relayerCounts.authorize).toBeGreaterThanOrEqual(1);
      expect(relayerCounts.init).toBe(0);
      expect(relayerCounts.finalize).toBe(0);
    } finally {
      await srv.close().catch(() => undefined);
    }
  });
});
