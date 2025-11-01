import { test, expect } from '@playwright/test';
import { buildPermissionsPolicy, buildWalletCsp, type CspMode } from '../../plugins/headers';

test.describe('plugins/headers builders', () => {
  test('buildPermissionsPolicy with origin', () => {
    const origin = 'https://wallet.example.localhost';
    const pp = buildPermissionsPolicy(origin);
    expect(pp).toBe(
      'publickey-credentials-get=(self "https://wallet.example.localhost"), ' +
      'publickey-credentials-create=(self "https://wallet.example.localhost"), ' +
      'clipboard-read=(self "https://wallet.example.localhost"), ' +
      'clipboard-write=(self "https://wallet.example.localhost")'
    );
  });

  test('buildPermissionsPolicy without origin', () => {
    const pp = buildPermissionsPolicy();
    expect(pp).toBe(
      'publickey-credentials-get=(self), ' +
      'publickey-credentials-create=(self), ' +
      'clipboard-read=(self), ' +
      'clipboard-write=(self)'
    );
  });

  test('buildWalletCsp strict default', () => {
    const csp = buildWalletCsp();
    expect(csp).toBe(
      "default-src 'self'; " +
      "script-src 'self'; " +
      "style-src-attr 'none'; " +
      "style-src 'self'; " +
      "img-src 'self' data:; " +
      "font-src 'self'; " +
      "connect-src 'self' https:; " +
      "worker-src 'self' blob:; " +
      "frame-src 'self'; " +
      "object-src 'none'; " +
      "base-uri 'none'; " +
      "form-action 'none'"
    );
  });

  test('buildWalletCsp compatible mode allows inline', () => {
    const csp = buildWalletCsp({ mode: 'compatible' as CspMode });
    expect(csp).toBe(
      "default-src 'self'; " +
      "script-src 'self' 'unsafe-inline'; " +
      "style-src 'self' 'unsafe-inline'; " +
      "img-src 'self' data:; " +
      "font-src 'self'; " +
      "connect-src 'self' https:; " +
      "worker-src 'self' blob:; " +
      "frame-src 'self'; " +
      "object-src 'none'; " +
      "base-uri 'none'; " +
      "form-action 'none'"
    );
  });

  test("buildWalletCsp allows 'unsafe-eval' when requested", () => {
    const csp = buildWalletCsp({ allowUnsafeEval: true });
    expect(csp).toBe(
      "default-src 'self'; " +
      "script-src 'self' 'unsafe-eval'; " +
      "style-src-attr 'none'; " +
      "style-src 'self'; " +
      "img-src 'self' data:; " +
      "font-src 'self'; " +
      "connect-src 'self' https:; " +
      "worker-src 'self' blob:; " +
      "frame-src 'self'; " +
      "object-src 'none'; " +
      "base-uri 'none'; " +
      "form-action 'none'"
    );
  });

  test('buildWalletCsp frame-src allowlist', () => {
    const walletOrigin = 'https://wallet.example.localhost';
    const csp = buildWalletCsp({ frameSrc: [walletOrigin] });
    expect(csp).toBe(
      "default-src 'self'; " +
      "script-src 'self'; " +
      "style-src-attr 'none'; " +
      "style-src 'self'; " +
      "img-src 'self' data:; " +
      "font-src 'self'; " +
      "connect-src 'self' https:; " +
      "worker-src 'self' blob:; " +
      "frame-src 'self' https://wallet.example.localhost; " +
      "object-src 'none'; " +
      "base-uri 'none'; " +
      "form-action 'none'"
    );
  });
});

