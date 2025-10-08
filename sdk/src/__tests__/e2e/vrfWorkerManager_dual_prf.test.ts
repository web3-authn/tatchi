/**
 * VRF Worker Manager Dual PRF Integration Test
 *
 * This test verifies VRF Worker Manager functionality:
 * - Real WASM VRF worker operations
 * - VRF keypair generation, encryption, and derivation
 * - Dual PRF deterministic derivation of keys
 * - Cross-worker session management and state consistency
 *
 */

import { test, expect, Page } from '@playwright/test';
import { setupBasicPasskeyTest } from '../setup';
import { BUILD_PATHS } from '@build-paths';
import type { VrfWorkerManager } from '../../core/WebAuthnManager/VrfWorkerManager';
import type { AccountId } from '../../core/types/accountIds';
import { WebAuthnAuthenticationCredential } from '../../core/types/webauthn';

// Test configuration
const TEST_CONFIG = {
  ACCOUNT_ID: 'vrf-test-account.testnet',
  VRF_INPUT_PARAMS: {
    userId: 'vrf-test-account.testnet',
    rpId: 'localhost',
    blockHeight: '12345',
    blockHash: '11111111111111111111111111111111111111111111', // Simple valid base58 string (all 1s, decodes to zeros)
  },
  MOCK_PRF_OUTPUT: 'dGVzdC1wcmYtb3V0cHV0LTMyLWJ5dGVzLWZvci10ZXN0aW5n', // base64url: 'test-prf-output-32-bytes-for-testing'
  VRF_WORKER_URL: BUILD_PATHS.TEST_WORKERS.VRF
};

const ensureBase64Utils = async (page: Page): Promise<void> => {
  await page.evaluate(() => {
    if (typeof (window as any).base64UrlEncode !== 'function') {
      (window as any).base64UrlEncode = (value: ArrayBufferLike | ArrayBufferView): string => {
        const buffer = value instanceof ArrayBuffer ? new Uint8Array(value) : new Uint8Array((value as ArrayBufferView).buffer);
        let binary = '';
        for (let i = 0; i < buffer.length; i++) {
          binary += String.fromCharCode(buffer[i]);
        }
        return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      };
    }
    if (typeof (window as any).base64UrlDecode !== 'function') {
      (window as any).base64UrlDecode = (value: string): Uint8Array => {
        const padded = value.replace(/-/g, '+').replace(/_/g, '/');
        const padding = padded.length % 4 ? 4 - (padded.length % 4) : 0;
        const base64 = padded + '='.repeat(padding);
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        return bytes;
      };
    }
  });
};

// Note: Mock credential creation functions are defined inside test evaluations
// to ensure they're available in the browser context

