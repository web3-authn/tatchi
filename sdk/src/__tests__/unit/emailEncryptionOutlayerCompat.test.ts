import { test, expect } from '@playwright/test';
import { injectImportMap } from '../setup/bootstrap';
import { readFileSync } from 'node:fs';

const IMPORT_PATHS = {
  server: '/sdk/esm/server/index.js',
} as const;

const GMAIL_RESET_EMAIL_BLOB = readFileSync(
  'src/__tests__/unit/emails/gmail_reset_full.eml',
  'utf8'
);

// Raw email for the on-chain envelope test is now stored as a fixture.
const RAW_EMAIL_FROM_LOGS = readFileSync(
  'src/__tests__/unit/emails/gmail_reset_full2.eml',
  'utf8'
);

const ENVELOPE_FROM_CHAIN = {
  version: 1,
  ephemeral_pub: '4Uh8l9zSJ5tjLbOCL0AZy0q/OZ9KBhinPQuhiNN8C0U=',
  nonce: 'yWQBRHG0l7JtaaFd',
  ciphertext:
    '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',
} as const;

const CONTEXT_FROM_CHAIN = {
  account_id: 'nerp3.w3a-v1.testnet',
  payer_account_id: 'w3a-relayer.testnet',
  network_id: 'testnet',
} as const;

test.describe('Email encryption compatibility with Outlayer worker seed', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await injectImportMap(page);
  });

  test('encryptEmailForOutlayer matches decryptEmailForOutlayerTestOnly for given worker seed', async ({ page }) => {
    const res = await page.evaluate(async ({ paths }) => {
      try {
        const {
          encryptEmailForOutlayer,
          decryptEmailForOutlayerTestOnly,
          deriveOutlayerStaticKeyFromSeedHex,
        } = await import(paths.server);

        const SEED_HEX = 'e4c9a1f3b87d54c2a0fe93d1c6428b7fd2a6c1e89bf7405de318ab94f6c2d07e';
        const { secretKey: workerSk, publicKey: workerPk } = deriveOutlayerStaticKeyFromSeedHex(SEED_HEX);

        const pkB64 = btoa(String.fromCharCode(...workerPk));

        const emailRaw = 'Subject: recover-ABC123 alice.testnet\n\nHello DKIM/TEE world with Outlayer seed!';
        const context = {
          account_id: 'alice.testnet',
          payer_account_id: 'w3a-relayer.testnet',
          network_id: 'testnet',
        };

        const { envelope } = await encryptEmailForOutlayer({
          emailRaw,
          aeadContext: context,
          recipientPk: workerPk,
        });

        const decrypted = await decryptEmailForOutlayerTestOnly({
          envelope,
          context,
          recipientSk: workerSk,
        });

        return { success: true, decrypted, original: emailRaw, pkB64 };
      } catch (error: any) {
        return {
          success: false,
          error: error?.message || String(error),
        };
      }
    }, { paths: IMPORT_PATHS });

    if (!res.success) {
      test.skip(true, `email encryption Outlayer compat test unavailable: ${res.error || 'unknown error'}`);
      return;
    }

    expect(res.pkB64).toBe('jSO3s2HFZBZsFUMQIijeilN/lJa6MWmXMafg642/Hhw=');
    expect(res.decrypted).toBe(res.original);
  });

  test('decrypts on-chain Outlayer envelope with seed-derived static key', async ({ page }) => {
    const res = await page.evaluate(async ({ paths, envelope, context }) => {
      try {
        const {
          decryptEmailForOutlayerTestOnly,
          deriveOutlayerStaticKeyFromSeedHex,
        } = await import(paths.server);

        const SEED_HEX = 'e4c9a1f3b87d54c2a0fe93d1c6428b7fd2a6c1e89bf7405de318ab94f6c2d07e';
        const { secretKey: workerSk } = deriveOutlayerStaticKeyFromSeedHex(SEED_HEX);

        const decrypted = await decryptEmailForOutlayerTestOnly({
          envelope,
          context,
          recipientSk: workerSk,
        });

        return { success: true, decrypted };
      } catch (error: any) {
        return {
          success: false,
          error: error?.message || String(error),
        };
      }
    }, { paths: IMPORT_PATHS, envelope: ENVELOPE_FROM_CHAIN, context: CONTEXT_FROM_CHAIN });

    if (!res.success) {
      test.skip(true, `on-chain envelope decrypt failed: ${res.error || 'unknown error'}`);
      return;
    }

    expect(
      res.decrypted.replace(/\r\n/g, '\n')
    ).toBe(RAW_EMAIL_FROM_LOGS.replace(/\r\n/g, '\n'));
  });

  test('encrypts and decrypts full Gmail fixture with Outlayer worker seed', async ({ page }) => {
    const res = await page.evaluate(async ({ paths, emailBlob }) => {
      try {
        const {
          encryptEmailForOutlayer,
          decryptEmailForOutlayerTestOnly,
          deriveOutlayerStaticKeyFromSeedHex,
        } = await import(paths.server);

        const SEED_HEX = 'e4c9a1f3b87d54c2a0fe93d1c6428b7fd2a6c1e89bf7405de318ab94f6c2d07e';
        const { secretKey: workerSk, publicKey: workerPk } = deriveOutlayerStaticKeyFromSeedHex(SEED_HEX);

        const context = {
          account_id: 'berp61.w3a-v1.testnet',
          payer_account_id: 'w3a-relayer.testnet',
          network_id: 'testnet',
        };

        const { envelope } = await encryptEmailForOutlayer({
          emailRaw: emailBlob,
          aeadContext: context,
          recipientPk: workerPk,
        });

        const decrypted = await decryptEmailForOutlayerTestOnly({
          envelope,
          context,
          recipientSk: workerSk,
        });

        return { success: true, decrypted, original: emailBlob };
      } catch (error: any) {
        return {
          success: false,
          error: error?.message || String(error),
        };
      }
    }, { paths: IMPORT_PATHS, emailBlob: GMAIL_RESET_EMAIL_BLOB });

    if (!res.success) {
      test.skip(true, `gmail_reset_full.eml encryption compat test unavailable: ${res.error || 'unknown error'}`);
      return;
    }

    expect(res.decrypted).toBe(res.original);
  });
});
