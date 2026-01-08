import { openDB, type IDBPDatabase } from 'idb';
import {
  buildThresholdEd25519Participants2pV1,
  parseThresholdEd25519ParticipantsV1,
  type ThresholdEd25519ParticipantV1,
} from '../../threshold/participants';

const DB_CONFIG: PasskeyNearKeysDBConfig = {
  dbName: 'PasskeyNearKeys',
  // v4: allow storing multiple key materials per device (keyed by kind)
  dbVersion: 4,
  storeName: 'keyMaterial',
  keyPath: ['nearAccountId', 'deviceNumber', 'kind']
} as const;

export type ClientShareDerivation = 'prf_first_v1';

export type PasskeyNearKeyMaterialKind =
  | 'local_near_sk_v3'
  | 'threshold_ed25519_2p_v1';

export interface BasePasskeyNearKeyMaterial {
  nearAccountId: string;
  deviceNumber: number; // 1-indexed device number
  kind: PasskeyNearKeyMaterialKind;
  /** NEAR ed25519 public key (e.g. `ed25519:...`) */
  publicKey: string;
  /** HKDF salt used alongside WrapKeySeed for KEK derivation */
  wrapKeySalt: string;
  timestamp: number;
}

export interface LocalNearSkV3Material extends BasePasskeyNearKeyMaterial {
  kind: 'local_near_sk_v3';
  encryptedSk: string;
  /**
   * Base64url-encoded AEAD nonce (ChaCha20-Poly1305) for `encryptedSk`.
   */
  chacha20NonceB64u: string;
}

export interface ThresholdEd25519_2p_V1Material extends BasePasskeyNearKeyMaterial {
  kind: 'threshold_ed25519_2p_v1';
  relayerKeyId: string;
  clientShareDerivation: ClientShareDerivation;
  /**
   * Versioned participant list for future n-party support.
   * In 2P, participants are `{id:1, role:'client'}` and `{id:2, role:'relayer', ...}`.
   */
  participants: ThresholdEd25519ParticipantV1[];
}

export type PasskeyNearKeyMaterial =
  | LocalNearSkV3Material
  | ThresholdEd25519_2p_V1Material;

interface PasskeyNearKeysDBConfig {
  dbName: string;
  dbVersion: number;
  storeName: string;
  keyPath: string | [string, string] | [string, string, string];
}

export class PasskeyNearKeysDBManager {
  private config: PasskeyNearKeysDBConfig;
  private db: IDBPDatabase | null = null;
  private disabled = false;

  constructor(config: PasskeyNearKeysDBConfig = DB_CONFIG) {
    this.config = config;
  }

  getDbName(): string {
    return this.config.dbName;
  }

  setDbName(dbName: string): void {
    const next = String(dbName || '').trim();
    if (!next || next === this.config.dbName) return;
    try { (this.db as any)?.close?.(); } catch {}
    this.db = null;
    this.config = { ...this.config, dbName: next };
  }

  isDisabled(): boolean {
    return this.disabled;
  }

  setDisabled(disabled: boolean): void {
    const next = !!disabled;
    if (next === this.disabled) return;
    this.disabled = next;
    if (next) {
      try { (this.db as any)?.close?.(); } catch {}
      this.db = null;
    }
  }

