import { test, expect } from '@playwright/test';
import { setupBasicPasskeyTest } from '../setup';

const IMPORT_PATHS = {
  helpers: '/sdk/esm/core/WebAuthnManager/credentialsHelpers.js',
} as const;

test.describe('credentialsHelpers – redaction', () => {
  test.beforeEach(async ({ page }) => {
    await setupBasicPasskeyTest(page);
  });

  test('removePrfOutputGuard redacts entire clientExtensionResults', async ({ page }) => {
    const result = await page.evaluate(async ({ paths }) => {
      const { removePrfOutputGuard } = await import(paths.helpers);

      const credential: any = {
        id: 'cred-id',
        rawId: 'AQID',
        type: 'public-key',
        authenticatorAttachment: undefined,
        response: {
          clientDataJSON: 'AQ',
          authenticatorData: 'Ag',
          signature: 'Aw',
          userHandle: undefined,
          // Non-standard but supported by worker extractors; ensure we redact it too.
          clientExtensionResults: {
            prf: { results: { first: 'nested-secret', second: 'nested-secret-2' } },
          },
        },
        clientExtensionResults: {
          appid: true,
          credProps: { rk: true },
          prf: { results: { first: 'secret-first', second: 'secret-second' } },
        },
      };

      const stripped = removePrfOutputGuard(credential);
      const json = JSON.stringify(stripped);

      const hasClientExtensionResults = !!stripped && Object.prototype.hasOwnProperty.call(stripped, 'clientExtensionResults');
      const responseObj =
        stripped?.response && typeof stripped.response === 'object' ? (stripped.response as any) : null;
      const hasResponseClientExtensionResults =
        !!responseObj && Object.prototype.hasOwnProperty.call(responseObj, 'clientExtensionResults');

      return {
        hasClientExtensionResults,
        clientExtensionResults: (stripped as any).clientExtensionResults,
        hasResponseClientExtensionResults,
        responseClientExtensionResults: responseObj ? responseObj.clientExtensionResults : undefined,
        json,
      };
    }, { paths: IMPORT_PATHS });

    expect(result.hasClientExtensionResults).toBe(true);
    expect(result.clientExtensionResults).toBeNull();
    expect(result.hasResponseClientExtensionResults).toBe(true);
    expect(result.responseClientExtensionResults).toBeNull();
    expect(result.json).not.toContain('secret-first');
    expect(result.json).not.toContain('secret-second');
    expect(result.json).not.toContain('nested-secret');
    expect(result.json).not.toContain('nested-secret-2');
  });
});
