/**
 * Example E2E Test - Demonstrating Reusable Setup
 */

import { test, expect } from '@playwright/test';
import { setupBasicPasskeyTest } from '../setup';

test.describe('Example PasskeyManager Usage', () => {

  test.beforeEach(async ({ page }) => {
    await setupBasicPasskeyTest(page);
    // Or with custom config:
    // await setupBasicPasskeyTest(page, {
    //   nearNetwork: 'testnet',
    //   contractId: 'custom-contract.testnet'
    // });
  });

  // showcases how setup wires PasskeyManager/test utils into the page context
  test('should demonstrate PasskeyManager access in different test file', async ({ page }) => {
    const result = await page.evaluate(async () => {
      // Access the pre-configured PasskeyManager and utilities (safe pattern)
      const { passkeyManager, generateTestAccountId, verifyAccountExists } = (window as any).testUtils;

      const testAccountId = generateTestAccountId();
      console.log('Generated test account ID:', testAccountId);

      // Example: Test some PasskeyManager functionality
      // You could test login state, configuration, etc.
      try {
        const loginState = await passkeyManager.getLoginState();
        return {
          success: true,
          hasPasskeyManager: !!passkeyManager,
          hasUtilities: !!(generateTestAccountId && verifyAccountExists),
          testAccountId: testAccountId,
          loginState: loginState,
          contractId: (window as any).testUtils?.configs?.contractId
        };
      } catch (error: any) {
        return {
          success: true, // This is expected in test environment
          hasPasskeyManager: !!passkeyManager,
          hasUtilities: !!(generateTestAccountId && verifyAccountExists),
          testAccountId: testAccountId,
          loginError: error.message,
          contractId: (window as any).testUtils?.configs?.contractId
        };
      }
    });

    // Verify setup worked correctly
    expect(result.hasPasskeyManager).toBe(true);
    expect(result.hasUtilities).toBe(true);
    const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const contractId = result.contractId || 'w3a-v1.testnet';
    const reOld = /^e2etest\d+\.testnet$/;
    const reNew = new RegExp(`^e2etest\\d+\\.${escapeRe(contractId)}$`);
    expect(reOld.test(result.testAccountId) || reNew.test(result.testAccountId)).toBe(true);
  });
});
