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
        const store = db.createObjectStore(DB_CONFIG.storeName, { keyPath: DB_CONFIG.keyPath as any });
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
      if (!res?.encryptedData && nearAccountId !== '_init_check') {
        console.warn('PasskeyNearKeysDB: getEncryptedKey - No result found for device:', deviceNumber);
      }
      return (res || null) as any;
    }
    // Fallback: pick the first entry for this account (non-deterministic order)
    try {
      const idx = db.transaction(this.config.storeName).store.index('nearAccountId');
      const cursor = await (idx as any).openCursor(IDBKeyRange.only(nearAccountId));
      if (cursor?.value) return cursor.value as any;
    } catch {}
    return null;
  }

  /**
   * Verify key storage by attempting retrieval
   */
  async verifyKeyStorage(nearAccountId: string, deviceNumber?: number): Promise<boolean> {
    try {
      const retrievedKey = await this.getEncryptedKey(nearAccountId, deviceNumber);
      return !!retrievedKey;
    } catch (error) {
      console.error('PasskeyNearKeysDB: verifyKeyStorage - Error:', error);
      return false;
    }
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
      try {
        const tx = db.transaction(this.config.storeName, 'readwrite');
        const idx = tx.store.index('nearAccountId');
        let cursor = await (idx as any).openCursor(IDBKeyRange.only(nearAccountId));
        while (cursor) {
          await tx.store.delete(cursor.primaryKey as any);
          cursor = await cursor.continue();
        }
        await tx.done;
      } catch {}
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
    try {
      const keyData = await this.getEncryptedKey(nearAccountId, deviceNumber);
      return !!keyData;
    } catch (error) {
      console.error('PasskeyNearKeysDB: hasEncryptedKey - Error:', error);
      return false;
    }
  }
}
