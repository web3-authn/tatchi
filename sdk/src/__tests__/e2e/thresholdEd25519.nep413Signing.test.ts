/**
 * Threshold Ed25519 (2-party) — NEP-413 message signing.
 *
 * Validates that the relayer-assisted signing flow produces a NEP-413 signature that verifies under
 * the threshold group public key.
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
import { threshold_ed25519_compute_nep413_signing_digest } from '../../wasm_signer_worker/pkg/wasm_signer_worker.js';

test.describe('threshold-ed25519 NEP-413 signing', () => {
  test.setTimeout(180_000);

  test.beforeEach(async ({ page }) => {
    await setupThresholdE2ePage(page);
  });

  test('happy path: threshold NEP-413 signature verifies under threshold key', async ({ page }) => {
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

      const result = await page.evaluate(async ({ relayerUrl }) => {
        try {
          const { TatchiPasskey } = await import('/sdk/esm/core/TatchiPasskey/index.js');
          const suffix =
            (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
              ? crypto.randomUUID()
              : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
          const accountId = `e2enep413${suffix}.w3a-v1.testnet`;

          const pm = new TatchiPasskey({
            nearNetwork: 'testnet',
            nearRpcUrl: 'https://test.rpc.fastnear.com',
            contractId: 'w3a-v1.testnet',
            relayer: { url: relayerUrl },
            iframeWallet: { walletOrigin: '' },
          });

          const confirmConfig = { uiMode: 'none', behavior: 'skipClick', autoProceedDelay: 0};

          const reg = await pm.registerPasskeyInternal(accountId, { signerMode: { mode: 'local-signer' } }, confirmConfig as any);
          if (!reg?.success) return { ok: false, error: reg?.error || 'registration failed' };

          const enrollment = await pm.enrollThresholdEd25519Key(accountId, { relayerUrl });
          if (!enrollment?.success) return { ok: false, error: enrollment?.error || 'threshold enrollment failed' };

          const login = await pm.loginAndCreateSession(accountId);
          if (!login?.success) return { ok: false, error: login?.error || 'login failed' };

          const localPublicKey = String(reg.clientNearPublicKey || '');
          const message = 'hello threshold nep413';
          const recipient = 'example.localhost';
          const state = 'test-state';
          const signed = await pm.signNEP413Message({
            nearAccountId: accountId,
            params: { message, recipient, state },
            options: { signerMode: { mode: 'threshold-signer', behavior: 'strict' }, confirmationConfig: confirmConfig as any },
          });
          if (!signed?.success) return { ok: false, error: signed?.error || 'nep413 signing failed' };
          return {
            ok: true,
            accountId,
            message,
            recipient,
            state,
            nonce: String((signed as any)?.nonce || ''),
            localPublicKey,
            thresholdPublicKey: String(enrollment.publicKey || ''),
            signerPublicKey: String(signed.publicKey || ''),
            signature: String(signed.signature || ''),
          };
        } catch (e: any) {
          return { ok: false, error: e?.message || String(e) };
        }
      }, { relayerUrl: srv.baseUrl });

      if (!result.ok) {
        throw new Error(`nep413 threshold signing test failed: ${result.error || 'unknown'}`);
      }

      expect(String(result.thresholdPublicKey)).toMatch(/^ed25519:/);
      expect(String(result.localPublicKey)).toMatch(/^ed25519:/);
      expect(String(result.signerPublicKey)).toBe(String(result.thresholdPublicKey));

      const toPkBytes = (pk: string): Uint8Array => {
        const raw = pk.includes(':') ? pk.split(':')[1] : pk;
        return bs58.decode(raw);
      };
      const sigStr = String(result.signature || '');
      const sigBytes = Uint8Array.from(Buffer.from(sigStr, (sigStr.includes('-') || sigStr.includes('_')) ? 'base64url' : 'base64'));
      expect(sigBytes.length).toBe(64);

      const signingPayload = {
        kind: 'nep413',
        nearAccountId: String(result.accountId),
        message: String(result.message),
        recipient: String(result.recipient),
        nonce: String(result.nonce),
        state: String(result.state),
      };

      const digestUnknown: unknown = threshold_ed25519_compute_nep413_signing_digest(signingPayload);
      const digest = digestUnknown instanceof Uint8Array ? digestUnknown : null;
      if (!digest || digest.length !== 32) {
        throw new Error('Expected NEP-413 signing digest to be a 32-byte Uint8Array');
      }

      expect(ed25519.verify(sigBytes, digest, toPkBytes(String(result.thresholdPublicKey)))).toBe(true);
      expect(ed25519.verify(sigBytes, digest, toPkBytes(String(result.localPublicKey)))).toBe(false);
    } finally {
      await srv.close().catch(() => undefined);
    }
  });
});
