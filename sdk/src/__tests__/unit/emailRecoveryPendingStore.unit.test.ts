import { test, expect } from '@playwright/test';
import { setupBasicPasskeyTest } from '../setup';

const IMPORT_PATHS = {
  store: '/sdk/esm/core/EmailRecovery/emailRecoveryPendingStore.js',
  indexedDb: '/sdk/esm/core/IndexedDBManager/index.js',
} as const;

test.describe('EmailRecoveryPendingStore', () => {
  test.beforeEach(async ({ page }) => {
    await setupBasicPasskeyTest(page);
  });

  test('clears index when record is missing', async ({ page }) => {
    const result = await page.evaluate(async ({ paths }) => {
      const mod = await import(paths.store);
      const EmailRecoveryPendingStore = mod.EmailRecoveryPendingStore;
      if (!EmailRecoveryPendingStore) {
        throw new Error('EmailRecoveryPendingStore export missing');
      }
      const { IndexedDBManager } = await import(paths.indexedDb);

      const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      IndexedDBManager.clientDB.setDisabled(false);
      IndexedDBManager.clientDB.setDbName(`PasskeyClientDB-emailRecoveryPendingStore-${suffix}`);

      let now = 1000;
      const store = new EmailRecoveryPendingStore({ getPendingTtlMs: () => 60_000, now: () => now });
      const record = {
        accountId: 'alice.testnet',
        recoveryEmail: 'alice@example.com',
        deviceNumber: 1,
        nearPublicKey: 'ed25519:alice',
        requestId: 'REQ123',
        encryptedVrfKeypair: { encryptedVrfDataB64u: 'enc', chacha20NonceB64u: 'nonce' },
        serverEncryptedVrfKeypair: null,
        vrfPublicKey: 'vrf',
        credential: {
          id: 'cred-id',
          rawId: 'cred-raw',
          type: 'public-key',
          response: { attestationObject: 'att', clientDataJSON: 'client' },
        },
        createdAt: now,
        status: 'awaiting-email',
      };

      await store.set(record);

      const indexKey = `pendingEmailRecovery:${record.accountId}`;
      const recordKey = `${indexKey}:${record.nearPublicKey}`;
      const indexBefore = await IndexedDBManager.clientDB.getAppState(indexKey);

      await IndexedDBManager.clientDB.setAppState(recordKey, undefined);

      const read = await store.get(record.accountId);
      const indexAfter = await IndexedDBManager.clientDB.getAppState(indexKey);

      return { indexBefore, read, indexAfter };
    }, { paths: IMPORT_PATHS });

    expect(result.indexBefore).toBe('ed25519:alice');
    expect(result.read).toBeNull();
    expect(result.indexAfter).toBeUndefined();
  });

  test('expires stale records based on TTL', async ({ page }) => {
    const result = await page.evaluate(async ({ paths }) => {
      const mod = await import(paths.store);
      const EmailRecoveryPendingStore = mod.EmailRecoveryPendingStore;
      if (!EmailRecoveryPendingStore) {
        throw new Error('EmailRecoveryPendingStore export missing');
      }
      const { IndexedDBManager } = await import(paths.indexedDb);

      const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      IndexedDBManager.clientDB.setDisabled(false);
      IndexedDBManager.clientDB.setDbName(`PasskeyClientDB-emailRecoveryPendingStore-${suffix}`);

      let now = 1000;
      const ttlMs = 500;
      const store = new EmailRecoveryPendingStore({ getPendingTtlMs: () => ttlMs, now: () => now });
      const record = {
        accountId: 'bob.testnet',
        recoveryEmail: 'bob@example.com',
        deviceNumber: 2,
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
        createdAt: now,
        status: 'awaiting-email',
      };

      await store.set(record);

      const indexKey = `pendingEmailRecovery:${record.accountId}`;
      const recordKey = `${indexKey}:${record.nearPublicKey}`;

      now = 2000;
      const read = await store.get(record.accountId);
      const recordAfter = await IndexedDBManager.clientDB.getAppState(recordKey);
      const indexAfter = await IndexedDBManager.clientDB.getAppState(indexKey);

      return { read, recordAfter, indexAfter };
    }, { paths: IMPORT_PATHS });

    expect(result.read).toBeNull();
    expect(result.recordAfter).toBeUndefined();
    expect(result.indexAfter).toBeUndefined();
  });
});
