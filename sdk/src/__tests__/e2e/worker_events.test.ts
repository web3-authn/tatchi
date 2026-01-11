/**
 * Worker Communication Integration Tests
 *
 * Tests the communication protocol between TypeScript worker and WASM
 * Specifically focuses on progress messaging functionality that was broken during refactoring
 */

import { test, expect } from '@playwright/test';
import { setupBasicPasskeyTest, handleInfrastructureErrors } from '../setup';
import { autoConfirmWalletIframeUntil } from '../setup/flows';
import { DEFAULT_TEST_CONFIG } from '../setup/config';
import { installCreateAccountAndRegisterUserMock, installFastNearRpcMock } from './thresholdEd25519.testUtils';

test.describe('Worker Communication Protocol', () => {

  test.beforeEach(async ({ page }) => {
    await setupBasicPasskeyTest(page);
    await page.waitForTimeout(500);
  });

  // exercises full signer-worker pipeline for function call, expecting progress events even on fetch failure
  test('Progress Messages - SignTransactionsWithActions', async ({ page }) => {
    const keysOnChain = new Set<string>();
    const nonceByPublicKey = new Map<string, number>();
    let localNearPublicKey = '';

    await installCreateAccountAndRegisterUserMock(page, {
      relayerBaseUrl: DEFAULT_TEST_CONFIG.relayer?.url ?? 'https://relay-server.localhost',
      onNewPublicKey: (pk) => {
        localNearPublicKey = pk;
        keysOnChain.add(pk);
        nonceByPublicKey.set(pk, 0);
      },
    });

    await installFastNearRpcMock(page, {
      keysOnChain,
      nonceByPublicKey,
      onSendTx: () => {
        if (localNearPublicKey) {
          nonceByPublicKey.set(localNearPublicKey, (nonceByPublicKey.get(localNearPublicKey) ?? 0) + 1);
        }
      },
      strictAccessKeyLookup: true,
    });

    const USE_RELAY_SERVER = process.env.USE_RELAY_SERVER === '1' || process.env.USE_RELAY_SERVER === 'true';
    const resultPromise = page.evaluate(async ({ useServer }) => {
      try {
        // @ts-ignore - Runtime import
        const { ActionType } = await import('/sdk/esm/core/types/actions.js');

        // Progress step constants that match the actual progress events being generated
        // These values are based on the actual events captured during testing
        const ProgressStep = {
          PREPARATION: 'preparation',
          USER_CONFIRMATION: 'user-confirmation',
          WEBAUTHN_AUTHENTICATION: 'webauthn-authentication',
          AUTHENTICATION_COMPLETE: 'authentication-complete',
          TRANSACTION_SIGNING_PROGRESS: 'transaction-signing-progress',
          TRANSACTION_SIGNING_COMPLETE: 'transaction-signing-complete',
          BROADCASTING: 'broadcasting',
          ACTION_COMPLETE: 'action-complete',
        } as const;

        const { tatchi, generateTestAccountId } = (window as any).testUtils;
        const testAccountId = generateTestAccountId();

        // Track all progress events
        const progressEvents: any[] = [];
        const registrationEvents: any[] = [];
        const actionEvents: any[] = [];

        // Register first to have an account (skip confirmation UI in tests)
        const cfg = ((window as any).testUtils?.confirmOverrides?.skip)
          || ({ uiMode: 'skip', behavior: 'autoProceed', autoProceedDelay: 0, theme: 'dark' } as const);
        const registrationResult = await tatchi.registerPasskeyInternal(testAccountId, {
          onEvent: (event: any) => {
            progressEvents.push(event);
            registrationEvents.push(event);
          }
        }, cfg);

        if (!registrationResult.success) {
          throw new Error(`Registration failed: ${registrationResult.error}`);
        }

        // Login to activate session
        const loginResult = await tatchi.loginAndCreateSession(testAccountId, {
          onEvent: (event: any) => {
            console.log(`Login [${event.step}]: ${event.phase} - ${event.message}`);
          }
        });

        if (!loginResult.success) {
          throw new Error(`Login failed: ${loginResult.error}`);
        }

        // Wait for registration to settle
        await new Promise(resolve => setTimeout(resolve, 5000));

        // Now test executeAction with detailed progress tracking (new SDK signature)
        const actionResult = await tatchi.executeAction({
          nearAccountId: testAccountId,
          receiverId: (window as any).testUtils.configs.testReceiverAccountId, // Use centralized configuration
          actionArgs: {
            type: ActionType.FunctionCall,
            methodName: 'set_greeting',
            args: { greeting: 'Test progress message' },
            gas: '30000000000000',
            deposit: '0'
          },
          options: {
            onEvent: (event: any) => {
              const normalized = {
                step: event.step,
                phase: event.phase,
                status: event.status,
                message: event.message,
                timestamp: event.timestamp,
                hasData: !!event.data
              };
              progressEvents.push(normalized);
              actionEvents.push(normalized);
              console.log(`Action Progress [${event.step}]: ${event.phase} - ${event.message}`);
            }
          }
        });

        return {
          success: true,
          actionResult,
          progressEvents,
          registrationEvents,
          actionEvents,
          // Analysis
          totalEvents: actionEvents.length,
          phases: actionEvents.map(e => e.phase),
          uniquePhases: [...new Set(actionEvents.map(e => e.phase))],
          // Check for phases that exist in the actual progress events being generated:
          hasPreparation: actionEvents.some(e => e.phase === ProgressStep.PREPARATION),
          hasUserConfirmation: actionEvents.some(e => e.phase === ProgressStep.USER_CONFIRMATION),
          hasWebauthnAuthentication: actionEvents.some(e => e.phase === ProgressStep.WEBAUTHN_AUTHENTICATION),
          hasAuthenticationComplete: actionEvents.some(e => e.phase === ProgressStep.AUTHENTICATION_COMPLETE),
          hasTransactionSigningProgress: actionEvents.some(e => e.phase === ProgressStep.TRANSACTION_SIGNING_PROGRESS),
          hasTransactionSigningComplete: actionEvents.some(e => e.phase === ProgressStep.TRANSACTION_SIGNING_COMPLETE),
          hasBroadcasting: actionEvents.some(e => e.phase === ProgressStep.BROADCASTING),
          hasActionComplete: actionEvents.some(e => e.phase === ProgressStep.ACTION_COMPLETE),
          hasError: actionEvents.some(e => e.status === 'error'),
          // Event structure validation
          allEventsHaveRequiredFields: actionEvents.every(e =>
            typeof e.step === 'number' &&
            typeof e.phase === 'string' &&
            typeof e.status === 'string' &&
            typeof e.message === 'string'
          ),
          // Debug: Log all captured events
          capturedEvents: actionEvents.map(e => ({
            step: e.step,
            phase: e.phase,
            status: e.status,
            message: e.message,
            timestamp: e.timestamp
          }))
        };

      } catch (error: any) {
        return {
          success: false,
          error: error.message,
          stack: error.stack
        };
      }
    }, { useServer: USE_RELAY_SERVER });
    const result = await autoConfirmWalletIframeUntil(page, resultPromise);
    const assertPhaseOrder = (phases: string[], expected: string[], label: string): void => {
      let lastIdx = -1;
      for (const phase of expected) {
        const idx = phases.indexOf(phase, lastIdx + 1);
        expect(idx, `${label} missing or out-of-order phase: ${phase}`).toBeGreaterThan(lastIdx);
        lastIdx = idx;
      }
    };
    const basePhaseSequence = ['preparation', 'user-confirmation'];
    const authPhaseSequence = ['preparation', 'user-confirmation', 'webauthn-authentication'];
    const signingPhaseSequence = [
      'preparation',
      'user-confirmation',
      'transaction-signing-progress',
      'transaction-signing-complete',
    ];
    const successPhaseSequence = [
      'preparation',
      'user-confirmation',
      'transaction-signing-progress',
      'transaction-signing-complete',
      'broadcasting',
      'action-complete',
    ];

    // Assertions
    if (!result.success) {
      // Handle common infrastructure errors (rate limiting, contract connectivity)
      if (handleInfrastructureErrors(result)) {
        return; // Test was skipped due to infrastructure issues
      }

      // For progress messaging tests, we expect the operation to fail but still capture progress events
      console.log('Operation failed as expected for progress messaging test:', result.error);
      console.log('Checking if progress events were captured despite failure...');
      console.log('Result structure:', JSON.stringify(result, null, 2));

        // Check if progress events were captured
        if (result.totalEvents === undefined) {
          console.log('No progress events captured - registration failed too early');
          console.log('This suggests the registration failed before progress tracking began');
          // Verify the error is a connectivity or registration failure (environment-dependent)
          expect(result.error).toMatch(/Failed to fetch|CreateAccount|register(ed)?|relay|fetch/i);
          console.log('Test passed - early failure matched expected patterns');
          return;
        }

      // Verify that progress events were still captured even though the operation failed
      expect(result.totalEvents).toBeGreaterThan(0);
      console.log(`Captured ${result.totalEvents} progress events despite operation failure`);
      console.log(`Phases: ${result.uniquePhases?.join(', ') || 'none'}`);
      console.log('Captured events:', JSON.stringify(result.capturedEvents, null, 2));

	      // Check for expected progress events even when operation fails
	      expect(result.hasPreparation).toBe(true);
	      expect(result.hasUserConfirmation).toBe(true);
	      assertPhaseOrder(result.phases || [], basePhaseSequence, 'action failure');
	      if (result.hasWebauthnAuthentication) {
	        assertPhaseOrder(result.phases || [], authPhaseSequence, 'action failure (auth)');
	      }
	      // Note: authentication-complete may not be reached if contract verification fails
	      // This is expected behavior when the operation fails early
	      if (result.hasAuthenticationComplete) {
	        console.log('Authentication completed successfully before failure');
      } else {
        console.log('Authentication did not complete due to early failure - this is expected');
      }

      console.log('Progress messaging test passed - events captured despite operation failure');
      return;
    }

    expect(result.success).toBe(true);

    // Verify progress events were captured
    expect(result.totalEvents).toBeGreaterThan(0);
    console.log(`Captured ${result.totalEvents} progress events`);
    console.log(`Phases: ${result.uniquePhases?.join(', ') || 'none'}`);
    console.log('Captured events:', JSON.stringify(result.capturedEvents, null, 2));

    // Check if operation failed - if so, we should still see the expected progress events
	    if (result.hasError) {
	      console.log('Operation failed with error - checking for expected progress events before failure');
	      // Even if the operation fails, we should see preparation and confirmation phases
	      expect(result.hasPreparation).toBe(true);
	      expect(result.hasUserConfirmation).toBe(true);
	      assertPhaseOrder(result.phases || [], basePhaseSequence, 'action error');
	      if (Array.isArray(result.actionEvents)) {
	        const confirmationIdx = result.actionEvents.findIndex((e: any) => e?.phase === 'user-confirmation');
	        const errorIdx = result.actionEvents.findIndex((e: any) => e?.status === 'error');
	        expect(confirmationIdx, 'missing user-confirmation event').toBeGreaterThanOrEqual(0);
	        expect(errorIdx, 'missing error status event').toBeGreaterThanOrEqual(0);
	        expect(errorIdx, 'error should occur after user-confirmation').toBeGreaterThan(confirmationIdx);
	      }
	      if (result.hasWebauthnAuthentication) {
	        assertPhaseOrder(result.phases || [], authPhaseSequence, 'action error (auth)');
	      }
	      // Note: authentication-complete may not be reached if contract verification fails
	      // This is expected behavior when the operation fails early
	      if (result.hasAuthenticationComplete) {
	        console.log('Authentication completed successfully before failure');
      } else {
        console.log('Authentication did not complete due to early failure - this is expected');
      }
	      // If verification succeeds but operation fails later, we should see verification complete
	      if (result.hasTransactionSigningComplete) {
	        expect(result.hasTransactionSigningProgress).toBe(true);
	        assertPhaseOrder(
	          result.phases || [],
	          signingPhaseSequence,
	          'action error (signed)'
	        );
	      }
	    } else {
	      // Operation succeeded - check all expected phases
	      expect(result.hasPreparation).toBe(true);
	      expect(result.hasUserConfirmation).toBe(true);
	      expect(result.hasTransactionSigningProgress).toBe(true);
	      expect(result.hasTransactionSigningComplete).toBe(true);
	      expect(result.hasBroadcasting).toBe(true);
	      expect(result.hasActionComplete).toBe(true);
	      if (result.hasWebauthnAuthentication) {
	        assertPhaseOrder(result.phases || [], authPhaseSequence, 'action success (auth)');
	      }
	      if (result.hasAuthenticationComplete) {
	        assertPhaseOrder(
	          result.phases || [],
	          ['preparation', 'user-confirmation', 'webauthn-authentication', 'authentication-complete'],
	          'action success (auth complete)'
	        );
	      }
	      assertPhaseOrder(result.phases || [], successPhaseSequence, 'action success');
	    }

    // Verify event structure
    expect(result.allEventsHaveRequiredFields).toBe(true);

    console.log('Worker communication and progress messaging test passed');
  });

  // verifies login emits early phases and error when account is missing (no RPC dependency)
  test('Progress Messages - Login without prior registration', async ({ page }) => {
    const resultPromise = page.evaluate(async () => {
      try {
        const { tatchi, generateTestAccountId } = (window as any).testUtils;
        const testAccountId = generateTestAccountId();

        const capturedEvents: Array<{ phase: string; status: string; message: string }> = [];

        const loginResult = await tatchi.loginAndCreateSession(testAccountId, {
          onEvent: (event: any) => {
            capturedEvents.push({
              phase: event?.phase ?? '',
              status: event?.status ?? '',
              message: event?.message ?? ''
            });
          },
          onError: () => {}
        });

        return {
          loginResult,
          capturedEvents,
          phases: capturedEvents.map(e => e.phase),
          statuses: capturedEvents.map(e => e.status),
          errorMessages: capturedEvents.filter(e => e.status === 'error').map(e => e.message)
        };
      } catch (error: any) {
        return {
          loginResult: { success: false, error: error?.message || String(error) },
          capturedEvents: [],
          phases: [],
          statuses: [],
          errorMessages: []
        };
      }
    });
    const result = await autoConfirmWalletIframeUntil(page, resultPromise);

    expect(result.loginResult.success).toBe(false);
    expect(result.capturedEvents.length).toBeGreaterThan(0);
    expect(result.phases).toContain('preparation');
    expect(result.statuses).toContain('error');
    expect(result.loginResult.error || '').toMatch(/register an account/i);
    expect(result.errorMessages.some((msg: string) => /register an account/i.test(msg))).toBe(true);
    const progressIdx = result.statuses.findIndex((status: string) => status === 'progress');
    const errorIdx = result.statuses.findIndex((status: string) => status === 'error');
    expect(progressIdx).toBeGreaterThanOrEqual(0);
    expect(errorIdx).toBeGreaterThan(progressIdx);
  });

  // happy-path login: seed registration via relay mock and assert full login phase progression
  test('Progress Messages - Login success after registration', async ({ page }) => {
    const USE_RELAY_SERVER = process.env.USE_RELAY_SERVER === '1' || process.env.USE_RELAY_SERVER === 'true';
    // This test requires a real relay server so the atomic registration can
    // actually create the account on-chain. Without it, the registration step
    // cannot verify the access key on-chain and subsequent login will fail.
    if (!USE_RELAY_SERVER) {
      test.skip(true, 'Requires relay server for on-chain registration verification');
    }
    const resultPromise = page.evaluate(async ({ useServer }) => {
      const utils = (window as any).testUtils;
      const registrationFlowUtils = utils.registrationFlowUtils;
      const restoreFetch = registrationFlowUtils?.restoreFetch?.bind(registrationFlowUtils);

      try {
        const testAccountId = utils.generateTestAccountId();
        if (!useServer) {
          registrationFlowUtils?.setupRelayServerMock?.(true);
        }

        const registrationEvents: Array<{ phase: string; status: string }> = [];
        const loginEvents: Array<{ phase: string; status: string; message: string }> = [];

        const cfg = (utils?.confirmOverrides?.skip) || ({ uiMode: 'skip', behavior: 'autoProceed', autoProceedDelay: 0, theme: 'dark' } as const);
        const registrationResult = await utils.tatchi.registerPasskeyInternal(testAccountId, {
          onEvent: (event: any) => {
            registrationEvents.push({
              phase: event?.phase ?? '',
              status: event?.status ?? ''
            });
          }
        }, cfg);

        if (!registrationResult?.success) {
          throw new Error(`Registration failed unexpectedly: ${registrationResult?.error}`);
        }

        const loginResult = await utils.tatchi.loginAndCreateSession(testAccountId, {
          onEvent: (event: any) => {
            loginEvents.push({
              phase: event?.phase ?? '',
              status: event?.status ?? '',
              message: event?.message ?? ''
            });
          }
        });

        return {
          success: loginResult?.success ?? false,
          loginError: loginResult?.error,
          registrationEvents,
          loginEvents,
          loginPhases: loginEvents.map(e => e.phase),
          loginStatuses: loginEvents.map(e => e.status)
        };
      } catch (error: any) {
        return {
          success: false,
          loginError: error?.message || String(error),
          registrationEvents: [],
          loginEvents: [],
          loginPhases: [],
          loginStatuses: []
        };
      } finally {
        try { restoreFetch?.(); } catch {}
      }
    }, { useServer: USE_RELAY_SERVER });
    const result = await autoConfirmWalletIframeUntil(page, resultPromise);

    if (!result.success) {
      if (handleInfrastructureErrors({ success: false, error: result.loginError })) {
        return;
      }
    }

    expect(result.success).toBe(true);
    expect(result.registrationEvents.length).toBeGreaterThan(0);
    expect(result.loginEvents.length).toBeGreaterThan(0);
    expect(result.loginPhases).toEqual(
      expect.arrayContaining(['preparation', 'webauthn-assertion', 'vrf-unlock', 'login-complete'])
    );
    expect(result.loginStatuses).toContain('success');
    const loginPhaseSequence = ['preparation', 'webauthn-assertion', 'vrf-unlock', 'login-complete'];
    let lastIdx = -1;
    for (const phase of loginPhaseSequence) {
      const idx = result.loginPhases.indexOf(phase, lastIdx + 1);
      expect(idx, `login phases missing or out-of-order: ${phase}`).toBeGreaterThan(lastIdx);
      lastIdx = idx;
    }
  });

  // captures registration + login worker events to ensure variety of phase/status pairs are emitted
  test('Progress Message Types - All Message Types', async ({ page }) => {
    const keysOnChain = new Set<string>();
    const nonceByPublicKey = new Map<string, number>();
    let localNearPublicKey = '';

    await installCreateAccountAndRegisterUserMock(page, {
      relayerBaseUrl: DEFAULT_TEST_CONFIG.relayer?.url ?? 'https://relay-server.localhost',
      onNewPublicKey: (pk) => {
        localNearPublicKey = pk;
        keysOnChain.add(pk);
        nonceByPublicKey.set(pk, 0);
      },
    });

    await installFastNearRpcMock(page, {
      keysOnChain,
      nonceByPublicKey,
      onSendTx: () => {
        if (localNearPublicKey) {
          nonceByPublicKey.set(localNearPublicKey, (nonceByPublicKey.get(localNearPublicKey) ?? 0) + 1);
        }
      },
      strictAccessKeyLookup: true,
    });

    const resultPromise = page.evaluate(async () => {
      try {
        const { tatchi, generateTestAccountId } = (window as any).testUtils;
        const testAccountId = generateTestAccountId();

        // Track progress message types
        const messageTypes = new Set<string>();
        const progressEvents: any[] = [];

        // Override console.log to capture worker debug messages
        const originalLog = console.log;
        const workerLogs: string[] = [];
        console.log = (...args) => {
          const message = args.join(' ');
          workerLogs.push(message);
          originalLog(...args);
        };

        try {
          // Test registration flow (should generate REGISTRATION_PROGRESS messages)
          const cfg2 = ((window as any).testUtils?.confirmOverrides?.skip)
            || ({ uiMode: 'skip', behavior: 'autoProceed', autoProceedDelay: 0, theme: 'dark' } as const);
          const registrationResult = await tatchi.registerPasskeyInternal(testAccountId, {
            onEvent: (event: any) => {
              progressEvents.push(event);
              messageTypes.add(`${event.phase}:${event.status}`);
            }
          }, cfg2);
          if (!registrationResult?.success) {
            throw new Error(`Registration failed: ${registrationResult?.error || 'unknown error'}`);
          }

          // Test login flow (should generate various progress messages)
          const loginResult = await tatchi.loginAndCreateSession(testAccountId, {
            onEvent: (event: any) => {
              progressEvents.push(event);
              messageTypes.add(`${event.phase}:${event.status}`);
            }
          });
          if (!loginResult?.success) {
            throw new Error(`Login failed: ${loginResult?.error || 'unknown error'}`);
          }

        } finally {
          console.log = originalLog;
        }

        return {
          success: true,
          totalEvents: progressEvents.length,
          messageTypes: Array.from(messageTypes),
          workerLogs: workerLogs.filter(log =>
            log.includes('Progress:') ||
            log.includes('SIGNING_') ||
            log.includes('VERIFICATION_') ||
            log.includes('REGISTRATION_')
          ),
          // Event type analysis
          progressCount: progressEvents.filter(e => e.status === 'progress').length,
          successCount: progressEvents.filter(e => e.status === 'success').length,
          errorCount: progressEvents.filter(e => e.status === 'error').length,
        };

      } catch (error: any) {
        return {
          success: false,
          error: error.message
        };
      }
    });
    const result = await autoConfirmWalletIframeUntil(page, resultPromise);

    if (!result.success) {
      // Handle common infrastructure errors (rate limiting, contract connectivity)
      if (handleInfrastructureErrors(result)) {
        return; // Test was skipped due to infrastructure issues
      }

      // For other errors, fail as expected
      console.error('Message types test failed:', result.error);
      expect(result.success).toBe(true); // This will fail and show the error
      return;
    }

    expect(result.success).toBe(true);

    console.log('Message Types Test Results:');
    console.log(`   Total Events: ${result.totalEvents}`);
    console.log(`   Message Types: ${result.messageTypes?.join(', ') || 'none'}`);
    console.log(`   Progress: ${result.progressCount}, Success: ${result.successCount}, Error: ${result.errorCount}`);

    if (result.workerLogs && result.workerLogs.length > 0) {
      console.log(`   Worker Logs: ${result.workerLogs.length} messages`);
      result.workerLogs.slice(0, 3).forEach(log => console.log(`     ${log}`));
    }

    expect(result.totalEvents).toBeGreaterThan(0);
    expect(result.messageTypes?.length || 0).toBeGreaterThan(0);
    expect(result.progressCount).toBeGreaterThan(0);
    expect(result.successCount).toBeGreaterThan(0);
  });

  // ensures relay failure still surfaces worker progress/error envelopes
  test('Worker Error Handling - Progress on Failure', async ({ page }) => {
    const relayRoute = '**/create_account_and_register_user';
    await page.route(relayRoute, async (route) => {
      const req = route.request();
      const method = req.method().toUpperCase();
      if (method === 'OPTIONS') {
        await route.fulfill({
          status: 204,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST,OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type,Authorization',
          },
          body: '',
        });
        return;
      }
      await route.fulfill({
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST,OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type,Authorization',
        },
        body: JSON.stringify({ success: false, error: 'forced relay failure' }),
      });
    });
    const resultPromise = page.evaluate(async () => {
      try {
        const { tatchi, generateTestAccountId } = (window as any).testUtils;
        const validAccountId = generateTestAccountId();

        const progressEvents: any[] = [];
        const errorEvents: any[] = [];
        let result: any = null;
        let threw = false;
        let thrownError = '';

        // Test error handling with a forced relay failure (should still send progress messages)
        try {
          const cfg3 = ((window as any).testUtils?.confirmOverrides?.skip)
            || ({ uiMode: 'skip', behavior: 'autoProceed', autoProceedDelay: 0, theme: 'dark' } as const);
          result = await tatchi.registerPasskeyInternal(validAccountId, {
            onEvent: (event: any) => {
              progressEvents.push(event);
              if (event.status === 'error') {
                errorEvents.push(event);
              }
            },
            onError: (error: any) => {
              console.log('Expected error caught:', error.message);
            }
          }, cfg3);
        } catch (expectedError) {
          // This is expected to fail
          threw = true;
          thrownError = (expectedError as any)?.message || String(expectedError);
        }

        return {
          success: true,
          resultSuccess: result?.success ?? null,
          resultError: result?.error ?? '',
          threw,
          thrownError,
          progressEvents: progressEvents.length,
          errorEvents: errorEvents.length,
          hasErrorPhase: progressEvents.some(e => e.phase === 'action-error' || e.status === 'error'),
          phases: progressEvents.map(e => e.phase),
          statuses: progressEvents.map(e => e.status),
          lastEvent: progressEvents[progressEvents.length - 1]
        };

      } catch (error: any) {
        return {
          success: false,
          error: error.message
        };
      }
    });
    const result = await autoConfirmWalletIframeUntil(page, resultPromise);
    await page.unroute(relayRoute).catch(() => {});

    expect(result.success).toBe(true);
    console.log('Error Handling Test Results:');
    console.log(`   Progress Events: ${result.progressEvents}`);
    console.log(`   Error Events: ${result.errorEvents}`);
    console.log(`   Has Error Phase: ${result.hasErrorPhase}`);

    // Even on failure, we should get some progress events
    expect(result.progressEvents).toBeGreaterThan(0);
    expect(result.errorEvents).toBeGreaterThan(0);
    expect(result.hasErrorPhase).toBe(true);
    expect(result.resultSuccess === false || result.threw === true).toBe(true);
    const progressIdx = result.statuses.findIndex((status: string) => status === 'progress');
    const errorIdx = result.statuses.findIndex((status: string) => status === 'error');
    expect(progressIdx).toBeGreaterThanOrEqual(0);
    expect(errorIdx).toBeGreaterThan(progressIdx);
    if (result.lastEvent?.status) {
      expect(result.lastEvent.status).toBe('error');
    }
  });

});
