// === EXPORTS ===
export { PasskeyClientDBManager } from './passkeyClientDB';
export { PasskeyNearKeysDBManager } from './passkeyNearKeysDB';

// Re-export types for convenience
export type {
  ClientUserData,
  UserPreferences,
  ClientAuthenticatorData
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

// === UNIFIED INTERFACE ===
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
      console.debug('Initializing IndexedDB databases...');
      // Initialize both databases by calling a simple operation
      // This will trigger the getDB() method in both managers and ensure databases are created
      await Promise.all([
        this.clientDB.getAppState('_init_check'),
        this.nearKeysDB.hasEncryptedKey('_init_check')
      ]);

      this._initialized = true;
      console.debug('IndexedDB databases initialized successfully - passkeyClientDB and passkeyNearKeysDB ready');
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
    const [userData, hasKeys, keyData] = await Promise.all([
      this.clientDB.getUser(nearAccountId),
      this.nearKeysDB.hasEncryptedKey(nearAccountId),
      this.nearKeysDB.getEncryptedKey(nearAccountId)
    ]);

    return {
      userData,
      hasKeys,
      keyData: hasKeys ? keyData : undefined
    };
  }
}

// Export singleton instance of unified manager
export const IndexedDBManager = new UnifiedIndexedDBManager();

// Initialize databases proactively when the module is imported
// This ensures both databases are created and available immediately
IndexedDBManager.initialize().catch(error => {
  console.warn('Failed to proactively initialize IndexedDB on module load:', error);
});