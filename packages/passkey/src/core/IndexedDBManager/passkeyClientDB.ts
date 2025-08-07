import { openDB, type IDBPDatabase } from 'idb';
import { type ValidationResult, validateNearAccountId } from '../../utils/validation';
import type { AccountId } from '../types/accountIds';
import { toAccountId } from '../types/accountIds';


export interface ClientUserData {
  // Primary key - now uses AccountId + deviceNumber for unique identification
  nearAccountId: AccountId;
  deviceNumber: number; // Device number for multi-device support (1-indexed)

  // User metadata
  registeredAt?: number;
  lastLogin?: number;
  lastUpdated?: number;

  // WebAuthn/Passkey data (merged from WebAuthnManager)
  clientNearPublicKey: string;
  passkeyCredential: {
    id: string;
    rawId: string;
  };

  // VRF credentials for stateless authentication
  encryptedVrfKeypair: {
    encrypted_vrf_data_b64u: string;
    chacha20_nonce_b64u: string;
  };

  // User preferences
  preferences?: UserPreferences;
}

export type StoreUserDataInput = Omit<ClientUserData, 'deviceNumber' | 'lastLogin' | 'registeredAt'>
  & { deviceNumber?: number | undefined; };

export interface UserPreferences {
  useRelayer: boolean;
  useNetwork: 'testnet' | 'mainnet';
  // User preferences can be extended here as needed
}

// Authenticator cache
export interface ClientAuthenticatorData {
  credentialId: string;
  credentialPublicKey: Uint8Array;
  transports?: string[]; // AuthenticatorTransport[]
  name?: string;
  nearAccountId: AccountId; // FK reference using AccountId
  deviceNumber: number; // Device number for this authenticator (1-indexed)
  registered: string; // ISO date string
  syncedAt: string; // When this cache entry was last synced with contract
  vrfPublicKey: string; // Base64-encoded VRF public key (1:1 relationship on client)
}

interface AppStateEntry<T = any> {
  key: string;
  value: T;
}

// Special type for lastUserAccountId app state entry
export interface LastUserAccountIdState {
  accountId: AccountId;
  deviceNumber: number;
}

interface PasskeyClientDBConfig {
  dbName: string;
  dbVersion: number;
  userStore: string;
  appStateStore: string;
  authenticatorStore: string;
}

// === CONSTANTS ===
const DB_CONFIG: PasskeyClientDBConfig = {
  dbName: 'PasskeyClientDB',
  dbVersion: 8, // Increment version for removing redundant nearAccountIdDevice index
  userStore: 'users',
  appStateStore: 'appState',
  authenticatorStore: 'authenticators'
} as const;

export class PasskeyClientDBManager {
  private config: PasskeyClientDBConfig;
  private db: IDBPDatabase | null = null;

  constructor(config: PasskeyClientDBConfig = DB_CONFIG) {
    this.config = config;
  }

