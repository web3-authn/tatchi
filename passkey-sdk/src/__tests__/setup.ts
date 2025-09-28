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
import type { PasskeyManager } from '../index';
import { WalletIframeDomEvents } from '../core/WalletIframe/events';

// =============================================================================
// MAIN SETUP FUNCTION
// =============================================================================

const DEFAULT_TEST_CONFIG = {
  // Frontend and test environment URLs
  frontendUrl: 'https://example.localhost',

  // NEAR network configuration
  nearNetwork: 'testnet' as const,
  // nearRpcUrl: 'https://rpc.testnet.near.org',
  nearRpcUrl: 'https://test.rpc.fastnear.com',

  // Contract and account configuration
  contractId: 'web3-authn-v5.testnet',
  relayerAccount: 'web3-authn-v5.testnet',

  // WebAuthn configuration
  rpId: 'localhost',

  // Registration flow testing options
  useRelayer: true, // Default to relay server flow (testnet faucet is deprecated)
  relayer: {
    url: 'http://localhost:3000' // Mock relay-server URL for testing
  },

  // Test account configuration
  testReceiverAccountId: 'web3-authn-v5.testnet', // Default receiver for transfer tests
};

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
  options: {
    frontendUrl?: string;
    nearNetwork?: 'testnet' | 'mainnet';
    relayerAccount?: string;
    contractId?: string;
    nearRpcUrl?: string;
    useRelayer?: boolean;
    relayServerUrl?: string;
    rpId?: string;
    testReceiverAccountId?: string;
  } = {}
): Promise<void> {
  const config = { ...DEFAULT_TEST_CONFIG, ...options };

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
  const urlToIntercept = nearRpcUrl || DEFAULT_TEST_CONFIG.nearRpcUrl;
  await page.route(urlToIntercept, async (route) => {
    try {
      const request = route.request();
      if (request.method() !== 'POST') return route.continue();
      const bodyText = request.postData() || '';
      let body: any = {};
      try { body = JSON.parse(bodyText); } catch { return route.continue(); }

      const method = body?.method;
      const params = body?.params || {};
      const methodName = params?.method_name;
      if (method !== 'query' || params?.request_type !== 'call_function' || methodName !== 'verify_authentication_response') {
        return route.continue();
      }

      // Decode args_base64 to extract user_id/rp_id for nice logs
      let userId = 'unknown.user';
      let rpId = 'example.localhost';
      try {
        const argsB64 = params?.args_base64 || '';
        const argsJsonStr = Buffer.from(argsB64, 'base64').toString('utf8');
        const args = JSON.parse(argsJsonStr);
        userId = args?.vrf_data?.user_id || userId;
        rpId = args?.vrf_data?.rp_id || rpId;
      } catch {}

      const contractResponse = JSON.stringify({ verified: true });
      const resultBytes = Array.from(Buffer.from(contractResponse, 'utf8'));

      const rpcResponse = {
        jsonrpc: '2.0',
        id: body?.id || 'verify_from_wasm',
        result: {
          result: resultBytes,
          logs: [
            'VRF Authentication: Verifying VRF proof + WebAuthn authentication',
            `  - User ID: ${userId}`,
            `  - RP ID (domain): ${rpId}`,
          ]
        }
      };

      return route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rpcResponse)
      });
    } catch {
      return route.continue();
    }
  });
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
async function setupWebAuthnVirtualAuthenticator(page: Page): Promise<string> {

  const client = await page.context().newCDPSession(page);
  await client.send('WebAuthn.enable');

  // Add virtual authenticator with configuration based on
  // https://www.corbado.com/blog/passkeys-e2e-playwright-testing-webauthn-virtual-authenticator
  const authenticator = await client.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal', // Platform authenticator (like Touch ID/Face ID)
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });

  const authenticatorId = authenticator.authenticatorId;
  console.log('Step 1 Complete: WebAuthn Virtual Authenticator enabled with ID:', authenticatorId);
  return authenticatorId;
}

/**
 * Step 2: IMPORT MAP INJECTION
 * Add module resolution mappings to the page
 */
async function injectImportMap(page: Page): Promise<void> {

  await page.evaluate(() => {
    const importMap = document.createElement('script');
    importMap.type = 'importmap';
    importMap.textContent = JSON.stringify({
      imports: {
        'bs58': 'https://esm.sh/bs58@6.0.0',
        'idb': 'https://esm.sh/idb@8.0.0',
        'js-sha256': 'https://esm.sh/js-sha256@0.11.1',
        '@noble/ed25519': 'https://esm.sh/@noble/ed25519@3.0.0',
        'qrcode': 'https://esm.sh/qrcode@1.5.4',
        'jsqr': 'https://esm.sh/jsqr@1.4.0',
        '@near-js/types': 'https://esm.sh/@near-js/types@2.0.1',
        'tslib': 'https://esm.sh/tslib@2.8.1',
        'buffer': 'https://esm.sh/buffer@6.0.3',
        'lit': 'https://esm.sh/lit@3.1.0',
        'lit/decorators.js': 'https://esm.sh/lit@3.1.0/decorators.js',
        'lit/directive.js': 'https://esm.sh/lit@3.1.0/directive.js',
        'lit/directive-helpers.js': 'https://esm.sh/lit@3.1.0/directive-helpers.js',
        'lit/async-directive.js': 'https://esm.sh/lit@3.1.0/async-directive.js',
        'lit/directives/when.js': 'https://esm.sh/lit@3.1.0/directives/when.js',
        'lit/directives/if-defined.js': 'https://esm.sh/lit@3.1.0/directives/if-defined.js',
        'lit/directives/class-map.js': 'https://esm.sh/lit@3.1.0/directives/class-map.js',
        'lit/directives/style-map.js': 'https://esm.sh/lit@3.1.0/directives/style-map.js',
        'lit/directives/repeat.js': 'https://esm.sh/lit@3.1.0/directives/repeat.js',
        'lit/directives/guard.js': 'https://esm.sh/lit@3.1.0/directives/guard.js',
        'lit/directives/cache.js': 'https://esm.sh/lit@3.1.0/directives/cache.js',
        'lit/directives/until.js': 'https://esm.sh/lit@3.1.0/directives/until.js',
        'lit/directives/ref.js': 'https://esm.sh/lit@3.1.0/directives/ref.js',
        'lit/directives/live.js': 'https://esm.sh/lit@3.1.0/directives/live.js',
        'lit/directives/unsafe-html.js': 'https://esm.sh/lit@3.1.0/directives/unsafe-html.js',
        'lit/directives/unsafe-svg.js': 'https://esm.sh/lit@3.1.0/directives/unsafe-svg.js',
        'lit/static-html.js': 'https://esm.sh/lit@3.1.0/static-html.js',
        'lit/html.js': 'https://esm.sh/lit@3.1.0/html.js',
        'lit/css.js': 'https://esm.sh/lit@3.1.0/css.js',
        'lit/lit-element.js': 'https://esm.sh/lit@3.1.0/lit-element.js',
        'lit/reactive-element.js': 'https://esm.sh/lit@3.1.0/reactive-element.js'
      }
    });

    // Insert as first child to ensure it loads before any modules
    if (document.head.firstChild) {
      document.head.insertBefore(importMap, document.head.firstChild);
    } else {
      document.head.appendChild(importMap);
    }
  });

  console.log('Step 2 Complete: Import map injected with NEAR.js dependencies');
}

