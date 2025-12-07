import { openDB, type IDBPDatabase } from 'idb';

const DB_CONFIG: PasskeyNearKeysDBConfig = {
  dbName: 'PasskeyNearKeys',
  dbVersion: 2,
  storeName: 'encryptedKeys',
  keyPath: ['nearAccountId', 'deviceNumber']
} as const;

export interface EncryptedKeyData {
  nearAccountId: string;
  deviceNumber: number; // 1-indexed device number
  encryptedData: string;
  iv: string;
  /**
   * HKDF salt used alongside WrapKeySeed for KEK derivation.
   * Required for v2+ vaults; may be undefined only for legacy entries
   * that predate VRF‑owned WrapKeySeed derivation.
   */
  wrapKeySalt?: string;
  version?: number;
  timestamp: number;
}

interface PasskeyNearKeysDBConfig {
  dbName: string;
  dbVersion: number;
  storeName: string;
  keyPath: string | [string, string];
}

export class PasskeyNearKeysDBManager {
  private config: PasskeyNearKeysDBConfig;
  private db: IDBPDatabase | null = null;

  constructor(config: PasskeyNearKeysDBConfig = DB_CONFIG) {
    this.config = config;
  }

  /**
   * Get database connection, initializing if necessary
   */
  private async getDB(): Promise<IDBPDatabase> {
    if (this.db) {
      return this.db;
    }

    this.db = await openDB(this.config.dbName, this.config.dbVersion, {
      upgrade(db): void {
        // Always recreate store with composite key; no migration
        try { if (db.objectStoreNames.contains(DB_CONFIG.storeName)) db.deleteObjectStore(DB_CONFIG.storeName); } catch {}
        const store = db.createObjectStore(DB_CONFIG.storeName, { keyPath: DB_CONFIG.keyPath });
        try { store.createIndex('nearAccountId', 'nearAccountId', { unique: false }); } catch {}
      },
      blocked() {
        console.warn('PasskeyNearKeysDB connection is blocked.');
      },
      blocking() {
        console.warn('PasskeyNearKeysDB connection is blocking another connection.');
      },
      terminated: () => {
        console.warn('PasskeyNearKeysDB connection has been terminated.');
        this.db = null;
      },
    });

    return this.db;
  }

  /**
   * Store encrypted key data
   */
  async storeEncryptedKey(data: EncryptedKeyData): Promise<void> {
    const db = await this.getDB();
    await db.put(this.config.storeName, data);
  }

  /**
   * Retrieve encrypted key data
   */
  async getEncryptedKey(nearAccountId: string, deviceNumber?: number): Promise<EncryptedKeyData | null> {
    const db = await this.getDB();
    if (typeof deviceNumber === 'number') {
      const res = await db.get(this.config.storeName, [nearAccountId, deviceNumber]);
      if (res?.encryptedData) {
        return res;
      }
      // Fallback: if specific device key missing, return the most recent key for the account
      if (nearAccountId !== '_init_check') {
        console.warn('PasskeyNearKeysDB: getEncryptedKey - No result for device', deviceNumber, '→ falling back to any key for account');
      }
      try {
        const idx = db.transaction(this.config.storeName).store.index('nearAccountId');
        const all = await idx.getAll(nearAccountId);
        if (Array.isArray(all) && all.length > 0) {
          // Choose the most recently stored entry by timestamp
          const latest = (all as EncryptedKeyData[]).reduce((a, b) => (a.timestamp >= b.timestamp ? a : b));
          return latest;
        }
      } catch {}
      return null;
    }
    // Fallback: pick the first entry for this account (non-deterministic order)
    try {
      const idx = db.transaction(this.config.storeName).store.index('nearAccountId');
      // Prefer all+latest even in generic path for consistency
      const all = await idx.getAll(nearAccountId);
      if (Array.isArray(all) && all.length > 0) {
        const latest = (all as EncryptedKeyData[]).reduce((a, b) => (a.timestamp >= b.timestamp ? a : b));
        return latest;
      }
    } catch {}
    return null;
  }

  /**
   * Verify key storage by attempting retrieval
   */
  async verifyKeyStorage(nearAccountId: string, deviceNumber?: number): Promise<boolean> {
    const retrievedKey = await this.getEncryptedKey(nearAccountId, deviceNumber);
    return !!retrievedKey;
  }

  /**
   * Delete encrypted key data for a specific account
   */
  async deleteEncryptedKey(nearAccountId: string, deviceNumber?: number): Promise<void> {
    const db = await this.getDB();
    if (typeof deviceNumber === 'number') {
      await db.delete(this.config.storeName, [nearAccountId, deviceNumber]);
    } else {
      // Delete all keys for this account if device unspecified
      const tx = db.transaction(this.config.storeName, 'readwrite');
      const idx = tx.store.index('nearAccountId');
      let cursor = await idx.openCursor(IDBKeyRange.only(nearAccountId));
      while (cursor) {
        await tx.store.delete(cursor.primaryKey);
        cursor = await cursor.continue();
      }
      await tx.done;
    }
    console.debug('PasskeyNearKeysDB: deleteEncryptedKey - Successfully deleted');
  }

  /**
   * Get all encrypted keys (for migration or debugging purposes)
   */
  async getAllEncryptedKeys(): Promise<EncryptedKeyData[]> {
    const db = await this.getDB();
    return await db.getAll(this.config.storeName);
  }

  /**
   * Check if a key exists for the given account
   */
  async hasEncryptedKey(nearAccountId: string, deviceNumber?: number): Promise<boolean> {
    const keyData = await this.getEncryptedKey(nearAccountId, deviceNumber);
    return !!keyData;
  }
}