test.describe('VRF Worker Manager Integration Test', () => {

  test.beforeEach(async ({ page }) => {
    await setupBasicPasskeyTest(page);
    // Add delay to prevent worker initialization conflicts
    await page.waitForTimeout(1000);
    await ensureBase64Utils(page);
    const base64Type = await page.evaluate(() => typeof (window as any).base64UrlEncode);
    console.log('base64UrlEncode typeof:', base64Type);
    const webAuthnUtilKeys = await page.evaluate(() => Object.keys(((window as any).testUtils?.webAuthnUtils) || {}));
    console.log('webAuthnUtils keys:', webAuthnUtilKeys);
  });

  // ensures VRF worker surfaces descriptive logs when configuration is incomplete
  test('VRF Worker Manager - Debug Error Logging', async ({ page }) => {
    const result = await page.evaluate(async (testConfig) => {
      try {
        console.log('=== DEBUG TEST START ===');
        console.log('Current URL:', window.location.href);
        console.log('Testing VRF Worker Manager import from built SDK...');
        // Import VrfWorkerManager directly from its built module
        // @ts-ignore - Runtime import path
        const { VrfWorkerManager } = await import('/sdk/esm/core/WebAuthnManager/VrfWorkerManager/index.js');
        // @ts-ignore - Runtime import path
        const { serializeAuthenticationCredentialWithPRF } = await import('/sdk/esm/core/WebAuthnManager/credentialsHelpers.js');
        console.log('serializeAuthenticationCredentialWithPRF typeof (browser):', typeof serializeAuthenticationCredentialWithPRF);
        const vrfWorkerManager = new VrfWorkerManager({
          vrfWorkerUrl: testConfig.VRF_WORKER_URL,
          workerTimeout: 15000,
          debug: true
        }) as VrfWorkerManager;
        console.log('VrfWorkerManager created successfully');
        await vrfWorkerManager.initialize();
        console.log('VrfWorkerManager initialized successfully');

        return { success: true, message: 'All steps completed' };

      } catch (error: any) {
        console.error('=== ERROR DETAILS ===');
        console.error('Full error object:', error);
        return {
          success: false,
          error: error.message,
          stack: error.stack,
          name: error.name,
          fullError: String(error)
        };
      }
    }, TEST_CONFIG);

    console.log('Test result:', result);
    // Don't add expectations - just log the result
  });

  ////////////////////////////////////
  // Test VRF Worker Manager Initialization
  ////////////////////////////////////

  // verifies the parent thread can initialize the VRF worker and exchange basic messages
  test('VRF Worker Manager - Initialization and Communication', async ({ page }) => {
    const result = await page.evaluate(async (testConfig) => {
      try {
        // Import VRF Worker Manager from built SDK
        // @ts-ignore - Runtime import path
        const { VrfWorkerManager } = await import('/sdk/esm/core/WebAuthnManager/VrfWorkerManager/index.js');
        // @ts-ignore - Runtime import path
        const { serializeAuthenticationCredentialWithPRF } = await import('/sdk/esm/core/WebAuthnManager/credentialsHelpers.js');
        console.log('serializeAuthenticationCredentialWithPRF typeof (browser):', typeof serializeAuthenticationCredentialWithPRF);
        console.log('Testing VRF Worker Manager initialization...');
        // Create VRF Worker Manager with test configuration
        const vrfWorkerManager = new VrfWorkerManager({
          vrfWorkerUrl: testConfig.VRF_WORKER_URL,
          workerTimeout: 15000,
          debug: true
        }) as VrfWorkerManager;

        // Test initialization
        await vrfWorkerManager.initialize();

        // Test communication
        const statusBefore = await vrfWorkerManager.checkVrfStatus();

        return {
          success: true,
          initialized: true,
          statusBefore,
          workerAvailable: true
        };

      } catch (error: any) {
        console.error('VRF Worker Manager initialization error:', error);
        return {
          success: false,
          error: error.message,
          stack: error.stack
        };
      }
    }, TEST_CONFIG);

    // Verify initialization succeeded
    expect(result.success).toBe(true);
    expect(result.initialized).toBe(true);
    expect(result.statusBefore).toEqual({
      active: false,
      nearAccountId: null,
      sessionDuration: 0
    });

    console.log('VRF Worker Manager initialization test passed');
  });

  ////////////////////////////////////
  // Test VRF Keypair Generation (Bootstrap)
  ////////////////////////////////////

  // covers initial VRF keypair generation and storage round-trip through the worker
  test('VRF Worker Manager - Bootstrap Keypair Generation', async ({ page }) => {
    const result = await page.evaluate(async (testConfig) => {
      try {
        // @ts-ignore - Runtime import path
        const { VrfWorkerManager } = await import('/sdk/esm/core/WebAuthnManager/VrfWorkerManager/index.js');
        console.log('Testing VRF bootstrap keypair generation...');
        const vrfWorkerManager = new VrfWorkerManager() as VrfWorkerManager;
        await vrfWorkerManager.initialize();

        // Get centralized configuration
        const { configs } = (window as any).testUtils;

        // Generate bootstrap VRF keypair (used during registration)
        console.log('Generating bootstrap VRF keypair...');
        const bootstrapResult = await vrfWorkerManager.generateVrfKeypairBootstrap({
          vrfInputData: {
            ...testConfig.VRF_INPUT_PARAMS,
            rpId: configs.rpId
          },
          saveInMemory: true // saveInMemory
        });

        // Verify bootstrap keypair generation
        const hasValidPublicKey = !!(bootstrapResult?.vrfPublicKey &&
                                     bootstrapResult.vrfPublicKey.length > 0);
        const hasValidChallenge = !!(bootstrapResult?.vrfChallenge &&
                                     bootstrapResult.vrfChallenge.vrfOutput &&
                                     bootstrapResult.vrfChallenge.vrfProof);

        // Test that VRF challenge is deterministic for same input
        console.log('Testing deterministic VRF challenge generation...');
        const bootstrapResult2 = await vrfWorkerManager.generateVrfKeypairBootstrap({
          vrfInputData: {
            ...testConfig.VRF_INPUT_PARAMS,
            rpId: configs.rpId
          },
          saveInMemory: true
        });

        // Note: Bootstrap keypairs are random, so public keys will be different
        // But VRF challenges should use the newly generated keypair consistently
        const publicKeysAreDifferent = bootstrapResult?.vrfPublicKey
          && bootstrapResult2?.vrfPublicKey
          ? bootstrapResult.vrfPublicKey !== bootstrapResult2.vrfPublicKey
          : false;
        const challengesAreDifferent = bootstrapResult?.vrfChallenge?.vrfOutput
          && bootstrapResult2?.vrfChallenge?.vrfOutput
          ? bootstrapResult.vrfChallenge.vrfOutput !== bootstrapResult2.vrfChallenge.vrfOutput
          : false;

        return {
          success: !!(bootstrapResult && bootstrapResult2),
          hasValidPublicKey,
          hasValidChallenge,
          publicKeysAreDifferent,
          challengesAreDifferent,
          vrfPublicKey1: bootstrapResult?.vrfPublicKey ? `${bootstrapResult.vrfPublicKey.substring(0, 20)}...` : null,
          vrfPublicKey2: bootstrapResult2?.vrfPublicKey ? `${bootstrapResult2.vrfPublicKey.substring(0, 20)}...` : null,
          vrfOutput1: bootstrapResult?.vrfChallenge?.vrfOutput ? `${bootstrapResult.vrfChallenge.vrfOutput.substring(0, 20)}...` : null,
          vrfOutput2: bootstrapResult2?.vrfChallenge?.vrfOutput ? `${bootstrapResult2.vrfChallenge.vrfOutput.substring(0, 20)}...` : null,
          rawBootstrap1: bootstrapResult,
          rawBootstrap2: bootstrapResult2,
        };

      } catch (error: any) {
        console.error('VRF bootstrap keypair generation error:', error);
        return {
          success: false,
          error: error.message
        };
      }
    }, TEST_CONFIG);

    // Debug: Log result details if test fails
    if (!result.success) {
      console.log('=== BOOTSTRAP TEST FAILURE DEBUG ===');
      console.log('Error:', result.error);
      console.log('Full result:', JSON.stringify(result, null, 2));
      console.log('=== END DEBUG ===');
    }

    if (!result.hasValidPublicKey || !result.hasValidChallenge) {
      console.log('Bootstrap raw result 1:', JSON.stringify(result.rawBootstrap1, null, 2));
      console.log('Bootstrap raw result 2:', JSON.stringify(result.rawBootstrap2, null, 2));
    }

    // Verify bootstrap keypair generation
    expect(result.success).toBe(true);
    expect(result.hasValidPublicKey).toBe(true);
    expect(result.hasValidChallenge).toBe(true);
    expect(result.publicKeysAreDifferent).toBe(true); // Bootstrap keypairs are random
    expect(result.challengesAreDifferent).toBe(true); // Different keypairs → different challenges

    console.log('VRF bootstrap keypair generation test passed');
    console.log(`   Generated VRF public keys: ${result.vrfPublicKey1} vs ${result.vrfPublicKey2}`);
    console.log(`   Generated VRF outputs: ${result.vrfOutput1} vs ${result.vrfOutput2}`);
  });

  ////////////////////////////////////
  // Test Deterministic VRF Keypair Derivation from PRF
  ////////////////////////////////////

  // checks dual-PRF deterministic derivation paths stay stable across runs
  test('VRF Worker Manager - Deterministic Keypair Derivation from PRF', async ({ page }) => {
    const testUtilsKeys = await page.evaluate(() => Object.keys((window as any).testUtils || {}));
    console.log('testUtils keys:', testUtilsKeys);
    const result = await page.evaluate(async (testConfig) => {
      try {
        // @ts-ignore - Runtime import path
        const { VrfWorkerManager } = await import('/sdk/esm/core/WebAuthnManager/VrfWorkerManager/index.js');
        console.log('Testing deterministic VRF keypair derivation from PRF...');
        const vrfWorkerManager = new VrfWorkerManager() as VrfWorkerManager;
        await vrfWorkerManager.initialize();

        // Get centralized configuration
        const { configs } = (window as any).testUtils;

        const serializeCredentialWithPrf = (credential: PublicKeyCredential): WebAuthnAuthenticationCredential => {
          const encode = (value: ArrayBuffer | ArrayBufferView | null | undefined): string | undefined => {
            if (!value) return undefined;
            if (typeof value === 'string') return value;
            const buffer = value instanceof ArrayBuffer
              ? value
              : ArrayBuffer.isView(value)
                ? value.buffer
                : new Uint8Array(value as ArrayBufferLike).buffer;
            return (window as any).base64UrlEncode(buffer);
          };
          const response = credential.response as AuthenticatorAssertionResponse;
          const extensionResults = credential.getClientExtensionResults?.() || {};
          const prfResults = (extensionResults as any)?.prf?.results
            || (credential as any).clientExtensionResults?.prf?.results
            || {};
          return {
            id: credential.id,
            rawId: (window as any).base64UrlEncode(credential.rawId),
            type: credential.type,
            authenticatorAttachment: credential.authenticatorAttachment ?? undefined,
            response: {
              clientDataJSON: encode(response.clientDataJSON)!,
              authenticatorData: encode(response.authenticatorData)!,
              signature: encode(response.signature)!,
              userHandle: encode(response.userHandle as ArrayBuffer | null | undefined),
            },
            clientExtensionResults: {
              prf: {
                results: {
                  first: encode(prfResults?.first),
                  second: encode(prfResults?.second),
                }
              }
            }
          } as WebAuthnAuthenticationCredential;
        };

        // Helper: obtain a serialized WebAuthnAuthenticationCredential with PRF via setup WebAuthn mocks
        const getCredentialForAccount = async (accountId: string): Promise<WebAuthnAuthenticationCredential> => {
          const challenge = crypto.getRandomValues(new Uint8Array(32));
          const cred = await (navigator as any).credentials.get({
            publicKey: {
              challenge,
              timeout: 60000,
              userVerification: 'preferred',
              // Provide PRF extension so setup mocks attach PRF results
              extensions: {
                prf: {
                  eval: {
                    // Pass account id through PRF salt to keep PRF deterministic per account
                    first: new TextEncoder().encode(`chacha20-salt:${accountId}`)
                  }
                }
              },
              // allowCredentials not required for our mock path using PRF salt
            }
          });
          const serialized = serializeCredentialWithPrf(cred as PublicKeyCredential);
          console.log('Serialized credential PRF results for account', accountId, serialized.clientExtensionResults?.prf?.results);
          return serialized;
        };

        // Derive deterministic VRF keypair from PRF output (used during recovery)
        console.log('Deriving VRF keypair from PRF output...');
        const cred1 = await getCredentialForAccount(testConfig.ACCOUNT_ID);
        const derivedResult1 = await vrfWorkerManager.deriveVrfKeypairFromPrf({
          credential: cred1,
          nearAccountId: testConfig.ACCOUNT_ID as AccountId,
          vrfInputData: {
            ...testConfig.VRF_INPUT_PARAMS,
            rpId: configs.rpId
          }
        });

        // Derive again with same PRF output to test deterministic behavior
        console.log('Deriving VRF keypair again with same PRF...');
        const cred2 = await getCredentialForAccount(testConfig.ACCOUNT_ID);
        const derivedResult2 = await vrfWorkerManager.deriveVrfKeypairFromPrf({
          credential: cred2,
          nearAccountId: testConfig.ACCOUNT_ID as AccountId,
          vrfInputData: {
            ...testConfig.VRF_INPUT_PARAMS,
            rpId: configs.rpId
          }
        });

        // Test with different PRF output by supplying a distinct raw PRF string
        console.log('Testing with different PRF output...');
        const randomBytes = crypto.getRandomValues(new Uint8Array(32));
        const differentPrfOutput = (window as any).base64UrlEncode(randomBytes);
        const derivedResult3 = await vrfWorkerManager.deriveVrfKeypairFromRawPrf({
          prfOutput: differentPrfOutput,
          nearAccountId: testConfig.ACCOUNT_ID as AccountId,
          vrfInputData: testConfig.VRF_INPUT_PARAMS
        });

        // Verify deterministic behavior
        const samePublicKey = !!(derivedResult1?.vrfPublicKey && derivedResult2?.vrfPublicKey)
          && derivedResult1.vrfPublicKey === derivedResult2.vrfPublicKey;
        const sameVrfOutput = derivedResult1?.vrfChallenge?.vrfOutput
          && derivedResult2?.vrfChallenge?.vrfOutput
          ? derivedResult1.vrfChallenge.vrfOutput === derivedResult2.vrfChallenge.vrfOutput
          : false;
        const sameVrfProof = derivedResult1?.vrfChallenge?.vrfProof
          && derivedResult2?.vrfChallenge?.vrfProof
          ? derivedResult1.vrfChallenge.vrfProof === derivedResult2.vrfChallenge.vrfProof
          : false;

        const differentPublicKey = !!(derivedResult1?.vrfPublicKey && derivedResult3?.vrfPublicKey)
          && derivedResult1.vrfPublicKey !== derivedResult3.vrfPublicKey;
        const differentVrfOutput = derivedResult1?.vrfChallenge?.vrfOutput
          && derivedResult3?.vrfChallenge?.vrfOutput
          ? derivedResult1.vrfChallenge.vrfOutput !== derivedResult3.vrfChallenge.vrfOutput
          : false;

        const vrfPublicKey1Preview = derivedResult1?.vrfPublicKey ? `${derivedResult1.vrfPublicKey.substring(0, 20)}...` : null;
        const vrfPublicKey3Preview = derivedResult3?.vrfPublicKey ? `${derivedResult3.vrfPublicKey.substring(0, 20)}...` : null;
        const vrfOutput1Preview = derivedResult1?.vrfChallenge?.vrfOutput ? `${derivedResult1.vrfChallenge.vrfOutput.substring(0, 20)}...` : null;
        const vrfOutput3Preview = derivedResult3?.vrfChallenge?.vrfOutput ? `${derivedResult3.vrfChallenge.vrfOutput.substring(0, 20)}...` : null;

        console.log(`VRF Public Key 1: ${vrfPublicKey1Preview}`);
        console.log(`VRF Public Key 3: ${vrfPublicKey3Preview}`);
        console.log(`VRF Output 1: ${vrfOutput1Preview}`);
        console.log(`VRF Output 3: ${vrfOutput3Preview}`);
        console.log(`Different public keys: ${differentPublicKey}`);
        console.log(`Different VRF outputs: ${differentVrfOutput}`);

        return {
          success: !!(derivedResult1 && derivedResult2 && derivedResult3),
          samePublicKey,
          sameVrfOutput,
          sameVrfProof,
          differentPublicKey,
          differentVrfOutput,
          hasEncryptedKeypair1: !!derivedResult1.encryptedVrfKeypair,
          hasEncryptedKeypair2: !!derivedResult2.encryptedVrfKeypair,
          vrfPublicKey1: vrfPublicKey1Preview,
          vrfPublicKey3: vrfPublicKey3Preview,
          vrfOutput1: vrfOutput1Preview || 'none',
          vrfOutput3: vrfOutput3Preview || 'none',
          rawDerived1: derivedResult1,
          rawDerived2: derivedResult2,
          rawDerived3: derivedResult3,
        };

      } catch (error: any) {
        console.error('VRF deterministic derivation error:', error);
        return {
          success: false,
          error: error.message
        };
      }
    }, TEST_CONFIG);

    if (!result.success) {
      console.log('Deterministic derivation error:', result.error);
      console.log('Deterministic derivation raw result 1:', JSON.stringify(result.rawDerived1, null, 2));
      console.log('Deterministic derivation raw result 2:', JSON.stringify(result.rawDerived2, null, 2));
      console.log('Deterministic derivation raw result 3:', JSON.stringify(result.rawDerived3, null, 2));
    }

    // Verify deterministic derivation
    expect(result.success).toBe(true);

    // Verify deterministic behavior (same PRF → same results)
    expect(result.samePublicKey).toBe(true);
    expect(result.sameVrfOutput).toBe(true);
    expect(result.sameVrfProof).toBe(true);

    // Debug: Log result details if test fails
    if (!result.differentVrfOutput) {
      console.log('=== DETERMINISTIC TEST FAILURE DEBUG ===');
      console.log('VRF Output 1:', result.vrfOutput1);
      console.log('VRF Output 3:', result.vrfOutput3);
      console.log('Different public keys:', result.differentPublicKey);
      console.log('Different VRF outputs:', result.differentVrfOutput);
      console.log('Full result:', JSON.stringify(result, null, 2));
      console.log('=== END DEBUG ===');
    }

    // Verify different PRF → different results
    expect(result.differentPublicKey).toBe(true);
    expect(result.differentVrfOutput).toBe(true);

    // Verify encrypted keypairs are generated
    expect(result.hasEncryptedKeypair1).toBe(true);
    expect(result.hasEncryptedKeypair2).toBe(true);

    console.log('VRF deterministic derivation test passed');
    console.log(`   Same PRF public key: ${result.vrfPublicKey1}`);
    console.log(`   Different PRF public key: ${result.vrfPublicKey3}`);
    console.log(`   Deterministic behavior verified: ${result.samePublicKey && result.sameVrfOutput}`);
  });

  ////////////////////////////////////
  // Test VRF Session Management
  ////////////////////////////////////

  // validates VRF session activation, refresh, and clearing without chain calls
  test('VRF Worker Manager - Session Management and Status', async ({ page }) => {
    const result = await page.evaluate(async (testConfig) => {
      try {
        // @ts-ignore - Runtime import path
        const { VrfWorkerManager } = await import('/sdk/esm/core/WebAuthnManager/VrfWorkerManager/index.js');

        console.log('Testing VRF session management...');

        const vrfWorkerManager = new VrfWorkerManager() as VrfWorkerManager;
        await vrfWorkerManager.initialize();

        // Check initial status (should be inactive)
        console.log('Checking initial VRF status...');
        const initialStatus = await vrfWorkerManager.checkVrfStatus();

        // Generate a VRF keypair to activate session
        console.log('Activating VRF session with keypair generation...');
        await vrfWorkerManager.generateVrfKeypairBootstrap({
          vrfInputData: testConfig.VRF_INPUT_PARAMS,
          saveInMemory: true
        });

        // Check status after activation
        console.log('Checking VRF status after activation...');
        const activeStatus = await vrfWorkerManager.checkVrfStatus();

        // Clear VRF session
        console.log('Clearing VRF session...');
        await vrfWorkerManager.clearVrfSession();

        // Check status after clearing
        console.log('Checking VRF status after clearing...');
        const clearedStatus = await vrfWorkerManager.checkVrfStatus();

        return {
          success: true,
          initialStatus,
          activeStatus,
          clearedStatus,
          sessionLifecycleWorking: !initialStatus.active && activeStatus.active && !clearedStatus.active
        };

      } catch (error: any) {
        console.error('VRF session management error:', error);
        return {
          success: false,
          error: error.message
        };
      }
    }, TEST_CONFIG);

    // Verify session management
    expect(result.success).toBe(true);
    expect(result.sessionLifecycleWorking).toBe(true);

    // Verify initial status
    expect(result?.initialStatus?.active).toBe(false);
    expect(result?.initialStatus?.nearAccountId).toBe(null);

    // Verify active status
    expect(result?.activeStatus?.active).toBe(true);
    expect(result?.activeStatus?.nearAccountId).toBe(TEST_CONFIG.ACCOUNT_ID);

    // Verify cleared status
    expect(result?.clearedStatus?.active).toBe(false);
    expect(result?.clearedStatus?.nearAccountId).toBe(null);

    console.log('VRF session management test passed');
    console.log(`   Session lifecycle: inactive → active → inactive`);
  });

  ////////////////////////////////////
  // Test VRF Challenge Generation with Active Session
  ////////////////////////////////////

  // confirms challenge generation succeeds once a VRF session is live
  test('VRF Worker Manager - VRF Challenge Generation with Active Session', async ({ page }) => {
    const result = await page.evaluate(async (testConfig) => {
      try {
        // @ts-ignore - Runtime import path
        const { VrfWorkerManager } = await import('/sdk/esm/core/WebAuthnManager/VrfWorkerManager/index.js');
        console.log('Testing VRF challenge generation with active session...');

        const vrfWorkerManager = new VrfWorkerManager() as VrfWorkerManager;
        await vrfWorkerManager.initialize();

        // Get centralized configuration
        const { configs } = (window as any).testUtils;

        // First, activate session by generating a VRF keypair
        console.log('Activating VRF session...');
        await vrfWorkerManager.generateVrfKeypairBootstrap({
          vrfInputData: {
            ...testConfig.VRF_INPUT_PARAMS,
            rpId: configs.rpId
          },
          saveInMemory: true
        });

        // Test VRF challenge generation with active session
        console.log('Generating VRF challenge with active session...');
        const vrfInputData = {
          userId: testConfig.ACCOUNT_ID,
          rpId: configs.rpId,
          blockHeight: "67890",
          blockHash: testConfig.VRF_INPUT_PARAMS.blockHash,
        };

        const vrfChallenge1 = await vrfWorkerManager.generateVrfChallenge(vrfInputData);

        // Test deterministic behavior with same input
        console.log('Generating VRF challenge again with same input...');
        const vrfChallenge2 = await vrfWorkerManager.generateVrfChallenge(vrfInputData);

        // Test different behavior with different input
        console.log('Generating VRF challenge with different input...');
        const differentInputData = {
          ...vrfInputData,
          blockHeight: "99999",
        };
        const vrfChallenge3 = await vrfWorkerManager.generateVrfChallenge(differentInputData);

        // Verify challenge properties
        const challenge1Valid = !!(vrfChallenge1?.vrfOutput && vrfChallenge1?.vrfProof && vrfChallenge1?.vrfPublicKey);
        const challenge2Valid = !!(vrfChallenge2?.vrfOutput && vrfChallenge2?.vrfProof && vrfChallenge2?.vrfPublicKey);
        const challenge3Valid = !!(vrfChallenge3?.vrfOutput && vrfChallenge3?.vrfProof && vrfChallenge3?.vrfPublicKey);

        // Same input should produce same output (deterministic)
        const sameVrfOutput = !!(vrfChallenge1?.vrfOutput && vrfChallenge2?.vrfOutput)
          && vrfChallenge1.vrfOutput === vrfChallenge2.vrfOutput;
        const sameVrfProof = !!(vrfChallenge1?.vrfProof && vrfChallenge2?.vrfProof)
          && vrfChallenge1.vrfProof === vrfChallenge2.vrfProof;

        // Different input should produce different output
        const differentVrfOutput = !!(vrfChallenge1?.vrfOutput && vrfChallenge3?.vrfOutput)
          && vrfChallenge1.vrfOutput !== vrfChallenge3.vrfOutput;
        const differentVrfProof = !!(vrfChallenge1?.vrfProof && vrfChallenge3?.vrfProof)
          && vrfChallenge1.vrfProof !== vrfChallenge3.vrfProof;

        return {
          success: !!(vrfChallenge1 && vrfChallenge2 && vrfChallenge3),
          challenge1Valid,
          challenge2Valid,
          challenge3Valid,
          sameVrfOutput,
          sameVrfProof,
          differentVrfOutput,
          differentVrfProof,
          vrfOutput1: vrfChallenge1?.vrfOutput ? `${vrfChallenge1.vrfOutput.substring(0, 20)}...` : null,
          vrfOutput3: vrfChallenge3?.vrfOutput ? `${vrfChallenge3.vrfOutput.substring(0, 20)}...` : null,
          rawChallenge1: vrfChallenge1,
          rawChallenge2: vrfChallenge2,
          rawChallenge3: vrfChallenge3,
        };

      } catch (error: any) {
        console.error('VRF challenge generation error:', error);
        return {
          success: false,
          error: error.message
        };
      }
    }, TEST_CONFIG);

    if (!result.success) {
      console.log('Challenge generation raw challenge1:', JSON.stringify(result.rawChallenge1, null, 2));
      console.log('Challenge generation raw challenge2:', JSON.stringify(result.rawChallenge2, null, 2));
      console.log('Challenge generation raw challenge3:', JSON.stringify(result.rawChallenge3, null, 2));
      console.log('Challenge generation error:', result.error);
    }

    // Verify VRF challenge generation
    expect(result.success).toBe(true);
    expect(result.challenge1Valid).toBe(true);
    expect(result.challenge2Valid).toBe(true);
    expect(result.challenge3Valid).toBe(true);

    // Verify deterministic behavior
    expect(result.sameVrfOutput).toBe(true);
    expect(result.sameVrfProof).toBe(true);

    // Verify different inputs produce different outputs
    expect(result.differentVrfOutput).toBe(true);
    expect(result.differentVrfProof).toBe(true);

    console.log('VRF challenge generation test passed');
    console.log(`   Same input VRF output: ${result.vrfOutput1}`);
    console.log(`   Different input VRF output: ${result.vrfOutput3}`);
    console.log(`   Deterministic behavior verified: ${result.sameVrfOutput && result.sameVrfProof}`);
  });

  ////////////////////////////////////
  // Test Error Handling and Edge Cases
  ////////////////////////////////////

  // exercises defensive branches (missing keys, mismatched sessions, malformed payloads)
  test('VRF Worker Manager - Error Handling and Edge Cases', async ({ page }) => {
    const result = await page.evaluate(async (testConfig) => {
      try {
        // @ts-ignore - Runtime import path
        const { VrfWorkerManager } = await import('/sdk/esm/core/WebAuthnManager/VrfWorkerManager/index.js');
        const serializeCredentialWithPrf = (credential: PublicKeyCredential): WebAuthnAuthenticationCredential => {
          const encode = (value: ArrayBuffer | ArrayBufferView | null | undefined): string | undefined => {
            if (!value) return undefined;
            if (typeof value === 'string') return value;
            const buffer = value instanceof ArrayBuffer
              ? value
              : ArrayBuffer.isView(value)
                ? value.buffer
                : new Uint8Array(value as ArrayBufferLike).buffer;
            return (window as any).base64UrlEncode(buffer);
          };
          const response = credential.response as AuthenticatorAssertionResponse;
          const extensionResults = credential.getClientExtensionResults?.() || {};
          const prfResults = (extensionResults as any)?.prf?.results
            || (credential as any).clientExtensionResults?.prf?.results
            || {};
          return {
            id: credential.id,
            rawId: (window as any).base64UrlEncode(credential.rawId),
            type: credential.type,
            authenticatorAttachment: credential.authenticatorAttachment ?? undefined,
            response: {
              clientDataJSON: encode(response.clientDataJSON)!,
              authenticatorData: encode(response.authenticatorData)!,
              signature: encode(response.signature)!,
              userHandle: encode(response.userHandle as ArrayBuffer | null | undefined),
            },
            clientExtensionResults: {
              prf: {
                results: {
                  first: encode(prfResults?.first),
                  second: encode(prfResults?.second),
                }
              }
            }
          } as WebAuthnAuthenticationCredential;
        };
        console.log('Testing VRF Worker Manager error handling...');
        const vrfWorkerManager = new VrfWorkerManager() as VrfWorkerManager;
        await vrfWorkerManager.initialize();

        const testResults = {
          challengeWithoutSession: false,
          invalidPrfDerivation: false,
          emptyPrfDerivation: false,
          workerCommunicationTimeout: false,
          // Add debug fields
          invalidPrfError: '',
          emptyPrfError: '',
          challengeWithoutSessionError: ''
        };

        // Test 1: Try to generate VRF challenge without active session
        console.log('Testing VRF challenge without active session...');
        try {
          await vrfWorkerManager.generateVrfChallenge({
            userId: testConfig.ACCOUNT_ID,
            rpId: 'localhost',
            blockHeight: "12345",
            blockHash: 'dGVzdC1ibG9jay1oYXNo', // base64url: 'test-block-hash'
          });
          console.log('ERROR: Challenge without session should have failed but succeeded!');
        } catch (error: any) {
          testResults.challengeWithoutSessionError = error.message;
          console.log('Challenge without session error message:', error.message);
          testResults.challengeWithoutSession = error.message.includes('VRF challenge generation failed');
        }

        const buildCredential = async (salt: ArrayBuffer | null): Promise<WebAuthnAuthenticationCredential> => {
          const challenge = crypto.getRandomValues(new Uint8Array(32));
          const extensions: any = salt === null
            ? { prf: { eval: { first: null } } }
            : { prf: { eval: { first: salt } } };
          const cred = await (navigator as any).credentials.get({
            publicKey: {
              challenge,
              timeout: 60000,
              userVerification: 'preferred',
              extensions
            }
          });
          return serializeCredentialWithPrf(cred as PublicKeyCredential);
        };

        // Test 2: Try to derive VRF keypair with missing PRF results
        console.log('Testing VRF derivation with missing PRF results...');
        try {
          // Create a credential without PRF extension results
          const challenge = crypto.getRandomValues(new Uint8Array(32));
          const cred = await (navigator as any).credentials.get({
            publicKey: {
              challenge,
              timeout: 60000,
              userVerification: 'preferred',
              // No extensions - this should result in no PRF results
            }
          });
          const invalidCred = serializeCredentialWithPrf(cred as PublicKeyCredential);
          // Remove PRF results to simulate missing PRF
          (invalidCred as any).clientExtensionResults = undefined;

          await vrfWorkerManager.deriveVrfKeypairFromPrf({
            credential: invalidCred,
            nearAccountId: testConfig.ACCOUNT_ID as AccountId
          });
          console.log('ERROR: Missing PRF derivation should have failed but succeeded!');
        } catch (error: any) {
          testResults.invalidPrfError = error.message;
          console.log('Missing PRF derivation error message:', error.message);
          console.log('Error message includes "VRF keypair derivation failed":', error.message.includes('VRF keypair derivation failed'));
          testResults.invalidPrfDerivation = error.message.includes('VRF keypair derivation failed');
        }

        // Test 3: Try to derive VRF keypair with empty PRF output (null salt to break mock)
        console.log('Testing VRF derivation with empty PRF...');
        try {
          const emptyCred = await buildCredential(null);
          await vrfWorkerManager.deriveVrfKeypairFromPrf({
            credential: emptyCred,
            nearAccountId: testConfig.ACCOUNT_ID as AccountId
          });
          console.log('ERROR: Empty PRF derivation should have failed but succeeded!');
        } catch (error: any) {
          testResults.emptyPrfError = error.message;
          console.log('Empty PRF derivation error message:', error.message);
          console.log('Error message includes "VRF keypair derivation failed":', error.message.includes('VRF keypair derivation failed'));
          testResults.emptyPrfDerivation = error.message.includes('VRF keypair derivation failed');
        }

        return {
          success: true,
          testResults
        };

      } catch (error: any) {
        console.error('VRF error handling test error:', error);
        return {
          success: false,
          error: error.message
        };
      }
    }, TEST_CONFIG);

    // Debug: Log the actual error messages
    console.log('=== VRF ERROR HANDLING TEST DEBUG ===');
    console.log('Test success:', result.success);
    console.log('Challenge without session error:', result.testResults?.challengeWithoutSessionError);
    console.log('Invalid PRF error:', result.testResults?.invalidPrfError);
    console.log('Empty PRF error:', result.testResults?.emptyPrfError);
    console.log('=== END DEBUG ===');

    // Verify error handling
    expect(result.success).toBe(true);
    expect(result.testResults?.challengeWithoutSession).toBe(true);
    expect(result.testResults?.invalidPrfDerivation).toBe(true);
    expect(result.testResults?.emptyPrfDerivation).toBe(true);

    console.log('VRF error handling test passed');
    console.log(`   All error cases handled correctly`);
  });

  // dumps the raw response envelope to guard against structural regressions
  test('VRF Worker Manager - Response Structure Debug', async ({ page }) => {
    const result = await page.evaluate(async (testConfig) => {
      try {
        // @ts-ignore - Runtime import path
        const { VrfWorkerManager } = await import('/sdk/esm/core/WebAuthnManager/VrfWorkerManager/index.js');
        console.log('=== VRF RESPONSE STRUCTURE DEBUG ===');
        const vrfWorkerManager = new VrfWorkerManager({
          vrfWorkerUrl: testConfig.VRF_WORKER_URL,
          workerTimeout: 15000,
          debug: true
        });
        await vrfWorkerManager.initialize();

        // Test 1: Check VRF status (simple response)
        console.log('Testing checkVrfStatus response...');
        const statusResponse = await vrfWorkerManager.checkVrfStatus();
        console.log('Status response type:', typeof statusResponse);
        console.log('Status response:', statusResponse);
        console.log('Status response keys:', Object.keys(statusResponse));

        // Test 2: Generate VRF keypair (complex response)
        console.log('Testing generateVrfKeypairBootstrap response...');
        const keypairResult = await vrfWorkerManager.generateVrfKeypairBootstrap({
          vrfInputData: testConfig.VRF_INPUT_PARAMS,
          saveInMemory: true
        });
        console.log('Keypair result type:', typeof keypairResult);
        console.log('Keypair result keys:', Object.keys(keypairResult));
        console.log('vrfPublicKey type:', typeof keypairResult.vrfPublicKey);
        console.log('vrfChallenge type:', typeof keypairResult.vrfChallenge);
        console.log('vrfChallenge value:', keypairResult.vrfChallenge);
        console.log('vrfChallenge keys:', keypairResult.vrfChallenge ? Object.keys(keypairResult.vrfChallenge) : 'null');

        if (keypairResult.vrfChallenge && typeof keypairResult.vrfChallenge === 'object') {
          console.log('vrfChallenge.vrfOutput type:', typeof keypairResult.vrfChallenge.vrfOutput);
          console.log('vrfChallenge.vrfOutput value:', keypairResult.vrfChallenge.vrfOutput);
          console.log('vrfChallenge.vrfProof type:', typeof keypairResult.vrfChallenge.vrfProof);
          console.log('vrfChallenge.vrfProof value:', keypairResult.vrfChallenge.vrfProof);
        }

        return {
          success: true,
          statusResponse,
          keypairResult: {
            vrfPublicKeyType: typeof keypairResult.vrfPublicKey,
            vrfChallengeType: typeof keypairResult.vrfChallenge,
            vrfChallengeValue: keypairResult.vrfChallenge,
            vrfChallengeKeys: keypairResult.vrfChallenge ? Object.keys(keypairResult.vrfChallenge) : null
          }
        };

      } catch (error: any) {
        console.error('VRF response structure debug error:', error);
        return {
          success: false,
          error: error.message,
          stack: error.stack
        };
      }
    }, TEST_CONFIG);

    // Just log the results, don't assert anything
    console.log('=== VRF RESPONSE STRUCTURE DEBUG RESULTS ===');
    console.log(JSON.stringify(result, null, 2));
    console.log('=== END DEBUG RESULTS ===');

    // Basic success check
    expect(result.success).toBe(true);
  });

});