  /**
   * Get database connection, initializing if necessary
   */
  private async getDB(): Promise<IDBPDatabase> {
    if (this.disabled) {
      throw new Error('[PasskeyNearKeysDBManager] IndexedDB is disabled in this environment.');
    }
    if (this.db) {
      return this.db;
    }

    this.db = await openDB(this.config.dbName, this.config.dbVersion, {
      upgrade(db): void {
        // Always recreate store with composite key; no migration.
        for (const name of ['encryptedKeys', DB_CONFIG.storeName]) {
          try { if (db.objectStoreNames.contains(name)) db.deleteObjectStore(name); } catch {}
        }
        const store = db.createObjectStore(DB_CONFIG.storeName, { keyPath: DB_CONFIG.keyPath });
        try { store.createIndex('nearAccountId', 'nearAccountId', { unique: false }); } catch {}
        try { store.createIndex('publicKey', 'publicKey', { unique: false }); } catch {}
        try { store.createIndex('kind', 'kind', { unique: false }); } catch {}
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
  async storeKeyMaterial(data: PasskeyNearKeyMaterial): Promise<void> {
    const db = await this.getDB();
    if (!data.wrapKeySalt) {
      throw new Error('PasskeyNearKeysDB: Missing wrapKeySalt');
    }
    if (!data.publicKey) {
      throw new Error('PasskeyNearKeysDB: Missing publicKey');
    }

    if (data.kind === 'local_near_sk_v3') {
      if (!data.encryptedSk) {
        throw new Error('PasskeyNearKeysDB: Missing encryptedSk for local_near_sk_v3');
      }
      if (!data.chacha20NonceB64u) {
        throw new Error('PasskeyNearKeysDB: Missing chacha20NonceB64u for local_near_sk_v3');
      }
    } else if (data.kind === 'threshold_ed25519_2p_v1') {
      if (!data.relayerKeyId) {
        throw new Error('PasskeyNearKeysDB: Missing relayerKeyId for threshold_ed25519_2p_v1');
      }
      if (!data.clientShareDerivation) {
        throw new Error('PasskeyNearKeysDB: Missing clientShareDerivation for threshold_ed25519_2p_v1');
      }
      const parsed = parseThresholdEd25519ParticipantsV1(data.participants);
      data.participants = parsed || buildThresholdEd25519Participants2pV1({
        relayerKeyId: data.relayerKeyId,
        clientShareDerivation: data.clientShareDerivation,
      });
    }
    await db.put(this.config.storeName, data);
  }

  /**
   * Retrieve encrypted key data
   */
  async getKeyMaterial(
    nearAccountId: string,
    deviceNumber: number,
    kind: PasskeyNearKeyMaterialKind,
  ): Promise<PasskeyNearKeyMaterial | null> {
    const db = await this.getDB();
    if (!kind) {
      throw new Error('PasskeyNearKeysDB: kind is required (no fallback lookup is allowed)');
    }
    const sanitize = (rec: any): PasskeyNearKeyMaterial | null => {
      const kind = rec?.kind as PasskeyNearKeyMaterialKind | undefined;
      if (!rec?.nearAccountId || typeof rec?.deviceNumber !== 'number') return null;
      if (!kind) return null;
      if (!rec?.publicKey || !rec?.wrapKeySalt || typeof rec?.timestamp !== 'number') return null;

      if (kind === 'local_near_sk_v3') {
        if (!rec?.encryptedSk || !rec?.chacha20NonceB64u) return null;
        return {
          nearAccountId: rec.nearAccountId,
          deviceNumber: rec.deviceNumber,
          kind,
          publicKey: rec.publicKey,
          wrapKeySalt: rec.wrapKeySalt,
          encryptedSk: rec.encryptedSk,
          chacha20NonceB64u: rec.chacha20NonceB64u,
          timestamp: rec.timestamp,
        };
      }

      if (kind === 'threshold_ed25519_2p_v1') {
        if (!rec?.relayerKeyId || !rec?.clientShareDerivation) return null;
        const participants =
          parseThresholdEd25519ParticipantsV1(rec.participants)
          || buildThresholdEd25519Participants2pV1({
            relayerKeyId: rec.relayerKeyId,
            clientShareDerivation: rec.clientShareDerivation,
          });
        return {
          nearAccountId: rec.nearAccountId,
          deviceNumber: rec.deviceNumber,
          kind,
          publicKey: rec.publicKey,
          wrapKeySalt: rec.wrapKeySalt,
          relayerKeyId: rec.relayerKeyId,
          clientShareDerivation: rec.clientShareDerivation,
          participants,
          timestamp: rec.timestamp,
        };
      }

      return null;
    };

    const res = await db.get(this.config.storeName, [nearAccountId, deviceNumber, kind]);
    return sanitize(res);
  }

  async getLocalKeyMaterial(
    nearAccountId: string,
    deviceNumber: number
  ): Promise<LocalNearSkV3Material | null> {
    const rec = await this.getKeyMaterial(nearAccountId, deviceNumber, 'local_near_sk_v3');
    return rec?.kind === 'local_near_sk_v3' ? rec : null;
  }

  async getThresholdKeyMaterial(
    nearAccountId: string,
    deviceNumber: number
  ): Promise<ThresholdEd25519_2p_V1Material | null> {
    const rec = await this.getKeyMaterial(nearAccountId, deviceNumber, 'threshold_ed25519_2p_v1');
    return rec?.kind === 'threshold_ed25519_2p_v1' ? rec : null;
  }

  /**
   * Verify key storage by attempting retrieval
   */
  async verifyKeyStorage(
    nearAccountId: string,
    deviceNumber: number,
    kind: PasskeyNearKeyMaterialKind
  ): Promise<boolean> {
    const retrievedKey = await this.getKeyMaterial(nearAccountId, deviceNumber, kind);
    return !!retrievedKey;
  }

  /**
   * Delete encrypted key data for a specific account
   */
  async deleteKeyMaterial(nearAccountId: string, deviceNumber?: number, kind?: PasskeyNearKeyMaterialKind): Promise<void> {
    const db = await this.getDB();
    if (typeof deviceNumber === 'number' && kind) {
      await db.delete(this.config.storeName, [nearAccountId, deviceNumber, kind]);
    } else if (typeof deviceNumber === 'number') {
      // Delete all kinds for this deviceNumber
      const tx = db.transaction(this.config.storeName, 'readwrite');
      const idx = tx.store.index('nearAccountId');
      let cursor = await idx.openCursor(IDBKeyRange.only(nearAccountId));
      while (cursor) {
        const value: any = cursor.value;
        if (value?.deviceNumber === deviceNumber) {
          await tx.store.delete(cursor.primaryKey);
        }
        cursor = await cursor.continue();
      }
      await tx.done;
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
    console.debug('PasskeyNearKeysDB: deleteKeyMaterial - Successfully deleted');
  }

  /**
   * Get all encrypted keys (for migration or debugging purposes)
   */
  async getAllKeyMaterial(): Promise<PasskeyNearKeyMaterial[]> {
    const db = await this.getDB();
    const all = await db.getAll(this.config.storeName);
    return (all as any[])
      .map((rec) => {
        const kind = rec?.kind as PasskeyNearKeyMaterialKind | undefined;
        if (!kind) return null;

        if (kind === 'local_near_sk_v3') {
          if (!rec?.encryptedSk || !rec?.chacha20NonceB64u) return null;
          return {
            nearAccountId: rec.nearAccountId,
            deviceNumber: rec.deviceNumber,
            kind,
            publicKey: rec.publicKey,
            wrapKeySalt: rec.wrapKeySalt,
            encryptedSk: rec.encryptedSk,
            chacha20NonceB64u: rec.chacha20NonceB64u,
            timestamp: rec.timestamp,
          } as LocalNearSkV3Material;
        }

        if (kind === 'threshold_ed25519_2p_v1') {
          if (!rec?.relayerKeyId || !rec?.clientShareDerivation) return null;
          const participants =
            parseThresholdEd25519ParticipantsV1(rec.participants)
            || buildThresholdEd25519Participants2pV1({
              relayerKeyId: rec.relayerKeyId,
              clientShareDerivation: rec.clientShareDerivation,
            });
          return {
            nearAccountId: rec.nearAccountId,
            deviceNumber: rec.deviceNumber,
            kind,
            publicKey: rec.publicKey,
            wrapKeySalt: rec.wrapKeySalt,
            relayerKeyId: rec.relayerKeyId,
            clientShareDerivation: rec.clientShareDerivation,
            participants,
            timestamp: rec.timestamp,
          } as ThresholdEd25519_2p_V1Material;
        }

        return null;
      })
      .filter((rec): rec is PasskeyNearKeyMaterial => rec !== null);
  }

  /**
   * Check if a key exists for the given account
   */
  async hasKeyMaterial(
    nearAccountId: string,
    deviceNumber: number,
    kind: PasskeyNearKeyMaterialKind
  ): Promise<boolean> {
    const keyData = await this.getKeyMaterial(nearAccountId, deviceNumber, kind);
    return !!keyData;
  }
}
