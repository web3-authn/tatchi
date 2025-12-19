import { test, expect } from '@playwright/test';
import { parseRecoverEmailRequest } from '../../server/email-recovery/emailParsers';

test.describe('parseRecoverEmailRequest', () => {
  test('parses accountId from Subject header and explicitMode from headers', async () => {
    const body = {
      from: 'sender@example.com',
      to: 'recover@web3authn.org',
      headers: {
        Subject: 'recover-ABC123 bob.testnet ed25519:somepk',
      },
      raw: 'Subject: recover-ABC123 bob.testnet ed25519:somepk\r\n\r\nhello',
      rawSize: 1,
    };

    const parsed = parseRecoverEmailRequest(body, {
      headers: { 'x-email-recovery-mode': 'zk-email' },
    });

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.accountId).toBe('bob.testnet');
    expect(parsed.explicitMode).toBe('zk-email');
    expect(parsed.emailBlob.length).toBeGreaterThan(0);
  });

  test('prefers explicitMode from JSON body over request headers', async () => {
    const body = {
      from: 'sender@example.com',
      to: 'recover@web3authn.org',
      headers: {
        Subject: 'recover-ABC123 bob.testnet ed25519:somepk',
      },
      raw: 'Subject: recover-ABC123 bob.testnet ed25519:somepk\r\n\r\nhello',
      rawSize: 1,
      explicit_mode: 'tee-encrypted',
    };

    const parsed = parseRecoverEmailRequest(body, {
      headers: { 'x-email-recovery-mode': 'zk-email' },
    });

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.explicitMode).toBe('tee-encrypted');
  });

  test('returns missing_email when raw email blob is absent', async () => {
    const body = {
      from: 'sender@example.com',
      to: 'recover@web3authn.org',
      headers: {
        Subject: 'recover-ABC123 bob.testnet ed25519:somepk',
      },
    };

    const parsed = parseRecoverEmailRequest(body);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.status).toBe(400);
    expect(parsed.code).toBe('missing_email');
  });

  test('returns invalid_email for non-object input', async () => {
    const parsed = parseRecoverEmailRequest(null);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.status).toBe(400);
    expect(parsed.code).toBe('invalid_email');
  });
});
