import { test, expect } from '@playwright/test';
import { loginAndCreateSession } from '../../core/TatchiPasskey/login';
import { IndexedDBManager } from '../../core/IndexedDBManager';

test('loginAndCreateSession: cancelling TouchID during warm signing rolls back VRF session', async () => {
  const originalWindow = (globalThis as any).window;
  (globalThis as any).window = { isSecureContext: true };

  const originalGetLastDBUpdatedUser = IndexedDBManager.clientDB.getLastDBUpdatedUser;
  const originalEnsureCurrentPasskey = IndexedDBManager.clientDB.ensureCurrentPasskey;
  const originalGetUserByDevice = IndexedDBManager.clientDB.getUserByDevice;

  // Minimal user row required by login.ts for Shamir3Pass auto‑unlock.
  const userData: any = {
    nearAccountId: 'alice.testnet',
    deviceNumber: 1,
    clientNearPublicKey: 'ed25519:pk',
    encryptedVrfKeypair: {
      encryptedVrfDataB64u: 'vrf_enc',
      chacha20NonceB64u: 'vrf_nonce',
    },
    serverEncryptedVrfKeypair: {
      ciphertextVrfB64u: 'cipher',
      kek_s_b64u: 'kek_s',
      serverKeyId: 'server-key-id',
      updatedAt: Date.now(),
    },
  };

  let vrfActive = false;
  const calls = { clearVrf: 0, getAuth: 0, mintSigning: 0 };

  const webAuthnManager: any = {
    checkVrfStatus: async () => ({ active: vrfActive, nearAccountId: vrfActive ? 'alice.testnet' : null }),
    getLastUser: async () => userData,
    getUserByDevice: async () => userData,
    getAuthenticatorsByUser: async () => [{ credentialId: 'cred', deviceNumber: 1 }],
    shamir3PassDecryptVrfKeypair: async () => {
      vrfActive = true;
      return { success: true };
    },
    maybeProactiveShamirRefresh: async () => {},
    setLastUser: async () => {},
    updateLastLogin: async () => {},
    getAuthenticationCredentialsSerialized: async () => {
      calls.getAuth++;
      throw new Error('NotAllowedError');
    },
    mintSigningSessionFromCredential: async () => {
      calls.mintSigning++;
    },
    clearVrfSession: async () => {
      calls.clearVrf++;
      vrfActive = false;
    },
    getNonceManager: () => ({ clear: () => {} }),
    getWarmSigningSessionStatus: async () => ({ sessionId: 's', status: 'not_found' }),
    generateVrfChallengeOnce: async () => ({}),
    getRpId: () => 'example.localhost',
  };

  const context: any = {
    webAuthnManager,
    nearClient: {},
    configs: {
      signingSessionDefaults: { ttlMs: 60_000, remainingUses: 1 },
      relayer: { url: 'https://relay.example' },
    },
  };

  // Avoid real IndexedDB in this unit test by stubbing the few methods used.
  IndexedDBManager.clientDB.getLastDBUpdatedUser = (async () => userData) as any;
  IndexedDBManager.clientDB.getUserByDevice = (async () => userData) as any;
  IndexedDBManager.clientDB.ensureCurrentPasskey = (async (_accountId: string, authenticators: any[]) => ({
    authenticatorsForPrompt: authenticators,
    wrongPasskeyError: null,
  })) as any;

  try {
    const res = await loginAndCreateSession(context, 'alice.testnet' as any, {});
    expect(res.success).toBe(false);
    expect(calls.getAuth).toBe(1);
    expect(calls.mintSigning).toBe(0);
    expect(calls.clearVrf).toBe(1);
    expect(vrfActive).toBe(false);
  } finally {
    // Restore shared globals/mocks to avoid cross‑test contamination.
    (globalThis as any).window = originalWindow;
    IndexedDBManager.clientDB.getLastDBUpdatedUser = originalGetLastDBUpdatedUser as any;
    IndexedDBManager.clientDB.ensureCurrentPasskey = originalEnsureCurrentPasskey as any;
    IndexedDBManager.clientDB.getUserByDevice = originalGetUserByDevice as any;
  }
});
