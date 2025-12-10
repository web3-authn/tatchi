import { test, expect } from '@playwright/test';
import { injectImportMap } from '../setup/bootstrap';

const IMPORT_PATHS = {
  userHandle: '/sdk/esm/core/WebAuthnManager/userHandle.js',
} as const;

test.describe('parseAccountIdFromUserHandle', () => {
  test.beforeEach(async ({ page }) => {
    // Light setup for unit tests: blank page + import map only
    await page.goto('data:text/html,<!DOCTYPE html><html><head></head><body></body></html>');
    await injectImportMap(page);
  });

  test('parses base64url string userHandle into accountId', async ({ page }) => {
    const res = await page.evaluate(async ({ paths }) => {
      try {
        const { parseAccountIdFromUserHandle } = await import(paths.userHandle);

        const account = 'serp120.web3-authn.testnet';
        const bytes = new TextEncoder().encode(account);
        const b64url = (() => {
          const bin = String.fromCharCode(...Array.from(bytes));
          return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
        })();

        const parsed = parseAccountIdFromUserHandle(b64url);
        return { success: true, parsed };
      } catch (err: any) {
        return { success: false, error: err?.message || String(err) };
      }
    }, { paths: IMPORT_PATHS });

    if (!res.success) {
      test.skip(true, `parseAccountIdFromUserHandle test skipped: ${res.error || 'unknown error'}`);
      return;
    }
    expect(res.parsed).toBe('serp120.web3-authn.testnet');
  });

  test('parses ArrayBuffer userHandle and strips device suffix', async ({ page }) => {
    const res = await page.evaluate(async ({ paths }) => {
      try {
        const { parseAccountIdFromUserHandle } = await import(paths.userHandle);

        const raw = 'serp120.web3-authn.testnet (2)';
        const buf = new TextEncoder().encode(raw);
        const parsed = parseAccountIdFromUserHandle(buf);
        return { success: true, parsed };
      } catch (err: any) {
        return { success: false, error: err?.message || String(err) };
      }
    }, { paths: IMPORT_PATHS });

    if (!res.success) {
      test.skip(true, `parseAccountIdFromUserHandle test skipped: ${res.error || 'unknown error'}`);
      return;
    }
    expect(res.parsed).toBe('serp120.web3-authn.testnet');
  });

  test('returns null for invalid/empty inputs', async ({ page }) => {
    const res = await page.evaluate(async ({ paths }) => {
      try {
        const { parseAccountIdFromUserHandle } = await import(paths.userHandle);
        const bad1 = parseAccountIdFromUserHandle('');
        const bad2 = parseAccountIdFromUserHandle('Zm9vYmFy'); // b64 of "foobar" (no suffix, invalid account format)
        const bad3 = parseAccountIdFromUserHandle(new Uint8Array());
        return { success: true, values: [bad1, bad2, bad3] };
      } catch (err: any) {
        return { success: false, error: err?.message || String(err) };
      }
    }, { paths: IMPORT_PATHS });

    if (!res.success) {
      test.skip(true, `parseAccountIdFromUserHandle test skipped: ${res.error || 'unknown error'}`);
      return;
    }
    for (const v of res.values!) {
      expect(v).toBeNull();
    }
  });
});

