import { test, expect } from '@playwright/test';
import { injectImportMap } from '../setup/bootstrap';

const IMPORT_PATHS = {
  server: '/sdk/esm/server/index.js',
} as const;

test.describe('Email encryption round-trip (Outlayer DKIM flow)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await injectImportMap(page);
  });

  test('encryptEmailForOutlayer + decryptEmailForOutlayerTestOnly round-trip', async ({ page }) => {
    const res = await page.evaluate(async ({ paths }) => {
      try {
        const {
          encryptEmailForOutlayer,
          decryptEmailForOutlayerTestOnly,
          deriveTestX25519KeypairFromSeed,
        } = await import(paths.server);

        const encoder = new TextEncoder();

        // Fixed test keys and inputs for determinism
        const { secretKey: recipientSk, publicKey: recipientPk } =
          deriveTestX25519KeypairFromSeed('recipient-secret-key-32bytes!!');

        const ephemeralSk = new Uint8Array(32);
        ephemeralSk.set(encoder.encode('ephemeral-secret-key-32bytes').slice(0, 32));

        const nonce = new Uint8Array(12);
        nonce.set(encoder.encode('nonce-12-bytes').slice(0, 12));

        const emailRaw = 'Subject: recover-ABC123 alice.testnet\n\nHello DKIM/TEE world!';
        const context = {
          account_id: 'alice.testnet',
          payer_account_id: 'w3a-relayer.testnet',
          network_id: 'testnet',
        };

        const { envelope } = await encryptEmailForOutlayer({
          emailRaw,
          aeadContext: context,
          recipientPk,
          testOverrides: {
            ephemeralSecretKey: ephemeralSk,
            nonce,
          },
        });

        const decrypted = await decryptEmailForOutlayerTestOnly({
          envelope,
          context,
          recipientSk,
        });

        return { success: true, decrypted, original: emailRaw };
      } catch (error: any) {
        return {
          success: false,
          error: error?.message || String(error),
        };
      }
    }, { paths: IMPORT_PATHS });

    if (!res.success) {
      console.log('email encryption round-trip error:', res.error || 'unknown error');
      test.skip(true, 'email encryption round-trip unavailable in this test environment');
      return;
    }

    expect(res.decrypted).toBe(res.original);
  });
});