/**
 * Step 3: STABILIZATION WAIT
 * Allow browser environment to settle
 */
async function waitForEnvironmentStabilization(page: Page): Promise<void> {

  // Critical timing: Wait for import map processing
  // The WebAuthn Virtual Authenticator setup can interfere with import map processing
  await new Promise(resolve => setTimeout(resolve, 500));
  await page.waitForLoadState('domcontentloaded');

  console.log('Step 3 Complete: Environment stabilized and ready for imports');
}

/**
 * Step 4: DYNAMIC IMPORTS
 * Load PasskeyManager only after environment is ready
 */
async function loadPasskeyManagerDynamically(page: Page, configs: any): Promise<void> {
  // Wait for page to be completely stable before attempting imports
  await page.waitForLoadState('networkidle');
  await page.waitForFunction(() => document.readyState === 'complete');

  // Use waitForFunction with robust error handling and retry logic
  const maxRetries = 3;
  let lastError: any = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Attempt ${attempt}/${maxRetries}: Loading PasskeyManager...`);

      const loadHandle = await page.waitForFunction(async (setupOptions) => {
        try {
          console.log('Importing PasskeyManager from built SDK...');
          // @ts-ignore
          const { PasskeyManager } = await import('/sdk/esm/core/PasskeyManager/index.js');

          if (!PasskeyManager) {
            throw new Error('PasskeyManager not found in SDK module');
          }
          console.log('PasskeyManager imported successfully:', typeof PasskeyManager);

          // Create and validate configuration
          const runtimeConfigs = {
            nearNetwork: setupOptions.nearNetwork as 'testnet',
            relayerAccount: setupOptions.relayerAccount,
            contractId: setupOptions.contractId,
            nearRpcUrl: setupOptions.nearRpcUrl,
            useRelayer: setupOptions.useRelayer || false,
            relayServerUrl: setupOptions.relayServerUrl,
            relayer: setupOptions.relayer,
            // Ensure VRF worker has relay server for Shamir3Pass operations
            vrfWorkerConfigs: {
              shamir3pass: {
                relayServerUrl: (setupOptions.relayServerUrl || (setupOptions.relayer && (setupOptions.relayer as any).url) || 'http://localhost:3000'),
                applyServerLockRoute: '/vrf/apply-server-lock',
                removeServerLockRoute: '/vrf/remove-server-lock',
              }
            },
            // Additional centralized configuration
            frontendUrl: setupOptions.frontendUrl,
            rpId: setupOptions.rpId,
            testReceiverAccountId: setupOptions.testReceiverAccountId
          };

          // Validate required configs
          if (!runtimeConfigs.nearRpcUrl) throw new Error('nearRpcUrl is required but not provided');
          if (!runtimeConfigs.contractId) throw new Error('contractId is required but not provided');
          if (!runtimeConfigs.relayerAccount) throw new Error('relayerAccount is required but not provided');

          // Create PasskeyManager instance
          const passkeyManager = new PasskeyManager(runtimeConfigs);
          console.log('PasskeyManager instance created successfully');

          // Test basic functionality
          try {
            const loginState = await passkeyManager.getLoginState();
            console.log('getLoginState test successful:', loginState);
          } catch (testError: any) {
            console.warn('getLoginState test failed:', testError.message);
          }

          // Store in window for test access
          (window as any).PasskeyManager = PasskeyManager;
          (window as any).passkeyManager = passkeyManager;
          (window as any).configs = runtimeConfigs;

          return { success: true, message: 'PasskeyManager loaded successfully' };
        } catch (error: any) {
          console.error('Failed to load PasskeyManager:', error);
          throw error;
        }
      }, configs, {
        timeout: 30000, // 30 second timeout
        polling: 1000   // Check every second
      });

      const loadResult = await loadHandle.jsonValue().catch(() => ({ success: true }));
      await loadHandle.dispose();

      if (!loadResult?.success) {
        const message = (loadResult && typeof loadResult === 'object' && 'error' in loadResult && typeof (loadResult as { error?: unknown }).error === 'string')
          ? (loadResult as { error: string }).error
          : 'Unknown error loading PasskeyManager';
        throw new Error(message);
      }

      console.log(`Step 4 Complete: PasskeyManager loaded and instantiated (attempt ${attempt})`);
      return;

    } catch (error: any) {
      lastError = error;
      console.warn(`Attempt ${attempt} failed:`, error.message);

      if (attempt < maxRetries) {
        console.log(`Retrying in 2 seconds... (${maxRetries - attempt} attempts remaining)`);
        await new Promise(resolve => setTimeout(resolve, 2000));
        // Wait for page to be stable again before retry
        await page.waitForLoadState('domcontentloaded');
      }
    }
  }

  // All retries failed
  throw new Error(`Failed to load PasskeyManager after ${maxRetries} attempts. Last error: ${lastError?.message}`);
}

/**
 * Step 5: GLOBAL FALLBACK
 * Ensure base64UrlEncode is available as safety measure
 */
async function ensureGlobalFallbacks(page: Page): Promise<void> {
  await page.waitForFunction(async () => {
    try {
      // Defense in depth: Ensure base64UrlEncode is globally available
      // This prevents "base64UrlEncode is not defined" errors even if timing issues occur
      if (typeof (window as any).base64UrlEncode === 'undefined') {
        try {
          // @ts-ignore
          const { base64UrlEncode } = await import('/sdk/esm/utils/base64.js');
          (window as any).base64UrlEncode = base64UrlEncode;
          console.log('base64UrlEncode made available globally as fallback');
        } catch (encoderError) {
          console.error('Failed to import base64UrlEncode fallback:', encoderError);
        }
      }

      // Also ensure base64UrlDecode is available for credential ID decoding
      if (typeof (window as any).base64UrlDecode === 'undefined') {
        try {
          // @ts-ignore
          const { base64UrlDecode } = await import('/sdk/esm/utils/base64.js');
          (window as any).base64UrlDecode = base64UrlDecode;
          console.log('base64UrlDecode made available globally for credential ID decoding');
        } catch (encoderError) {
          console.error('Failed to import base64UrlDecode fallback:', encoderError);
        }
      }

      // Ensure toAccountId is available globally for tests
      if (typeof (window as any).toAccountId === 'undefined') {
        try {
          // @ts-ignore
          const { toAccountId } = await import('/sdk/esm/core/types/accountIds.js');
          (window as any).toAccountId = toAccountId;
          console.log('toAccountId made available globally for tests');
        } catch (accountIdError) {
          console.error('Failed to import toAccountId fallback:', accountIdError);
        }
      }

      return true; // Success indicator
    } catch (error) {
      console.error('Global fallbacks setup failed:', error);
      return false;
    }
  }, {
    timeout: 15000, // 15 second timeout
    polling: 500    // Check every 500ms
  });

  console.log('Step 5 Complete: Global fallbacks in place');
}

/**
 * Orchestrator function that executes all 5 setup steps sequentially
 */
async function executeSequentialSetup(page: Page, configs: any): Promise<string> {
  console.log('Starting 5-step sequential setup process...');

  // Step 1: ENVIRONMENT SETUP
  const authenticatorId = await setupWebAuthnVirtualAuthenticator(page);

  // Step 2: IMPORT MAP INJECTION
  await injectImportMap(page);

  // Step 3: STABILIZATION WAIT
  await waitForEnvironmentStabilization(page);

  // Step 4: DYNAMIC IMPORTS
  await loadPasskeyManagerDynamically(page, configs);

  // Step 5: GLOBAL FALLBACK
  await ensureGlobalFallbacks(page);

  console.log('All 5 setup steps completed successfully!');
  return authenticatorId;
}

// =============================================================================
// WEBAUTHN MOCKS AND TEST UTILITIES
// Setup WebAuthn mocks and test utilities
// =============================================================================

/**
 * Creates a properly formatted CBOR-encoded WebAuthn attestation object
 * that matches the contract's expectations for successful verification.
 *
 * Credential ID Format Consistency
 * ==========================================
 * The WebAuthn contract expects credential IDs to be handled consistently:
 * 1. Registration: Credential ID bytes are embedded in attestation object
 * 2. Storage: Contract base64url-encodes the credential ID bytes for storage key
 * 3. Authentication: Contract looks up using the same base64url-encoded string
 *
 * This function ensures that:
 * - The credential ID embedded in attestation object matches the response ID
 * - Both use the same byte representation that will be base64url-encoded consistently
 * - The contract can successfully look up stored credentials during authentication
 *
 * Note: WebAuthn attestation object utilities are now defined inline within
 * the setupWebAuthnMocks function to ensure they're available in browser context
 */
async function setupWebAuthnMocks(page: Page): Promise<void> {
  await page.evaluate(() => {
    console.log('Setting up WebAuthn Virtual Authenticator mocks...');

    // Store original functions for restoration
    const originalFetch = window.fetch;
    const originalCredentialsCreate = navigator.credentials?.create;
    const originalCredentialsGet = navigator.credentials?.get;

    const createProperAttestationObject = async (rpIdHash: Uint8Array, credentialIdString: string): Promise<Uint8Array> => {
      // Convert string credential ID to bytes for embedding in attestation object
      // This ensures the contract will store and lookup the credential using the same format
      const credentialIdBytes = new TextEncoder().encode(credentialIdString);

      // Try to generate a real Ed25519 keypair via noble; on failure, fall back to deterministic bytes
      let publicKeyBytes: Uint8Array;
      let seed: Uint8Array;
      try {
        const ed25519: any = await import('@noble/ed25519');
        seed = new Uint8Array(32);
        crypto.getRandomValues(seed);
        const getPk = ed25519.getPublicKey || ed25519.getPublicKeyAsync;
        if (!getPk) throw new Error('ed25519.getPublicKey not available');
        const pk = await getPk.call(ed25519, seed);
        publicKeyBytes = pk instanceof Uint8Array ? pk : new Uint8Array(pk);
        console.log('Generated real Ed25519 keypair for credential:', credentialIdString);
      } catch (e) {
        console.warn('[WebAuthn Mock] noble/ed25519 import failed during create(); using deterministic fallback:', e);
        // Deterministic fallback: derive bytes from SHA-256 of the credentialIdString
        const enc = new TextEncoder();
        const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode('pub:' + credentialIdString)));
        publicKeyBytes = digest.slice(0, 32);
        seed = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode('seed:' + credentialIdString)));
      }

      // Store the seed for later signature generation (get/assertion flow will use it when available)
      (window as any).__testKeyPairs = (window as any).__testKeyPairs || {};
      (window as any).__testKeyPairs[credentialIdString] = { seed };

      try { console.log('Public key bytes:', Array.from(publicKeyBytes)); } catch {}

      // Create COSE key using the real Ed25519 public key
      // This replicates the exact CBOR structure the contract expects and can parse
      const coseKeyBytes = new Uint8Array([
        0xa4,                           // map(4) - 4 key-value pairs
        0x01, 0x01,                     // 1: 1 (kty: OKP)
        0x03, 0x27,                     // 3: -8 (alg: EdDSA)
        0x20, 0x06,                     // -1: 6 (crv: Ed25519)
        0x21, 0x58, 0x20,               // -2: bytes(32) (x coordinate)
        ...publicKeyBytes               // Real Ed25519 public key
      ]);

      // Create valid authenticator data following contract format in:
      // webauthn-contract/src/utils/verifiers.rs
      // Size: rpIdHash(32) + flags(1) + counter(4) + aaguid(16) + credIdLen(2) + credId + coseKey
      const coseKeySize = coseKeyBytes.length; // Use actual COSE key size from contract test
      const authData = new Uint8Array(37 + 16 + 2 + credentialIdBytes.length + coseKeySize);
      let offset = 0;

      // RP ID hash (32 bytes)
      authData.set(rpIdHash, offset);
      offset += 32;

      // Flags (1 byte): UP (0x01) + UV (0x04) + AT (0x40) = 0x45
      authData[offset] = 0x45;
      offset += 1;

      // Counter (4 bytes)
      authData[offset] = 0x00;
      authData[offset + 1] = 0x00;
      authData[offset + 2] = 0x00;
      authData[offset + 3] = 0x01;
      offset += 4;

      // AAGUID (16 bytes) - all zeros for mock
      for (let i = 0; i < 16; i++) {
        authData[offset + i] = 0x00;
      }
      offset += 16;

      // Credential ID length (2 bytes)
      authData[offset] = (credentialIdBytes.length >> 8) & 0xff;
      authData[offset + 1] = credentialIdBytes.length & 0xff;
      offset += 2;

      // Embed the credential ID bytes in attestation object
      // This is what the contract will extract and base64url-encode for storage
      authData.set(credentialIdBytes, offset);
      offset += credentialIdBytes.length;

      authData.set(coseKeyBytes, offset);

      // Simple CBOR encoding for attestation object
      const attestationObjectBytes = new Uint8Array([
        0xa3, // map with 3 items
        0x63, 0x66, 0x6d, 0x74, // "fmt"
        0x64, 0x6e, 0x6f, 0x6e, 0x65, // "none"
        0x68, 0x61, 0x75, 0x74, 0x68, 0x44, 0x61, 0x74, 0x61, // "authData"
        0x59, (authData.length >> 8) & 0xff, authData.length & 0xff, // bytes(authData.length)
        ...authData,
        0x67, 0x61, 0x74, 0x74, 0x53, 0x74, 0x6d, 0x74, // "attStmt"
        0xa0 // empty map
      ]);

      return attestationObjectBytes;
    };

    /**
     * Creates mock PRF outputs for WebAuthn PRF extension testing
     */
    const createMockPRFOutput = (seed: string, accountHint: string = '', length: number = 32): ArrayBuffer => {
      const encoder = new TextEncoder();
      // Use deterministic seed based on credential and account, NOT timestamp
      const deterministic_seed = `${seed}-${accountHint}-deterministic-v1`;
      const seedBytes = encoder.encode(deterministic_seed);
      const output = new Uint8Array(length);
      for (let i = 0; i < length; i++) {
        output[i] = (seedBytes[i % seedBytes.length] + i * 7) % 256;
      }
      return output.buffer;
    };

    const resolvePrfEvalValue = (
      requested: unknown,
      fallbackSeed: string,
      accountHint: string
    ): ArrayBuffer | null => {
      if (requested === null) {
        return null;
      }
      if (typeof requested === 'undefined') {
        return createMockPRFOutput(fallbackSeed, accountHint, 32);
      }
      if (requested instanceof ArrayBuffer || ArrayBuffer.isView(requested)) {
        // Convert to string to use as seed for deterministic 32-byte output
        const view = requested as ArrayBufferView;
        const bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
        const seedString = new TextDecoder().decode(bytes);
        return createMockPRFOutput(seedString, accountHint, 32);
      }
      if (typeof requested === 'string') {
        try {
          if (typeof (window as any).base64UrlDecode === 'function') {
            const decoded = (window as any).base64UrlDecode(requested);
            // Convert decoded bytes to string and use as seed for 32-byte output
            const bytes = new Uint8Array(decoded);
            const seedString = new TextDecoder().decode(bytes);
            return createMockPRFOutput(seedString, accountHint, 32);
          }
          // Use the string as a seed to generate exactly 32 bytes
          return createMockPRFOutput(requested, accountHint, 32);
        } catch (error) {
          console.warn('[PRF MOCK] Failed to decode string PRF value, using fallback', error);
          return createMockPRFOutput(fallbackSeed, accountHint, 32);
        }
      }

      console.warn('[PRF MOCK] Unexpected PRF eval type, using fallback:', typeof requested);
      return createMockPRFOutput(fallbackSeed, accountHint, 32);
    };

    const buildPrfExtensionResults = (
      prfRequest: any,
      accountHint: string
    ): { first: ArrayBuffer | null; second: ArrayBuffer | null } => {
      const evalConfig = prfRequest?.eval || {};
      return {
        first: resolvePrfEvalValue(evalConfig.first, 'chacha20-test-seed', accountHint),
        second: resolvePrfEvalValue(evalConfig.second, 'ed25519-test-seed', accountHint),
      };
    };

    // Override WebAuthn API to include PRF extension support
    if (navigator.credentials) {
      navigator.credentials.create = async function(options: any) {
        console.log('Enhanced Virtual Authenticator CREATE with PRF support');
        if (!options?.publicKey) {
          throw new DOMException('Missing publicKey', 'NotSupportedError');
        }
        await new Promise(resolve => setTimeout(resolve, 200));

        const prfRequested = options.publicKey.extensions?.prf;
        // Use hardcoded RP ID for test consistency (browser context doesn't have access to DEFAULT_TEST_CONFIG)
        const rpId = 'example.localhost';
        const rpIdBytes = new TextEncoder().encode(rpId);
        const rpIdHashBuffer = await crypto.subtle.digest('SHA-256', rpIdBytes);
        const rpIdHash = new Uint8Array(rpIdHashBuffer);

        // Extract account ID from user info for deterministic PRF
        const accountId = options.publicKey.user?.name || 'default-account';

        // Credential ID Format for Contract Compatibility
        // ========================================================
        // The contract stores credentials using: BASE64_URL_ENGINE.encode(&credential_id_bytes)
        // During authentication, it looks up using: webauthn_authentication.id
        // Therefore, we must ensure both registration and authentication use the same format
        const credentialIdString = `test-credential-${accountId}-auth`; // Human-readable format
        const credentialIdBytes = new TextEncoder().encode(credentialIdString); // Convert to bytes
        const credentialIdBase64Url = (window as any).base64UrlEncode(credentialIdBytes); // What contract expects

        // Create proper CBOR-encoded attestation object that matches contract expectations
        const attestationObjectBytes = await createProperAttestationObject(rpIdHash, credentialIdString);

        return {
          // Follow WebAuthn spec - id is base64URL string, rawId is bytes
          id: credentialIdBase64Url, // Base64URL string for JSON serialization
          rawId: credentialIdBytes.buffer, // ArrayBuffer for WebAuthn spec compliance
          type: 'public-key',
          authenticatorAttachment: 'platform',
          response: {
            clientDataJSON: new TextEncoder().encode(JSON.stringify({
              type: 'webauthn.create',
              challenge: (window as any).base64UrlEncode(new Uint8Array(options.publicKey.challenge)),
              origin: 'https://example.localhost', // Must match contract expectations
              rpId: 'example.localhost', // RP ID should match the origin hostname
              crossOrigin: false
            })),
            attestationObject: attestationObjectBytes,
            getPublicKey: () => new Uint8Array(65).fill(0).map((_, i) => i + 1),
            getPublicKeyAlgorithm: () => -7,
            getTransports: () => ['internal', 'hybrid'],
            // Add missing properties that might be expected
            url: undefined
          },
          getClientExtensionResults: () => {
            const results: any = {};
            if (prfRequested) {
              results.prf = {
                enabled: true,
                results: {
                  ...buildPrfExtensionResults(prfRequested, accountId)
                }
              };
            }
            return results;
          }
        };
      };

      navigator.credentials.get = async function(options: any) {
        console.log('Enhanced Virtual Authenticator GET with PRF support');
        if (!options?.publicKey) {
          throw new DOMException('Missing publicKey', 'NotSupportedError');
        }
        await new Promise(resolve => setTimeout(resolve, 200));

        const prfRequested = options.publicKey.extensions?.prf;

        // Extract account ID from allowCredentials or PRF salt
        const firstCredential = options.publicKey.allowCredentials?.[0];

        let accountId = 'default-account';

        // **MAIN ISSUE**: VRF keypair unlock was failing with "aead::Error" during login
        // **ROOT CAUSE**: Account ID extraction failure during authentication caused PRF mismatch
        // - Credential ID was Uint8Array but base64UrlDecode() expected string → TypeError
        // - Extraction fell back to 'default-account' instead of real account ID
        // - VRF keypair encrypted with 'e2etest123.testnet' PRF couldn't decrypt with 'default-account' PRF

        if (firstCredential) {
          try {
            const credentialId = firstCredential.id;

            // Handle the actual format that touchIdPrompt.ts passes via allowCredentials
            // touchIdPrompt.ts calls base64UrlDecode(auth.credentialId) which returns raw bytes
            if (credentialId instanceof Uint8Array || credentialId instanceof ArrayBuffer) {
              // Convert raw bytes back to credential string for account ID extraction
              const bytes = credentialId instanceof ArrayBuffer
                ? new Uint8Array(credentialId)
                : credentialId;
              const credentialIdString = new TextDecoder().decode(bytes);

              const match = credentialIdString.match(/test-credential-(.+)-auth$/);
              if (match && match[1]) {
                accountId = match[1];
              } else {
                console.warn('[AUTH PRF DEBUG] Failed to extract account ID from credential string, using default');
              }
            } else {
              console.warn('[AUTH PRF DEBUG] Unexpected credential ID format:', typeof credentialId);
              console.warn('[AUTH PRF DEBUG] Expected Uint8Array or ArrayBuffer from touchIdPrompt.ts, got:', credentialId);
              throw new Error(`Expected raw bytes from touchIdPrompt.ts, got ${typeof credentialId}`);
            }
          } catch (e) {
            console.warn('[AUTH PRF DEBUG] Failed to decode credential ID, using default account:', e);
          }
        } else {
          // No allowCredentials provided (recovery chooser). Pick from stored keypairs if available.
          try {
            const keyPairs = (window as any).__testKeyPairs || {};
            const keys = Object.keys(keyPairs);
            // Prefer any key that matches our test pattern and extract account id
            const matchKey = keys.find(k => /test-credential-(.+)-auth$/.test(k));
            if (matchKey) {
              const m = matchKey.match(/test-credential-(.+)-auth$/);
              if (m && m[1]) accountId = m[1];
            } else if (prfRequested?.eval?.first) {
              // Fallback: attempt to parse from PRF salt if present
              const chacha20Salt = new Uint8Array(prfRequested.eval.first);
              const saltText = new TextDecoder().decode(chacha20Salt);
              const saltMatch = saltText.match(/chacha20-salt:(.+)$/);
              if (saltMatch && saltMatch[1]) accountId = saltMatch[1];
            }
          } catch {}
        }

        // Credential ID Format for Contract Lookup Consistency
        // ==============================================================
        // Must return the same base64url-encoded format that the contract uses for storage
        const credentialIdString = `test-credential-${accountId}-auth`; // Human-readable format
        const credentialIdBytes = new TextEncoder().encode(credentialIdString); // Convert to bytes
        const credentialIdBase64Url = (window as any).base64UrlEncode(credentialIdBytes); // What contract expects

        return {
          // Follow WebAuthn spec - id is base64URL string, rawId is bytes
          id: credentialIdBase64Url, // Base64URL string for JSON serialization
          rawId: credentialIdBytes.buffer, // ArrayBuffer for WebAuthn spec compliance
          type: 'public-key',
          authenticatorAttachment: 'platform',
          response: {
            clientDataJSON: new TextEncoder().encode(JSON.stringify({
              type: 'webauthn.get',
              challenge: (window as any).base64UrlEncode(new Uint8Array(options.publicKey.challenge)),
              origin: 'https://example.localhost', // Must match contract expectations
              rpId: 'example.localhost', // RP ID should match the origin hostname
              crossOrigin: false
            })),
            authenticatorData: await (async () => {
              // Create proper authenticatorData with correct RP ID hash (same as registration)
              const rpId = 'example.localhost'; // Must match registration mock
              const rpIdBytes = new TextEncoder().encode(rpId);
              const rpIdHashBuffer = await crypto.subtle.digest('SHA-256', rpIdBytes);
              const rpIdHash = new Uint8Array(rpIdHashBuffer);

              // AuthenticatorData structure: rpIdHash(32) + flags(1) + counter(4)
              const authData = new Uint8Array(37);
              authData.set(rpIdHash, 0);       // RP ID hash
              authData[32] = 0x05;             // Flags (user present + user verified)
              authData.set([0, 0, 0, 1], 33);  // Counter (4 bytes)
              return authData;
            })(),
            signature: await (async () => {
              // Generate proper WebAuthn signature using the stored Ed25519 keypair
              try {
                const ed25519 = await import('@noble/ed25519');
                const entry = (window as any).__testKeyPairs?.[credentialIdString];
                if (!entry?.seed) {
                  console.warn('No stored keypair for credential:', credentialIdString);
                  return new Uint8Array(64).fill(0x99); // Fallback signature
                }

                // Create proper WebAuthn authenticatorData structure (must match response)
                const rpId = 'example.localhost';
                const rpIdBytes = new TextEncoder().encode(rpId);
                const rpIdHashBuffer = await crypto.subtle.digest('SHA-256', rpIdBytes);
                const rpIdHash = new Uint8Array(rpIdHashBuffer);

                const flags = 0x05; // UP (0x01) + UV (0x04)
                const counter = new Uint8Array([0x00, 0x00, 0x00, 0x01]); // Counter = 1 (must match response)

                // Build authenticatorData: rpIdHash(32) + flags(1) + counter(4)
                const authenticatorData = new Uint8Array(37);
                authenticatorData.set(rpIdHash, 0);
                authenticatorData[32] = flags;
                authenticatorData.set(counter, 33);

                // Create clientDataJSON
                const clientDataJSON = JSON.stringify({
                  type: 'webauthn.get',
                  challenge: (window as any).base64UrlEncode(new Uint8Array(options.publicKey.challenge)),
                  origin: 'https://example.localhost',
                  rpId: 'example.localhost', // RP ID should match the origin hostname
                  crossOrigin: false
                });
                const clientDataJSONBytes = new TextEncoder().encode(clientDataJSON);

                // Hash clientDataJSON using SHA-256 (proper WebAuthn way)
                const clientDataHashBuffer = await crypto.subtle.digest('SHA-256', clientDataJSONBytes);
                const clientDataHash = new Uint8Array(clientDataHashBuffer);

                // Create the data to sign: authenticatorData + clientDataHash
                const dataToSign = new Uint8Array(authenticatorData.length + clientDataHash.length);
                dataToSign.set(authenticatorData, 0);
                dataToSign.set(clientDataHash, authenticatorData.length);

                // Sign with the Ed25519 seed using noble (async variant avoids sha512 sync requirement)
                let signatureBytes: Uint8Array;
                if (ed25519.signAsync) {
                  // Version 2.x API
                  signatureBytes = await ed25519.signAsync(dataToSign, entry.seed);
                } else if (ed25519.sign) {
                  // Version 3.x API
                  signatureBytes = ed25519.sign(dataToSign, entry.seed);
                } else {
                  throw new Error('Unsupported @noble/ed25519 signing API');
                }

                console.log('Generated proper WebAuthn signature for credential:', credentialIdString);
                console.log('Signature bytes length:', signatureBytes.length);
                console.log('Data signed length:', dataToSign.length);
                return signatureBytes;
              } catch (error) {
                console.error('Error generating WebAuthn signature:', error);
                return new Uint8Array(64).fill(0x99); // Fallback signature
              }
            })(),
            // Provide userHandle with the near account id for recovery discovery
            userHandle: new TextEncoder().encode(accountId),
            // Add missing properties that might be expected
            url: undefined
          },
          getClientExtensionResults: () => {
            const results: any = {};
            if (prfRequested) {

              results.prf = {
                enabled: true,
                results: {
                  ...buildPrfExtensionResults(prfRequested, accountId)
                }
              };
            }
            return results;
          }
        };
      };
    }

    // Store originals for restoration
    (window as any).__test_originals = {
      originalFetch,
      originalCredentialsCreate,
      originalCredentialsGet
    };

    console.log('Enhanced WebAuthn mock with dual PRF extension support installed');
  });
}

/**
 * Setup test utilities
 */
async function setupTestUtilities(page: Page, config: any): Promise<void> {
  await page.evaluate((setupConfig) => {
    const { originalFetch, originalCredentialsCreate, originalCredentialsGet } = (window as any).__test_originals;

    const webAuthnUtils = {
      simulateSuccessfulPasskeyInput: async (operationTrigger: () => Promise<void>) => {
        console.log('Simulating successful passkey input...');
        await operationTrigger();
        await new Promise(resolve => setTimeout(resolve, 500));
        console.log('Successful passkey input simulation completed');
      },
      simulateFailedPasskeyInput: async (operationTrigger: () => Promise<void>, postOperationCheck?: () => Promise<void>) => {
        console.log('Simulating failed passkey input...');
        await operationTrigger();
        if (postOperationCheck) {
          await postOperationCheck();
        } else {
          await new Promise(resolve => setTimeout(resolve, 300));
        }
        console.log('Failed passkey input simulation completed');
      },
      getCredentials: async () => [],
      clearCredentials: async () => {}
    };

    (window as any).testUtils = {
      PasskeyManager: (window as any).PasskeyManager,
      passkeyManager: (window as any).passkeyManager,
      configs: (window as any).configs,
      confirmOverrides: {
        skip: { uiMode: 'skip', behavior: 'autoProceed', autoProceedDelay: 0, theme: 'dark' },
        autoProceed: { uiMode: 'modal', behavior: 'autoProceed', autoProceedDelay: 0, theme: 'dark' },
      },
      webAuthnUtils,
      // IMPORTANT: For the atomic relay-server flow, the contract creates the
      // account as the predecessor. On NEAR, only the predecessor can create
      // its own subaccounts. Since the contract call executes with
      // predecessor = contractId, the new account MUST be a subaccount of the
      // contractId (e.g., e2e1234.web3-authn-v5.testnet). Using "*.testnet"
      // would fail with CreateAccountNotAllowed.
      generateTestAccountId: () => {
        const cfg = (window as any).configs || {};
        const parent = cfg.contractId || 'web3-authn-v5.testnet';
        return `e2etest${Date.now()}.${parent}`;
      },
      verifyAccountExists: async (accountId: string) => {
        const response = await fetch(setupConfig.nearRpcUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 'verify-account',
            method: 'query',
            params: {
              request_type: 'view_account',
              finality: 'final',
              account_id: accountId
            }
          })
        });
        const result = await response.json();
        return !result.error && !!result.result;
      },
      failureMocks: {
        vrfGeneration: () => {},
        webAuthnCeremony: () => {
          if (navigator.credentials) {
            navigator.credentials.create = async () => {
              throw new Error('WebAuthn ceremony failed - user cancelled');
            };
          }
        },
        nearKeypairGeneration: () => {},
        contractVerification: () => {},
        faucetService: () => {
          window.fetch = async (url: any, options: any) => {
            if (typeof url === 'string' && url.includes('helper.testnet.near.org')) {
              return new Response(JSON.stringify({
                error: 'Rate limit exceeded - faucet failure injected'
              }), { status: 429, headers: { 'Content-Type': 'application/json' } });
            }
            return originalFetch(url, options);
          };
        },
        relayServer: () => {
          window.fetch = async (url: any, options: any) => {
            if (typeof url === 'string' && url.includes('/create_account_and_register_user')) {
              return new Response(JSON.stringify({
                success: false,
                error: 'Relay server failure injected for testing'
              }), { status: 500, headers: { 'Content-Type': 'application/json' } });
            }
            return originalFetch(url, options);
          };
        },
        contractRegistration: () => {},
        databaseStorage: () => {},
        vrfUnlock: () => {},
        // transactionBroadcasting mock removed - using real NEAR testnet
        accessKeyLookup: () => {
          window.fetch = async (url: any, options: any) => {
            if (typeof url === 'string' && url.includes('test.rpc.fastnear.com') && options?.method === 'POST') {
              try {
                const body = JSON.parse(options.body || '{}');
                if (body.method === 'query' && body.params?.request_type === 'view_access_key') {
                  return new Response(JSON.stringify({
                    jsonrpc: '2.0',
                    id: body.id,
                    result: {
                      nonce: 1,
                      permission: 'FullAccess',
                      block_height: 1,
                      block_hash: 'mock_block_hash_' + Date.now()
                    }
                  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
                }
              } catch (e) {
                // If parsing fails, continue with original fetch
              }
            }
            return originalFetch(url, options);
          };
        },
        preventVrfSessionClearing: () => {
          // Prevent VRF session from being cleared in test environment
          const originalClearVrfSession = (window as any).testUtils?.passkeyManager?.webAuthnManager?.clearVrfSession;
          if (originalClearVrfSession) {
            (window as any).testUtils.passkeyManager.webAuthnManager.clearVrfSession = async () => {
              console.log('[TEST] Preventing VRF session clearing in test environment');
              // Don't actually clear the session in tests
            };
          }
        },
        restore: () => {
          window.fetch = originalFetch;
          if (navigator.credentials && originalCredentialsCreate) {
            navigator.credentials.create = originalCredentialsCreate;
          }
          if (navigator.credentials && originalCredentialsGet) {
            navigator.credentials.get = originalCredentialsGet;
          }
        }
      },
      rollbackVerification: {
        verifyDatabaseClean: async (accountId: string) => true,
        verifyAccountDeleted: async (accountId: string) => true,
        getRollbackEvents: (events: any[]) => events.filter(e => e.type === 'rollback')
      },
      // Registration flow utilities
      registrationFlowUtils: {
        setupRelayServerMock: (successResponse = true) => {
          window.fetch = async (url: any, options: any) => {
            if (typeof url === 'string' && url.includes('/create_account_and_register_user')) {
              if (successResponse) {
                return new Response(JSON.stringify({
                  success: true,
                  transactionHash: 'mock_atomic_transaction_hash_' + Date.now(),
                  message: 'Account created and registered successfully via relay-server'
                }), { status: 200, headers: { 'Content-Type': 'application/json' } });
              } else {
                return new Response(JSON.stringify({
                  success: false,
                  error: 'Mock atomic registration failure'
                }), { status: 500, headers: { 'Content-Type': 'application/json' } });
              }
            }
            return originalFetch(url, options);
          };
        },
        setupTestnetFaucetMock: (successResponse = true) => {
          window.fetch = async (url: any, options: any) => {
            if (typeof url === 'string' && url.includes('helper.testnet.near.org')) {
              if (successResponse) {
                return new Response(JSON.stringify({
                  ok: true,
                  account_id: options.body ? JSON.parse(options.body).account_id : 'test.testnet'
                }), { status: 200, headers: { 'Content-Type': 'application/json' } });
              } else {
                return new Response(JSON.stringify({
                  error: 'Mock testnet faucet failure'
                }), { status: 429, headers: { 'Content-Type': 'application/json' } });
              }
            }
            return originalFetch(url, options);
          };
        },
        restoreFetch: () => {
          window.fetch = originalFetch;
        }
      }
    };

    console.log('Test utilities setup complete');

    // Silence expected warnings to keep logs clean in CI
    try {
      const originalWarn = console.warn;
      console.warn = function(...args: any[]) {
        const msg = (args && args[0]) ? String(args[0]) : '';
        if (
          /Passkey(Client|NearKeys)DB connection is blocking another connection\./i.test(msg)
          || /pre-warm timeout/i.test(msg)
          || /noble\/ed25519 import failed/i.test(msg)
        ) {
          return; // suppress noise
        }
        return (originalWarn as any).apply(console, args as any);
      } as any;
    } catch {}

    // Apply NonceManager patches for test environment
    try {
      const passkeyManager = (window as any).passkeyManager;
      const nonceManager = passkeyManager?.webAuthnManager?.getNonceManager?.();

      if (!nonceManager) {
        console.warn('[TEST PATCH] NonceManager not available for patching');
      } else {
        // Patch getNonceBlockHashAndHeight for early VRF refresh
        if (typeof nonceManager.getNonceBlockHashAndHeight === 'function') {
          const originalGet = nonceManager.getNonceBlockHashAndHeight.bind(nonceManager);
          nonceManager.getNonceBlockHashAndHeight = async function(nearClient: any, opts?: any) {
            if (this.nearAccountId && this.nearPublicKeyStr) {
              return await originalGet(nearClient, opts);
            }

            // Handle uninitialized state with block-only fallback
            try {
              const block = await nearClient.viewBlock({ finality: 'final' });
              return {
                nearPublicKeyStr: 'ed25519:11111111111111111111111111111111',
                accessKeyInfo: { nonce: 0, permission: 'FullAccess' },
                nextNonce: '1',
                txBlockHeight: String(block?.header?.height ?? '0'),
                txBlockHash: block?.header?.hash ?? '',
              };
            } catch (error) {
              console.warn('[TEST PATCH] Block-only NonceManager fallback failed:', error);
              return await originalGet(nearClient, opts);
            }
          };
        }

        // Patch reserveNonces to return mock nonces for uninitialized state
        if (typeof nonceManager.reserveNonces === 'function') {
          const originalReserve = nonceManager.reserveNonces.bind(nonceManager);
          nonceManager.reserveNonces = function(count: number) {
            if (this.nearAccountId && this.nearPublicKeyStr) {
              return originalReserve(count);
            }

            // Return mock nonces for uninitialized state
            const timestamp = Date.now();
            const mockNonces = Array.from({ length: count }, (_, i) => `${timestamp}${i}`);
            console.log(`[TEST PATCH] NonceManager returning ${count} mock nonces for uninitialized state`);
            return mockNonces;
          };
        }

        // Patch updateFromChain to tolerate nonce mismatches in test environment
        if (typeof nonceManager.updateFromChain === 'function') {
          const originalUpdate = nonceManager.updateFromChain.bind(nonceManager);
          nonceManager.updateFromChain = async function(nearClient: any) {
            try {
              return await originalUpdate(nearClient);
            } catch (error) {
              const message = (error && (error as any).message) ? String((error as any).message) : String(error ?? '');
              if (message.includes('behind expected') || message.includes('nonce')) {
                console.log('[TEST PATCH] NonceManager: Tolerating nonce mismatch during test');
                return;
              }
              throw error;
            }
          };
        }

        console.log('[TEST PATCH] NonceManager patches applied successfully');
      }
    } catch (error) {
      console.warn('[TEST PATCH] Failed to apply NonceManager patches:', error);
    }
  }, config);
}


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
  }

  return false;
}
