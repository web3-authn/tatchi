/**
 * Threshold Ed25519 (2-party) — relayer failure behavior.
 *
 * Validates "no silent downgrade": when relayer endpoints fail (5xx), threshold signing returns a
 * hard error in strict mode instead of falling back to local signing.
 */

import { test, expect } from '@playwright/test';
import { DEFAULT_TEST_CONFIG } from '../setup/config';
import { createRelayRouter } from '../../server/router/express-adaptor';
import { startExpressRouter } from '../relayer/helpers';
import {
  corsHeadersForRoute,
  installCreateAccountAndRegisterUserMock,
  installFastNearRpcMock,
  makeAuthServiceForThreshold,
  proxyPostJsonAndMutate,
  setupThresholdE2ePage,
} from './thresholdEd25519.testUtils';

test.describe('threshold-ed25519 relayer failure behavior', () => {
  test.setTimeout(180_000);

  test.beforeEach(async ({ page }) => {
    await setupThresholdE2ePage(page);
  });

  test('no silent downgrade: /authorize 5xx causes threshold signing to error', async ({ page }) => {
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

      await page.route(`${srv.baseUrl}/threshold-ed25519/authorize`, async (route) => {
        const req = route.request();
        const method = req.method().toUpperCase();
        if (method === 'OPTIONS') {
          await route.fallback();
          return;
        }
        if (method !== 'POST') {
          await route.fallback();
          return;
        }
        const corsHeaders = corsHeadersForRoute(route);
        await route.fulfill({
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
          body: JSON.stringify({ ok: false, code: 'internal', message: 'forced 5xx for /authorize' }),
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
          const accountId = `e2erelayfail${suffix}.w3a-v1.testnet`;

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

          return { ok: false, error: 'expected threshold signing to fail but it succeeded' };
        } catch (e: any) {
          return { ok: true, error: e?.message || String(e) };
        }
      }, { relayerUrl: srv.baseUrl });

      expect(result.ok).toBe(true);
      expect(String(result.error)).toContain('forced 5xx for /authorize');
    } finally {
      await srv.close().catch(() => undefined);
    }
  });

  test('no silent downgrade: /sign/finalize 5xx causes threshold signing to error', async ({ page }) => {
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
        const req = route.request();
        const method = req.method().toUpperCase();
        if (method === 'OPTIONS') {
          await route.fallback();
          return;
        }
        if (method !== 'POST') {
          await route.fallback();
          return;
        }
        const corsHeaders = corsHeadersForRoute(route);
        await route.fulfill({
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
          body: JSON.stringify({ ok: false, code: 'internal', message: 'forced 5xx for /sign/finalize' }),
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
          const accountId = `e2erelayfail${suffix}.w3a-v1.testnet`;

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

          return { ok: false, error: 'expected threshold signing to fail but it succeeded' };
        } catch (e: any) {
          return { ok: true, error: e?.message || String(e) };
        }
      }, { relayerUrl: srv.baseUrl });

      expect(result.ok).toBe(true);
      expect(String(result.error)).toContain('forced 5xx for /sign/finalize');
    } finally {
      await srv.close().catch(() => undefined);
    }
  });
});
