/**
 * Threshold Ed25519 (2-party) — end-to-end FROST signing happy path.
 *
 * Validates post-registration enrollment (keygen + AddKey(threshold pk)) and the full relayer-assisted
 * 2-round signing flow (authorize → sign/init → sign/finalize), producing a signature that verifies
 * under the threshold group public key (and not the local key).
 */

import { test, expect } from '@playwright/test';
import bs58 from 'bs58';
import { ed25519 } from '@noble/curves/ed25519.js';
import { setupBasicPasskeyTest } from '../setup';
import { DEFAULT_TEST_CONFIG } from '../setup/config';
import { AuthService } from '../../server/core/AuthService';
import { createThresholdEd25519ServiceFromAuthService } from '../../server/core/ThresholdService';
import type { VerifyAuthenticationRequest, VerifyAuthenticationResponse } from '../../server/core/types';
import { createRelayRouter } from '../../server/router/express-adaptor';
import { makeSessionAdapter, startExpressRouter } from '../relayer/helpers';
import {
  threshold_ed25519_compute_near_tx_signing_digests,
} from '../../wasm_signer_worker/pkg/wasm_signer_worker.js';

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

  // Avoid network calls in threshold routes; we only want to test the FROST coordinator wiring.
  (svc as unknown as {
    verifyAuthenticationResponse: (req: VerifyAuthenticationRequest) => Promise<VerifyAuthenticationResponse>;
  }).verifyAuthenticationResponse = async (_req: VerifyAuthenticationRequest) => ({ success: true, verified: true });

  // Tight scope checks in /authorize and /sign/init require verifying the relayer key is actually
  // an on-chain access key. For tests, model this with an in-memory set that we mutate via send_tx mocks.
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

