import { test, expect } from '@playwright/test';
import { buildCorsOrigins, parseCsvList } from '../../server/core/SessionService';

test.describe('CORS origin helpers (server)', () => {
  test('parseCsvList normalizes URLs and dedupes', async () => {
    const out = parseCsvList('https://EXAMPLE.com/, https://example.com, https://example.com/path');
    expect(out).toContain('https://example.com');
    expect(out.filter((x) => x === 'https://example.com').length).toBe(1);
    // URL inputs are normalized to scheme + host (+ optional port) only.
    expect(out.some((x) => x.includes('/path'))).toBe(false);
  });

  test('buildCorsOrigins returns "*" when no inputs', async () => {
    const out = buildCorsOrigins(undefined, '');
    expect(out).toBe('*');
  });

  test('buildCorsOrigins merges CSV lists', async () => {
    const out = buildCorsOrigins('https://a.com, https://b.com', 'https://a.com/');
    expect(out).toEqual(['https://a.com', 'https://b.com']);
  });
});
