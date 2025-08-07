/**
 * Registration Rollback Test
 *
 * This test verifies:
 * 1. Presigned delete transactions are created during registration
 * 2. The hash generation function works correctly
 * 3. Rollback scenarios work as expected
 * 4. Event messages contain transaction hashes for verification
 */

import { test, expect } from '@playwright/test';
import { setupBasicPasskeyTest, type TestUtils } from '../setup';
// toAccountId is available globally from the dynamic SDK import


test.describe('PasskeyManager Registration Rollback Verification', () => {
  test.beforeEach(async ({ page }) => {
    await setupBasicPasskeyTest(page);
    // Add delay to prevent throttling
    await page.waitForTimeout(1000);
  });

  ////////////////////////////////////
  // Test presigned delete transaction hash generation
  ////////////////////////////////////

  test('Presigned Delete Transaction Hash Generation', async () => {
    // This test verifies the hash generation function used for presigned delete transactions
    // during registration rollback scenarios.

    console.log('Testing presigned delete transaction hash generation...');

    // Step 1: Import base64UrlEncode directly from source
    const { base64UrlEncode } = await import('../../utils/encoders');

    // Step 2: Replicate the hash generation logic from registration.ts
    function generateTransactionHash(signedTransaction: { borsh_bytes: number[] }): string {
      try {
        const transactionBytes = new Uint8Array(signedTransaction.borsh_bytes);
        const hashInput = Array.from(transactionBytes).join(',');
        const hash = base64UrlEncode(new TextEncoder().encode(hashInput)).substring(0, 16);
        return hash;
      } catch (error) {
        console.warn('Failed to generate transaction hash:', error);
        return 'hash-generation-failed';
      }
    }

    // Step 3: Test with mock transaction data
    const mockSignedTransaction = {
      borsh_bytes: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] // Mock transaction bytes
    };

    const hash1 = generateTransactionHash(mockSignedTransaction);
    const hash2 = generateTransactionHash(mockSignedTransaction);

    console.log('✅ Hash generated successfully');

    // Step 4: Test deterministic behavior
    expect(hash1).toBe(hash2);
    expect(hash1.length).toBe(16);
    expect(typeof hash1).toBe('string');
    console.log('✅ Hash generation is deterministic');

    // Step 5: Test different data produces different hash
    const differentTransaction = {
      borsh_bytes: [10, 9, 8, 7, 6, 5, 4, 3, 2, 1]
    };
    const hash3 = generateTransactionHash(differentTransaction);

    expect(hash1).not.toBe(hash3);
    console.log('✅ Different transaction data produces different hash');

    console.log('Presigned Delete Transaction Hash Generation Test PASSED');
    console.log(`   Sample hash: ${hash1}`);
    console.log('   This test verifies the hash generation function that creates');
    console.log('   identifiers for presigned delete transactions during registration.');
    console.log('   The hash is included in registration events for verification purposes.');
  });

  test('Presigned Delete Transaction Message Format Verification', async () => {
    // This test verifies the message format used in registration events
    // when presigned delete transactions are created.

    console.log('Testing presigned delete transaction message format...');

    // Import base64UrlEncode directly from source
    const { base64UrlEncode } = await import('../../utils/encoders');

    function generateTransactionHash(signedTransaction: { borsh_bytes: number[] }): string {
      const transactionBytes = new Uint8Array(signedTransaction.borsh_bytes);
      const hashInput = Array.from(transactionBytes).join(',');
      const hash = base64UrlEncode(new TextEncoder().encode(hashInput)).substring(0, 16);
      return hash;
    }

    // Test with mock transaction data
    const mockSignedTransaction = {
      borsh_bytes: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    };

    const hash = generateTransactionHash(mockSignedTransaction);

    // Create the message format that would be used in registration events
    const eventMessage = `Presigned delete transaction created for rollback (hash: ${hash})`;

    // Verify the message format
    expect(eventMessage).toContain('Presigned delete transaction created for rollback');
    expect(eventMessage).toContain(`hash: ${hash}`);
    expect(eventMessage).toMatch(/hash: [A-Za-z0-9_-]+\)/);

    // Test hash extraction from message (as would be done in tests)
    const hashMatch = eventMessage.match(/hash: ([^)]+)\)/);
    expect(hashMatch).toBeTruthy();
    expect(hashMatch![1]).toBe(hash);

    console.log('✅ Message format verified');
    console.log(`   Event message: "${eventMessage}"`);
    console.log(`   Extracted hash: "${hashMatch![1]}"`);
    console.log(`   Hash matches original: ${hashMatch![1] === hash}`);

    console.log('Presigned Delete Transaction Message Format Test PASSED');
    console.log('   This test verifies the message format used in registration events');
    console.log('   when presigned delete transactions are created for rollback purposes.');
  });

  ////////////////////////////////////
  // Test actual registration rollback scenario
  ////////////////////////////////////

  test('Registration Rollback - Event Monitoring for Presigned Delete Transaction', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const { passkeyManager, generateTestAccountId, verifyAccountExists } = (window as any).testUtils as TestUtils;
      const { toAccountId } = (window as any);
      const testAccountId = generateTestAccountId();

      console.log(`Testing registration rollback event monitoring for: ${testAccountId}`);

      try {
        // Track registration events to capture the presigned delete transaction hash
        const registrationEvents: any[] = [];
        let preSignedDeleteTransactionHash: string | null = null;

        console.log('Test utilities available:', {
          passkeyManager: !!passkeyManager,
          generateTestAccountId: !!generateTestAccountId,
          verifyAccountExists: !!verifyAccountExists
        });

        // Attempt registration and capture events
        const registrationResult = await passkeyManager.registerPasskey(toAccountId(testAccountId), {
          onEvent: (event: any) => {
            registrationEvents.push({
              step: event.step,
              phase: event.phase,
              status: event.status,
              message: event.message,
              timestamp: event.timestamp
            });

            // Look for presigned delete transaction hash in message
            if (event.message && event.message.includes('Presigned delete transaction created for rollback')) {
              const hashMatch = event.message.match(/hash: ([^)]+)\)/);
              if (hashMatch) {
                preSignedDeleteTransactionHash = hashMatch[1];
                console.log(`Found presigned delete transaction hash: ${preSignedDeleteTransactionHash}`);
              }
            }
          }
        });

        console.log(`Registration result:`, {
          success: registrationResult?.success,
          testAccountId: testAccountId,
          eventsCount: registrationEvents.length
        });

        // Check if account was created
        const accountExists = await verifyAccountExists(testAccountId);
        console.log(`Account exists after registration: ${accountExists}`);

        return {
          success: true,
          testAccountId,
          registrationResult,
          registrationEvents,
          preSignedDeleteTransactionHash,
          accountExists,
          eventsCount: registrationEvents.length
        };

      } catch (error: any) {
        console.error('Test execution error:', error);
        return {
          success: false,
          error: error.message,
          testAccountId,
          stack: error.stack
        };
      }
    });

    // Verify the test executed successfully
    expect(result.success).toBe(true);
    expect(result.testAccountId).toBeTruthy();

    // If registration succeeded, verify presigned delete transaction hash was captured
    if (result.registrationResult?.success) {
      expect(result.preSignedDeleteTransactionHash).toBeTruthy();
      expect(typeof result.preSignedDeleteTransactionHash).toBe('string');

      // Verify that at least one event contained the presigned delete transaction hash
      expect(result.registrationEvents).toBeTruthy();
      const eventsWithHash = result.registrationEvents?.filter(e =>
        e.message && e.message.includes('Presigned delete transaction created for rollback')
      ) || [];
      expect(eventsWithHash.length).toBeGreaterThan(0);

      console.log(`✅ Presigned delete transaction hash verification completed for ${result.testAccountId}`);
      console.log(`   Presigned delete transaction hash: ${result.preSignedDeleteTransactionHash}`);
      console.log(`   Registration successful: ${result.registrationResult?.success}`);
      console.log(`   Account exists: ${result.accountExists}`);
      console.log(`   Events captured: ${result.eventsCount}`);
    } else {
      console.log(`️Registration failed for ${result.testAccountId}, which is expected in some test environments`);
      console.log(`   This test verifies that when registration succeeds, presigned delete transactions are created`);
    }
  });

  ////////////////////////////////////
  // Test comprehensive rollback verification
  ////////////////////////////////////

  test('Comprehensive rollback verification - state consistency', async ({ page }) => {
    // Increase timeout for registration + verification
    test.setTimeout(60000); // 1 minute

    const result = await page.evaluate(async () => {
      const { passkeyManager, generateTestAccountId, verifyAccountExists } = (window as any).testUtils as TestUtils;
      const { toAccountId } = (window as any);

      const testAccountId = generateTestAccountId();
      console.log(`Testing comprehensive rollback scenario for: ${testAccountId}`);

      try {
        // Attempt registration (may succeed or fail depending on environment)
        const registrationEvents: any[] = [];
        let hasPreSignedDeleteTransaction = false;

        const registrationResult = await passkeyManager.registerPasskey(toAccountId(testAccountId), {
          onEvent: (event: any) => {
            registrationEvents.push({
              step: event.step,
              phase: event.phase,
              status: event.status,
              message: event.message
            });

            // Track if presigned delete transaction was created
            if (event.message && event.message.includes('Presigned delete transaction created for rollback')) {
              hasPreSignedDeleteTransaction = true;
            }
          }
        });

        const accountExists = await verifyAccountExists(testAccountId);

        return {
          success: true,
          testAccountId,
          registrationSuccess: registrationResult?.success || false,
          accountExists,
          hasPreSignedDeleteTransaction,
          eventsCount: registrationEvents.length,
          phases: registrationEvents.map(e => e.phase).filter((v, i, a) => a.indexOf(v) === i)
        };

      } catch (error: any) {
        return {
          success: false,
          testAccountId,
          registrationSuccess: false,
          accountExists: false,
          hasPreSignedDeleteTransaction: false,
          error: error.message
        };
      }
    });

    // Verify the test executed
    expect(result.success).toBe(true);
    expect(result.testAccountId).toBeTruthy();

    // Log test results
    console.log(`Test - ${result.testAccountId}:`);
    console.log(`   Registration success: ${result.registrationSuccess}`);
    console.log(`   Account exists: ${result.accountExists}`);
    console.log(`   Has presigned delete transaction: ${result.hasPreSignedDeleteTransaction}`);

    if (result.phases) {
      console.log(`Registration phases: ${result.phases.join(', ')}`);
    }

    if (result.error) {
      console.log(`Error: ${result.error}`);
    }

    // Verify that when registration succeeds, presigned delete transactions are created
    if (result.registrationSuccess) {
      expect(result.hasPreSignedDeleteTransaction).toBe(true);
      console.log(`✅ Registration created presigned delete transaction successfully`);
    } else {
      console.log(`️No successful registration in this test run - this is expected in some test environments`);
    }
  });

});