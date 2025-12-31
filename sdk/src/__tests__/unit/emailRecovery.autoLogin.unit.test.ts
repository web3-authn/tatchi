import { test, expect } from '@playwright/test';
import { setupBasicPasskeyTest } from '../setup';

const IMPORT_PATHS = {
  emailRecovery: '/sdk/esm/core/TatchiPasskey/emailRecovery.js',
} as const;

const CONFIG = {
  relayer: {
    emailRecovery: {
      minBalanceYocto: '0',
      pollingIntervalMs: 10,
      maxPollingDurationMs: 1000,
      pendingTtlMs: 60_000,
      mailtoAddress: 'recovery@example.com',
    },
  },
  contractId: 'contract.testnet',
  nearRpcUrl: 'https://rpc.testnet',
  vrfWorkerConfigs: {
    shamir3pass: { relayServerUrl: 'https://relay.testnet' },
  },
};

test.describe('EmailRecoveryFlow attemptAutoLogin strategies', () => {
  test.beforeEach(async ({ page }) => {
    await setupBasicPasskeyTest(page);
  });

  test('prefers Shamir unlock when available', async ({ page }) => {
    const result = await page.evaluate(async ({ paths, config }) => {
      const mod = await import(paths.emailRecovery);
      if (mod.init_emailRecovery) {
        mod.init_emailRecovery();
      }
      const EmailRecoveryFlow =
        mod.EmailRecoveryFlow ?? mod.emailRecovery_exports?.EmailRecoveryFlow;
      if (!EmailRecoveryFlow) {
        throw new Error('EmailRecoveryFlow export missing');
      }
      const calls: string[] = [];
      const accountId = 'alice.testnet';

      const webAuthnManager = {
        shamir3PassDecryptVrfKeypair: async () => {
          calls.push('shamir');
          return { success: true };
        },
        checkVrfStatus: async () => ({ active: true, nearAccountId: accountId }),
        setLastUser: async () => { calls.push('setLastUser'); },
        initializeCurrentUser: async () => { calls.push('initializeCurrentUser'); },
        getLastUser: async () => ({ nearAccountId: accountId, clientNearPublicKey: 'pk' }),
        getWarmSigningSessionStatus: async () => ({ active: true }),
        getAuthenticatorsByUser: async () => { calls.push('getAuthenticators'); return []; },
        getAuthenticationCredentialsSerializedDualPrf: async () => {
          calls.push('touchId');
          return { rawId: 'cred-raw', id: 'cred-raw' };
        },
        unlockVRFKeypair: async () => { calls.push('unlock'); return { success: true }; },
        clearVrfSession: async () => { calls.push('clearVrfSession'); },
      };

      const flow = new EmailRecoveryFlow({
        configs: config,
        nearClient: {},
        webAuthnManager,
      });

	      const rec = {
	        accountId,
	        deviceNumber: 1,
	        nearPublicKey: 'ed25519:alice',
	        requestId: 'REQ123',
	        encryptedVrfKeypair: { encryptedVrfDataB64u: 'enc', chacha20NonceB64u: 'nonce' },
        serverEncryptedVrfKeypair: {
          ciphertextVrfB64u: 'cipher',
          kek_s_b64u: 'kek',
          serverKeyId: 'server-key',
        },
        vrfPublicKey: 'vrf',
        credential: {
          id: 'cred-id',
          rawId: 'cred-raw',
          type: 'public-key',
          response: { attestationObject: 'att', clientDataJSON: 'client' },
        },
        createdAt: 1000,
        status: 'finalizing',
      };

      const result = await (flow as any).attemptAutoLogin(rec);
      return { result, calls };
    }, { paths: IMPORT_PATHS, config: CONFIG });

    expect(result.result.success).toBe(true);
    expect(result.result.method).toBe('shamir');
    expect(result.calls).toContain('shamir');
    expect(result.calls).not.toContain('touchId');
  });

  test('falls back to TouchID when Shamir unavailable', async ({ page }) => {
    const result = await page.evaluate(async ({ paths, config }) => {
      const mod = await import(paths.emailRecovery);
      if (mod.init_emailRecovery) {
        mod.init_emailRecovery();
      }
      const EmailRecoveryFlow =
        mod.EmailRecoveryFlow ?? mod.emailRecovery_exports?.EmailRecoveryFlow;
      if (!EmailRecoveryFlow) {
        throw new Error('EmailRecoveryFlow export missing');
      }
      const calls: string[] = [];
      const accountId = 'bob.testnet';

      const webAuthnManager = {
        shamir3PassDecryptVrfKeypair: async () => {
          calls.push('shamir');
          return { success: false };
        },
        checkVrfStatus: async () => ({ active: true, nearAccountId: accountId }),
        setLastUser: async () => { calls.push('setLastUser'); },
        initializeCurrentUser: async () => { calls.push('initializeCurrentUser'); },
        getLastUser: async () => ({ nearAccountId: accountId, clientNearPublicKey: 'pk' }),
        getWarmSigningSessionStatus: async () => ({ active: true }),
        getAuthenticatorsByUser: async () => { calls.push('getAuthenticators'); return []; },
        getAuthenticationCredentialsSerializedDualPrf: async () => {
          calls.push('touchId');
          return { rawId: 'cred-raw', id: 'cred-raw' };
        },
        unlockVRFKeypair: async () => { calls.push('unlock'); return { success: true }; },
        clearVrfSession: async () => { calls.push('clearVrfSession'); },
      };

      const flow = new EmailRecoveryFlow({
        configs: config,
        nearClient: {},
        webAuthnManager,
      });

	      const rec = {
	        accountId,
	        deviceNumber: 1,
	        nearPublicKey: 'ed25519:bob',
	        requestId: 'REQ999',
	        encryptedVrfKeypair: { encryptedVrfDataB64u: 'enc', chacha20NonceB64u: 'nonce' },
        serverEncryptedVrfKeypair: null,
        vrfPublicKey: 'vrf',
        credential: {
          id: 'cred-id',
          rawId: 'cred-raw',
          type: 'public-key',
          response: { attestationObject: 'att', clientDataJSON: 'client' },
        },
        createdAt: 1000,
        status: 'finalizing',
      };

      const result = await (flow as any).attemptAutoLogin(rec);
      return { result, calls };
    }, { paths: IMPORT_PATHS, config: CONFIG });

    expect(result.result.success).toBe(true);
    expect(result.result.method).toBe('touchid');
    expect(result.calls).toContain('touchId');
    expect(result.calls).not.toContain('shamir');
  });

  test('returns failure when the wrong passkey is selected', async ({ page }) => {
    const result = await page.evaluate(async ({ paths, config }) => {
      const mod = await import(paths.emailRecovery);
      if (mod.init_emailRecovery) {
        mod.init_emailRecovery();
      }
      const EmailRecoveryFlow =
        mod.EmailRecoveryFlow ?? mod.emailRecovery_exports?.EmailRecoveryFlow;
      if (!EmailRecoveryFlow) {
        throw new Error('EmailRecoveryFlow export missing');
      }
      const calls: string[] = [];
      const accountId = 'carol.testnet';

      const webAuthnManager = {
        shamir3PassDecryptVrfKeypair: async () => {
          calls.push('shamir');
          return { success: false };
        },
        checkVrfStatus: async () => ({ active: true, nearAccountId: accountId }),
        setLastUser: async () => { calls.push('setLastUser'); },
        initializeCurrentUser: async () => { calls.push('initializeCurrentUser'); },
        getLastUser: async () => ({ nearAccountId: accountId, clientNearPublicKey: 'pk' }),
        getWarmSigningSessionStatus: async () => ({ active: true }),
        getAuthenticatorsByUser: async () => { calls.push('getAuthenticators'); return []; },
        getAuthenticationCredentialsSerializedDualPrf: async () => {
          calls.push('touchId');
          return { rawId: 'wrong-raw', id: 'wrong-raw' };
        },
        unlockVRFKeypair: async () => { calls.push('unlock'); return { success: true }; },
        clearVrfSession: async () => { calls.push('clearVrfSession'); },
      };

      const flow = new EmailRecoveryFlow({
        configs: config,
        nearClient: {},
        webAuthnManager,
      });

	      const rec = {
	        accountId,
	        deviceNumber: 1,
	        nearPublicKey: 'ed25519:carol',
	        requestId: 'REQ777',
	        encryptedVrfKeypair: { encryptedVrfDataB64u: 'enc', chacha20NonceB64u: 'nonce' },
        serverEncryptedVrfKeypair: null,
        vrfPublicKey: 'vrf',
        credential: {
          id: 'cred-id',
          rawId: 'cred-raw',
          type: 'public-key',
          response: { attestationObject: 'att', clientDataJSON: 'client' },
        },
        createdAt: 1000,
        status: 'finalizing',
      };

      const result = await (flow as any).attemptAutoLogin(rec);
      return { result, calls };
    }, { paths: IMPORT_PATHS, config: CONFIG });

    expect(result.result.success).toBe(false);
    expect(result.calls).toContain('clearVrfSession');
    expect(result.calls).not.toContain('unlock');
  });
});
