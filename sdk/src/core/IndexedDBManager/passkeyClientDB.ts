import { openDB, type IDBPDatabase } from 'idb';
import { type ValidationResult, validateNearAccountId } from '../../utils/validation';
import type { AccountId } from '../types/accountIds';
import { toAccountId } from '../types/accountIds';
import {
  ConfirmationConfig,
  DEFAULT_CONFIRMATION_CONFIG,
  type SignerMode,
  DEFAULT_SIGNING_MODE,
  coerceSignerMode,
} from '../types/signer-worker'


export interface ClientUserData {
  // Primary key - now uses AccountId + deviceNumber for unique identification
  nearAccountId: AccountId;
  deviceNumber: number; // Device number for multi-device support (1-indexed)
  version?: number;

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

export type StoreUserDataInput = Omit<ClientUserData, 'deviceNumber' | 'lastLogin' | 'registeredAt'>
  & {
    deviceNumber?: number;
    serverEncryptedVrfKeypair?: ClientUserData['serverEncryptedVrfKeypair'];
    version?: number;
  };

export type StoreWebAuthnUserDataInput = {
  nearAccountId: AccountId;
  deviceNumber: number;
  clientNearPublicKey: string;
  lastUpdated?: number;
  version?: number;
  passkeyCredential: ClientUserData['passkeyCredential'];
  encryptedVrfKeypair: ClientUserData['encryptedVrfKeypair'];
  serverEncryptedVrfKeypair?: ClientUserData['serverEncryptedVrfKeypair'];
};

export interface UserPreferences {
  useRelayer: boolean;
  useNetwork: 'testnet' | 'mainnet';
  confirmationConfig: ConfirmationConfig;
  signerMode?: SignerMode;
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

interface AppStateEntry<T = unknown> {
  key: string;
  value: T;
}

// Internal helper: legacy user records may be missing deviceNumber.
type ClientUserDataWithOptionalDevice =
  | ClientUserData
  | (Omit<ClientUserData, 'deviceNumber'> & { deviceNumber?: number });

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
  derivedAddressStore: string;
  recoveryEmailStore: string;
}

// === CONSTANTS ===
const DB_CONFIG: PasskeyClientDBConfig = {
  dbName: 'PasskeyClientDB',
  dbVersion: 15, // v15: add recoveryEmails store
  userStore: 'users',
  appStateStore: 'appState',
  authenticatorStore: 'authenticators',
  derivedAddressStore: 'derivedAddresses',
  recoveryEmailStore: 'recoveryEmails'
} as const;

export interface IndexedDBEvent {
  type: 'user-updated' | 'preferences-updated' | 'user-deleted';
  accountId: AccountId;
  data?: Record<string, unknown>;
}

// Persisted mapping of derived (e.g., EVM) addresses tied to an account
/**
 * Persisted mapping of derived (e.g., EVM/Solana/Zcash) addresses tied to an account.
 *
 * Notes on multi-chain support:
 * - The composite primary key is [nearAccountId, contractId, path]. To support
 *   different chains and chain IDs, encode them in the `path` string, e.g.:
 *     - EVM: `evm:<chainId>:<derivationPath>` → `evm:84532:ethereum-1`
 *     - Solana: `solana:<derivationPath>`
 *     - Zcash: `zcash:<derivationPath>`
 * - Additional descriptive fields like `namespace` and `chainRef` are optional metadata
 *   and are not part of the key.
 */
export interface DerivedAddressRecord {
  nearAccountId: AccountId;
  contractId: string; // MPC/Derivation contract on NEAR
  path: string;       // Composite path (may include namespace/chainId); see docs above
  address: string;    // Derived address (e.g., 0x...)
  updatedAt: number;
  // Optional metadata (not used in the key)
  namespace?: string; // e.g., 'evm', 'solana', 'zcash'
  chainRef?: string;  // e.g., chainId '84532' or a named network slug
}

/**
 * Persisted mapping of recovery email hashes to canonical email addresses for an account.
 *
 * Notes:
 * - Composite primary key is [nearAccountId, hashHex].
 * - `hashHex` is the 0x-prefixed hex encoding of the 32-byte hash:
 *     SHA256(canonical_email || "|" || account_id)
 * - `email` is the canonical form: "local@domain", lowercased.
 */
export interface RecoveryEmailRecord {
  nearAccountId: AccountId;
  hashHex: string;
  email: string;
  addedAt: number;
}

export class PasskeyClientDBManager {
  private config: PasskeyClientDBConfig;
  private db: IDBPDatabase | null = null;
  private disabled = false;
  private eventListeners: Set<(event: IndexedDBEvent) => void> = new Set();

