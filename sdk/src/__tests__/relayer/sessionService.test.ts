import { test, expect } from '@playwright/test';
import { SessionService } from '../../server/core/SessionService';

test.describe('SessionService (server)', () => {
  test('buildSetCookie() defaults include HttpOnly/Secure/SameSite/Max-Age/Expires', async () => {
    const s = new SessionService({ jwt: { signToken: async () => 't' } });
    const out = s.buildSetCookie('token-123');
    expect(out).toContain('HttpOnly');
    expect(out).toContain('Secure');
    expect(out).toContain('SameSite=Lax');
    expect(out).toContain('Max-Age=');
    expect(out).toContain('Expires=');
  });

  test('buildClearCookie() defaults include Max-Age=0 and epoch Expires', async () => {
    const s = new SessionService({ jwt: { signToken: async () => 't' } });
    const out = s.buildClearCookie();
    expect(out).toContain('Max-Age=0');
    expect(out).toContain('Expires=Thu, 01 Jan 1970');
  });

  test('extractTokenFromHeaders prefers Authorization Bearer over Cookie', async () => {
    const s = new SessionService({ jwt: { signToken: async () => 't' }, cookie: { name: 'w3a_session' } });
    const tok = s.extractTokenFromHeaders({
      authorization: 'Bearer bearer-token',
      cookie: 'w3a_session=cookie-token',
    });
    expect(tok).toBe('bearer-token');
  });

  test('refresh() returns not_eligible when outside refresh window', async () => {
    const now = Math.floor(Date.now() / 1000);
    const s = new SessionService({
      jwt: {
        refreshWindowSec: 900,
        verifyToken: async () => ({ valid: true, payload: { sub: 'bob', exp: now + 2000 } }),
        signToken: async () => 'new-token',
      },
    });
    const out = await s.refresh({ authorization: 'Bearer old' });
    expect(out.ok).toBe(false);
    expect(out.code).toBe('not_eligible');
  });

  test('refresh() returns jwt when within refresh window', async () => {
    const now = Math.floor(Date.now() / 1000);
    const s = new SessionService({
      jwt: {
        refreshWindowSec: 900,
        verifyToken: async () => ({ valid: true, payload: { sub: 'bob', exp: now + 5 } }),
        signToken: async () => 'new-token',
      },
    });
    const out = await s.refresh({ authorization: 'Bearer old' });
    expect(out.ok).toBe(true);
    expect(out.jwt).toBe('new-token');
  });
});

