/**
 * Debug test to capture PasskeyManager setup errors
 */

import { test, expect } from '@playwright/test';
import { setupBasicPasskeyTest } from '../setup';

test.describe('Debug Setup Errors', () => {

  test('Debug PasskeyManager setup error', async ({ page }) => {

    await setupBasicPasskeyTest(page);

    const result = await page.evaluate(async () => {
      try {
        console.log('=== DEBUG PASSKEY MANAGER SETUP ERROR ===');

        // Step 1: Inject import map manually (same as setup)
        console.log('Step 1: Injecting import map...');
        const importMap = document.createElement('script');
        importMap.type = 'importmap';
        importMap.textContent = JSON.stringify({
          imports: {
            'bs58': 'https://esm.sh/bs58@6.0.0',
            'idb': 'https://esm.sh/idb@8.0.0',
            'js-sha256': 'https://esm.sh/js-sha256@0.11.1',
            '@near-js/crypto': 'https://esm.sh/@near-js/crypto@2.0.1',
            '@near-js/transactions': 'https://esm.sh/@near-js/transactions@2.0.1',
            '@near-js/types': 'https://esm.sh/@near-js/types@2.0.1',
            '@near-js/accounts': 'https://esm.sh/@near-js/accounts@2.0.1',
            '@near-js/client': 'https://esm.sh/@near-js/client@2.0.1',
            '@near-js/keystores': 'https://esm.sh/@near-js/keystores@2.0.1',
            '@near-js/providers': 'https://esm.sh/@near-js/providers@2.0.1',
            '@near-js/signers': 'https://esm.sh/@near-js/signers@2.0.1',
            'tslib': 'https://esm.sh/tslib@2.8.1',
            'buffer': 'https://esm.sh/buffer@6.0.3'
          }
        });
        document.head.appendChild(importMap);
        console.log('Import map injected');

        // Add a delay to ensure import map is processed
        await new Promise(resolve => setTimeout(resolve, 200));
        console.log('Waited for import map to be processed');

        // Step 2: Try to create PasskeyManager directly and catch the error
        console.log('Step 2: Attempting PasskeyManager creation...');
        try {
          // @ts-ignore
          const { PasskeyManager } = await import('/sdk/esm/index.js');
          console.log('PasskeyManager class imported successfully');

          // Use centralized configuration from testUtils
          const { configs } = (window as any).testUtils;
          console.log('Configs prepared:', configs);

          console.log('Creating PasskeyManager instance...');
          const passkeyManager = new PasskeyManager(configs);
          console.log('PasskeyManager created successfully!');
          console.log('PasskeyManager type:', typeof passkeyManager);
          console.log('PasskeyManager methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(passkeyManager)));
          console.log('Has getLoginState:', typeof passkeyManager.getLoginState === 'function');

          return {
            success: true,
            error: null,
            passkeyManagerCreated: true,
            hasGetLoginState: typeof passkeyManager.getLoginState === 'function'
          };

        } catch (passkeyManagerError: any) {
          console.error('PasskeyManager creation failed with error:', passkeyManagerError);
          console.error('Error message:', passkeyManagerError.message);
          console.error('Error stack:', passkeyManagerError.stack);
          console.error('Error name:', passkeyManagerError.name);

          return {
            success: false,
            error: passkeyManagerError.message,
            errorName: passkeyManagerError.name,
            errorStack: passkeyManagerError.stack,
            passkeyManagerCreated: false
          };
        }

      } catch (outerError: any) {
        console.error('Outer error:', outerError);
        return {
          success: false,
          error: outerError.message,
          errorStack: outerError.stack,
          outerError: true
        };
      }
    });

    console.log('PasskeyManager setup debug result:', result);

    if (!result.success) {
      console.log('PasskeyManager setup failed');
      console.log('Error:', result.error);
      console.log('Error name:', result.errorName);
      if (result.errorStack) {
        console.log('Error stack:', result.errorStack);
      }

    } else {
      console.log('PasskeyManager setup successful!');
      console.log('PasskeyManager created:', result.passkeyManagerCreated);
      console.log('Has getLoginState:', result.hasGetLoginState);
    }

    expect(result).toBeDefined();
  });
});