/**
 * Threshold Ed25519 (2-party) — threshold session exhaustion.
 *
 * Validates browser behavior when the relayer-issued threshold session token runs out of uses:
 * the client retries `/authorize` via WebAuthn+VRF, then completes threshold signing successfully.
 */

import { test, expect } from '@playwright/test';
import bs58 from 'bs58';
import { ed25519 } from '@noble/curves/ed25519.js';
import { DEFAULT_TEST_CONFIG } from '../setup/config';
import { createRelayRouter } from '../../server/router/express-adaptor';
import { startExpressRouter } from '../relayer/helpers';
import {
  createInMemoryJwtSessionAdapter,
  installCreateAccountAndRegisterUserMock,
  installFastNearRpcMock,
  makeAuthServiceForThreshold,
  proxyPostJsonAndMutate,
  setupThresholdE2ePage,
} from './thresholdEd25519.testUtils';
import { threshold_ed25519_compute_near_tx_signing_digests } from '../../wasm_signer_worker/pkg/wasm_signer_worker.js';

test.describe('threshold-ed25519 session exhaustion', () => {
  test.setTimeout(180_000);

  test.beforeEach(async ({ page }) => {
    await setupThresholdE2ePage(page);
  });

  test('falls back to WebAuthn authorize when session exhausted', async ({ page }) => {
    const keysOnChain = new Set<string>();
    const nonceByPublicKey = new Map<string, number>();
    let localNearPublicKey = '';
    let thresholdPublicKeyFromKeygen = '';
    let sendTxCount = 0;

    const { service, threshold } = makeAuthServiceForThreshold(keysOnChain);
    await service.getRelayerAccount();

    const session = createInMemoryJwtSessionAdapter();
    const frontendOrigin = new URL(DEFAULT_TEST_CONFIG.frontendUrl).origin;
    const router = createRelayRouter(service, { corsOrigins: [frontendOrigin], threshold, session });
    const srv = await startExpressRouter(router);

    const relayerCounts = { keygen: 0, session: 0, authorize: 0, init: 0, finalize: 0 };
    const authorizeRequests: Array<{
      authHeader: string;
      body: Record<string, unknown>;
    }> = [];
    const authorizeResponses: Array<{ status: number; message: string }> = [];
    const authorizeResponsePromises: Array<Promise<void>> = [];
    let onAuthorizeResponse: ((resp: any) => void) | null = null;

    try {
      onAuthorizeResponse = (resp: any) => {
        try {
          if (typeof resp?.url !== 'function' || resp.url() !== `${srv.baseUrl}/threshold-ed25519/authorize`) return;
          const req = typeof resp?.request === 'function' ? resp.request() : null;
          if (!req || typeof req.method !== 'function') return;
          if (req.method().toUpperCase() !== 'POST') return;

          authorizeResponsePromises.push((async () => {
            const status = typeof resp.status === 'function' ? resp.status() : 0;
            const text = typeof resp.text === 'function' ? await resp.text() : '';
            let message = '';
            try {
              message = String(JSON.parse(text || '{}')?.message || '');
            } catch { }
            authorizeResponses.push({ status, message });
          })());
        } catch { }
      };

      page.on('response', onAuthorizeResponse);

      await page.route(`${srv.baseUrl}/threshold-ed25519/session`, async (route) => {
        const req = route.request();
        if (req.method().toUpperCase() === 'POST') relayerCounts.session += 1;
        await route.fallback();
      });

      await page.route(`${srv.baseUrl}/threshold-ed25519/authorize`, async (route) => {
        const req = route.request();
        if (req.method().toUpperCase() !== 'POST') {
          await route.fallback();
          return;
        }

        relayerCounts.authorize += 1;
        const headers = req.headers();
        const authHeader = String(headers['authorization'] || headers['Authorization'] || '');

        let body: Record<string, unknown> = {};
        try {
          body = JSON.parse(req.postData() || '{}');
        } catch { }

        authorizeRequests.push({ authHeader, body });
        await route.fallback();
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

      await page.route(`${srv.baseUrl}/threshold-ed25519/keygen`, async (route) => {
        const req = route.request();
        if (req.method().toUpperCase() !== 'POST') {
          await route.fallback();
          return;
        }

        relayerCounts.keygen += 1;
        await proxyPostJsonAndMutate(route, (json) => {
          thresholdPublicKeyFromKeygen = String((json as any)?.publicKey || '');
          return json;
        });
      });

      await installCreateAccountAndRegisterUserMock(page, {
        relayerBaseUrl: srv.baseUrl,
        onNewPublicKey: (pk) => {
          localNearPublicKey = pk;
          keysOnChain.add(pk);
          nonceByPublicKey.set(pk, 0);
        },
      });

      await installFastNearRpcMock(page, {
        keysOnChain,
        nonceByPublicKey,
        onSendTx: () => {
          sendTxCount += 1;
          if (thresholdPublicKeyFromKeygen) {
            keysOnChain.add(thresholdPublicKeyFromKeygen);
            nonceByPublicKey.set(thresholdPublicKeyFromKeygen, 0);
            if (localNearPublicKey) {
              nonceByPublicKey.set(localNearPublicKey, (nonceByPublicKey.get(localNearPublicKey) ?? 0) + 1);
            }
          }
        },
        strictAccessKeyLookup: true,
      });

      type ExtractedSignedTx = {
        nonce: string;
        blockHash: number[];
        signature: number[];
      };

      type SessionExhaustionResult =
        | {
          ok: true;
          accountId: string;
          localPublicKey: string;
          thresholdPublicKey: string;
          txInput: { receiverId: string; wasmActions: unknown[] };
          signed1: ExtractedSignedTx;
          signed2: ExtractedSignedTx;
        }
        | { ok: false; error: string };

      const result = await page.evaluate(async ({ relayerUrl }) => {
        try {
          const { TatchiPasskey } = await import('/sdk/esm/core/TatchiPasskey/index.js');
          const { ActionType, toActionArgsWasm } = await import('/sdk/esm/core/types/actions.js');
          const suffix =
            (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
              ? crypto.randomUUID()
              : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
          const accountId = `e2esess${suffix}.w3a-v1.testnet`;

          const pm = new TatchiPasskey({
            nearNetwork: 'testnet',
            nearRpcUrl: 'https://test.rpc.fastnear.com',
            contractId: 'w3a-v1.testnet',
            relayer: { url: relayerUrl },
            signerMode: { mode: 'threshold-signer' },
            signingSessionDefaults: { ttlMs: 60_000, remainingUses: 1 },
            iframeWallet: { walletOrigin: '' },
          });

          const confirmConfig = { uiMode: 'none', behavior: 'skipClick', autoProceedDelay: 0};

          const reg = await pm.registerPasskeyInternal(accountId, { signerMode: { mode: 'local-signer' } }, confirmConfig as any);
          if (!reg?.success) return { ok: false, error: reg?.error || 'registration failed' };

          const enrollment = await pm.enrollThresholdEd25519Key(accountId, { relayerUrl });
          if (!enrollment?.success) return { ok: false, error: enrollment?.error || 'threshold enrollment failed' };

          const login = await pm.loginAndCreateSession(accountId);
          if (!login?.success) return { ok: false, error: login?.error || 'login failed' };

          const receiverId = 'w3a-v1.testnet';
          const actions = [{ type: ActionType.Transfer, amount: '1' }];
          const wasmActions = actions.map(toActionArgsWasm);

          const signOnce = async () => {
            const signed = await pm.signTransactionsWithActions({
              nearAccountId: accountId,
              transactions: [{ receiverId, actions }],
              options: { signerMode: { mode: 'threshold-signer', behavior: 'strict' }, confirmationConfig: confirmConfig as any },
            });
            if (!Array.isArray(signed) || signed.length !== 1) {
              throw new Error(`expected 1 signed tx, got ${Array.isArray(signed) ? signed.length : 'non-array'}`);
            }
            const signedTx: any = signed[0]?.signedTransaction;
            const signatureData = signedTx?.signature?.signatureData;
            const tx = signedTx?.transaction;
            if (!tx || !signatureData) {
              throw new Error('invalid signed transaction shape');
            }
            return {
              nonce: typeof tx.nonce === 'bigint' ? tx.nonce.toString() : String(tx.nonce || ''),
              blockHash: Array.from(tx.blockHash || []) as number[],
              signature: Array.from(signatureData) as number[],
            };
          };

          const signed1 = await signOnce();
          const signed2 = await signOnce();

          return {
            ok: true,
            accountId,
            localPublicKey: String(reg.clientNearPublicKey || ''),
            thresholdPublicKey: String(enrollment.publicKey || ''),
            txInput: { receiverId, wasmActions },
            signed1,
            signed2,
          };
        } catch (e: any) {
          return { ok: false, error: e?.message || String(e) };
        }
      }, { relayerUrl: srv.baseUrl }) as SessionExhaustionResult;

      if (!result.ok) {
        throw new Error(`session exhaustion test failed: ${result.error || 'unknown'}`);
      }

      expect(sendTxCount).toBe(1);
      expect(relayerCounts.keygen).toBe(1);
      expect(relayerCounts.session).toBe(1);
      expect(relayerCounts.authorize).toBeGreaterThanOrEqual(3);
      expect(relayerCounts.authorize).toBeLessThanOrEqual(4);
      expect(relayerCounts.init).toBe(2);
      expect(relayerCounts.finalize).toBe(2);

      await expect.poll(() => authorizeResponses.length, { timeout: 10_000 }).toBe(relayerCounts.authorize);
      await Promise.all(authorizeResponsePromises);

      const authorizeCombined = authorizeRequests.map((req, idx) => ({
        ...req,
        status: authorizeResponses[idx]?.status ?? 0,
        message: authorizeResponses[idx]?.message ?? '',
      }));

      const sessionAuthorizeIdxs = authorizeCombined
        .map((r, idx) => ({ r, idx }))
        .filter(({ r }) =>
          /^Bearer\s+testjwt-/i.test(r.authHeader)
          && !('vrf_data' in r.body)
          && !('webauthn_authentication' in r.body)
        )
        .map(({ idx }) => idx);

      const webauthnAuthorizeIdxs = authorizeCombined
        .map((r, idx) => ({ r, idx }))
        .filter(({ r }) => ('vrf_data' in r.body) && ('webauthn_authentication' in r.body))
        .map(({ idx }) => idx);

      const authorizeSummary = authorizeCombined.map((r) => ({
        authHeader: r.authHeader,
        hasVrfData: 'vrf_data' in r.body,
        hasWebauthnAuthentication: 'webauthn_authentication' in r.body,
        status: r.status,
        message: r.message,
      }));

      if (sessionAuthorizeIdxs.length < 1 || webauthnAuthorizeIdxs.length < 1) {
        throw new Error(`Unexpected /authorize auth modes:\n${JSON.stringify(authorizeSummary, null, 2)}`);
      }

      const exhaustedIdx = authorizeCombined.findIndex((r) => {
        if (r.status !== 401) return false;
        return String(r.message || '').includes('threshold session exhausted');
      });
      expect(exhaustedIdx).toBeGreaterThanOrEqual(0);

      const firstWebauthnAfterExhaustion = webauthnAuthorizeIdxs.find((idx) => idx > exhaustedIdx);
      expect(typeof firstWebauthnAfterExhaustion).toBe('number');

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
        expect(ed25519.verify(sigBytes, digest, toPkBytes(thresholdPkStr))).toBe(true);
        expect(ed25519.verify(sigBytes, digest, toPkBytes(localPkStr))).toBe(false);
      };

      verifySigned(result.signed1);
      verifySigned(result.signed2);
    } finally {
      await srv.close().catch(() => undefined);
      if (onAuthorizeResponse) page.off('response', onAuthorizeResponse);
    }
  });
});
