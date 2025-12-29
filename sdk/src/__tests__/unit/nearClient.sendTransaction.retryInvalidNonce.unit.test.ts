import { test, expect } from '@playwright/test';
import { setupBasicPasskeyTest } from '../setup';

const IMPORT_PATHS = {
  nearClient: '/sdk/esm/core/NearClient.js',
} as const;

test.describe('MinimalNearClient.sendTransaction', () => {
  test.beforeEach(async ({ page }) => {
    await setupBasicPasskeyTest(page);
  });

  test('retries after transient HTTP error, then can surface InvalidNonce', async ({ page }) => {
    let requestCount = 0;

    await page.route('**/rpc-send-tx', async (route) => {
      requestCount += 1;

      // Simulate a transient upstream error (public RPCs often return 429s/5xx intermittently).
      if (requestCount === 1) {
        await route.fulfill({
          status: 429,
          contentType: 'text/plain',
          body: 'Too Many Requests',
        });
        return;
      }

      // Second attempt: node responds with a structured InvalidNonce error.
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: '1',
          error: {
            code: -32000,
            message: 'Server error',
            data: {
              TxExecutionError: {
                InvalidTxError: {
                  InvalidNonce: {
                    tx_nonce: 1,
                    ak_nonce: 1,
                  },
                },
              },
            },
          },
        }),
      });
    });

    const result = await page.evaluate(async ({ paths }) => {
      const mod = await import(paths.nearClient);
      const { MinimalNearClient } = mod as any;

      const origin = window.location.origin;
      const nearClient = new MinimalNearClient(`${origin}/rpc-send-tx`);

      const dummyBytes = Array.from(new TextEncoder().encode('dummy-signed-tx'));
      const signedTx = { borsh_bytes: dummyBytes };

      try {
        await nearClient.sendTransaction(signedTx, 'FINAL');
        return { ok: true as const };
      } catch (error: any) {
        return {
          ok: false as const,
          message: error?.message || String(error),
          short: error?.short,
          kind: error?.kind,
          type: error?.type,
        };
      }
    }, { paths: IMPORT_PATHS });

    expect(result.ok, JSON.stringify(result)).toBe(false);
    expect(result.short).toBe('InvalidTxError: InvalidNonce');
    expect(requestCount).toBe(2);
  });
});

