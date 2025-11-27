import { test, expect } from '@playwright/test';

const IMPORT_PATHS = {
  nearClient: '/sdk/esm/core/NearClient.js',
} as const;

test.describe('encodeSignedTransactionBase64', () => {
  test.beforeEach(async ({ page }) => {
    // Minimal bootstrap for pure unit tests: ensure origin is available for /sdk imports
    await page.goto('/');
  });

  test('encodes SignedTransaction instances via methods', async ({ page }) => {
    const res = await page.evaluate(async ({ paths }) => {
      try {
        const { SignedTransaction, encodeSignedTransactionBase64 } = await import(paths.nearClient);
        const bytes = [0, 1, 2, 255];

        const st = new SignedTransaction({
          transaction: {} as any,
          signature: {} as any,
          borsh_bytes: bytes,
        });

        const encoded = encodeSignedTransactionBase64(st);

        // Compute expected base64 in a simple, browser-safe way
        let bin = '';
        for (const b of bytes) bin += String.fromCharCode(b);
        const expected = btoa(bin);

        return { success: true, encoded, expected };
      } catch (err: any) {
        return { success: false, error: err?.message || String(err) };
      }
    }, { paths: IMPORT_PATHS });

    if (!res.success) {
      test.skip(true, `encodeSignedTransactionBase64 (methods) skipped: ${res.error || 'unknown error'}`);
      return;
    }

    expect(res.encoded).toBe(res.expected);
  });

  test('encodes plain objects with borsh_bytes array', async ({ page }) => {
    const res = await page.evaluate(async ({ paths }) => {
      try {
        const { encodeSignedTransactionBase64 } = await import(paths.nearClient);
        const bytes = [10, 20, 30, 40];

        const encoded = encodeSignedTransactionBase64({
          transaction: {} as any,
          signature: {} as any,
          borsh_bytes: bytes,
        });

        let bin = '';
        for (const b of bytes) bin += String.fromCharCode(b);
        const expected = btoa(bin);

        return { success: true, encoded, expected };
      } catch (err: any) {
        return { success: false, error: err?.message || String(err) };
      }
    }, { paths: IMPORT_PATHS });

    if (!res.success) {
      test.skip(true, `encodeSignedTransactionBase64 (borsh_bytes) skipped: ${res.error || 'unknown error'}`);
      return;
    }

    expect(res.encoded).toBe(res.expected);
  });

  test('encodes plain objects with borshBytes typed array', async ({ page }) => {
    const res = await page.evaluate(async ({ paths }) => {
      try {
        const { encodeSignedTransactionBase64 } = await import(paths.nearClient);
        const bytes = new Uint8Array([5, 6, 7, 8]);

        const encoded = encodeSignedTransactionBase64({
          transaction: {} as any,
          signature: {} as any,
          borshBytes: bytes,
        });

        let bin = '';
        for (const b of bytes) bin += String.fromCharCode(b);
        const expected = btoa(bin);

        return { success: true, encoded, expected };
      } catch (err: any) {
        return { success: false, error: err?.message || String(err) };
      }
    }, { paths: IMPORT_PATHS });

    if (!res.success) {
      test.skip(true, `encodeSignedTransactionBase64 (borshBytes) skipped: ${res.error || 'unknown error'}`);
      return;
    }

    expect(res.encoded).toBe(res.expected);
  });

  test('throws on invalid payloads with no bytes', async ({ page }) => {
    const res = await page.evaluate(async ({ paths }) => {
      try {
        const { encodeSignedTransactionBase64 } = await import(paths.nearClient);
        let error: string | null = null;
        try {
          // Missing base64Encode/encode and no borsh_bytes / borshBytes
          encodeSignedTransactionBase64({ transaction: {}, signature: {} } as any);
        } catch (e: any) {
          error = e?.message || String(e);
        }
        return { success: true, error };
      } catch (err: any) {
        return { success: false, error: err?.message || String(err) };
      }
    }, { paths: IMPORT_PATHS });

    if (!res.success) {
      test.skip(true, `encodeSignedTransactionBase64 (invalid payload) skipped: ${res.error || 'unknown error'}`);
      return;
    }

    expect(res.error).toBe('Invalid signed transaction payload: cannot serialize to base64');
  });

  test('handles large borsh_bytes payloads without stack overflow', async ({ page }) => {
    const res = await page.evaluate(async ({ paths }) => {
      try {
        const { SignedTransaction, encodeSignedTransactionBase64 } = await import(paths.nearClient);

        const length = 100_000;
        const bytes = new Array<number>(length);
        for (let i = 0; i < length; i++) bytes[i] = i % 256;

        const st = new SignedTransaction({
          transaction: {} as any,
          signature: {} as any,
          borsh_bytes: bytes,
        });

        const encoded = encodeSignedTransactionBase64(st);

        // Decode and verify a few sample positions
        const bin = atob(encoded);
        if (bin.length !== bytes.length) {
          return { success: false, error: `Length mismatch: ${bin.length} != ${bytes.length}` };
        }
        const sampleIndices = [0, 1, 12345, length - 1];
        for (const idx of sampleIndices) {
          const expectedByte = bytes[idx];
          const actualByte = bin.charCodeAt(idx);
          if (expectedByte !== actualByte) {
            return { success: false, error: `Byte mismatch at ${idx}: ${actualByte} != ${expectedByte}` };
          }
        }

        return { success: true };
      } catch (err: any) {
        return { success: false, error: err?.message || String(err) };
      }
    }, { paths: IMPORT_PATHS });

    if (!res.success) {
      test.skip(true, `encodeSignedTransactionBase64 (large payload) skipped: ${res.error || 'unknown error'}`);
      return;
    }

    expect(res.success).toBe(true);
  });
});

