/**
 * Threshold Ed25519 (2-party) — transcript tampering (negative tests).
 *
 * Validates that malformed relayer messages in the 2-round signing protocol are detected:
 * - tampered Round1 commitments, or
 * - tampered Round2 signature share
 * cause client aggregation/verification to fail.
 */

import { test, expect } from '@playwright/test';
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

function tamperString(input: unknown): string {
  const s = String(input || '');
  if (!s) return s;
  const last = s.slice(-1);
  const replacement = last === 'A' ? 'B' : 'A';
  return `${s.slice(0, -1)}${replacement}`;
}

test.describe('threshold-ed25519 FROST transcript tampering', () => {
  test.setTimeout(180_000);

  test.beforeEach(async ({ page }) => {
    await setupThresholdE2ePage(page);
  });

  test('fails when /sign/init relayer commitments are tampered', async ({ page }) => {
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

      await page.route(`${srv.baseUrl}/threshold-ed25519/sign/init`, async (route) => {
        await proxyPostJsonAndMutate(route, (json) => {
          const commitmentsById = json?.commitmentsById;
          return {
            ...json,
            commitmentsById: commitmentsById && typeof commitmentsById === 'object'
              ? {
                ...(commitmentsById as any),
                2: ((commitmentsById as any)[2] && typeof (commitmentsById as any)[2] === 'object')
                  ? { ...(commitmentsById as any)[2], hiding: tamperString((commitmentsById as any)[2].hiding) }
                  : (commitmentsById as any)[2],
              }
              : commitmentsById,
          };
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

      const result = await page.evaluate(async ({ relayerUrl }) => {
        try {
          const { TatchiPasskey } = await import('/sdk/esm/core/TatchiPasskey/index.js');
          const { ActionType } = await import('/sdk/esm/core/types/actions.js');
          const suffix =
            (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
              ? crypto.randomUUID()
              : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
          const accountId = `e2etamper${suffix}.w3a-v1.testnet`;

          const pm = new TatchiPasskey({
            nearNetwork: 'testnet',
            nearRpcUrl: 'https://test.rpc.fastnear.com',
            contractId: 'w3a-v1.testnet',
            relayer: { url: relayerUrl },
            iframeWallet: { walletOrigin: '' },
          });

          const confirmConfig = { uiMode: 'none', behavior: 'skipClick', autoProceedDelay: 0};

          const reg = await pm.registerPasskeyInternal(accountId, { signerMode: { mode: 'local-signer' } }, confirmConfig as any);
          if (!reg?.success) throw new Error(reg?.error || 'registration failed');

          const enrollment = await pm.enrollThresholdEd25519Key(accountId, { relayerUrl });
          if (!enrollment?.success) throw new Error(enrollment?.error || 'threshold enrollment failed');

          await pm.signTransactionsWithActions({
            nearAccountId: accountId,
            transactions: [{
              receiverId: 'w3a-v1.testnet',
              actions: [{ type: ActionType.Transfer, amount: '1' }],
            }],
            options: { signerMode: { mode: 'threshold-signer', behavior: 'strict' }, confirmationConfig: confirmConfig as any },
          });

          return { ok: false, error: 'expected signing to fail but it succeeded' };
        } catch (e: any) {
          return { ok: true, error: e?.message || String(e) };
        }
      }, { relayerUrl: srv.baseUrl });

      expect(result.ok).toBe(true);
    } finally {
      await srv.close().catch(() => undefined);
    }
  });

  test('fails when /sign/finalize relayer signature share is tampered', async ({ page }) => {
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

      await page.route(`${srv.baseUrl}/threshold-ed25519/sign/finalize`, async (route) => {
        await proxyPostJsonAndMutate(route, (json) => {
          const sharesById = json?.relayerSignatureSharesById;
          return {
            ...json,
            relayerSignatureSharesById: sharesById && typeof sharesById === 'object'
              ? { ...(sharesById as any), 2: tamperString((sharesById as any)[2]) }
              : sharesById,
          };
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

      const result = await page.evaluate(async ({ relayerUrl }) => {
        try {
          const { TatchiPasskey } = await import('/sdk/esm/core/TatchiPasskey/index.js');
          const { ActionType } = await import('/sdk/esm/core/types/actions.js');
          const suffix =
            (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
              ? crypto.randomUUID()
              : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
          const accountId = `e2etamper${suffix}.w3a-v1.testnet`;

          const pm = new TatchiPasskey({
            nearNetwork: 'testnet',
            nearRpcUrl: 'https://test.rpc.fastnear.com',
            contractId: 'w3a-v1.testnet',
            relayer: { url: relayerUrl },
            iframeWallet: { walletOrigin: '' },
          });

          const confirmConfig = { uiMode: 'none', behavior: 'skipClick', autoProceedDelay: 0};

          const reg = await pm.registerPasskeyInternal(accountId, { signerMode: { mode: 'local-signer' } }, confirmConfig as any);
          if (!reg?.success) throw new Error(reg?.error || 'registration failed');

          const enrollment = await pm.enrollThresholdEd25519Key(accountId, { relayerUrl });
          if (!enrollment?.success) throw new Error(enrollment?.error || 'threshold enrollment failed');

          await pm.signTransactionsWithActions({
            nearAccountId: accountId,
            transactions: [{
              receiverId: 'w3a-v1.testnet',
              actions: [{ type: ActionType.Transfer, amount: '1' }],
            }],
            options: { signerMode: { mode: 'threshold-signer', behavior: 'strict' }, confirmationConfig: confirmConfig as any },
          });

          return { ok: false, error: 'expected signing to fail but it succeeded' };
        } catch (e: any) {
          return { ok: true, error: e?.message || String(e) };
        }
      }, { relayerUrl: srv.baseUrl });

      expect(result.ok).toBe(true);
    } finally {
      await srv.close().catch(() => undefined);
    }
  });
});