test.describe('threshold-ed25519 (FROST) signing', () => {
  test.setTimeout(180_000);

  test.beforeEach(async ({ page }) => {
    // Use a same-origin "blank page" harness so we can:
    // - use WebAuthn virtual authenticator + PRF
    // - intercept NEAR RPC deterministically
    // - run SDK flows directly in the browser context
    const blankPageUrl = new URL('/__test_blank.html', DEFAULT_TEST_CONFIG.frontendUrl).toString();
    await setupBasicPasskeyTest(page, {
      frontendUrl: blankPageUrl,
      skipPasskeyManagerInit: true,
    });

    // setupBasicPasskeyTest() skips bootstrap global fallbacks when passkeyManager init is skipped.
    // The WebAuthn mocks expect base64UrlEncode/base64UrlDecode to exist on window.
    await page.evaluate(async () => {
      const { base64UrlEncode, base64UrlDecode } = await import('/sdk/esm/utils/base64.js');
      (window as any).base64UrlEncode = base64UrlEncode;
      (window as any).base64UrlDecode = base64UrlDecode;
    });
  });

  test('happy path: enroll threshold key then sign near_tx via relayer FROST endpoints', async ({ page }) => {
    // What this test validates (end-to-end in a real browser context, with a real in-process relayer):
    //
    // 1) Post-registration threshold enrollment works against the actual relayer routes:
    //    - client calls POST /threshold-ed25519/keygen (WebAuthn+VRF verified)
    //    - client submits AddKey(thresholdPublicKey) on-chain (mocked NEAR RPC)
    //
    // 2) Threshold transaction signing uses the full 2-round FROST flow end-to-end:
    //    - client calls POST /threshold-ed25519/authorize (binds intent + signing digests)
    //    - client calls POST /threshold-ed25519/sign/init (round 1: commitments/nonces)
    //    - client calls POST /threshold-ed25519/sign/finalize (round 2: relayer signature share)
    //    - client aggregates signature shares into a valid Ed25519 signature for the threshold group public key
    //
    // 3) The produced signature verifies under the threshold public key and does NOT verify under the local key.

    const consoleMessages: string[] = [];
    const onConsole = (msg: any) => {
      try {
        consoleMessages.push(`[${msg.type?.() || 'log'}] ${msg.text?.() || String(msg)}`);
      } catch { }
    };
    const onPageError = (err: any) => {
      try {
        consoleMessages.push(`[pageerror] ${String(err?.message || err)}`);
      } catch { }
    };
    page.on('console', onConsole);
    page.on('pageerror', onPageError);

    const keysOnChain = new Set<string>();
    const nonceByPublicKey = new Map<string, number>();
    let localNearPublicKey = '';
    let thresholdPublicKeyFromKeygen = '';
    let sendTxCount = 0;

    const { service, threshold } = makeAuthServiceForThreshold(keysOnChain);
    // Ensure the signer WASM module is initialized before the test uses WASM helper exports.
    await service.getRelayerAccount();

    const issuedTokens = new Map<string, Record<string, unknown>>();
    const session = makeSessionAdapter({
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

    const frontendOrigin = new URL(DEFAULT_TEST_CONFIG.frontendUrl).origin;
    const router = createRelayRouter(service, { corsOrigins: [frontendOrigin], threshold, session });
    const srv = await startExpressRouter(router);
    try {
      // Observe relayer calls (do not mock). This ensures the browser is actually hitting:
      // /threshold-ed25519/keygen, /session, /authorize, /sign/init, /sign/finalize
      const relayerCounts = { keygen: 0, session: 0, authorize: 0, init: 0, finalize: 0 };
      const authorizeBodies: Array<Record<string, unknown>> = [];
      const authorizeAuthHeaders: string[] = [];
      const sessionBodies: Array<Record<string, unknown>> = [];
      const observeRelayerCall = (path: keyof typeof relayerCounts) => async (route: any) => {
        const req = route.request();
        const method = req.method().toUpperCase();
        if (method === 'POST') relayerCounts[path] += 1;
        await route.fallback();
      };

      await page.route(`${srv.baseUrl}/threshold-ed25519/session`, async (route) => {
        const req = route.request();
        const method = req.method().toUpperCase();
        if (method === 'POST') {
          relayerCounts.session += 1;
          try { sessionBodies.push(JSON.parse(req.postData() || '{}')); } catch { }
        }
        await route.fallback();
      });

      await page.route(`${srv.baseUrl}/threshold-ed25519/authorize`, async (route) => {
        const req = route.request();
        const method = req.method().toUpperCase();
        if (method === 'POST') {
          relayerCounts.authorize += 1;
          try { authorizeBodies.push(JSON.parse(req.postData() || '{}')); } catch { }
          const h = req.headers();
          authorizeAuthHeaders.push(String(h['authorization'] || h['Authorization'] || ''));
        }
        await route.fallback();
      });
      await page.route(`${srv.baseUrl}/threshold-ed25519/sign/init`, observeRelayerCall('init'));
      await page.route(`${srv.baseUrl}/threshold-ed25519/sign/finalize`, observeRelayerCall('finalize'));
      await page.route(`${srv.baseUrl}/threshold-ed25519/keygen`, async (route) => {
        const req = route.request();
        const method = req.method().toUpperCase();
        if (method !== 'POST') {
          await route.fallback();
          return;
        }

        relayerCounts.keygen += 1;

        // Proxy the request to the real relayer so we can capture the actual (random) keygen output.
        // threshold_ed25519_keygen_from_client_verifying_share uses RNG, so we cannot safely recompute here.
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

      // Mock the relayer "registration" endpoint only (we do not need real on-chain account creation here).
      // We do need to mark the local key as an on-chain access key for subsequent AddKey and signing flows.
      await page.route(`${srv.baseUrl}/create_account_and_register_user`, async (route) => {
        const req = route.request();
        const method = req.method().toUpperCase();
        if (method === 'OPTIONS') {
          await route.fallback();
          return;
        }
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
          body: JSON.stringify({
            success: true,
            transactionHash: `mock_atomic_tx_${Date.now()}`,
          }),
        });
      });

      // Mock NEAR JSON-RPC for:
      // - block (VRF freshness + tx context)
      // - call_function (contract verification; always { verified: true })
      // - view_access_key / view_access_key_list (nonce + on-chain key presence)
      // - send_tx (mutate on-chain key set when AddKey runs)
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
        if (method !== 'POST') return route.fallback();

        let body: any = {};
        try {
          body = JSON.parse(req.postData() || '{}');
        } catch {
          body = {};
        }

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
          if (!keysOnChain.has(publicKey)) {
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
          const nonce = nonceByPublicKey.get(publicKey) ?? 0;
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
          const keys: any[] = [];
          for (const pk of keysOnChain) {
            keys.push({ public_key: pk, access_key: { nonce: nonceByPublicKey.get(pk) ?? 0, permission: 'FullAccess' } });
          }
          await route.fulfill({
            status: 200,
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
            body: JSON.stringify({ jsonrpc: '2.0', id, result: { keys } }),
          });
          return;
        }

        if (rpcMethod === 'send_tx') {
          // The only on-chain tx we submit in this test is AddKey(thresholdPublicKey) (activation).
          // Model it by adding the threshold key to the in-memory key set and incrementing the local key nonce.
          sendTxCount += 1;
          if (sendTxCount === 1 && thresholdPublicKeyFromKeygen) {
            keysOnChain.add(thresholdPublicKeyFromKeygen);
            nonceByPublicKey.set(thresholdPublicKeyFromKeygen, 0);
            if (localNearPublicKey) {
              nonceByPublicKey.set(localNearPublicKey, (nonceByPublicKey.get(localNearPublicKey) ?? 0) + 1);
            }
          }
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

      type EvaluateOkResult = {
        ok: true;
        accountId: string;
        localPublicKey: string;
        thresholdPublicKey: string;
        txInput: { receiverId: string; wasmActions: unknown[] };
        signedTx1: {
          signerId: string;
          receiverId: string;
          nonce: string;
          blockHash: number[];
          signature: number[];
          borshBytes: number[];
        };
        signedTx2: {
          signerId: string;
          receiverId: string;
          nonce: string;
          blockHash: number[];
          signature: number[];
          borshBytes: number[];
        };
      };
      type EvaluateResult = { ok: false; error: string } | EvaluateOkResult;

	      const result = await page.evaluate<EvaluateResult, { relayerUrl: string }>(async ({ relayerUrl }): Promise<EvaluateResult> => {
	        try {
	          const { TatchiPasskey } = await import('/sdk/esm/core/TatchiPasskey/index.js');
	          const { ActionType, toActionArgsWasm } = await import('/sdk/esm/core/types/actions.js');
          const suffix =
            (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
              ? crypto.randomUUID()
              : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
          const accountId = `e2efrost${suffix}.w3a-v1.testnet`;

	          const pm = new TatchiPasskey({
	            nearNetwork: 'testnet',
	            nearRpcUrl: 'https://test.rpc.fastnear.com',
	            contractId: 'w3a-v1.testnet',
	            relayer: { url: relayerUrl },
	            // Session-style threshold signing: login mints a relayer session, then signing uses warm-session auth.
	            signerMode: { mode: 'threshold-signer' },
	            signingSessionDefaults: { ttlMs: 60_000, remainingUses: 10 },
	            iframeWallet: { walletOrigin: '' },
	          });

          const confirmConfig = {
            uiMode: 'skip',
            behavior: 'autoProceed',
            autoProceedDelay: 0,
            theme: 'dark',
          };

          const reg = await pm.registerPasskeyInternal(
            accountId,
            { signerMode: { mode: 'local-signer' } },
            confirmConfig as any,
          );
          if (!reg?.success) {
            return { ok: false, error: reg?.error || 'registration failed' };
          }

	          const enrollment = await pm.enrollThresholdEd25519Key(accountId, { relayerUrl });
	          if (!enrollment?.success) {
	            return { ok: false, error: enrollment?.error || 'threshold enrollment failed' };
	          }

	          // Mint a threshold relayer auth session at login (one WebAuthn+VRF prompt).
	          // Subsequent threshold signing calls should use the cached session JWT and warm VRF session.
	          const login = await pm.loginAndCreateSession(accountId);
	          if (!login?.success) {
	            return { ok: false, error: login?.error || 'login failed' };
	          }

	          const receiverId = 'w3a-v1.testnet';
	          const actions = [{ type: ActionType.Transfer, amount: '1' }];
	          const wasmActions = actions.map(toActionArgsWasm);
          console.log('[e2e] signTransactionsWithActions (1) start');
          const signed1 = await pm.signTransactionsWithActions({
            nearAccountId: accountId,
            transactions: [{ receiverId, actions }],
            options: { signerMode: { mode: 'threshold-signer' }, confirmationConfig: confirmConfig as any },
          });
          console.log('[e2e] signTransactionsWithActions (1) done');
          if (!Array.isArray(signed1) || !signed1.length) {
            return { ok: false, error: 'no signed transaction returned (1)' };
          }

          console.log('[e2e] signTransactionsWithActions (2) start');
          const signed2 = await pm.signTransactionsWithActions({
            nearAccountId: accountId,
            transactions: [{ receiverId, actions }],
            options: { signerMode: { mode: 'threshold-signer' }, confirmationConfig: confirmConfig as any },
          });
          console.log('[e2e] signTransactionsWithActions (2) done');
          if (!Array.isArray(signed2) || !signed2.length) {
            return { ok: false, error: 'no signed transaction returned (2)' };
          }

          const extractSigned = (item: any): EvaluateOkResult['signedTx1'] => {
            const signedTx = item?.signedTransaction as any;
            const signatureData = signedTx?.signature?.signatureData;
            const tx = signedTx?.transaction;
            const borshBytes = signedTx?.borsh_bytes;
            if (!tx || !signatureData || !borshBytes) {
              throw new Error('invalid signed transaction shape');
            }
            return {
              signerId: String(tx.signerId || ''),
              receiverId: String(tx.receiverId || ''),
              nonce: typeof tx.nonce === 'bigint' ? tx.nonce.toString() : String(tx.nonce || ''),
              blockHash: Array.from(tx.blockHash || []),
              signature: Array.from(signatureData),
              borshBytes: Array.isArray(borshBytes) ? borshBytes : [],
            };
          };

          return {
            ok: true,
            accountId,
            localPublicKey: String(reg.clientNearPublicKey || ''),
            thresholdPublicKey: String(enrollment.publicKey || ''),
            txInput: { receiverId, wasmActions },
            signedTx1: extractSigned(signed1[0]),
            signedTx2: extractSigned(signed2[0]),
          };
        } catch (e: any) {
          return { ok: false, error: e?.message || String(e) };
        }
      }, { relayerUrl: srv.baseUrl });

      if (!result.ok) {
        throw new Error([
          `threshold signing test failed: ${result.error || 'unknown'}`,
          '',
          `relayerCounts: ${JSON.stringify(relayerCounts)}`,
          `sendTxCount: ${sendTxCount}`,
          `thresholdPublicKeyFromKeygen: ${thresholdPublicKeyFromKeygen || '(empty)'}`,
          '',
          'console:',
          ...consoleMessages.slice(-120),
        ].join('\n'));
      }

      // Registration does not submit send_tx in this test (relayer does); enrollment activation does.
      expect(sendTxCount).toBe(1);
      expect(localNearPublicKey).toMatch(/^ed25519:/);
      expect(String(result.thresholdPublicKey)).toMatch(/^ed25519:/);
      expect(String(result.localPublicKey)).toMatch(/^ed25519:/);
      expect(String(result.thresholdPublicKey)).not.toBe(String(result.localPublicKey));

      // Ensure the real relayer endpoints were called (FROST 2-round flow) and that
      // session-style threshold authorization is used (one WebAuthn+VRF → JWT → multiple signatures).
      expect(relayerCounts.keygen).toBe(1);
      expect(relayerCounts.session).toBe(1);
      expect(relayerCounts.authorize).toBe(2);
      expect(relayerCounts.init).toBe(2);
      expect(relayerCounts.finalize).toBe(2);

      expect(sessionBodies.length).toBe(1);
      const sessionBody = sessionBodies[0] as any;
      expect(typeof sessionBody?.relayerKeyId).toBe('string');
      expect(sessionBody?.sessionPolicy).toBeTruthy();
      expect(sessionBody?.vrf_data).toBeTruthy();
      expect(sessionBody?.webauthn_authentication).toBeTruthy();
      expect(Array.isArray(sessionBody?.vrf_data?.session_policy_digest_32)).toBe(true);
      expect((sessionBody?.vrf_data?.session_policy_digest_32 || []).length).toBe(32);

      // `/authorize` should be token-authenticated (no vrf_data/webauthn in the body).
      expect(authorizeBodies.length).toBe(2);
      expect(authorizeAuthHeaders.length).toBe(2);
      for (let i = 0; i < authorizeBodies.length; i += 1) {
        const h = String(authorizeAuthHeaders[i] || '');
        expect(/^Bearer\s+testjwt-/i.test(h)).toBe(true);
        const b = authorizeBodies[i] as any;
        expect('vrf_data' in b).toBe(false);
        expect('webauthn_authentication' in b).toBe(false);
      }

      const thresholdPkStr = String(result.thresholdPublicKey);
      const localPkStr = String(result.localPublicKey);

      const toPkBytes = (pk: string): Uint8Array => {
        const raw = pk.includes(':') ? pk.split(':')[1] : pk;
        return bs58.decode(raw);
      };

      const computeDigest = (signed: { nonce: string; blockHash: number[] }): Uint8Array => {
        const signingPayload = {
          kind: 'near_tx',
          txSigningRequests: [{
            nearAccountId: String(result.accountId),
            receiverId: String(result.txInput.receiverId),
            actions: result.txInput.wasmActions,
          }],
          transactionContext: {
            nearPublicKeyStr: thresholdPkStr,
            nextNonce: String(signed.nonce),
            txBlockHash: bs58.encode(Uint8Array.from(signed.blockHash)),
            txBlockHeight: '424242',
          },
        };

        const digestsUnknown: unknown = threshold_ed25519_compute_near_tx_signing_digests(signingPayload);
        if (!Array.isArray(digestsUnknown) || digestsUnknown.length === 0) {
          throw new Error('Expected a non-empty signing digests array');
        }
        const digest0 = digestsUnknown[0];
        if (!(digest0 instanceof Uint8Array) || digest0.length !== 32) {
          throw new Error('Expected digest[0] to be a 32-byte Uint8Array');
        }
        return digest0;
      };

      const verifySigned = (signed: { nonce: string; blockHash: number[]; signature: number[] }): void => {
        const digest = computeDigest(signed);
        const sigBytes = Uint8Array.from(signed.signature);
        expect(sigBytes.length).toBe(64);

        // The signature MUST verify against the threshold group public key.
        expect(ed25519.verify(sigBytes, digest, toPkBytes(thresholdPkStr))).toBe(true);
        // And MUST NOT verify against the local signer key.
        expect(ed25519.verify(sigBytes, digest, toPkBytes(localPkStr))).toBe(false);
      };

      verifySigned(result.signedTx1);
      verifySigned(result.signedTx2);
    } finally {
      await srv.close().catch(() => undefined);
      page.off('console', onConsole);
      page.off('pageerror', onPageError);
    }
  });
});
