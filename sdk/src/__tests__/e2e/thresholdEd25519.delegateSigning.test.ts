/**
 * Threshold Ed25519 (2-party) — delegate action signing (NEP-461).
 *
 * Validates that the relayer-assisted 2-round signing flow produces a signature that verifies under
 * the threshold group public key (and not the local key).
 */

import { test, expect } from '@playwright/test';
import bs58 from 'bs58';
import { ed25519 } from '@noble/curves/ed25519.js';
import { DEFAULT_TEST_CONFIG } from '../setup/config';
import { createRelayRouter } from '../../server/router/express-adaptor';
import { startExpressRouter } from '../relayer/helpers';
import {
  installCreateAccountAndRegisterUserMock,
  installFastNearRpcMock,
  makeAuthServiceForThreshold,
  proxyPostJsonAndMutate,
  setupThresholdE2ePage,
} from './thresholdEd25519.testUtils';
import { threshold_ed25519_compute_delegate_signing_digest } from '../../wasm_signer_worker/pkg/wasm_signer_worker.js';

test.describe('threshold-ed25519 delegate signing (NEP-461)', () => {
  test.setTimeout(180_000);

  test.beforeEach(async ({ page }) => {
    await setupThresholdE2ePage(page);
  });

  test('happy path: threshold delegate signature verifies under threshold key', async ({ page }) => {
    const keysOnChain = new Set<string>();
    const nonceByPublicKey = new Map<string, number>();
    let localNearPublicKey = '';
    let thresholdPublicKeyFromKeygen = '';

    const { service, threshold } = makeAuthServiceForThreshold(keysOnChain);
    await service.getRelayerAccount();

    const frontendOrigin = new URL(DEFAULT_TEST_CONFIG.frontendUrl).origin;
    const router = createRelayRouter(service, { corsOrigins: [frontendOrigin], threshold });
    const srv = await startExpressRouter(router);

    try {
      await page.route(`${srv.baseUrl}/threshold-ed25519/keygen`, async (route) => {
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

      type DelegateSigningResult =
        | {
          ok: true;
          accountId: string;
          thresholdPublicKey: string;
          localPublicKey: string;
          signingPayload: unknown;
          signature: number[];
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
          const accountId = `e2edelegate${suffix}.w3a-v1.testnet`;

          const pm = new TatchiPasskey({
            nearNetwork: 'testnet',
            nearRpcUrl: 'https://test.rpc.fastnear.com',
            contractId: 'w3a-v1.testnet',
            relayer: { url: relayerUrl },
            iframeWallet: { walletOrigin: '' },
          });

          const confirmConfig = { uiMode: 'skip', behavior: 'autoProceed', autoProceedDelay: 0};

          const reg = await pm.registerPasskeyInternal(accountId, { signerMode: { mode: 'local-signer' } }, confirmConfig as any);
          if (!reg?.success) return { ok: false, error: reg?.error || 'registration failed' };

          const enrollment = await pm.enrollThresholdEd25519Key(accountId, { relayerUrl });
          if (!enrollment?.success) return { ok: false, error: enrollment?.error || 'threshold enrollment failed' };

          const login = await pm.loginAndCreateSession(accountId);
          if (!login?.success) return { ok: false, error: login?.error || 'login failed' };

          const thresholdPublicKey = String(enrollment.publicKey || '');
          const localPublicKey = String(reg.clientNearPublicKey || '');

          const actions = [{ type: ActionType.Transfer, amount: '1' }];
          const wasmActions = actions.map(toActionArgsWasm);
          const delegate = {
            senderId: accountId,
            receiverId: 'w3a-v1.testnet',
            actions,
            nonce: 1,
            maxBlockHeight: 999_999,
            publicKey: thresholdPublicKey,
          };

          const signed = await pm.signDelegateAction({
            nearAccountId: accountId,
            delegate,
            options: { signerMode: { mode: 'threshold-signer', behavior: 'strict' }, confirmationConfig: confirmConfig as any },
          });

          const sd = signed?.signedDelegate as any;
          const da = sd?.delegateAction as any;
          const signedNonce = (typeof da?.nonce === 'bigint') ? da.nonce.toString() : String(da?.nonce || '');
          const signedMaxBlockHeight = (typeof da?.maxBlockHeight === 'bigint')
            ? da.maxBlockHeight.toString()
            : String(da?.maxBlockHeight || '');
          const sigData = sd?.signature?.signatureData;
          const sigBytes = sigData instanceof Uint8Array
            ? Array.from(sigData)
            : (Array.isArray(sigData) ? sigData.map((n) => Number(n)) : null);
          if (!sigBytes || sigBytes.length !== 64) {
            return { ok: false, error: 'missing signature bytes' };
          }

          return {
            ok: true,
            accountId,
            thresholdPublicKey,
            localPublicKey,
            signingPayload: {
              kind: 'nep461_delegate',
              delegate: {
                senderId: accountId,
                receiverId: delegate.receiverId,
                actions: wasmActions,
                nonce: signedNonce || String(delegate.nonce),
                maxBlockHeight: signedMaxBlockHeight || String(delegate.maxBlockHeight),
                publicKey: thresholdPublicKey,
              },
            },
            signature: sigBytes,
          };
        } catch (e: any) {
          return { ok: false, error: e?.message || String(e) };
        }
      }, { relayerUrl: srv.baseUrl }) as DelegateSigningResult;

      if (!result.ok) {
        throw new Error(`delegate threshold signing test failed: ${result.error || 'unknown'}`);
      }

      const toPkBytes = (pk: string): Uint8Array => {
        const raw = pk.includes(':') ? pk.split(':')[1] : pk;
        return bs58.decode(raw);
      };

      const digestUnknown: unknown = threshold_ed25519_compute_delegate_signing_digest(result.signingPayload);
      const digest = digestUnknown instanceof Uint8Array ? digestUnknown : null;
      if (!digest || digest.length !== 32) {
        throw new Error('Expected delegate signing digest to be a 32-byte Uint8Array');
      }

      const sigBytes = Uint8Array.from(result.signature);
      expect(sigBytes.length).toBe(64);

      expect(ed25519.verify(sigBytes, digest, toPkBytes(String(result.thresholdPublicKey)))).toBe(true);
      expect(ed25519.verify(sigBytes, digest, toPkBytes(String(result.localPublicKey)))).toBe(false);
    } finally {
      await srv.close().catch(() => undefined);
    }
  });
});
