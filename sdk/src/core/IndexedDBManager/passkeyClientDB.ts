import { openDB, type IDBPDatabase } from 'idb';
import { type ValidationResult, validateNearAccountId } from '../../utils/validation';
import type { AccountId } from '../types/accountIds';
import { toAccountId } from '../types/accountIds';
import { ConfirmationConfig, DEFAULT_CONFIRMATION_CONFIG } from '../types/signer-worker'


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
    encryptedVrfDataB64u: string;
    chacha20NonceB64u: string;
  };

  // Server-assisted auto-login (VRF key session): Shamir 3-pass fields
  // Stores relayer-blinded KEK and the VRF ciphertext; server never sees plaintext VRF or KEK
  serverEncryptedVrfKeypair?: {
    ciphertextVrfB64u: string;
    kek_s_b64u: string;
    // Metadata for proactive refresh
    serverKeyId: string;
    updatedAt?: number;
  };

  // User preferences
  preferences?: UserPreferences;
}

// TODO: fix typings
export type StoreUserDataInput = Omit<ClientUserData, 'deviceNumber' | 'lastLogin' | 'registeredAt'>
  & {
    deviceNumber?: number;
    serverEncryptedVrfKeypair?: ClientUserData['serverEncryptedVrfKeypair'];
  };

export interface UserPreferences {
  useRelayer: boolean;
  useNetwork: 'testnet' | 'mainnet';
  confirmationConfig: ConfirmationConfig;
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
  dbVersion: 13, // Bump version; add fallback open for mixed-version contexts
  userStore: 'users',
  appStateStore: 'appState',
  authenticatorStore: 'authenticators'
} as const;

export interface IndexedDBEvent {
  type: 'user-updated' | 'preferences-updated' | 'user-deleted';
  accountId: AccountId;
  data?: any;
}

export class PasskeyClientDBManager {
  private config: PasskeyClientDBConfig;
  private db: IDBPDatabase | null = null;
  private eventListeners: Set<(event: IndexedDBEvent) => void> = new Set();

  constructor(config: PasskeyClientDBConfig = DB_CONFIG) {
    this.config = config;
  }

  // === EVENT SYSTEM ===

  /**
   * Subscribe to IndexedDB change events
   */
  onChange(listener: (event: IndexedDBEvent) => void): () => void {
    this.eventListeners.add(listener);
    return () => {
      this.eventListeners.delete(listener);
    };
  }

  /**
   * Emit an event to all listeners
   */
  private emitEvent(event: IndexedDBEvent): void {
    this.eventListeners.forEach(listener => {
      try {
        listener(event);
      } catch (error) {
        console.warn('[IndexedDBManager]: Error in event listener:', error);
      }
    });
  }

