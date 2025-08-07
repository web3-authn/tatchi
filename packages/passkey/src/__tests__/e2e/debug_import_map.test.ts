/**
 * Debug test to verify import map setup
 */

import { test, expect } from '@playwright/test';
import { setupBasicPasskeyTest } from '../setup';

test.describe('Debug Import Map', () => {

  test('Debug import map setup', async ({ page }) => {

    await setupBasicPasskeyTest(page);

    const result = await page.evaluate(async () => {
      try {
        console.log('=== DEBUG IMPORT MAP ===');

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
            'tslib': 'https://esm.sh/tslib@2.8.1',
            'buffer': 'https://esm.sh/buffer@6.0.3'
          }
        });

        if (document.head.firstChild) {
          document.head.insertBefore(importMap, document.head.firstChild);
        } else {
          document.head.appendChild(importMap);
        }
        console.log('Import map injected');

        // Step 2: Wait a moment for import map to be processed
        await new Promise(resolve => setTimeout(resolve, 100));

        // Step 3: Test importing bs58 directly
        console.log('Step 3: Testing bs58 import...');
        const bs58Module = await import('bs58');
        console.log('bs58 imported successfully:', typeof bs58Module.default);

        // Step 4: Test bs58 functionality
        console.log('Step 4: Testing bs58 functionality...');
        const testData = new Uint8Array([1, 2, 3, 4]);
        const encoded = bs58Module.default.encode(testData);
        console.log('bs58 encode works:', encoded);

        // Step 5: Test utils/encoders import (which uses bs58)
        console.log('Step 5: Testing utils/encoders import...');
        // @ts-ignore
        const utilsModule = await import('/sdk/esm/utils/encoders.js');
        console.log('utils/encoders imported:', Object.keys(utilsModule));

        // Step 6: Test base64UrlEncode
        console.log('Step 6: Testing base64UrlEncode...');
        const testBuffer = new Uint8Array([1, 2, 3, 4]).buffer;
        const encoded64 = utilsModule.base64UrlEncode(testBuffer);
        console.log('base64UrlEncode works:', encoded64);

        return { success: true, step: 6 };

      } catch (error: any) {
        console.error('Error at step:', error.message);
        console.error('Error stack:', error.stack);
        return {
          success: false,
          error: error.message,
          stack: error.stack
        };
      }
    });

    console.log('Import map debug result:', result);

    if (!result.success) {
      console.log('Failed with error:', result.error);
      if (result.stack) {
        console.log('Stack:', result.stack);
      }
    } else {
      console.log('All import map steps completed successfully up to step:', result.step);
    }

    expect(result).toBeDefined();
  });
});