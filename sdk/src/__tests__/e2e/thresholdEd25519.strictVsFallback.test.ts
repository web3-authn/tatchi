/**
 * Threshold Ed25519 (2-party) — strict vs fallback semantics.
 *
 * This test proves the client behavior when `signerMode.mode='threshold-signer'` but the relayer
 * cannot sign (missing relayer-held share):
 * - `behavior: 'strict'` surfaces a hard error (no silent downgrade).
 * - `behavior: 'fallback'` falls back to local signing, producing a signature that verifies under
 *   the local key (and not the threshold key).
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

test.describe('threshold-ed25519 strict vs fallback semantics', () => {
  test.setTimeout(180_000);

  test.beforeEach(async ({ page }) => {
    await setupThresholdE2ePage(page);
  });

  test('strict errors; fallback local-signs when relayer is missing the threshold share', async ({ page }) => {
    const keysOnChain = new Set<string>();
    const nonceByPublicKey = new Map<string, number>();
    let localNearPublicKey = '';
    let thresholdPublicKeyFromKeygen = '';
    let sendTxCount = 0;

    const frontendOrigin = new URL(DEFAULT_TEST_CONFIG.frontendUrl).origin;

    const startKvRelayer = async (): Promise<{ baseUrl: string; close: () => Promise<void> }> => {
      const kvConfig = { THRESHOLD_ED25519_SHARE_MODE: 'kv' } as const;
      const { service, threshold } = makeAuthServiceForThreshold(keysOnChain, kvConfig);
      await service.getRelayerAccount();
      const session = createInMemoryJwtSessionAdapter();
      const router = createRelayRouter(service, { corsOrigins: [frontendOrigin], threshold, session });
      return await startExpressRouter(router);
    };

    const srv1 = await startKvRelayer();
    type SetupResult =
      | { ok: true; accountId: string; localPublicKey: string; thresholdPublicKey: string; txInput: { receiverId: string; wasmActions: unknown[] } }
      | { ok: false; error: string };

    let setup: SetupResult | null = null;
    try {
      await page.route(`${srv1.baseUrl}/threshold-ed25519/keygen`, async (route) => {
        const req = route.request();
        if (req.method().toUpperCase() !== 'POST') {
          await route.fallback();
          return;
        }
        await proxyPostJsonAndMutate(route, (json) => {
          thresholdPublicKeyFromKeygen = String((json as any)?.publicKey || '');
          return json;
        });
      });

      await installCreateAccountAndRegisterUserMock(page, {
        relayerBaseUrl: srv1.baseUrl,
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

      setup = await page.evaluate(async ({ relayerUrl }) => {
        try {
          const { TatchiPasskey } = await import('/sdk/esm/core/TatchiPasskey/index.js');
          const { ActionType, toActionArgsWasm } = await import('/sdk/esm/core/types/actions.js');
          const suffix =
            (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
              ? crypto.randomUUID()
              : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
          const accountId = `e2estrict${suffix}.w3a-v1.testnet`;

          const pm = new TatchiPasskey({
            nearNetwork: 'testnet',
            nearRpcUrl: 'https://test.rpc.fastnear.com',
            contractId: 'w3a-v1.testnet',
            relayer: { url: relayerUrl },
            signerMode: { mode: 'threshold-signer' },
            signingSessionDefaults: { ttlMs: 60_000, remainingUses: 10 },
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

          return {
            ok: true,
            accountId,
            localPublicKey: String(reg.clientNearPublicKey || ''),
            thresholdPublicKey: String(enrollment.publicKey || ''),
            txInput: { receiverId, wasmActions },
          };
        } catch (e: any) {
          return { ok: false, error: e?.message || String(e) };
        }
      }, { relayerUrl: srv1.baseUrl }) as SetupResult;

      if (!setup.ok) {
        throw new Error(`setup failed: ${setup.error || 'unknown'}`);
      }
    } finally {
      await srv1.close().catch(() => undefined);
    }

    const srv2 = await startKvRelayer(); // fresh in-memory keystore => missing_key
    const relayerCounts = { authorize: 0, init: 0, finalize: 0 };
    const authorizeRequests: Array<{ authHeader: string; body: Record<string, unknown> }> = [];

    try {
      await page.route(`${srv2.baseUrl}/threshold-ed25519/authorize`, async (route) => {
        const req = route.request();
        if (req.method().toUpperCase() !== 'POST') {
          await route.fallback();
          return;
        }
        relayerCounts.authorize += 1;
        const headers = req.headers();
        const authHeader = String(headers['authorization'] || headers['Authorization'] || '');
        let body: Record<string, unknown> = {};
        try { body = JSON.parse(req.postData() || '{}'); } catch { }
        authorizeRequests.push({ authHeader, body });
        await route.fallback();
      });

      await page.route(`${srv2.baseUrl}/threshold-ed25519/sign/init`, async (route) => {
        const req = route.request();
        if (req.method().toUpperCase() === 'POST') relayerCounts.init += 1;
        await route.fallback();
      });
      await page.route(`${srv2.baseUrl}/threshold-ed25519/sign/finalize`, async (route) => {
        const req = route.request();
        if (req.method().toUpperCase() === 'POST') relayerCounts.finalize += 1;
        await route.fallback();
      });

      type ExtractedSignedTx = { nonce: string; blockHash: number[]; signature: number[] };
      type StrictFallbackResult =
        | { ok: true; strictError: string; fallbackSigned: ExtractedSignedTx }
        | { ok: false; error: string };

      const result = await page.evaluate(async ({ relayerUrl, accountId }) => {
        try {
          const { TatchiPasskey } = await import('/sdk/esm/core/TatchiPasskey/index.js');
          const { ActionType } = await import('/sdk/esm/core/types/actions.js');

          const pm = new TatchiPasskey({
            nearNetwork: 'testnet',
            nearRpcUrl: 'https://test.rpc.fastnear.com',
            contractId: 'w3a-v1.testnet',
            relayer: { url: relayerUrl },
            signerMode: { mode: 'threshold-signer' },
            signingSessionDefaults: { ttlMs: 60_000, remainingUses: 10 },
            iframeWallet: { walletOrigin: '' },
          });

          const confirmConfig = { uiMode: 'none', behavior: 'skipClick', autoProceedDelay: 0};

          // Ensure VRF + warm signing session are available. Threshold session mint is best-effort and may fail.
          const login = await pm.loginAndCreateSession(accountId);
          if (!login?.success) return { ok: false, error: login?.error || 'login failed' };

          const receiverId = 'w3a-v1.testnet';
          const actions = [{ type: ActionType.Transfer, amount: '1' }];

          let strictError = '';
          try {
            await pm.signTransactionsWithActions({
              nearAccountId: accountId,
              transactions: [{ receiverId, actions }],
              options: { signerMode: { mode: 'threshold-signer', behavior: 'strict' }, confirmationConfig: confirmConfig as any },
            });
            return { ok: false, error: 'expected strict signing to fail, but it succeeded' };
          } catch (e: any) {
            strictError = e?.message || String(e);
          }

          const signed = await pm.signTransactionsWithActions({
            nearAccountId: accountId,
            transactions: [{ receiverId, actions }],
            options: { signerMode: { mode: 'threshold-signer', behavior: 'fallback' }, confirmationConfig: confirmConfig as any },
          });

          if (!Array.isArray(signed) || signed.length !== 1) {
            return { ok: false, error: `expected 1 signed tx, got ${Array.isArray(signed) ? signed.length : 'non-array'}` };
          }

          const signedTx: any = signed[0]?.signedTransaction;
          const signatureData = signedTx?.signature?.signatureData;
          const tx = signedTx?.transaction;
          if (!tx || !signatureData) {
            return { ok: false, error: 'invalid signed transaction shape' };
          }

          return {
            ok: true,
            strictError,
            fallbackSigned: {
              nonce: typeof tx.nonce === 'bigint' ? tx.nonce.toString() : String(tx.nonce || ''),
              blockHash: Array.from(tx.blockHash || []) as number[],
              signature: Array.from(signatureData) as number[],
            },
          };
        } catch (e: any) {
          return { ok: false, error: e?.message || String(e) };
        }
      }, { relayerUrl: srv2.baseUrl, accountId: (setup as any).accountId }) as StrictFallbackResult;

      if (!result.ok) {
        throw new Error(`strict vs fallback flow failed: ${result.error || 'unknown'}`);
      }

      expect(sendTxCount).toBe(1);
      expect(relayerCounts.authorize).toBeGreaterThanOrEqual(2); // strict + fallback (both attempt threshold first)
      expect(relayerCounts.init).toBe(0);
      expect(relayerCounts.finalize).toBe(0);

      expect(result.strictError.toLowerCase()).toContain('call /threshold-ed25519/keygen');

      const localPkStr = String((setup as any).localPublicKey);
      const thresholdPkStr = String((setup as any).thresholdPublicKey);

      const toPkBytes = (pk: string): Uint8Array => {
        const raw = pk.includes(':') ? pk.split(':')[1] : pk;
        return bs58.decode(raw);
      };

      const computeDigest = (signed: { nonce: string; blockHash: number[] }, signingPk: string): Uint8Array => {
        const signingPayload = {
          kind: 'near_tx',
          txSigningRequests: [{
            nearAccountId: String((setup as any).accountId),
            receiverId: String((setup as any).txInput.receiverId),
            actions: (setup as any).txInput.wasmActions,
          }],
          transactionContext: {
            nearPublicKeyStr: signingPk,
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

      const sigBytes = Uint8Array.from(result.fallbackSigned.signature);
      expect(sigBytes.length).toBe(64);
      const digestLocal = computeDigest(result.fallbackSigned, localPkStr);
      const digestThreshold = computeDigest(result.fallbackSigned, thresholdPkStr);
      expect(ed25519.verify(sigBytes, digestLocal, toPkBytes(localPkStr))).toBe(true);
      expect(ed25519.verify(sigBytes, digestThreshold, toPkBytes(thresholdPkStr))).toBe(false);
    } finally {
      await srv2.close().catch(() => undefined);
    }
  });
});