  private async getDB(): Promise<IDBPDatabase> {
    if (this.db) {
      return this.db;
    }

    try {
      this.db = await openDB(this.config.dbName, this.config.dbVersion, {
        upgrade: (db, oldVersion, _newVersion, _transaction): void => {
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
      // Post-open migrations (non-blocking)
      try { await this.runMigrationsIfNeeded(this.db); } catch {}
    } catch (err: any) {
      const msg = String(err?.message || '');
      if (err?.name === 'VersionError' || /less than the existing version/i.test(msg)) {
        // Mixed-version contexts (host/app) — open without version to adopt existing DB
        try {
          console.warn('PasskeyClientDB: opening existing DB without version due to VersionError');
          this.db = await openDB(this.config.dbName);
        } catch (e) {
          throw err;
        }
      } else {
        throw err;
      }
    }

    return this.db;
  }

  private async runMigrationsIfNeeded(db: IDBPDatabase): Promise<void> {
    try {
      const migrated = await db.get(DB_CONFIG.appStateStore, 'migrated_v13_serverKeyFields');
      if (migrated?.value === true) return;

      const tx = db.transaction(DB_CONFIG.userStore, 'readwrite');
      const store = tx.objectStore(DB_CONFIG.userStore);
      const users: any[] = await store.getAll();
      const now = Date.now();
      for (const user of users) {
        if (user?.serverEncryptedVrfKeypair && typeof user.serverEncryptedVrfKeypair === 'object') {
          if (user.serverEncryptedVrfKeypair.updatedAt == null) {
            user.serverEncryptedVrfKeypair.updatedAt = now;
            await store.put(user);
          }
        }
      }
      await tx.done;
      await db.put(DB_CONFIG.appStateStore, { key: 'migrated_v13_serverKeyFields', value: true });
    } catch (e) {
      console.warn('PasskeyClientDB migration v13 failed (non-fatal):', e);
    }
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
    const user = results.length > 0 ? (results[0] as any) : null;
    if (!user) return null;
    // Ensure deviceNumber is always present; backfill to 1 if missing and persist
    if (typeof user.deviceNumber !== 'number' || !Number.isFinite(user.deviceNumber)) {
      const fixed: ClientUserData = {
        ...user,
        deviceNumber: 1,
      };
      await this.updateUser(accountId, { deviceNumber: 1 });
      return fixed;
    }
    return user as ClientUserData;
  }

  /**
   * Get the current/last user
   * This is maintained via app state and updated whenever a user is stored or updated
   */
  async getLastUser(): Promise<ClientUserData | null> {
    const lastUserState = await this.getAppState<LastUserAccountIdState>('lastUserAccountId');
    if (!lastUserState) return null;
    const db = await this.getDB();
    const accountId = toAccountId(lastUserState.accountId);
    // Prefer exact device match using composite primary key
    const record = await db.get(DB_CONFIG.userStore, [accountId, lastUserState.deviceNumber]);
    if (record) return record as ClientUserData;
    // Fallback: return any user for account
    return this.getUser(accountId);
  }

  /** Get user record by composite key (nearAccountId, deviceNumber) */
  async getUserByDevice(nearAccountId: AccountId, deviceNumber: number): Promise<ClientUserData | null> {
    const db = await this.getDB();
    const accountId = toAccountId(nearAccountId);
    const rec = await db.get(DB_CONFIG.userStore, [accountId, deviceNumber]);
    return rec as ClientUserData || null;
  }

  async hasPasskeyCredential(nearAccountId: AccountId): Promise<boolean> {
    const authenticators = await this.getAuthenticatorsByUser(nearAccountId);
    return !!authenticators[0]?.credentialId;
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
        confirmationConfig: DEFAULT_CONFIRMATION_CONFIG,
        // Default preferences can be set here
      },
      encryptedVrfKeypair: storeUserData.encryptedVrfKeypair,
      serverEncryptedVrfKeypair: storeUserData.serverEncryptedVrfKeypair,
    };

    await this.storeUser(userData);
    return userData;
  }

  async updateUser(nearAccountId: AccountId, updates: Partial<ClientUserData>): Promise<void> {
    const user = await this.getUser(nearAccountId);
    if (user) {
      const updatedUser = {
        ...user,
        ...updates,
        lastUpdated: Date.now()
      };
      await this.storeUser(updatedUser); // This will update the app state lastUserAccountId

      // Emit event for user updates
      this.emitEvent({
        type: 'user-updated',
        accountId: nearAccountId,
        data: { updates, updatedUser }
      });
    }
  }

  async updateLastLogin(nearAccountId: AccountId): Promise<void> {
    await this.updateUser(nearAccountId, { lastLogin: Date.now() });
  }

  /**
   * Set the last logged-in user
   * @param nearAccountId - The account ID of the user
   * @param deviceNumber - The device number (defaults to 1)
   */
  async setLastUser(nearAccountId: AccountId, deviceNumber: number = 1): Promise<void> {
    const lastUserState: LastUserAccountIdState = {
      accountId: nearAccountId,
      deviceNumber,
    };
    await this.setAppState('lastUserAccountId', lastUserState);
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

      // Emit event for preference changes
      this.emitEvent({
        type: 'preferences-updated',
        accountId: nearAccountId,
        data: { preferences: updatedPreferences }
      });
    }
  }

