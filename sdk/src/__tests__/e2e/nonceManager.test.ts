/**
 * NonceManager Integration Tests
 *
 * Tests the robust nonce management functionality for batch transactions
 * Uses real TatchiPasskey and requires full registration/login setup
 */

import { test, expect } from '@playwright/test';
import { setupBasicPasskeyTest, handleInfrastructureErrors } from '../setup';
import { autoConfirmWalletIframeUntil } from '../setup/flows';
import { DEFAULT_TEST_CONFIG } from '../setup/config';

test.describe('NonceManager Integration Tests', () => {

  test.beforeEach(async ({ page }) => {
    // Use a blank harness page so the example app does not configure wallet-iframe mode,
    // which disables IndexedDB on the app origin (NonceManager tests need app-origin IndexedDB).
    const blankPageUrl = new URL('/__test_blank.html', DEFAULT_TEST_CONFIG.frontendUrl).toString();
    await setupBasicPasskeyTest(page, {
      frontendUrl: blankPageUrl,
      skipPasskeyManagerInit: true,
    });
    await page.waitForTimeout(300);
  });

  // validates remote nonce fetch + caching via TatchiPasskey integration helpers
  test('NonceManager - Integration with TatchiPasskey', async ({ page }) => {
    const resultPromise = page.evaluate(async () => {
      try {
        const { generateTestAccountId, configs } = (window as any).testUtils;
        const testAccountId = generateTestAccountId();

        // Ensure relay-server registration is mocked for deterministic success
        try { (window as any).testUtils?.registrationFlowUtils?.setupRelayServerMock?.(true); } catch {}

        // Use a local (non-iframe) TatchiPasskey instance so NonceManager is initialized on the app origin.
        // Wallet-iframe mode keeps nonce/session state on the wallet origin.
        // @ts-ignore - Runtime import
        const { TatchiPasskey } = await import('/sdk/esm/core/TatchiPasskey/index.js');
        const pm = new TatchiPasskey({
          nearNetwork: configs.nearNetwork,
          nearRpcUrl: configs.nearRpcUrl,
          contractId: configs.contractId,
          relayer: configs.relayer,
          iframeWallet: { walletOrigin: '' },
        });

        // Register and login to get a working session
        const cfg = ((window as any).testUtils?.confirmOverrides?.skip)
          || ({ uiMode: 'skip', behavior: 'autoProceed', autoProceedDelay: 0} as const);
        const registrationResult = await pm.registerPasskeyInternal(testAccountId, {}, cfg as any);
        if (!registrationResult.success) {
          throw new Error(`Registration failed: ${registrationResult.error}`);
        }

        const loginResult = await pm.loginAndCreateSession(testAccountId);
        if (!loginResult.success) {
          throw new Error(`Login failed: ${loginResult.error}`);
        }

        // Wait for session to settle
        await new Promise(resolve => setTimeout(resolve, 2000));

        const ctx = pm.getContext();

        // Test nonce manager integration
        const nonceManager = ctx.webAuthnManager.getNonceManager();

        // Get initial nonce
        const initialContext = await nonceManager.getNonceBlockHashAndHeight(ctx.nearClient);

        // Test nonce reservation
        const nonces = nonceManager.reserveNonces(2);

        // Test nonce release
        nonceManager.releaseNonce(nonces[0]);

        const reservedNonces = (nonceManager as any).reservedNonces;

        return {
          success: true,
          initialNonce: initialContext.nextNonce,
          reservedNonces: nonces,
          finalReservedCount: reservedNonces.size,
          hasFirstNonce: reservedNonces.has(nonces[0]),
          hasSecondNonce: reservedNonces.has(nonces[1]),
        };

      } catch (error: any) {
        return {
          success: false,
          error: error.message,
          stack: error.stack
        };
      }
    });
    const result = await autoConfirmWalletIframeUntil(page, resultPromise);

    if (!result.success) {
      if (handleInfrastructureErrors(result)) {
        return;
      }
      console.error('Integration test failed:', result.error);
      expect(result.success).toBe(true);
      return;
    }

    expect(result.success).toBe(true);
    expect(result.initialNonce).toBeDefined();
    expect(result.reservedNonces).toHaveLength(2);
    expect(result.finalReservedCount).toBe(1); // Only second nonce should be reserved
    expect(result.hasFirstNonce).toBe(false); // Released
    expect(result.hasSecondNonce).toBe(true); // Still reserved

    console.log('NonceManager integration test passed');
  });

  // simulates a full sign-and-send to confirm nonce sequencing across multiple actions
  test('NonceManager - Real Transaction Flow Simulation', async ({ page }) => {
    const resultPromise = page.evaluate(async () => {
      try {
        const { generateTestAccountId, configs } = (window as any).testUtils;
        const testAccountId = generateTestAccountId();

        // Ensure relay-server registration is mocked for deterministic success
        try { (window as any).testUtils?.registrationFlowUtils?.setupRelayServerMock?.(true); } catch {}

        // @ts-ignore - Runtime import
        const { TatchiPasskey } = await import('/sdk/esm/core/TatchiPasskey/index.js');
        const pm = new TatchiPasskey({
          nearNetwork: configs.nearNetwork,
          nearRpcUrl: configs.nearRpcUrl,
          contractId: configs.contractId,
          relayer: configs.relayer,
          iframeWallet: { walletOrigin: '' },
        });

        // Register and login
        const cfg = ((window as any).testUtils?.confirmOverrides?.skip)
          || ({ uiMode: 'skip', behavior: 'autoProceed', autoProceedDelay: 0} as const);
        const registrationResult = await pm.registerPasskeyInternal(testAccountId, {}, cfg as any);
        if (!registrationResult.success) {
          throw new Error(`Registration failed: ${registrationResult.error}`);
        }

        const loginResult = await pm.loginAndCreateSession(testAccountId);
        if (!loginResult.success) {
          throw new Error(`Login failed: ${loginResult.error}`);
        }

        await new Promise(resolve => setTimeout(resolve, 2000));

        const ctx = pm.getContext();
        const nonceManager = ctx.webAuthnManager.getNonceManager();

        // Ensure transaction context exists so getNextNonce()/reserveNonces() are meaningful
        await nonceManager.getNonceBlockHashAndHeight(ctx.nearClient);

        // Simulate consecutive transactions with real TatchiPasskey
        const transactionResults = [];

        for (let i = 0; i < 3; i++) {
          const nonce = nonceManager.getNextNonce();
          transactionResults.push({
            transactionId: i + 1,
            nonce: nonce,
            reserved: (nonceManager as any).reservedNonces.has(nonce)
          });
        }

        // Release all nonces
        nonceManager.releaseAllNonces();

        const finalReservedCount = (nonceManager as any).reservedNonces.size;

        return {
          success: true,
          transactionResults: transactionResults,
          finalReservedCount: finalReservedCount,
          allNoncesUnique: new Set(transactionResults.map(t => t.nonce)).size === transactionResults.length,
        };

      } catch (error: any) {
        return {
          success: false,
          error: error.message,
          stack: error.stack
        };
      }
    });
    const result = await autoConfirmWalletIframeUntil(page, resultPromise);

    if (!result.success) {
      if (handleInfrastructureErrors(result)) {
        return;
      }
      console.error('Real transaction flow test failed:', result.error);
      expect(result.success).toBe(true);
      return;
    }

    expect(result.success).toBe(true);
    expect(result.transactionResults).toHaveLength(3);
    expect(result.finalReservedCount).toBe(0); // All nonces should be released
    expect(result.allNoncesUnique).toBe(true); // All nonces should be unique

    // Verify nonces are sequential
    const nonces = result.transactionResults?.map(t => parseInt(t.nonce)) || [];
    expect(nonces[1]).toBe(nonces[0] + 1);
    expect(nonces[2]).toBe(nonces[1] + 1);

    console.log('NonceManager real transaction flow test passed');
  });

  // stresses batch increment/decrement logic using realistic account state snapshots
  test('NonceManager - Batch Transaction with Real Context', async ({ page }) => {
    const resultPromise = page.evaluate(async () => {
      try {
        const { generateTestAccountId, configs } = (window as any).testUtils;
        const testAccountId = generateTestAccountId();

        // Ensure relay-server registration is mocked for deterministic success
        try { (window as any).testUtils?.registrationFlowUtils?.setupRelayServerMock?.(true); } catch {}

        // @ts-ignore - Runtime import
        const { TatchiPasskey } = await import('/sdk/esm/core/TatchiPasskey/index.js');
        const pm = new TatchiPasskey({
          nearNetwork: configs.nearNetwork,
          nearRpcUrl: configs.nearRpcUrl,
          contractId: configs.contractId,
          relayer: configs.relayer,
          iframeWallet: { walletOrigin: '' },
        });

        // Register and login
        const cfg = ((window as any).testUtils?.confirmOverrides?.skip)
          || ({ uiMode: 'skip', behavior: 'autoProceed', autoProceedDelay: 0} as const);
        const registrationResult = await pm.registerPasskeyInternal(testAccountId, {}, cfg as any);
        if (!registrationResult.success) {
          throw new Error(`Registration failed: ${registrationResult.error}`);
        }

        const loginResult = await pm.loginAndCreateSession(testAccountId);
        if (!loginResult.success) {
          throw new Error(`Login failed: ${loginResult.error}`);
        }

        await new Promise(resolve => setTimeout(resolve, 2000));

        const ctx = pm.getContext();
        const nonceManager = ctx.webAuthnManager.getNonceManager();

        // Ensure transaction context exists so reservations are tracked
        await nonceManager.getNonceBlockHashAndHeight(ctx.nearClient);

        // Test batch nonce reservation with real context
        const batch1 = nonceManager.reserveNonces(3);
        batch1.forEach((nonce: string) => nonceManager.releaseNonce(nonce));

        const batch2 = nonceManager.reserveNonces(2);

        // Test mixed single and batch
        const single = nonceManager.getNextNonce();
        const batch3 = nonceManager.reserveNonces(2);

        const reservedNonces = (nonceManager as any).reservedNonces;

        return {
          success: true,
          batch1: batch1,
          batch2: batch2,
          single: single,
          batch3: batch3,
          totalReserved: reservedNonces.size,
          allReserved: Array.from(reservedNonces),
        };

      } catch (error: any) {
        return {
          success: false,
          error: error.message,
          stack: error.stack
        };
      }
    });
    const result = await autoConfirmWalletIframeUntil(page, resultPromise);

    if (!result.success) {
      if (handleInfrastructureErrors(result)) {
        return;
      }
      console.error('Batch transaction test failed:', result.error);
      expect(result.success).toBe(true);
      return;
    }

    expect(result.success).toBe(true);
    expect(result.batch1).toHaveLength(3);
    expect(result.batch2).toHaveLength(2);
    expect(result.single).toBeDefined();
    expect(result.batch3).toHaveLength(2);
    expect(result.totalReserved).toBe(5); // batch2 + single + batch3
    expect(result.allReserved).toHaveLength(5);

    // Verify nonces are sequential
    const allNonces = [...result.batch1, ...result.batch2, result.single, ...result.batch3];
    const sortedNonces = allNonces.map(n => parseInt(n)).sort((a, b) => a - b);
    for (let i = 1; i < sortedNonces.length; i++) {
      expect(sortedNonces[i]).toBe(sortedNonces[i-1] + 1);
    }

    console.log('NonceManager batch transaction with real context test passed');
  });

});
