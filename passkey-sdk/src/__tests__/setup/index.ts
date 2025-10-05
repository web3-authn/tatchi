/**
 * E2E Test Setup Utilities
 *
 * Provides reusable setup functions for PasskeyManager e2e testing for:
 * - Registration flow: Works correctly
 * - Contract verification: Finds stored credentials
 * - VRF Login flow: VRF keypair unlock works properly
 * - Recovery flow: Works correctly with proper account ID extraction
 *
 * IMPORTANT: Module Loading Strategy
 * ===================================
 *
 * This file uses STATIC imports at the top for types and utilities that are safe to load early.
 * However, PasskeyManager itself is imported DYNAMICALLY inside test functions to avoid
 * module loading race conditions with WebAuthn Virtual Authenticator setup.
 *
 * Why Dynamic Imports Are Necessary:
 * 1. WebAuthn Virtual Authenticator setup modifies browser environment
 * 2. This can interfere with import map processing timing
 * 3. Early imports may fail with "base64UrlEncode is not defined" errors
 * 4. Dynamic imports after setup ensure stable environment
 *
 * Setup Process:
 * ==============
 * The setup follows a precise 5-step sequence to avoid race conditions:
 * 1. ENVIRONMENT SETUP: Configure WebAuthn Virtual Authenticator first
 * 2. IMPORT MAP INJECTION: Add module resolution mappings to the page
 * 3. STABILIZATION WAIT: Allow browser environment to settle
 * 4. DYNAMIC IMPORTS: Load PasskeyManager only after environment is ready
 * 5. GLOBAL FALLBACK: Ensure base64UrlEncode is available as safety measure
 */

// STATIC IMPORTS: Safe to load early
// ===================================
// These imports are safe to use statically because:
// - Page: Playwright type, no runtime dependencies
// - type PasskeyManager: TypeScript type only, no runtime code
// - encoders: Utility functions used in Node.js context, not browser
import { Page, test } from '@playwright/test';
import type { PasskeyManager } from '../../index';
import { executeSequentialSetup } from './bootstrap';
import { DEFAULT_TEST_CONFIG } from './config';
import { setupWebAuthnMocks, setupTestUtilities } from './mocks';
import type { PasskeyTestConfig, PasskeyTestConfigOverrides } from './types';
import { bypassContractVerification } from './intercepts';

// =============================================================================
// MAIN SETUP FUNCTION
// =============================================================================

/**
 * Main setup function using the 5-step process
 *
 * This function orchestrates the complete test environment setup following
 * a precise sequence to avoid module loading race conditions:
 *
 * 1. ENVIRONMENT SETUP: Configure WebAuthn Virtual Authenticator first
 * 2. IMPORT MAP INJECTION: Add module resolution mappings to the page
 * 3. STABILIZATION WAIT: Allow browser environment to settle
 * 4. DYNAMIC IMPORTS: Load PasskeyManager only after environment is ready
 * 5. GLOBAL FALLBACK: Ensure base64UrlEncode is available as safety measure
 */
export async function setupBasicPasskeyTest(
  page: Page,
  options: PasskeyTestConfigOverrides = {}
): Promise<void> {
  const config: PasskeyTestConfig = { ...DEFAULT_TEST_CONFIG, ...options };

  // Navigate to the frontend first
  await page.goto(config.frontendUrl);

  // Execute the 5-step sequential setup process
  const authenticatorId = await executeSequentialSetup(page, config);

  // Continue with the rest of the setup (WebAuthn mocks, etc.)
  await setupWebAuthnMocks(page);
  await setupTestUtilities(page, config);

  // Note: We do not install relay-server mocks by default.
  // Tests should call setupRelayServerMock(true) in their page.evaluate context
  // before attempting registration to avoid "Invalid signed transaction payload" errors.

  console.log('Playwright test environment ready!');
}

/**
 * Install a Playwright route to bypass on-chain contract verification during actions.
 * This intercepts NEAR RPC `query` calls for `verify_authentication_response` and
 * returns a successful, minimal response so tests can proceed to signing.
 *
 * Note: This is test-only and does not modify application source code.
 */
export async function installContractVerificationBypass(
  page: Page,
  nearRpcUrl?: string
): Promise<void> {
  await bypassContractVerification(page, { nearRpcUrl });
}

/**
 * Setup test environment with relay-server (atomic) registration flow
 * This configures the test to use the atomic create_account_and_register_user endpoint
 */
export async function setupRelayServerTest(
  page: Page,
  options: {
    frontendUrl?: string;
    relayServerUrl?: string;
    contractId?: string;
    nearRpcUrl?: string;
    rpId?: string;
    testReceiverAccountId?: string;
  } = {}
): Promise<void> {
  await setupBasicPasskeyTest(page, {
    ...options,
    useRelayer: true,
    relayServerUrl: options.relayServerUrl || 'http://localhost:3000'
  });
}

/**
 * Setup test environment with testnet faucet (sequential) registration flow
 * This configures the test to use the traditional sequential registration flow
 */
