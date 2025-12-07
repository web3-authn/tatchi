import { test, expect } from '@playwright/test';
import { setupBasicPasskeyTest } from '../setup';

const IMPORT_PATHS = {
  determine: '/sdk/esm/core/WebAuthnManager/VrfWorkerManager/confirmTxFlow/determineConfirmationConfig.js',
  types: '/sdk/esm/core/WebAuthnManager/VrfWorkerManager/confirmTxFlow/types.js',
} as const;

test.describe('determineConfirmationConfig', () => {
  test.beforeEach(async ({ page }) => {
    await setupBasicPasskeyTest(page);
  });

  test('merges request override over user prefs (top window)', async ({ page }) => {
    const res = await page.evaluate(async ({ paths }) => {
      // Import target function and enum from built ESM bundle
      const mod = await import(paths.determine);
      const types = await import(paths.types);
      const determine = mod.determineConfirmationConfig as Function;

      const ctx: any = {
        userPreferencesManager: {
          getConfirmationConfig: () => ({
            uiMode: 'modal',
            behavior: 'requireClick',
            autoProceedDelay: 42,
            theme: 'light'
          })
        }
      };

      const request = {
        type: types.SecureConfirmationType.SIGN_TRANSACTION,
        confirmationConfig: {
          uiMode: 'drawer',
          behavior: 'autoProceed',
          autoProceedDelay: 7,
          theme: 'dark'
        }
      } as any;

      const cfg = determine(ctx, request);
      return { cfg };
    }, { paths: IMPORT_PATHS });

    expect(res.cfg).toEqual({
      uiMode: 'drawer',
      behavior: 'autoProceed',
      autoProceedDelay: 7,
      theme: 'dark'
    });
  });

  test('decryptPrivateKeyWithPrf defaults to uiMode=skip and preserves theme', async ({ page }) => {
    const res = await page.evaluate(async ({ paths }) => {
      const mod = await import(paths.determine);
      const types = await import(paths.types);
      const determine = mod.determineConfirmationConfig as Function;

      const ctx: any = {
        userPreferencesManager: {
          getConfirmationConfig: () => ({
            uiMode: 'modal',
            behavior: 'requireClick',
            autoProceedDelay: 0,
            theme: 'light'
          })
        }
      };

      const request = { type: types.SecureConfirmationType.DECRYPT_PRIVATE_KEY_WITH_PRF } as any;
      const cfg = determine(ctx, request);
      return { cfg };
    }, { paths: IMPORT_PATHS });

    expect(res.cfg.uiMode).toBe('skip');
    expect(res.cfg.behavior).toBe('requireClick');
    expect(res.cfg.theme).toBe('light');
  });

  test('SHOW_SECURE_PRIVATE_KEY_UI inherits theme and uses modal/drawer UI', async ({ page }) => {
    const res = await page.evaluate(async ({ paths }) => {
      const mod = await import(paths.determine);
      const types = await import(paths.types);
      const determine = mod.determineConfirmationConfig as Function;

      const ctx: any = {
        userPreferencesManager: {
          getConfirmationConfig: () => ({
            uiMode: 'modal',
            behavior: 'requireClick',
            autoProceedDelay: 0,
            theme: 'dark'
          })
        }
      };

      const req = { type: types.SecureConfirmationType.SHOW_SECURE_PRIVATE_KEY_UI } as any;
      const cfg = determine(ctx, req);
      return { cfg };
    }, { paths: IMPORT_PATHS });

    // The export viewer uses a full-screen modal/drawer; we only assert
    // that it does not get forced to 'skip' and that it keeps the theme.
    expect(res.cfg.uiMode === 'modal' || res.cfg.uiMode === 'drawer').toBe(true);
    expect(res.cfg.theme).toBe('dark');
  });

  test('in iframe + registration/link clamps to modal+requireClick when no override provided', async ({ page }) => {
    // Create a same-origin iframe and run the function inside that context
    const result = await (async () => {
      const frameHandle = await page.evaluateHandle(() => {
        const iframe = document.createElement('iframe');
        iframe.setAttribute('data-test', 'cfg-frame');
        document.body.appendChild(iframe);
        return iframe;
      });
      const element = frameHandle.asElement();
      if (!element) throw new Error('iframe element not found');
      const frame = await element.contentFrame();
      if (!frame) throw new Error('iframe content frame not available');

      // Ensure the iframe has the same import map as the top window so bare
      // module specifiers (e.g., "bs58") used by the built ESM bundle resolve.
      await frame.evaluate(() => {
        try {
          const parentImportMap = window.top?.document.querySelector<HTMLScriptElement>('script[type="importmap"]');
          if (!parentImportMap) return;

          const clone = document.createElement('script');
          clone.type = 'importmap';
          clone.textContent = parentImportMap.textContent;

          if (document.head.firstChild) {
            document.head.insertBefore(clone, document.head.firstChild);
          } else {
            document.head.appendChild(clone);
          }
        } catch {
          // If anything goes wrong here, fall back to the iframe's default
          // resolution (the test will surface any remaining issues).
        }
      });

      // Evaluate within the iframe so window.self !== window.top → true
      return await frame.evaluate(async ({ paths }) => {
        const mod = await import(paths.determine);
        const types = await import(paths.types);
        const determine = mod.determineConfirmationConfig as Function;
        const ctx: any = {
          userPreferencesManager: {
            getConfirmationConfig: () => ({
              uiMode: 'drawer',
              behavior: 'autoProceed',
              autoProceedDelay: 5,
              theme: 'dark'
            })
          }
        };
        const req1 = { type: types.SecureConfirmationType.REGISTER_ACCOUNT } as any;
        const req2 = { type: types.SecureConfirmationType.LINK_DEVICE } as any;
        const cfg1 = determine(ctx, req1);
        const cfg2 = determine(ctx, req2);
        return { cfg1, cfg2 };
      }, { paths: IMPORT_PATHS });
    })();

    // Should clamp to safe modal/requireClick, keeping theme
    expect(result.cfg1).toEqual({ uiMode: 'modal', behavior: 'requireClick', autoProceedDelay: 5, theme: 'dark' });
    expect(result.cfg2).toEqual({ uiMode: 'modal', behavior: 'requireClick', autoProceedDelay: 5, theme: 'dark' });
  });
});
