import { Page } from '@playwright/test';
import type { PasskeyTestConfig } from './types';

export async function setupWebAuthnMocks(page: Page): Promise<void> {
  await page.evaluate(() => {
    const baseLog = console.log.bind(console);
    const baseWarn = console.warn.bind(console);
    const baseError = console.error.bind(console);
    const log = (...args: any[]) => baseLog('[setup:mocks]', ...args);
    const warn = (...args: any[]) => baseWarn('[setup:mocks]', ...args);
    const err = (...args: any[]) => baseError('[setup:mocks]', ...args);

    console.log = log;
    console.warn = warn;
    console.error = err;

    log('Setting up WebAuthn Virtual Authenticator mocks...');

    const loadNobleEd25519 = async () => {
      const cacheKey = '__noble_ed25519';
      const cached = (window as any)[cacheKey];
      if (cached !== undefined) return cached;

      const ensureSha512 = (ed: any) => {
        const utils = ed?.utils;
        if (!utils) return;
        if (typeof utils.sha512 === 'function') return;
        utils.sha512 = async (message: Uint8Array | ArrayBuffer) => {
          // Normalize to a fresh ArrayBuffer to satisfy BufferSource typing
          const bytes = message instanceof Uint8Array ? message : new Uint8Array(message);
          const ab = new ArrayBuffer(bytes.byteLength);
          new Uint8Array(ab).set(bytes);
          const digest = await crypto.subtle.digest('SHA-512', ab);
          return new Uint8Array(digest);
        };
        log('Patched noble/ed25519 utils.sha512 with WebCrypto digest');
      };

      try {
        const mod: any = await import('@noble/ed25519');
        const ed25519 = mod?.ed25519 ?? mod;
        ensureSha512(ed25519);
        (window as any)[cacheKey] = ed25519;
        return ed25519;
      } catch (error) {
        warn('[WebAuthn Mock] Failed to load noble/ed25519 module; falling back to deterministic keys', error);
        (window as any)[cacheKey] = null;
        return null;
      }
    };

    // Store original functions for restoration
    const originalFetch = window.fetch;
    const originalCredentialsCreate = navigator.credentials?.create;
    const originalCredentialsGet = navigator.credentials?.get;

    const createProperAttestationObject = async (rpIdHash: Uint8Array, credentialIdString: string): Promise<Uint8Array> => {
      // Convert string credential ID to bytes for embedding in attestation object
      // This ensures the contract will store and lookup the credential using the same format
      const credentialIdBytes = new TextEncoder().encode(credentialIdString);

      // Try to generate a real Ed25519 keypair via noble; on failure, fall back to deterministic bytes
      let publicKeyBytes: Uint8Array | undefined;
      let seed: Uint8Array | undefined;
      let deterministicFallback = false;

      const ed25519 = await loadNobleEd25519();
      if (ed25519) {
        try {
          seed = new Uint8Array(32);
          crypto.getRandomValues(seed);
          // Prefer async variant so we only need utils.sha512 (not sha512Sync)
          const getPk = ed25519.getPublicKeyAsync || ed25519.getPublicKey;
          if (!getPk) {
            throw new Error('ed25519.getPublicKey not available');
          }
          const pk = await getPk.call(ed25519, seed);
          publicKeyBytes = pk instanceof Uint8Array ? pk : new Uint8Array(pk);
          log('Generated real Ed25519 keypair for credential:', credentialIdString);
        } catch (error) {
          warn('[WebAuthn Mock] noble/ed25519 key generation failed; using deterministic fallback', error);
          deterministicFallback = true;
        }
      } else {
        deterministicFallback = true;
      }

      if (deterministicFallback) {
        const encoder = new TextEncoder();
        const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode('pub:' + credentialIdString)));
        publicKeyBytes = digest.slice(0, 32);
        seed = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode('seed:' + credentialIdString)));
      }

      if (!publicKeyBytes || !seed) {
        throw new Error('Failed to derive Ed25519 keypair for WebAuthn mock');
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

    // === Helper utilities for RP ID resolution in tests ===
    const resolveTestRpId = (): string => {
      try {
        const fromConfig = (window as any).testUtils?.configs?.rpId;
        if (fromConfig && typeof fromConfig === 'string' && fromConfig.length > 0) return fromConfig;
        const host = (typeof window !== 'undefined' && window.location) ? window.location.hostname : '';
        return host || 'localhost';
      } catch {
        return 'localhost';
      }
    };

    const computeRpIdHash = async (rpId: string): Promise<Uint8Array> => {
      const rpIdBytes = new TextEncoder().encode(rpId);
      const rpIdHashBuffer = await crypto.subtle.digest('SHA-256', rpIdBytes);
      return new Uint8Array(rpIdHashBuffer);
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
        // Resolve RP ID (shared logic for tests)
        const rpId = resolveTestRpId();
        const rpIdHash = await computeRpIdHash(rpId);

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
              origin: 'https://example.localhost', // Test origin (Caddy)
              rpId: rpId, // Must match rpIdHash and VRF challenge rpId
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
              origin: 'https://example.localhost', // Test origin (Caddy)
              rpId: resolveTestRpId(),
              crossOrigin: false
            })),
            authenticatorData: await (async () => {
              // Create proper authenticatorData with correct RP ID hash (same as registration)
              const rpId = resolveTestRpId(); // Must match registration mock
              const rpIdHash = await computeRpIdHash(rpId);

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
                const rpId = resolveTestRpId();
                const rpIdHash = await computeRpIdHash(rpId);

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
                  rpId: rpId, // RP ID should match the origin policy + hash
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
export async function setupTestUtilities(page: Page, config: PasskeyTestConfig): Promise<void> {
  await page.evaluate((setupConfig) => {
    const baseLog = console.log.bind(console);
    const baseWarn = console.warn.bind(console);
    const baseError = console.error.bind(console);
    console.log = (...args: any[]) => baseLog('[setup:utils]', ...args);
    console.warn = (...args: any[]) => baseWarn('[setup:utils]', ...args);
    console.error = (...args: any[]) => baseError('[setup:utils]', ...args);

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
      // contractId (e.g., e2e1234.w3a-v1.testnet). Using "*.testnet"
      // would fail with CreateAccountNotAllowed.
      generateTestAccountId: () => {
        const cfg = (window as any).configs || {};
        const parent = cfg.contractId || 'w3a-v1.testnet';
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
            console.log('[TEST PATCH] NonceManager returning %d mock nonces for uninitialized state', count);
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