export async function setupTestnetFaucetTest(
  page: Page,
  options: {
    frontendUrl?: string;
    contractId?: string;
    nearRpcUrl?: string;
    rpId?: string;
    testReceiverAccountId?: string;
  } = {}
): Promise<void> {
  await setupBasicPasskeyTest(page, {
    ...options,
    useRelayer: false,
    relayServerUrl: undefined
  });
}

// =============================================================================
// TEST UTILITY INTERFACE - available in browser context
// =============================================================================

export interface TestUtils {
  PasskeyManager: typeof PasskeyManager;
  passkeyManager: PasskeyManager;
  configs: {
    nearNetwork: 'testnet';
    relayerAccount: string;
    contractId: string;
    nearRpcUrl: string;
    useRelayer: boolean;
    relayServerUrl?: string;
    // Additional centralized configuration
    frontendUrl: string;
    rpId: string;
    testReceiverAccountId: string;
  };
  confirmOverrides?: {
    skip: { uiMode: 'skip'; behavior: 'autoProceed'; autoProceedDelay: number; theme: 'dark' | 'light' };
    autoProceed: { uiMode: 'modal'; behavior: 'autoProceed'; autoProceedDelay: number; theme: 'dark' | 'light' };
  };
  generateTestAccountId: () => string;
  verifyAccountExists: (accountId: string) => Promise<boolean>;
  // WebAuthn Virtual Authenticator utilities
  webAuthnUtils: {
    simulateSuccessfulPasskeyInput: (operationTrigger: () => Promise<void>) => Promise<void>;
    simulateFailedPasskeyInput: (operationTrigger: () => Promise<void>, postOperationCheck?: () => Promise<void>) => Promise<void>;
    getCredentials: () => Promise<any[]>;
    clearCredentials: () => Promise<void>;
  };
  // Failure testing utilities
  failureMocks: {
    vrfGeneration: () => void;
    webAuthnCeremony: () => void;
    nearKeypairGeneration: () => void;
    contractVerification: () => void;
    faucetService: () => void;
    relayServer: () => void;
    contractRegistration: () => void;
    databaseStorage: () => void;
    vrfUnlock: () => void;
    restore: () => void;
  };
  rollbackVerification: {
    verifyDatabaseClean: (accountId: string) => Promise<boolean>;
    verifyAccountDeleted: (accountId: string) => Promise<boolean>;
    getRollbackEvents: (events: any[]) => any[];
  };
  // Registration flow utilities
  registrationFlowUtils: {
    setupRelayServerMock: (successResponse?: boolean) => void;
    setupTestnetFaucetMock: (successResponse?: boolean) => void;
    restoreFetch: () => void;
  };
}

// =============================================================================
// SETUP HELPER FUNCTIONS
// =============================================================================

/**
 * Step 1: ENVIRONMENT SETUP
 * Configure WebAuthn Virtual Authenticator first
 */
/**
 * Handles common infrastructure errors that should result in test skips rather than failures.
 * This centralizes error detection for testnet faucet rate limiting and contract connectivity issues.
 *
 * @param result - The test result object containing success status and error message
 * @returns boolean - true if test was skipped due to infrastructure issues, false otherwise
 */
export function handleInfrastructureErrors(result: { success: boolean; error?: string }): boolean {
  if (!result.success && result.error) {
    // Check if this is a rate limiting error (429) from testnet faucet
    if (result.error.includes('429') && result.error.includes('Faucet service error')) {
      console.warn('⚠️  Test skipped due to testnet faucet rate limiting (HTTP 429)');
      console.warn('   This is expected when running multiple tests quickly.');
      console.warn('   Rerun the test later - this is not a test failure.');
      console.warn(`   Error: ${result.error}`);

      // Skip this test instead of failing
      test.skip(true, 'Testnet faucet rate limited (HTTP 429) - retry later');
      return true;
    }
    // Real relay server sometimes lacks funds; treat as infra flake and skip
    if (result.error.includes('LackBalanceForState') || result.error.includes('Atomic registration failed')) {
      console.warn('⚠️  Test skipped due to relay server insufficient balance (infra condition)');
      console.warn('   Use mocked relay server for deterministic tests or fund the relayer account.');
      console.warn(`   Error: ${result.error}`);
      test.skip(true, 'Relay server insufficient balance - skipping test');
      return true;
    }
    // Port already in use (relay server collision) – treat as infra
    if (result.error.includes('EADDRINUSE') || result.error.includes('address already in use')) {
      console.warn('⚠️  Test skipped due to port already in use (EADDRINUSE)');
      console.warn('   Another test/server is using the relay port. Skipping this test.');
      console.warn(`   Error: ${result.error}`);
      test.skip(true, 'Relay server port in use (EADDRINUSE) - skipping test');
      return true;
    }
  }

  return false;
}

export type { PasskeyTestConfig, PasskeyTestConfigOverrides } from './types';
export { DEFAULT_TEST_CONFIG } from './config';