  constructor(config: PasskeyClientDBConfig = DB_CONFIG) {
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

  // === EVENT SYSTEM ===

  onChange(listener: (event: IndexedDBEvent) => void): () => void {
    this.eventListeners.add(listener);
    return () => {
      this.eventListeners.delete(listener);
    };
  }

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
    if (this.disabled) {
      throw new Error('[PasskeyClientDBManager] IndexedDB is disabled in this environment.');
    }
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
          if (!db.objectStoreNames.contains(DB_CONFIG.derivedAddressStore)) {
            // Derived addresses: composite key of [nearAccountId, contractId, path]
            const dStore = db.createObjectStore(DB_CONFIG.derivedAddressStore, { keyPath: ['nearAccountId', 'contractId', 'path'] });
            try { dStore.createIndex('nearAccountId', 'nearAccountId', { unique: false }); } catch {}
          }
          if (!db.objectStoreNames.contains(DB_CONFIG.recoveryEmailStore)) {
            // Recovery emails: composite key of [nearAccountId, hashHex]
            const rStore = db.createObjectStore(DB_CONFIG.recoveryEmailStore, { keyPath: ['nearAccountId', 'hashHex'] });
            try { rStore.createIndex('nearAccountId', 'nearAccountId', { unique: false }); } catch {}
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

  private async runMigrationsIfNeeded(_db: IDBPDatabase): Promise<void> {
    return;
  }

  // === APP STATE METHODS ===

  async getAppState<T = unknown>(key: string): Promise<T | undefined> {
    const db = await this.getDB();
    const result = await db.get(DB_CONFIG.appStateStore, key);
    return result?.value as T | undefined;
  }

  async setAppState<T = unknown>(key: string, value: T): Promise<void> {
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

  async getUser(nearAccountId: AccountId, deviceNumber?: number): Promise<ClientUserData | null> {
    if (!nearAccountId) return null;

    const validation = this.validateNearAccountId(nearAccountId);
    if (!validation.valid) {
      console.warn(`Invalid account ID format: ${nearAccountId}`);
      return null;
    }

    const db = await this.getDB();
    const accountId = toAccountId(nearAccountId);

    if (typeof deviceNumber === 'number') {
      const rec = await db.get(DB_CONFIG.userStore, [accountId, deviceNumber]);
      if (!rec) return null;
      return await this.normalizeUserDeviceNumber(rec as ClientUserDataWithOptionalDevice, deviceNumber);
    }

    const index = db.transaction(DB_CONFIG.userStore).store.index('nearAccountId');
    const results = await index.getAll(accountId);
    if (results.length === 0) {
      return null;
    }

    if (results.length > 1) {
      console.warn(
        `Multiple passkeys found for account ${accountId}, deviceNumber not provided; ` +
        'defaulting to last logged-in user.'
      );
      console.log('defaulting to last used user deviceNumber');
      const lastUserState = await this.getAppState<LastUserAccountIdState>('lastUserAccountId').catch(() => null);
      if (lastUserState && toAccountId(lastUserState.accountId) === accountId) {
        const keyed = await db.get(DB_CONFIG.userStore, [accountId, lastUserState.deviceNumber]);
        if (keyed) {
          return await this.normalizeUserDeviceNumber(
            keyed as ClientUserDataWithOptionalDevice,
            lastUserState.deviceNumber
          );
        }
      }
    }

    const first = results[0] as ClientUserDataWithOptionalDevice;
    if (!first) return null;
    return await this.normalizeUserDeviceNumber(first, 1);
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

  /**
   * Get the most recently updated user record for a given account.
   * Useful when deviceNumber is unknown but we need the freshest key for the account.
   */
  /**
   * Get the most recently updated user record for a given account.
   * Useful when deviceNumber is unknown but we need the freshest key for the account.
   */
  async getLastDBUpdatedUser(nearAccountId: AccountId): Promise<ClientUserData | null> {
    const db = await this.getDB();
    try {
      const idx = db.transaction(DB_CONFIG.userStore).store.index('nearAccountId');
      const all = await idx.getAll(toAccountId(nearAccountId));
      if (Array.isArray(all) && all.length > 0) {
        const latest = (all as ClientUserData[]).reduce((a, b) =>
          (a.lastUpdated ?? 0) >= (b.lastUpdated ?? 0) ? a : b
        );
        return latest;
      }
    } catch {
      // fall through
    }
    return null;
  }

  async hasPasskeyCredential(nearAccountId: AccountId): Promise<boolean> {
    const authenticators = await this.getAuthenticatorsByUser(nearAccountId);
    return !!authenticators[0]?.credentialId;
  }

  /**
   * Ensure the current passkey selection is aligned with the last logged-in device.
   *
   * - When multiple authenticators exist for an account and no deviceNumber is specified,
   *   this helper prefers authenticators whose deviceNumber matches the last logged-in user.
   * - Optionally validates that a selected credential (by rawId) also matches the last-user device.
   *
   * @param nearAccountId - Account ID for which the operation is being performed
   * @param authenticators - All authenticators stored for the account
   * @param selectedCredentialRawId - Optional rawId of the credential chosen by WebAuthn
   * @returns filtered authenticators for allowCredentials, plus optional wrongPasskeyError
   */
  async ensureCurrentPasskey(
    nearAccountId: AccountId,
    authenticators: ClientAuthenticatorData[],
    selectedCredentialRawId?: string,
  ): Promise<{
    authenticatorsForPrompt: ClientAuthenticatorData[];
    wrongPasskeyError?: string;
  }> {
    if (authenticators.length <= 1) {
      return { authenticatorsForPrompt: authenticators };
    }

    const accountIdNormalized = toAccountId(nearAccountId);
    const lastUser = await this.getLastUser().catch(() => null);
    if (!lastUser || lastUser.nearAccountId !== accountIdNormalized) {
      return { authenticatorsForPrompt: authenticators };
    }

    const expectedDeviceNumber = lastUser.deviceNumber;
    const byDeviceNumber = authenticators.filter(a => a.deviceNumber === expectedDeviceNumber);

    // Prefer the credentialId for the last-user deviceNumber; use the stored last-user rawId
    // only when it matches an authenticator for that device (or when we have no device match).
    let expectedCredentialId = lastUser.passkeyCredential.rawId;
    if (byDeviceNumber.length > 0 && !byDeviceNumber.some(a => a.credentialId === expectedCredentialId)) {
      expectedCredentialId = byDeviceNumber[0].credentialId;
    }

    // Preference: restrict allowCredentials to the last-user credentialId.
    // Fallback: if the local authenticator cache is missing that entry, prefer the last-user deviceNumber.
    const byCredentialId = authenticators.filter(a => a.credentialId === expectedCredentialId);
    const authenticatorsForPrompt =
      byCredentialId.length > 0
        ? byCredentialId
        : (byDeviceNumber.length > 0 ? byDeviceNumber : authenticators);

    const wrongPasskeyError =
      selectedCredentialRawId && selectedCredentialRawId !== expectedCredentialId
        ? (
          `You have multiple passkeys (deviceNumbers) for account ${accountIdNormalized}, ` +
          'but used a different passkey than the most recently logged-in one. Please use the passkey for the most recently logged-in device.'
        )
        : undefined;

    return { authenticatorsForPrompt, wrongPasskeyError };
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
      version: storeUserData.version || 2,
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

  async updateUser(nearAccountId: AccountId, updates: Partial<ClientUserData>, deviceNumber?: number): Promise<void> {
    const user = await this.getUser(nearAccountId, deviceNumber);
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

  private async normalizeUserDeviceNumber(
    user: ClientUserDataWithOptionalDevice,
    defaultDeviceNumber: number
  ): Promise<ClientUserData> {
    const hasValidDevice =
      typeof user.deviceNumber === 'number' && Number.isFinite(user.deviceNumber);
    if (hasValidDevice) {
      return user as ClientUserData;
    }

    const deviceNumber = defaultDeviceNumber;
    const fixed: ClientUserData = {
      ...(user as Omit<ClientUserData, 'deviceNumber'>),
      deviceNumber,
    };
    await this.storeUser(fixed);
    return fixed;
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
  async storeWebAuthnUserData(userData: StoreWebAuthnUserDataInput): Promise<void> {
    const validation = this.validateNearAccountId(userData.nearAccountId);
    if (!validation.valid) {
      throw new Error(`Cannot store WebAuthn data for invalid account ID: ${validation.error}`);
    }

    const accountId = toAccountId(userData.nearAccountId);
    const deviceNumber = userData.deviceNumber;
    let user = await this.getUser(accountId, deviceNumber);

    if (!user) {
      user = await this.registerUser({
        nearAccountId: accountId,
        deviceNumber,
        clientNearPublicKey: userData.clientNearPublicKey,
        passkeyCredential: userData.passkeyCredential,
        encryptedVrfKeypair: userData.encryptedVrfKeypair,
        version: userData.version || 2,
        serverEncryptedVrfKeypair: userData.serverEncryptedVrfKeypair,
      });
    }

    const updatedUser: ClientUserData = {
      ...user,
      clientNearPublicKey: userData.clientNearPublicKey,
      passkeyCredential: userData.passkeyCredential,
      encryptedVrfKeypair: userData.encryptedVrfKeypair,
      serverEncryptedVrfKeypair: userData.serverEncryptedVrfKeypair ?? user.serverEncryptedVrfKeypair,
      version: userData.version ?? user.version,
      lastUpdated: userData.lastUpdated ?? Date.now(),
    };

    await this.storeUser(updatedUser);
    this.emitEvent({
      type: 'user-updated',
      accountId,
      data: { updatedUser }
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
    const tx = db.transaction(DB_CONFIG.authenticatorStore, 'readonly');
    const store = tx.objectStore(DB_CONFIG.authenticatorStore);
    const accountId = toAccountId(nearAccountId);

    // Primary key is [nearAccountId, deviceNumber, credentialId], so we cannot
    // look up by [nearAccountId, credentialId] directly. Use the nearAccountId
    // index and filter by credentialId.
    const index = store.index('nearAccountId');
    const all = await index.getAll(accountId);
    const match = all.find((auth: any) => auth.credentialId === credentialId) || null;
    return match;
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
      // Composite PK is [nearAccountId, deviceNumber, credentialId]
      await store.delete([nearAccountId, auth.deviceNumber, auth.credentialId]);
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
      // Composite PK is [nearAccountId, deviceNumber, credentialId]
      await store.delete([nearAccountId, auth.deviceNumber, auth.credentialId]);
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
   * Get user's signer mode preference from IndexedDB
   */
  async getSignerMode(nearAccountId: AccountId): Promise<SignerMode> {
    const user = await this.getUser(nearAccountId);
    const raw = user?.preferences?.signerMode as SignerMode | SignerMode['mode'] | null | undefined;
    return coerceSignerMode(raw, DEFAULT_SIGNING_MODE);
  }

  /**
   * Set user's signer mode preference in IndexedDB
   */
  async setSignerMode(nearAccountId: AccountId, signerMode: SignerMode | SignerMode['mode']): Promise<void> {
    const next = coerceSignerMode(signerMode, DEFAULT_SIGNING_MODE);
    await this.updatePreferences(nearAccountId, { signerMode: next });
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

  // === DERIVED ADDRESS METHODS ===

  /**
   * Store a derived address for a given NEAR account + contract + path
   */
  async setDerivedAddress(nearAccountId: AccountId, args: { contractId: string; path: string; address: string }): Promise<void> {
    if (!nearAccountId || !args?.contractId || !args?.path || !args?.address) return;
    const validation = this.validateNearAccountId(nearAccountId);
    if (!validation.valid) return;
    const rec: DerivedAddressRecord = {
      nearAccountId: toAccountId(nearAccountId),
      contractId: String(args.contractId),
      path: String(args.path),
      address: String(args.address),
      updatedAt: Date.now(),
    };
    const db = await this.getDB();
    await db.put(DB_CONFIG.derivedAddressStore, rec);
  }

  /**
   * Fetch a derived address record; returns null if not found
   */
  async getDerivedAddressRecord(nearAccountId: AccountId, args: { contractId: string; path: string }): Promise<DerivedAddressRecord | null> {
    if (!nearAccountId || !args?.contractId || !args?.path) return null;
    const db = await this.getDB();
    const rec = await db.get(DB_CONFIG.derivedAddressStore, [toAccountId(nearAccountId), String(args.contractId), String(args.path)]);
    return (rec as DerivedAddressRecord) || null;
  }

  /**
   * Get only the derived address string; returns null if not set
   */
  async getDerivedAddress(nearAccountId: AccountId, args: { contractId: string; path: string }): Promise<string | null> {
    const rec = await this.getDerivedAddressRecord(nearAccountId, args);
    return rec?.address || null;
  }

  // === RECOVERY EMAIL METHODS ===

  /**
   * Upsert recovery email records for an account.
   * Merges by hashHex, preferring the most recent email.
   */
  async upsertRecoveryEmails(
    nearAccountId: AccountId,
    entries: Array<{ hashHex: string; email: string }>
  ): Promise<void> {
    if (!nearAccountId || !entries?.length) return;
    const validation = this.validateNearAccountId(nearAccountId);
    if (!validation.valid) return;

    const db = await this.getDB();
    const accountId = toAccountId(nearAccountId);
    const now = Date.now();

    for (const entry of entries) {
      const hashHex = String(entry?.hashHex || '').trim();
      const email = String(entry?.email || '').trim();
      if (!hashHex || !email) continue;

      const rec: RecoveryEmailRecord = {
        nearAccountId: accountId,
        hashHex,
        email,
        addedAt: now,
      };
      await db.put(DB_CONFIG.recoveryEmailStore, rec);
    }
  }

  /**
   * Fetch all recovery email records for an account.
   */
  async getRecoveryEmails(nearAccountId: AccountId): Promise<RecoveryEmailRecord[]> {
    if (!nearAccountId) return [];
    const db = await this.getDB();
    const accountId = toAccountId(nearAccountId);
    const tx = db.transaction(DB_CONFIG.recoveryEmailStore, 'readonly');
    const store = tx.objectStore(DB_CONFIG.recoveryEmailStore);
    const index = store.index('nearAccountId');
    const result = await index.getAll(accountId);
    return (result as RecoveryEmailRecord[]) || [];
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
