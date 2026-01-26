/**
 * Threshold Ed25519 (2-party) — batch near-tx signing.
 *
 * Validates that batch signing produces valid threshold signatures per-transaction (no local fallback),
 * and that the relayer FROST endpoints are exercised once per digest.
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

test.describe('threshold-ed25519 batch signing', () => {
  test.setTimeout(180_000);

  test.beforeEach(async ({ page }) => {
    await setupThresholdE2ePage(page);
  });

  test('happy path: batch (2 txs) threshold signatures verify and relayer is called per digest', async ({ page }) => {
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

    try {
      await page.route(`${srv.baseUrl}/threshold-ed25519/session`, async (route) => {
        const req = route.request();
        if (req.method().toUpperCase() === 'POST') relayerCounts.session += 1;
        await route.fallback();
      });

      await page.route(`${srv.baseUrl}/threshold-ed25519/authorize`, async (route) => {
        const req = route.request();
        if (req.method().toUpperCase() === 'POST') {
          relayerCounts.authorize += 1;
        }
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
        relayerCounts.keygen += 1;
        await proxyPostJsonAndMutate(route, (json) => {
          thresholdPublicKeyFromKeygen = String(json?.publicKey || '');
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
        signerId: string;
        receiverId: string;
        nonce: string;
        blockHash: number[];
        signature: number[];
        borshBytes: number[];
      };

      type BatchSigningResult =
        | {
          ok: true;
          accountId: string;
          localPublicKey: string;
          thresholdPublicKey: string;
          txInput: { receiverId: string; wasmActions: unknown[] };
          signedTxs: ExtractedSignedTx[];
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
          const accountId = `e2ebatch${suffix}.w3a-v1.testnet`;

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

          const signed = await pm.signTransactionsWithActions({
            nearAccountId: accountId,
            transactions: [
              { receiverId, actions },
              { receiverId, actions },
            ],
            options: { signerMode: { mode: 'threshold-signer', behavior: 'strict' }, confirmationConfig: confirmConfig as any },
          });

          if (!Array.isArray(signed) || signed.length !== 2) {
            return { ok: false, error: `expected 2 signed txs, got ${Array.isArray(signed) ? signed.length : 'non-array'}` };
          }

          const extractSigned = (item: any) => {
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
              blockHash: Array.from(tx.blockHash || []) as number[],
              signature: Array.from(signatureData) as number[],
              borshBytes: (Array.isArray(borshBytes) ? borshBytes : []) as number[],
            };
          };

          return {
            ok: true,
            accountId,
            localPublicKey: String(reg.clientNearPublicKey || ''),
            thresholdPublicKey: String(enrollment.publicKey || ''),
            txInput: { receiverId, wasmActions },
            signedTxs: [extractSigned(signed[0]), extractSigned(signed[1])],
          };
        } catch (e: any) {
          return { ok: false, error: e?.message || String(e) };
        }
      }, { relayerUrl: srv.baseUrl }) as BatchSigningResult;

      if (!result.ok) {
        throw new Error(`batch signing test failed: ${result.error || 'unknown'}`);
      }

      expect(sendTxCount).toBe(1);
      expect(relayerCounts.keygen).toBe(1);
      expect(relayerCounts.session).toBe(1);
      expect(relayerCounts.authorize).toBeGreaterThanOrEqual(2);
      expect(relayerCounts.authorize).toBeLessThanOrEqual(4);
      expect(relayerCounts.init).toBe(2);
      expect(relayerCounts.finalize).toBe(2);

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

      for (const signed of result.signedTxs) {
        const digest = computeDigest(signed);
        const sigBytes = Uint8Array.from(signed.signature);
        expect(sigBytes.length).toBe(64);
        expect(ed25519.verify(sigBytes, digest, toPkBytes(thresholdPkStr))).toBe(true);
        expect(ed25519.verify(sigBytes, digest, toPkBytes(localPkStr))).toBe(false);
      }
    } finally {
      await srv.close().catch(() => undefined);
    }
  });
});
