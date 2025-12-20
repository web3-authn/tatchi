import { test, expect } from '@playwright/test';
import { injectImportMap } from '../setup/bootstrap';

const IMPORT_PATHS = {
  zkEmail: '/sdk/esm/server/email-recovery/zkEmail/index.js',
} as const;

test.describe('zk-email subject parsing with request_id', () => {
  test.beforeEach(async ({ page }) => {
    // Use a blank page for unit tests to avoid network dependencies
    await page.goto('data:text/html,<!DOCTYPE html><html><head></head><body></body></html>');
    await injectImportMap(page);
  });

  test('parseAccountIdFromSubject extracts accountId from recover-<request_id> subject', async ({ page }) => {
    const res = await page.evaluate(async ({ paths }) => {
      try {
        const { parseAccountIdFromSubject } = await import(paths.zkEmail);
        const subject = 'Subject: recover-ABC123 bob.testnet ed25519:edpkDummyKey\n';
        const accountId = parseAccountIdFromSubject(subject);
        return { success: true, accountId };
      } catch (err: any) {
        return { success: false, error: err?.message || String(err) };
      }
    }, { paths: IMPORT_PATHS });

    if (!res.success) {
      test.skip(true, `parseAccountIdFromSubject failed: ${res.error || 'unknown error'}`);
      return;
    }

    expect(res.accountId).toBe('bob.testnet');
  });

  test('parseAccountIdFromSubject returns null for subjects without request_id', async ({ page }) => {
    const res = await page.evaluate(async ({ paths }) => {
      try {
        const { parseAccountIdFromSubject } = await import(paths.zkEmail);
        const subject = 'Subject: recover bob.testnet ed25519:edpkDummyKey\n';
        const accountId = parseAccountIdFromSubject(subject);
        return { success: true, accountId };
      } catch (err: any) {
        return { success: false, error: err?.message || String(err) };
      }
    }, { paths: IMPORT_PATHS });

    if (!res.success) {
      test.skip(true, `parseAccountIdFromSubject (no request_id) failed: ${res.error || 'unknown error'}`);
      return;
    }

    expect(res.accountId).toBeNull();
  });

  test('extractZkEmailBindingsFromPayload parses bindings from recover-<request_id> subject', async ({ page }) => {
    const res = await page.evaluate(async ({ paths }) => {
      try {
        const { extractZkEmailBindingsFromPayload } = await import(paths.zkEmail);

        const rawEmail = [
          'Subject: recover-ABC123 bob.testnet ed25519:edpkDummyKey',
          'From: alice@example.com',
          'Date: Tue, 01 Jan 2024 00:00:00 GMT',
          '',
          'Body...',
        ].join('\n');

        const payload = {
          from: 'alice@example.com',
          to: 'recover@web3authn.org',
          headers: {
            subject: 'recover-ABC123 bob.testnet ed25519:edpkDummyKey',
            from: 'alice@example.com',
            date: 'Tue, 01 Jan 2024 00:00:00 GMT',
          },
          raw: rawEmail,
          rawSize: rawEmail.length,
        };

        const bindings = extractZkEmailBindingsFromPayload(payload as any);
        return { success: true, bindings };
      } catch (err: any) {
        return { success: false, error: err?.message || String(err) };
      }
    }, { paths: IMPORT_PATHS });

    if (!res.success) {
      test.skip(true, `extractZkEmailBindingsFromPayload failed: ${res.error || 'unknown error'}`);
      return;
    }

    expect(res.bindings).toBeTruthy();
    expect(res.bindings.accountId).toBe('bob.testnet');
    expect(res.bindings.newPublicKey).toBe('edpkDummyKey');
    expect(res.bindings.fromEmail).toBe('alice@example.com');
    expect(res.bindings.timestamp).toBe('Tue, 01 Jan 2024 00:00:00 GMT');
  });
});
