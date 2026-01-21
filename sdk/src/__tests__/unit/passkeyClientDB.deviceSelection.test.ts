import { test, expect } from '@playwright/test';
import { setupBasicPasskeyTest } from '../setup';

const IMPORT_PATHS = {
  clientDB: '/sdk/esm/core/IndexedDBManager/passkeyClientDB.js',
  getDeviceNumber: '/sdk/esm/core/WebAuthnManager/SignerWorkerManager/getDeviceNumber.js',
} as const;

test.describe('PasskeyClientDB device selection', () => {
  test.beforeEach(async ({ page }) => {
    await setupBasicPasskeyTest(page);
  });

  test('getLastLoggedInDeviceNumber does not fall back to another account', async ({ page }) => {
    const result = await page.evaluate(async ({ paths }) => {
      const { PasskeyClientDBManager } = await import(paths.clientDB);
      const { getLastLoggedInDeviceNumber } = await import(paths.getDeviceNumber);

      const db = new PasskeyClientDBManager();
      // Store a different account in DB (this will set lastUser to bob)
      await db.storeWebAuthnUserData({
        nearAccountId: 'bob.testnet',
        deviceNumber: 2,
        clientNearPublicKey: 'ed25519:pkbob',
        passkeyCredential: { id: 'c-bob', rawId: 'r-bob' },
        encryptedVrfKeypair: { encryptedVrfDataB64u: 'vrf', chacha20NonceB64u: 'nonce' },
      });
      // Point lastUser back to a different account so bob has no last-user session
      await db.setLastUser('alice.testnet', 1);

      try {
        await getLastLoggedInDeviceNumber('bob.testnet', db);
        return { threw: false };
      } catch (e: any) {
        return { threw: true, message: String(e?.message || e) };
      }
    }, { paths: IMPORT_PATHS });

    expect(result.threw).toBe(true);
    expect(result.message).toContain('No last user session');
  });

  test('ensureCurrentPasskey filters authenticators to last-user device', async ({ page }) => {
    const result = await page.evaluate(async ({ paths }) => {
      const { PasskeyClientDBManager } = await import(paths.clientDB);

      const db = new PasskeyClientDBManager();
      // Store user records for both devices
      await db.storeWebAuthnUserData({
        nearAccountId: 'carol.testnet',
        deviceNumber: 3,
        clientNearPublicKey: 'ed25519:pk-3',
        passkeyCredential: { id: 'c-3', rawId: 'r-3' },
        encryptedVrfKeypair: { encryptedVrfDataB64u: 'vrf3', chacha20NonceB64u: 'nonce3' },
      });
      await db.storeWebAuthnUserData({
        nearAccountId: 'carol.testnet',
        deviceNumber: 6,
        clientNearPublicKey: 'ed25519:pk-6',
        passkeyCredential: { id: 'c-6', rawId: 'r-6' },
        encryptedVrfKeypair: { encryptedVrfDataB64u: 'vrf6', chacha20NonceB64u: 'nonce6' },
      });
      // Last logged-in device is 6
      await db.setLastUser('carol.testnet', 6);

      const authenticators = [
        { credentialId: 'cred-old', credentialPublicKey: new Uint8Array([1]), deviceNumber: 3, nearAccountId: 'carol.testnet', registered: '', syncedAt: '', vrfPublicKey: '' },
        { credentialId: 'cred-new', credentialPublicKey: new Uint8Array([2]), deviceNumber: 6, nearAccountId: 'carol.testnet', registered: '', syncedAt: '', vrfPublicKey: '' },
      ];

      const { authenticatorsForPrompt, wrongPasskeyError } = await db.ensureCurrentPasskey('carol.testnet', authenticators as any);
      return {
        filteredIds: authenticatorsForPrompt.map((a: any) => a.credentialId),
        wrongPasskeyError: wrongPasskeyError || null,
      };
    }, { paths: IMPORT_PATHS });

    expect(result.wrongPasskeyError).toBeNull();
    expect(result.filteredIds).toEqual(['cred-new']);
  });

  test('login (setLastUser) pins deviceNumber even when multiple entries exist', async ({ page }) => {
    const result = await page.evaluate(async ({ paths }) => {
      const { PasskeyClientDBManager } = await import(paths.clientDB);
      const { getLastLoggedInDeviceNumber } = await import(paths.getDeviceNumber);

      const db = new PasskeyClientDBManager();

      // Insert two devices for the same account
      await db.storeWebAuthnUserData({
        nearAccountId: 'dana.testnet',
        deviceNumber: 3,
        clientNearPublicKey: 'ed25519:pk-3',
        passkeyCredential: { id: 'c-3', rawId: 'r-3' },
        encryptedVrfKeypair: { encryptedVrfDataB64u: 'vrf3', chacha20NonceB64u: 'nonce3' },
        lastUpdated: 1000,
      });
      await db.storeWebAuthnUserData({
        nearAccountId: 'dana.testnet',
        deviceNumber: 6,
        clientNearPublicKey: 'ed25519:pk-6',
        passkeyCredential: { id: 'c-6', rawId: 'r-6' },
        encryptedVrfKeypair: { encryptedVrfDataB64u: 'vrf6', chacha20NonceB64u: 'nonce6' },
        lastUpdated: 2000,
      });

      // Simulate login selecting device 6
      await db.setLastUser('dana.testnet', 6);

      const last = await db.getLastUser();
      const deviceFromHelper = await getLastLoggedInDeviceNumber('dana.testnet', db);
      const { authenticatorsForPrompt } = await db.ensureCurrentPasskey('dana.testnet', [
        { credentialId: 'c-3', credentialPublicKey: new Uint8Array([1]), deviceNumber: 3, nearAccountId: 'dana.testnet', registered: '', syncedAt: '', vrfPublicKey: '' },
        { credentialId: 'c-6', credentialPublicKey: new Uint8Array([2]), deviceNumber: 6, nearAccountId: 'dana.testnet', registered: '', syncedAt: '', vrfPublicKey: '' },
      ] as any);

      return {
        lastDevice: last?.deviceNumber,
        helperDevice: deviceFromHelper,
        filteredIds: authenticatorsForPrompt.map((a: any) => a.credentialId),
      };
    }, { paths: IMPORT_PATHS });

    expect(result.lastDevice).toBe(6);
    expect(result.helperDevice).toBe(6);
    expect(result.filteredIds).toEqual(['c-6']);
  });

  test('lastUserAccountId is scoped by lastUserScope when set (wallet origin multi-app)', async ({ page }) => {
    const result = await page.evaluate(async ({ paths }) => {
      const { PasskeyClientDBManager } = await import(paths.clientDB);

      const db = new PasskeyClientDBManager();

      // App A stores and selects alice under its scoped key.
      db.setLastUserScope('https://app-a.example');
      await db.storeWebAuthnUserData({
        nearAccountId: 'alice.testnet',
        deviceNumber: 1,
        clientNearPublicKey: 'ed25519:pk-alice',
        passkeyCredential: { id: 'c-alice', rawId: 'r-alice' },
        encryptedVrfKeypair: { encryptedVrfDataB64u: 'vrf-alice', chacha20NonceB64u: 'nonce-alice' },
      });

      // App B stores and selects bob under its own scoped key.
      db.setLastUserScope('https://app-b.example');
      await db.storeWebAuthnUserData({
        nearAccountId: 'bob.testnet',
        deviceNumber: 1,
        clientNearPublicKey: 'ed25519:pk-bob',
        passkeyCredential: { id: 'c-bob', rawId: 'r-bob' },
        encryptedVrfKeypair: { encryptedVrfDataB64u: 'vrf-bob', chacha20NonceB64u: 'nonce-bob' },
      });

      db.setLastUserScope('https://app-a.example');
      const lastA = await db.getLastUser();

      db.setLastUserScope('https://app-b.example');
      const lastB = await db.getLastUser();

      // No fallback: an app with no scoped key should not see a last user.
      db.setLastUserScope('https://app-c.example');
      const lastC = await db.getLastUser();

      const legacyGlobal = await db.getAppState('lastUserAccountId');

      return {
        lastA: lastA?.nearAccountId || null,
        lastB: lastB?.nearAccountId || null,
        lastC: lastC?.nearAccountId || null,
        legacyGlobal: legacyGlobal ?? null,
      };
    }, { paths: IMPORT_PATHS });

    expect(result.lastA).toBe('alice.testnet');
    expect(result.lastB).toBe('bob.testnet');
    expect(result.lastC).toBeNull();
    expect(result.legacyGlobal).toBeNull();
  });
});
