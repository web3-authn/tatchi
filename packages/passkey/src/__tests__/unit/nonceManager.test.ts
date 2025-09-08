/**
 * NonceManager Unit Tests
 *
 * Tests the robust nonce management functionality for batch transactions
 * Based on the worker_events.test.ts template structure
 */

import { test, expect } from '@playwright/test';
import { setupBasicPasskeyTest, handleInfrastructureErrors } from '../setup';

test.describe('NonceManager Unit Tests', () => {

  test.beforeEach(async ({ page }) => {
    await setupBasicPasskeyTest(page);
    await page.waitForTimeout(500);
  });

  test('NonceManager - Basic Nonce Reservation', async ({ page }) => {
    const result = await page.evaluate(async () => {
      try {
        // @ts-ignore - Runtime import
        const { NonceManager } = await import('/sdk/esm/core/nonceManager.js');

        const nonceManager = NonceManager.getInstance();
        nonceManager.clear();

        // Initialize with test data
        nonceManager.initializeUser('test-account', 'test-public-key');

        // Mock transaction context
        const mockTransactionContext = {
          nearPublicKeyStr: 'test-public-key',
          accessKeyInfo: { nonce: '100' },
          nextNonce: '101',
          txBlockHeight: '1000',
          txBlockHash: 'test-block-hash',
        };

        // Set up the manager with test data
        (nonceManager as any).transactionContext = mockTransactionContext;
        (nonceManager as any).lastNonceUpdate = Date.now();
        (nonceManager as any).lastBlockHeightUpdate = Date.now();

        // Test single nonce reservation
        const nonce = nonceManager.getNextNonce(); // should be '101'

        // Test multiple nonce reservation (continues after last reserved)
        const nonces = nonceManager.reserveNonces(3); // should be ['102','103','104']

        // Test nonce release (release '102' only)
        nonceManager.releaseNonce('102');

        // Check reserved nonces
        const reservedNonces = (nonceManager as any).reservedNonces;

        return {
          success: true,
          singleNonce: nonce,
          batchNonces: nonces,
          reservedCount: reservedNonces.size,
          hasNonce101: reservedNonces.has('101'),
          hasNonce102: reservedNonces.has('102'),
          hasNonce103: reservedNonces.has('103'),
          hasNonce104: reservedNonces.has('104'),
        };

      } catch (error: any) {
        return {
          success: false,
          error: error.message,
          stack: error.stack
        };
      }
    });

    // Handle infrastructure errors
    if (!result.success) {
      if (handleInfrastructureErrors(result)) {
        return; // Test was skipped due to infrastructure issues
      }
      console.error('NonceManager test failed:', result.error);
      expect(result.success).toBe(true);
      return;
    }

    expect(result.success).toBe(true);
    expect(result.singleNonce).toBe('101');
    expect(result.batchNonces).toEqual(['102', '103', '104']);
    expect(result.reservedCount).toBe(3); // 101 and 103,104 (102 was released)
    expect(result.hasNonce101).toBe(true);
    expect(result.hasNonce102).toBe(false); // Released
    expect(result.hasNonce103).toBe(true);
    expect(result.hasNonce104).toBe(true);

    console.log('NonceManager basic reservation test passed');
  });

  test('NonceManager - Batch Transaction Scenarios', async ({ page }) => {
    const result = await page.evaluate(async () => {
      try {
        // @ts-ignore - Runtime import
        const { NonceManager } = await import('/sdk/esm/core/nonceManager.js');

        const nonceManager = NonceManager.getInstance();
        nonceManager.clear();

        // Initialize with test data
        nonceManager.initializeUser('test-account', 'test-public-key');

        // Mock transaction context
        const mockTransactionContext = {
          nearPublicKeyStr: 'test-public-key',
          accessKeyInfo: { nonce: '200' },
          nextNonce: '201',
          txBlockHeight: '2000',
          txBlockHash: 'test-block-hash-2',
        };

        (nonceManager as any).transactionContext = mockTransactionContext;
        (nonceManager as any).lastNonceUpdate = Date.now();
        (nonceManager as any).lastBlockHeightUpdate = Date.now();

        // Test consecutive batch transactions
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

    if (!result.success) {
      if (handleInfrastructureErrors(result)) {
        return;
      }
      console.error('Batch transaction test failed:', result.error);
      expect(result.success).toBe(true);
      return;
    }

    expect(result.success).toBe(true);
    expect(result.batch1).toEqual(['201', '202', '203']);
    expect(result.batch2).toEqual(['204', '205']);
    expect(result.single).toBe('206');
    expect(result.batch3).toEqual(['207', '208']);
    expect(result.totalReserved).toBe(5); // 204, 205, 206, 207, 208
    expect(result.allReserved).toEqual(['204', '205', '206', '207', '208']);

    console.log('NonceManager batch transaction test passed');
  });

  test('NonceManager - Error Handling', async ({ page }) => {
    const result = await page.evaluate(async () => {
      try {
        // @ts-ignore - Runtime import
        const { NonceManager } = await import('/sdk/esm/core/nonceManager.js');

        const nonceManager = NonceManager.getInstance();
        nonceManager.clear();

        const errors: string[] = [];

        // Test error when no transaction context
        try {
          nonceManager.initializeUser('test-account', 'test-public-key');
          nonceManager.reserveNonces(1);
        } catch (error: any) {
          errors.push(`No context: ${error.message}`);
        }

        // Test graceful handling of releasing non-existent nonce
        try {
          nonceManager.releaseNonce('999');
        } catch (error: any) {
          errors.push(`Release error: ${error.message}`);
        }

        // Test clear functionality
        try {
          nonceManager.clear();
          const reservedCount = (nonceManager as any).reservedNonces.size;
          if (reservedCount !== 0) {
            errors.push(`Clear failed: reserved count is ${reservedCount}`);
          }
        } catch (error: any) {
          errors.push(`Clear error: ${error.message}`);
        }

        return {
          success: true,
          errors: errors,
          errorCount: errors.length,
        };

      } catch (error: any) {
        return {
          success: false,
          error: error.message,
          stack: error.stack
        };
      }
    });

    if (!result.success) {
      if (handleInfrastructureErrors(result)) {
        return;
      }
      console.error('Error handling test failed:', result.error);
      expect(result.success).toBe(true);
      return;
    }

    expect(result.success).toBe(true);
    expect(result.errorCount).toBe(1); // Only the "no context" error should occur
    expect(result.errors?.[0]).toContain('Transaction context not available');

    console.log('NonceManager error handling test passed');
  });

  test('NonceManager - Integration with PasskeyManager', async ({ page }) => {
    const result = await page.evaluate(async () => {
      try {
        const { passkeyManager, generateTestAccountId } = (window as any).testUtils;
        const testAccountId = generateTestAccountId();

        // Register and login to get a working session
        const registrationResult = await passkeyManager.registerPasskey(testAccountId);
        if (!registrationResult.success) {
          throw new Error(`Registration failed: ${registrationResult.error}`);
        }

        const loginResult = await passkeyManager.loginPasskey(testAccountId);
        if (!loginResult.success) {
          throw new Error(`Login failed: ${loginResult.error}`);
        }

        // Wait for session to settle
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Test nonce manager integration
        const nonceManager = passkeyManager.webAuthnManager.getNonceManager();

        // Get initial nonce
        const initialContext = await nonceManager.getNonceBlockHashAndHeight(passkeyManager.nearClient);

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

  test('NonceManager - Consecutive Transaction Simulation', async ({ page }) => {
    const result = await page.evaluate(async () => {
      try {
        const { passkeyManager, generateTestAccountId } = (window as any).testUtils;
        const testAccountId = generateTestAccountId();

        // Register and login
        const registrationResult = await passkeyManager.registerPasskey(testAccountId);
        if (!registrationResult.success) {
          throw new Error(`Registration failed: ${registrationResult.error}`);
        }

        const loginResult = await passkeyManager.loginPasskey(testAccountId);
        if (!loginResult.success) {
          throw new Error(`Login failed: ${loginResult.error}`);
        }

        await new Promise(resolve => setTimeout(resolve, 2000));

        const nonceManager = passkeyManager.webAuthnManager.getNonceManager();

        // Simulate consecutive transactions
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

    if (!result.success) {
      if (handleInfrastructureErrors(result)) {
        return;
      }
      console.error('Consecutive transaction test failed:', result.error);
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

    console.log('NonceManager consecutive transaction test passed');
  });

});