  private async getDB(): Promise<IDBPDatabase> {
    if (this.db) {
      return this.db;
    }

    this.db = await openDB(this.config.dbName, this.config.dbVersion, {
      upgrade(db, oldVersion): void {
        // Create stores if they don't exist
        if (!db.objectStoreNames.contains(DB_CONFIG.userStore)) {
          // Users table: composite key of [nearAccountId, deviceNumber]
          const userStore = db.createObjectStore(DB_CONFIG.userStore, { keyPath: ['nearAccountId', 'deviceNumber'] });
          userStore.createIndex('nearAccountId', 'nearAccountId', { unique: false });
        }
        if (!db.objectStoreNames.contains(DB_CONFIG.appStateStore)) {
          db.createObjectStore(DB_CONFIG.appStateStore, { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains(DB_CONFIG.authenticatorStore)) {
          // Authenticators table: composite key of [nearAccountId, deviceNumber, credentialId]
          const authStore = db.createObjectStore(DB_CONFIG.authenticatorStore, { keyPath: ['nearAccountId', 'deviceNumber', 'credentialId'] });
          authStore.createIndex('nearAccountId', 'nearAccountId', { unique: false });
        }
      },
      blocked() {
        console.warn('PasskeyClientDB connection is blocked.');
      },
      blocking() {
        console.warn('PasskeyClientDB connection is blocking another connection.');
      },
      terminated: () => {
        console.warn('PasskeyClientDB connection has been terminated.');
        this.db = null;
      },
    });

    return this.db;
  }

  // === APP STATE METHODS ===

  async getAppState<T = any>(key: string): Promise<T | undefined> {
    const db = await this.getDB();
    const result = await db.get(DB_CONFIG.appStateStore, key);
    return result?.value as T | undefined;
  }

  async setAppState<T = any>(key: string, value: T): Promise<void> {
    const db = await this.getDB();
    const entry: AppStateEntry<T> = { key, value };
    await db.put(DB_CONFIG.appStateStore, entry);
  }

  // === ACCOUNT ID VALIDATION AND UTILITIES ===

  /**
   * Validate that a NEAR account ID is in the expected format
   * Supports both <username>.<relayerAccountId> and <username>.testnet formats
   */
  validateNearAccountId(nearAccountId: AccountId): ValidationResult {
    return validateNearAccountId(nearAccountId);
  }

  /**
   * Extract username from NEAR account ID
   */
  extractUsername(nearAccountId: AccountId): string {
    const validation = validateNearAccountId(nearAccountId);
    if (!validation.valid) {
      throw new Error(`Invalid NEAR account ID: ${validation.error}`);
    }
    return nearAccountId.split('.')[0];
  }

  /**
   * Generate a NEAR account ID from a username and domain
   * @param username - The username to use for the account ID
   * @param domain - The domain to use for the account ID
   * @returns The generated NEAR account ID
   */
  generateNearAccountId(username: string, domain: string): string {
    const sanitizedName = username
      .toLowerCase()
      .replace(/[^a-z0-9_\\-]/g, '')
      .substring(0, 32);
    return `${sanitizedName}.${domain}`;
  }

  // === USER MANAGEMENT METHODS ===

  async getUser(nearAccountId: AccountId): Promise<ClientUserData | null> {
    if (!nearAccountId) return null;

    const validation = this.validateNearAccountId(nearAccountId);
    if (!validation.valid) {
      console.warn(`Invalid account ID format: ${nearAccountId}`);
      return null;
    }

    const db = await this.getDB();
    const accountId = toAccountId(nearAccountId);

    // Find first device for this account (most common case)
    // Should only have one record per account per device
    const index = db.transaction(DB_CONFIG.userStore).store.index('nearAccountId');
    const results = await index.getAll(accountId);
    return results.length > 0 ? results[0] : null;
  }

  /**
   * Get the current/last user
   * This is maintained via app state and updated whenever a user is stored or updated
   */
  async getLastUser(): Promise<ClientUserData | null> {
    const lastUserState = await this.getAppState<LastUserAccountIdState>('lastUserAccountId');
    if (!lastUserState) return null;

    return this.getUser(lastUserState.accountId);
  }

  async hasPasskeyCredential(nearAccountId: AccountId): Promise<boolean> {
    try {
      const authenticators = await this.getAuthenticatorsByUser(nearAccountId);
      return !!authenticators[0]?.credentialId;
    } catch (error) {
      console.warn('Error checking passkey credential:', error);
      return false;
    }
  }

  /**
   * Register a new user with the given NEAR account ID
   * @param nearAccountId - Full NEAR account ID (e.g., "username.testnet" or "username.relayer.testnet")
   * @param additionalData - Additional user data to store
   */
  async registerUser(storeUserData: StoreUserDataInput): Promise<ClientUserData> {

    const validation = this.validateNearAccountId(storeUserData.nearAccountId);
    if (!validation.valid) {
      throw new Error(`Cannot register user with invalid account ID: ${validation.error}`);
    }

    const now = Date.now();

    const userData: ClientUserData = {
      nearAccountId: toAccountId(storeUserData.nearAccountId),
      deviceNumber: storeUserData.deviceNumber || 1, // Default to device 1 (1-indexed)
      registeredAt: now,
      lastLogin: now,
      lastUpdated: now,
      clientNearPublicKey: storeUserData.clientNearPublicKey,
      passkeyCredential: storeUserData.passkeyCredential,
      preferences: {
        useRelayer: false,
        useNetwork: 'testnet',
        // Default preferences can be set here
      },
      encryptedVrfKeypair: storeUserData.encryptedVrfKeypair,
    };

    await this.storeUser(userData);
    return userData;
  }

  async updateUser(nearAccountId: AccountId, updates: Partial<ClientUserData>): Promise<void> {
    const user = await this.getUser(nearAccountId);
    if (user) {
      // CHANGE: Debug device number issue in updateUser
      console.log("DEBUG updateUser: existing user deviceNumber =", user.deviceNumber);
      console.log("DEBUG updateUser: updates =", updates);

      const updatedUser = {
        ...user,
        ...updates,
        lastUpdated: Date.now()
      };

      console.log("DEBUG updateUser: final updatedUser deviceNumber =", updatedUser.deviceNumber);
      await this.storeUser(updatedUser); // This will update the app state lastUserAccountId
    }
  }

  async updateLastLogin(nearAccountId: AccountId): Promise<void> {
    await this.updateUser(nearAccountId, { lastLogin: Date.now() });
  }

  async updatePreferences(
    nearAccountId: AccountId,
    preferences: Partial<UserPreferences>
  ): Promise<void> {
    const user = await this.getUser(nearAccountId);
    if (user) {
      const updatedPreferences = {
        ...user.preferences,
        ...preferences
      } as UserPreferences;
      await this.updateUser(nearAccountId, { preferences: updatedPreferences });
    }
  }

  private async storeUser(userData: ClientUserData): Promise<void> {
    const validation = this.validateNearAccountId(userData.nearAccountId);
    if (!validation.valid) {
      throw new Error(`Cannot store user with invalid account ID: ${validation.error}`);
    }

    // CHANGE: Debug device number issue in lastUserAccountId
    console.log("DEBUG storeUser: storing user with deviceNumber =", userData.deviceNumber,
                "for account", userData.nearAccountId);

    const db = await this.getDB();
    await db.put(DB_CONFIG.userStore, userData);

    // Update lastUserAccountId with new format including device info
    const lastUserState: LastUserAccountIdState = {
      accountId: userData.nearAccountId,
      deviceNumber: userData.deviceNumber,
    };

    console.log("DEBUG storeUser: setting lastUserAccountId to deviceNumber =", userData.deviceNumber);
    await this.setAppState('lastUserAccountId', lastUserState);
  }

  /**
   * Store WebAuthn user data (compatibility with WebAuthnManager)
   * @param userData - User data with nearAccountId as primary identifier
   */
  async storeWebAuthnUserData(userData: {
    nearAccountId: AccountId;
    deviceNumber?: number; // Device number for multi-device support (1-indexed)
    clientNearPublicKey: string;
    lastUpdated?: number;
    passkeyCredential: {
      id: string;
      rawId: string;
    };
    encryptedVrfKeypair: {
      encrypted_vrf_data_b64u: string;
      chacha20_nonce_b64u: string;
    };
  }): Promise<void> {

    // CHANGE: Debug device number issue - log what device number is being stored
    console.log("DEBUG storeWebAuthnUserData: received deviceNumber =", userData.deviceNumber);
    if (userData.deviceNumber === undefined) {
      console.warn("WARNING: deviceNumber is undefined in storeWebAuthnUserData, will default to 1");
    }
    const validation = this.validateNearAccountId(userData.nearAccountId);
    if (!validation.valid) {
      throw new Error(`Cannot store WebAuthn data for invalid account ID: ${validation.error}`);
    }

    // Get existing user data or create new
    let existingUser = await this.getUser(userData.nearAccountId);
    if (!existingUser) {
      const deviceNumberToUse = userData.deviceNumber || 1;
      console.log("DEBUG: Creating new user with deviceNumber =", deviceNumberToUse,
                  "(original =", userData.deviceNumber, ")");
      existingUser = await this.registerUser({
        nearAccountId: userData.nearAccountId,
        deviceNumber: deviceNumberToUse, // Use provided device number or default to 1
        clientNearPublicKey: userData.clientNearPublicKey,
        passkeyCredential: userData.passkeyCredential,
        encryptedVrfKeypair: userData.encryptedVrfKeypair,
      });
    }

    // Update with WebAuthn-specific data (including VRF credentials)
    const finalDeviceNumber = userData.deviceNumber || existingUser.deviceNumber;
    console.log("DEBUG: Updating user with deviceNumber =", finalDeviceNumber,
                "(provided =", userData.deviceNumber, ", existing =", existingUser.deviceNumber, ")");

    await this.updateUser(userData.nearAccountId, {
      clientNearPublicKey: userData.clientNearPublicKey,
      encryptedVrfKeypair: userData.encryptedVrfKeypair,
      deviceNumber: finalDeviceNumber, // Use provided device number or keep existing
      lastUpdated: userData.lastUpdated || Date.now()
    });
  }

  async getAllUsers(): Promise<ClientUserData[]> {
    const db = await this.getDB();
    return db.getAll(DB_CONFIG.userStore);
  }

  async deleteUser(nearAccountId: AccountId): Promise<void> {
    const db = await this.getDB();
    await db.delete(DB_CONFIG.userStore, nearAccountId);
    // Also clean up related authenticators
    await this.clearAuthenticatorsForUser(nearAccountId);
  }

  async clearAllUsers(): Promise<void> {
    const db = await this.getDB();
    await db.clear(DB_CONFIG.userStore);
  }

  async clearAllAppState(): Promise<void> {
    const db = await this.getDB();
    await db.clear(DB_CONFIG.appStateStore);
  }

  /**
   * Store authenticator data for a user
   */
  async storeAuthenticator(authenticatorData: ClientAuthenticatorData): Promise<void> {
    const db = await this.getDB();
    await db.put(DB_CONFIG.authenticatorStore, authenticatorData);
  }

  /**
   * Get all authenticators for a user (optionally for a specific device)
   */
  async getAuthenticatorsByUser(nearAccountId: AccountId): Promise<ClientAuthenticatorData[]> {
    const db = await this.getDB();
    const tx = db.transaction(DB_CONFIG.authenticatorStore, 'readonly');
    const store = tx.objectStore(DB_CONFIG.authenticatorStore);
    const accountId = toAccountId(nearAccountId);

    // Get all authenticators for this account across all devices
    const index = store.index('nearAccountId');
    return await index.getAll(accountId);
  }

  /**
   * Get a specific authenticator by credential ID
   */
  async getAuthenticatorByCredentialId(
    nearAccountId: AccountId,
    credentialId: string
  ): Promise<ClientAuthenticatorData | null> {
    const db = await this.getDB();
    const result = await db.get(DB_CONFIG.authenticatorStore, [nearAccountId, credentialId]);
    return result || null;
  }

  /**
   * Clear all authenticators for a user
   */
  async clearAuthenticatorsForUser(nearAccountId: AccountId): Promise<void> {
    const authenticators = await this.getAuthenticatorsByUser(nearAccountId);
    const db = await this.getDB();
    const tx = db.transaction(DB_CONFIG.authenticatorStore, 'readwrite');
    const store = tx.objectStore(DB_CONFIG.authenticatorStore);

    for (const auth of authenticators) {
      await store.delete([nearAccountId, auth.credentialId]);
    }
  }

  /**
   * Sync authenticators from contract data
   */
  async syncAuthenticatorsFromContract(
    nearAccountId: AccountId,
    contractAuthenticators: Array<{
      credentialId: string;
      credentialPublicKey: Uint8Array;
      transports?: string[];
      name?: string;
      registered: string;
      vrfPublicKey: string;
      deviceNumber?: number; // Device number from contract
    }>
  ): Promise<void> {
    // Clear existing cache for this user
    await this.clearAuthenticatorsForUser(nearAccountId);

    // Add all contract authenticators to cache
    const syncedAt = new Date().toISOString();
    for (const auth of contractAuthenticators) {
      // Fix transport processing: filter out undefined values and provide fallback
      const rawTransports = auth.transports || [];
      const validTransports = rawTransports.filter((transport: any) =>
        transport !== undefined && transport !== null && typeof transport === 'string'
      );

      // If no valid transports, default to 'internal' for platform authenticators
      const transports = validTransports.length > 0 ? validTransports : ['internal'];

      const clientAuth: ClientAuthenticatorData = {
        credentialId: auth.credentialId,
        credentialPublicKey: auth.credentialPublicKey,
        transports,
        name: auth.name,
        nearAccountId: toAccountId(nearAccountId),
        deviceNumber: auth.deviceNumber || 1, // Default to device 1 (1-indexed)
        registered: auth.registered,
        syncedAt: syncedAt,
        vrfPublicKey: auth.vrfPublicKey,
      };
      await this.storeAuthenticator(clientAuth);
    }
  }

  // === ATOMIC OPERATIONS AND ROLLBACK METHODS ===

  /**
   * Delete all authenticators for a user
   */
  async deleteAllAuthenticatorsForUser(nearAccountId: AccountId): Promise<void> {
    const authenticators = await this.getAuthenticatorsByUser(nearAccountId);

    if (authenticators.length === 0) {
      console.debug(`No authenticators found for user ${nearAccountId}`);
      return;
    }

    const db = await this.getDB();
    const tx = db.transaction(DB_CONFIG.authenticatorStore, 'readwrite');
    const store = tx.objectStore(DB_CONFIG.authenticatorStore);

    for (const auth of authenticators) {
      await store.delete([nearAccountId, auth.credentialId]);
    }

    console.debug(`Deleted ${authenticators.length} authenticators for user ${nearAccountId}`);
  }

  /**
   * Atomic operation wrapper for multiple IndexedDB operations
   * Either all operations succeed or all are rolled back
   */
  async atomicOperation<T>(operation: (db: IDBPDatabase) => Promise<T>): Promise<T> {
    const db = await this.getDB();
    try {
      const result = await operation(db);
      return result;
    } catch (error) {
      console.error('Atomic operation failed:', error);
      throw error;
    }
  }

  /**
   * Complete rollback of user registration data
   * Deletes user, authenticators, and WebAuthn data atomically
   */
  async rollbackUserRegistration(nearAccountId: AccountId): Promise<void> {
    console.debug(`Rolling back registration data for ${nearAccountId}`);

    await this.atomicOperation(async (db) => {
      // Delete all authenticators for this user
      await this.deleteAllAuthenticatorsForUser(nearAccountId);

      // Delete user record
      await db.delete(DB_CONFIG.userStore, nearAccountId);

      // Clear from app state if this was the last user
      const lastUserAccount = await this.getAppState<string>('lastUserAccountId');
      if (lastUserAccount === nearAccountId) {
        await this.setAppState('lastUserAccountId', null);
      }

      console.debug(`Rolled back all registration data for ${nearAccountId}`);
      return true;
    });
  }
}