  private async storeUser(userData: ClientUserData): Promise<void> {
    const validation = this.validateNearAccountId(userData.nearAccountId);
    if (!validation.valid) {
      throw new Error(`Cannot store user with invalid account ID: ${validation.error}`);
    }

    const db = await this.getDB();
    await db.put(DB_CONFIG.userStore, userData);

    // Update lastUserAccountId with new format including device info
    const lastUserState: LastUserAccountIdState = {
      accountId: userData.nearAccountId,
      deviceNumber: userData.deviceNumber,
    };

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
      encryptedVrfDataB64u: string;
      chacha20NonceB64u: string;
    };
    serverEncryptedVrfKeypair?: {
      ciphertextVrfB64u: string;
      kek_s_b64u: string;
      serverKeyId: string;
      updatedAt?: number;
    };
  }): Promise<void> {

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
      existingUser = await this.registerUser({
        nearAccountId: userData.nearAccountId,
        deviceNumber: deviceNumberToUse, // Use provided device number or default to 1
        clientNearPublicKey: userData.clientNearPublicKey,
        passkeyCredential: userData.passkeyCredential,
        encryptedVrfKeypair: userData.encryptedVrfKeypair,
        serverEncryptedVrfKeypair: userData.serverEncryptedVrfKeypair,
      });
    }

    // Update with WebAuthn-specific data (including VRF credentials)
    const finalDeviceNumber = userData.deviceNumber || existingUser.deviceNumber;

    await this.updateUser(userData.nearAccountId, {
      clientNearPublicKey: userData.clientNearPublicKey,
      encryptedVrfKeypair: userData.encryptedVrfKeypair,
      serverEncryptedVrfKeypair: userData.serverEncryptedVrfKeypair,
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
      console.warn(`No authenticators found for user ${nearAccountId}`);
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
   * Get user's confirmation config from IndexedDB
   * @param nearAccountId - The user's account ID
   * @returns ConfirmationConfig or undefined
   */
  async getConfirmationConfig(nearAccountId: AccountId): Promise<ConfirmationConfig> {
    const user = await this.getUser(nearAccountId);
    return user?.preferences?.confirmationConfig || DEFAULT_CONFIRMATION_CONFIG;
  }

  /**
   * Get user's theme preference from IndexedDB
   * @param nearAccountId - The user's account ID
   * @returns 'dark' | 'light' | null
   */
  async getTheme(nearAccountId: AccountId): Promise<'dark' | 'light' | null> {
    const user = await this.getUser(nearAccountId);
    return user?.preferences?.confirmationConfig.theme || null;
  }

  /**
   * Set user's theme preference in IndexedDB
   * @param nearAccountId - The user's account ID
   * @param theme - The theme to set ('dark' | 'light')
   */
  async setTheme(nearAccountId: AccountId, theme: 'dark' | 'light'): Promise<void> {
    const existingConfig = await this.getConfirmationConfig(nearAccountId);
    const confirmationConfig = { ...existingConfig, theme };
    await this.updatePreferences(nearAccountId, { confirmationConfig });
  }

  /**
   * Get user's theme with fallback to 'dark'
   * @param nearAccountId - The user's account ID
   * @returns 'dark' | 'light'
   */
  async getThemeOrDefault(nearAccountId: AccountId): Promise<'dark' | 'light'> {
    const theme = await this.getTheme(nearAccountId);
    return theme || 'dark';
  }

  /**
   * Toggle between dark and light theme for a user
   * @param nearAccountId - The user's account ID
   * @returns The new theme that was set
   */
  async toggleTheme(nearAccountId: AccountId): Promise<'dark' | 'light'> {
    const currentTheme = await this.getThemeOrDefault(nearAccountId);
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    await this.setTheme(nearAccountId, newTheme);
    return newTheme;
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
