import { test, expect } from '@playwright/test';
import { setupBasicPasskeyTest } from '../setup';

const IMPORT_PATHS = {
  helpers: '/sdk/esm/core/WebAuthnManager/VrfWorkerManager/confirmTxFlow/flows/common.js',
} as const;

test.describe('confirmTxFlow common helpers', () => {
  test.beforeEach(async ({ page }) => {
    await setupBasicPasskeyTest(page);
  });

  test('sanitizeForPostMessage strips functions and handle references', async ({ page }) => {
    const result = await page.evaluate(async ({ paths }) => {
      const mod = await import(paths.helpers);
      // compile‑time type query, TypeScript requires module specifier to be a literal string
      const { sanitizeForPostMessage } = mod as typeof import(
        '../../core/WebAuthnManager/VrfWorkerManager/confirmTxFlow/flows/common'
      );
      const input = {
        confirmed: true,
        count: 2,
        nested: { ok: true },
        _confirmHandle: { close: () => {} },
        onProgress: () => {},
      } as any;
      const sanitized = sanitizeForPostMessage(input);
      return {
        keys: Object.keys(sanitized as Record<string, unknown>),
        hasConfirmHandle: ('_confirmHandle' in (sanitized as Record<string, unknown>)),
        hasOnProgress: ('onProgress' in (sanitized as Record<string, unknown>)),
        nested: (sanitized as any).nested,
        confirmed: (sanitized as any).confirmed,
        count: (sanitized as any).count,
      };
    }, { paths: IMPORT_PATHS });

    expect(result.keys.sort()).toEqual(['confirmed', 'count', 'nested']);
    expect(result.hasConfirmHandle).toBe(false);
    expect(result.hasOnProgress).toBe(false);
    expect(result.nested).toEqual({ ok: true });
    expect(result.confirmed).toBe(true);
    expect(result.count).toBe(2);
  });

  test('sanitizeForPostMessage strips unexpected future function fields', async ({ page }) => {
    const result = await page.evaluate(async ({ paths }) => {
      const mod = await import(paths.helpers);
      const { sanitizeForPostMessage } = mod as typeof import(
        '../../core/WebAuthnManager/VrfWorkerManager/confirmTxFlow/flows/common'
      );
      const sanitized = sanitizeForPostMessage({
        confirmed: false,
        futureHandler: () => 'noop',
        ttl: 7,
      } as any);
      return {
        keys: Object.keys(sanitized as Record<string, unknown>),
        hasFutureHandler: ('futureHandler' in (sanitized as Record<string, unknown>)),
        ttl: (sanitized as any).ttl,
      };
    }, { paths: IMPORT_PATHS });

    expect(result.keys.sort()).toEqual(['confirmed', 'ttl']);
    expect(result.hasFutureHandler).toBe(false);
    expect(result.ttl).toBe(7);
  });

  test('parseTransactionSummary parses JSON and falls back on invalid strings', async ({ page }) => {
    const result = await page.evaluate(async ({ paths }) => {
      const mod = await import(paths.helpers);
      const { parseTransactionSummary } = mod as typeof import(
        '../../core/WebAuthnManager/VrfWorkerManager/confirmTxFlow/flows/common'
      );
      const parsed = parseTransactionSummary('{"totalAmount":"10","method":"transfer"}');
      const fallback = parseTransactionSummary('{invalid json');
      const objectPass = parseTransactionSummary({ totalAmount: '5', method: 'stake' });
      return { parsed, fallback, objectPass };
    }, { paths: IMPORT_PATHS });

    expect(result.parsed).toEqual({ totalAmount: '10', method: 'transfer' });
    expect(result.fallback).toEqual({});
    expect(result.objectPass).toEqual({ totalAmount: '5', method: 'stake' });
  });
});
