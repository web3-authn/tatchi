/**
 * Debug test to capture TatchiPasskey setup errors
 */

import { test, expect } from '@playwright/test';
import { setupBasicPasskeyTest } from '../setup';

test.describe('Debug Setup Errors', () => {

  // intentionally walks the setup sequence to surface any missing globals/modules
  test('Debug TatchiPasskey setup error', async ({ page }) => {

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
            '@noble/ed25519': 'https://esm.sh/@noble/ed25519@3.0.0',
            '@near-js/types': 'https://esm.sh/@near-js/types@2.0.1',
            'qrcode': 'https://esm.sh/qrcode@1.5.4',
            'jsqr': 'https://esm.sh/jsqr@1.4.0',
            'tslib': 'https://esm.sh/tslib@2.8.1',
            'buffer': 'https://esm.sh/buffer@6.0.3'
          }
        });
        document.head.appendChild(importMap);
        console.log('Import map injected');

        // Add a delay to ensure import map is processed
        await new Promise(resolve => setTimeout(resolve, 200));
        console.log('Waited for import map to be processed');

        // Step 2: Try to create TatchiPasskey directly and catch the error
        console.log('Step 2: Attempting TatchiPasskey creation...');
        try {
          // @ts-ignore
          const { TatchiPasskey } = await import('/sdk/esm/core/TatchiPasskey/index.js');
          console.log('TatchiPasskey class imported successfully');

          // Use centralized configuration from testUtils
          const { configs } = (window as any).testUtils;
          console.log('Configs prepared:', configs);

          console.log('Creating TatchiPasskey instance...');
          const tatchi = new TatchiPasskey(configs);
          console.log('TatchiPasskey created successfully!');
          console.log('TatchiPasskey type:', typeof tatchi);
          console.log('TatchiPasskey methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(tatchi)));
          console.log('Has getLoginSession:', typeof tatchi.getLoginSession === 'function');

          return {
            success: true,
            error: null,
            tatchiCreated: true,
            hasGetLoginSession: typeof tatchi.getLoginSession === 'function'
          };

        } catch (tatchiError: any) {
          console.error('TatchiPasskey creation failed with error:', tatchiError);
          console.error('Error message:', tatchiError.message);
          console.error('Error stack:', tatchiError.stack);
          console.error('Error name:', tatchiError.name);

          return {
            success: false,
            error: tatchiError.message,
            errorName: tatchiError.name,
            errorStack: tatchiError.stack,
            tatchiCreated: false
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

    console.log('TatchiPasskey setup debug result:', result);

    if (!result.success) {
      console.log('TatchiPasskey setup failed');
      console.log('Error:', result.error);
      console.log('Error name:', result.errorName);
      if (result.errorStack) {
        console.log('Error stack:', result.errorStack);
      }

    } else {
      console.log('TatchiPasskey setup successful!');
      console.log('TatchiPasskey created:', result.tatchiCreated);
      console.log('Has getLoginSession:', (result as any).hasGetLoginSession);
    }

    expect(result).toBeDefined();
  });
});
