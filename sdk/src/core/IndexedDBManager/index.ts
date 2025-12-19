export { PasskeyClientDBManager } from './passkeyClientDB';
export { PasskeyNearKeysDBManager } from './passkeyNearKeysDB';

export type {
  ClientUserData,
  UserPreferences,
  ClientAuthenticatorData,
  IndexedDBEvent,
  DerivedAddressRecord,
  RecoveryEmailRecord
} from './passkeyClientDB';

export type {
  EncryptedKeyData
} from './passkeyNearKeysDB';

import { AccountId } from '../types/accountIds';

// === SINGLETON INSTANCES ===
import { PasskeyClientDBManager, type ClientUserData } from './passkeyClientDB';
import { PasskeyNearKeysDBManager, type EncryptedKeyData } from './passkeyNearKeysDB';

// Export singleton instances for backward compatibility with existing code
export const passkeyClientDB = new PasskeyClientDBManager();
export const passkeyNearKeysDB = new PasskeyNearKeysDBManager();

export type IndexedDBMode = 'legacy' | 'wallet' | 'disabled';

const DB_CONFIG_BY_MODE: Record<IndexedDBMode, { clientDbName: string; nearKeysDbName: string; disabled: boolean }> = {
  legacy: { clientDbName: 'PasskeyClientDB', nearKeysDbName: 'PasskeyNearKeys', disabled: false },
  wallet: { clientDbName: 'PasskeyClientDB', nearKeysDbName: 'PasskeyNearKeys', disabled: false },
  // When running the SDK on the app origin with a wallet iframe configured, we disable IndexedDB entirely
  // to ensure no SDK tables are created and nothing can accidentally persist there.
  disabled: { clientDbName: 'PasskeyClientDB', nearKeysDbName: 'PasskeyNearKeys', disabled: true },
};

let configured: { mode: IndexedDBMode; clientDbName: string; nearKeysDbName: string; disabled: boolean } | null = null;

/**
 * Configure IndexedDB database names for the current runtime.
 *
 * Call this once, early (before any IndexedDB access).
 * - Wallet iframe host should use `mode: 'wallet'`.
 * - App origin should use `mode: 'disabled'` when wallet-iframe mode is enabled.
 * - Non-iframe apps should use `mode: 'legacy'`.
 */
export function configureIndexedDB(args: { mode: IndexedDBMode }): { clientDbName: string; nearKeysDbName: string } {
  const mode = args?.mode;
  const next = DB_CONFIG_BY_MODE[mode];
  if (!next) {
    throw new Error(`[IndexedDBManager] Unknown IndexedDBMode: ${String(mode)}`);
  }

  if (configured) {
    const isSame =
      configured.clientDbName === next.clientDbName
      && configured.nearKeysDbName === next.nearKeysDbName
      && configured.disabled === next.disabled;
    if (!isSame) {
      console.warn('[IndexedDBManager] configureIndexedDB called multiple times; ignoring subsequent configuration', {
        configured,
        requested: next,
      });
    }
    return { clientDbName: configured.clientDbName, nearKeysDbName: configured.nearKeysDbName };
  }

  configured = { mode, ...next };
  passkeyClientDB.setDbName(next.clientDbName);
  passkeyNearKeysDB.setDbName(next.nearKeysDbName);
  passkeyClientDB.setDisabled(next.disabled);
  passkeyNearKeysDB.setDisabled(next.disabled);
  return { clientDbName: configured.clientDbName, nearKeysDbName: configured.nearKeysDbName };
}

export function getIndexedDBNames(): { clientDbName: string; nearKeysDbName: string } {
  return configured || {
    clientDbName: passkeyClientDB.getDbName(),
    nearKeysDbName: passkeyNearKeysDB.getDbName(),
  };
}

/**
 * Unified IndexedDB interface providing access to both databases
 * This allows centralized access while maintaining separation of concerns
 */
export class UnifiedIndexedDBManager {
  public readonly clientDB: PasskeyClientDBManager;
  public readonly nearKeysDB: PasskeyNearKeysDBManager;
  private _initialized = false;

  constructor() {
    this.clientDB = passkeyClientDB;
    this.nearKeysDB = passkeyNearKeysDB;
  }

  /**
   * Initialize both databases proactively
   * This ensures both databases are created and ready for use
   */
  async initialize(): Promise<void> {
    if (this._initialized) {
      return;
    }

    try {
      if (this.clientDB.isDisabled() || this.nearKeysDB.isDisabled()) {
        this._initialized = true;
        return;
      }
      // Initialize both databases by calling a simple operation
      // This will trigger the getDB() method in both managers and ensure databases are created
      await Promise.all([
        this.clientDB.getAppState('_init_check'),
        this.nearKeysDB.hasEncryptedKey('_init_check', 1)
      ]);

      this._initialized = true;
    } catch (error) {
      console.warn('Failed to initialize IndexedDB databases:', error);
      // Don't throw - allow the SDK to continue working, databases will be initialized on first use
    }
  }

  /**
   * Check if databases have been initialized
   */
  get isInitialized(): boolean {
    return this._initialized;
  }

  // === CONVENIENCE METHODS ===

  /**
   * Get user data and check if they have encrypted NEAR keys
   */
  async getUserWithKeys(nearAccountId: AccountId): Promise<{
    userData: ClientUserData | null;
    hasKeys: boolean;
    keyData?: EncryptedKeyData | null;
  }> {
    const last = await this.clientDB.getLastUser();
    const userData = last && last.nearAccountId === nearAccountId
      ? last
      : await this.clientDB.getUserByDevice(nearAccountId, 1);
    const deviceNumber = (last && last.nearAccountId === nearAccountId)
      ? last.deviceNumber
      : userData?.deviceNumber!;
    const [hasKeys, keyData] = await Promise.all([
      this.nearKeysDB.hasEncryptedKey(nearAccountId, deviceNumber),
      this.nearKeysDB.getEncryptedKey(nearAccountId, deviceNumber)
    ]);

    return {
      userData,
      hasKeys,
      keyData: hasKeys ? keyData : undefined
    };
  }

  // === Derived addresses convenience ===
  async setDerivedAddress(
    nearAccountId: AccountId,
    args: { contractId: string; path: string; address: string }
  ): Promise<void> {
    return this.clientDB.setDerivedAddress(nearAccountId, args);
  }

  async getDerivedAddressRecord(
    nearAccountId: AccountId,
    args: { contractId: string; path: string }
  ): Promise<import('./passkeyClientDB').DerivedAddressRecord | null> {
    return this.clientDB.getDerivedAddressRecord(nearAccountId, args);
  }

  async getDerivedAddress(
    nearAccountId: AccountId,
    args: { contractId: string; path: string }
  ): Promise<string | null> {
    return this.clientDB.getDerivedAddress(nearAccountId, args);
  }

  // === Recovery emails convenience ===
  async upsertRecoveryEmails(
    nearAccountId: AccountId,
    entries: Array<{ hashHex: string; email: string }>
  ): Promise<void> {
    return this.clientDB.upsertRecoveryEmails(nearAccountId, entries);
  }

  async getRecoveryEmails(nearAccountId: AccountId): Promise<import('./passkeyClientDB').RecoveryEmailRecord[]> {
    return this.clientDB.getRecoveryEmails(nearAccountId);
  }
}

// Export singleton instance of unified manager
export const IndexedDBManager = new UnifiedIndexedDBManager();
