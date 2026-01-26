/**
 * Threshold Ed25519 (2-party) — enrollment integrity (anti key-injection).
 *
 * Validates that the client rejects a tampered `/threshold-ed25519/keygen` response (mismatched
 * publicKey / relayerVerifyingShare) and does not proceed to submit AddKey(threshold pk).
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
import { base64UrlEncode } from '../../utils/encoders';

test.describe('threshold-ed25519 keygen integrity', () => {
  test.setTimeout(180_000);

  test.beforeEach(async ({ page }) => {
    await setupThresholdE2ePage(page);
  });

  test('rejects tampered /keygen publicKey (anti key-injection)', async ({ page }) => {
    const keysOnChain = new Set<string>();
    const nonceByPublicKey = new Map<string, number>();
    let localNearPublicKey = '';
    let sendTxCount = 0;

    const attackerPkBytes = ed25519.Point.BASE.multiply(1337n).toBytes();
    const attackerPublicKey = `ed25519:${bs58.encode(attackerPkBytes)}`;

    const { service, threshold } = makeAuthServiceForThreshold(keysOnChain);
    await service.getRelayerAccount();

    const frontendOrigin = new URL(DEFAULT_TEST_CONFIG.frontendUrl).origin;
    const router = createRelayRouter(service, { corsOrigins: [frontendOrigin], threshold });
    const srv = await startExpressRouter(router);

    try {
      await page.route(`${srv.baseUrl}/threshold-ed25519/keygen`, async (route) => {
        await proxyPostJsonAndMutate(route, (json) => ({ ...json, publicKey: attackerPublicKey }));
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
        },
        strictAccessKeyLookup: true,
      });

      const result = await page.evaluate(async ({ relayerUrl }) => {
        try {
          const { TatchiPasskey } = await import('/sdk/esm/core/TatchiPasskey/index.js');
          const suffix =
            (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
              ? crypto.randomUUID()
              : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
          const accountId = `e2ekeygen${suffix}.w3a-v1.testnet`;

          const pm = new TatchiPasskey({
            nearNetwork: 'testnet',
            nearRpcUrl: 'https://test.rpc.fastnear.com',
            contractId: 'w3a-v1.testnet',
            relayer: { url: relayerUrl },
            iframeWallet: { walletOrigin: '' },
          });

          const confirmConfig = { uiMode: 'none', behavior: 'skipClick', autoProceedDelay: 0};

          const reg = await pm.registerPasskeyInternal(accountId, { signerMode: { mode: 'local-signer' } }, confirmConfig as any);
          if (!reg?.success) return { success: false, error: reg?.error || 'registration failed' };

          const enrollment = await pm.enrollThresholdEd25519Key(accountId, { relayerUrl });
          return { success: !!enrollment?.success, error: String(enrollment?.error || '') };
        } catch (e: any) {
          return { success: false, error: e?.message || String(e) };
        }
      }, { relayerUrl: srv.baseUrl });

      expect(result.success).toBe(false);
      expect(result.error).toContain('does not match the client+relayer verifying shares');
      expect(sendTxCount).toBe(0);
      expect(localNearPublicKey).toMatch(/^ed25519:/);
    } finally {
      await srv.close().catch(() => undefined);
    }
  });

  test('rejects tampered /keygen relayerVerifyingShareB64u (anti key-injection)', async ({ page }) => {
    const keysOnChain = new Set<string>();
    const nonceByPublicKey = new Map<string, number>();
    let localNearPublicKey = '';
    let sendTxCount = 0;

    const tamperedRelayerVerifyingShareB64u = base64UrlEncode(ed25519.Point.BASE.multiply(999n).toBytes());

    const { service, threshold } = makeAuthServiceForThreshold(keysOnChain);
    await service.getRelayerAccount();

    const frontendOrigin = new URL(DEFAULT_TEST_CONFIG.frontendUrl).origin;
    const router = createRelayRouter(service, { corsOrigins: [frontendOrigin], threshold });
    const srv = await startExpressRouter(router);

    try {
      await page.route(`${srv.baseUrl}/threshold-ed25519/keygen`, async (route) => {
        await proxyPostJsonAndMutate(route, (json) => ({ ...json, relayerVerifyingShareB64u: tamperedRelayerVerifyingShareB64u }));
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
        },
        strictAccessKeyLookup: true,
      });

      const result = await page.evaluate(async ({ relayerUrl }) => {
        try {
          const { TatchiPasskey } = await import('/sdk/esm/core/TatchiPasskey/index.js');
          const suffix =
            (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
              ? crypto.randomUUID()
              : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
          const accountId = `e2ekeygen${suffix}.w3a-v1.testnet`;

          const pm = new TatchiPasskey({
            nearNetwork: 'testnet',
            nearRpcUrl: 'https://test.rpc.fastnear.com',
            contractId: 'w3a-v1.testnet',
            relayer: { url: relayerUrl },
            iframeWallet: { walletOrigin: '' },
          });

          const confirmConfig = { uiMode: 'none', behavior: 'skipClick', autoProceedDelay: 0};

          const reg = await pm.registerPasskeyInternal(accountId, { signerMode: { mode: 'local-signer' } }, confirmConfig as any);
          if (!reg?.success) return { success: false, error: reg?.error || 'registration failed' };

          const enrollment = await pm.enrollThresholdEd25519Key(accountId, { relayerUrl });
          return { success: !!enrollment?.success, error: String(enrollment?.error || '') };
        } catch (e: any) {
          return { success: false, error: e?.message || String(e) };
        }
      }, { relayerUrl: srv.baseUrl });

      expect(result.success).toBe(false);
      expect(result.error).toContain('does not match the client+relayer verifying shares');
      expect(sendTxCount).toBe(0);
      expect(localNearPublicKey).toMatch(/^ed25519:/);
    } finally {
      await srv.close().catch(() => undefined);
    }
  });
});
