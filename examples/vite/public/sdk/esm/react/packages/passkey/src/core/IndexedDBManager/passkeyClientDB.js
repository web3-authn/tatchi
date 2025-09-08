import { validateNearAccountId } from "../../utils/validation.js";
import { toAccountId } from "../types/accountIds.js";
import { DEFAULT_CONFIRMATION_CONFIG } from "../types/signer-worker.js";
import { openDB } from "idb";

//#region src/core/IndexedDBManager/passkeyClientDB.ts
const DB_CONFIG = {
	dbName: "PasskeyClientDB",
	dbVersion: 11,
	userStore: "users",
	appStateStore: "appState",
	authenticatorStore: "authenticators"
};
var PasskeyClientDBManager = class {
	config;
	db = null;
	eventListeners = /* @__PURE__ */ new Set();
	constructor(config = DB_CONFIG) {
		this.config = config;
	}
	/**
	* Subscribe to IndexedDB change events
	*/
	onChange(listener) {
		this.eventListeners.add(listener);
		return () => {
			this.eventListeners.delete(listener);
		};
	}
	/**
	* Emit an event to all listeners
	*/
	emitEvent(event) {
		this.eventListeners.forEach((listener) => {
			try {
				listener(event);
			} catch (error) {
				console.warn("[IndexedDBManager]: Error in event listener:", error);
			}
		});
	}
	async getDB() {
		if (this.db) return this.db;
		this.db = await openDB(this.config.dbName, this.config.dbVersion, {
			upgrade(db, oldVersion) {
				if (!db.objectStoreNames.contains(DB_CONFIG.userStore)) {
					const userStore = db.createObjectStore(DB_CONFIG.userStore, { keyPath: ["nearAccountId", "deviceNumber"] });
					userStore.createIndex("nearAccountId", "nearAccountId", { unique: false });
				}
				if (!db.objectStoreNames.contains(DB_CONFIG.appStateStore)) db.createObjectStore(DB_CONFIG.appStateStore, { keyPath: "key" });
				if (!db.objectStoreNames.contains(DB_CONFIG.authenticatorStore)) {
					const authStore = db.createObjectStore(DB_CONFIG.authenticatorStore, { keyPath: [
						"nearAccountId",
						"deviceNumber",
						"credentialId"
					] });
					authStore.createIndex("nearAccountId", "nearAccountId", { unique: false });
				}
			},
			blocked() {
				console.warn("PasskeyClientDB connection is blocked.");
			},
			blocking() {
				console.warn("PasskeyClientDB connection is blocking another connection.");
			},
			terminated: () => {
				console.warn("PasskeyClientDB connection has been terminated.");
				this.db = null;
			}
		});
		return this.db;
	}
	async getAppState(key) {
		const db = await this.getDB();
		const result = await db.get(DB_CONFIG.appStateStore, key);
		return result?.value;
	}
	async setAppState(key, value) {
		const db = await this.getDB();
		const entry = {
			key,
			value
		};
		await db.put(DB_CONFIG.appStateStore, entry);
	}
	/**
	* Validate that a NEAR account ID is in the expected format
	* Supports both <username>.<relayerAccountId> and <username>.testnet formats
	*/
	validateNearAccountId(nearAccountId) {
		return validateNearAccountId(nearAccountId);
	}
	/**
	* Extract username from NEAR account ID
	*/
	extractUsername(nearAccountId) {
		const validation = validateNearAccountId(nearAccountId);
		if (!validation.valid) throw new Error(`Invalid NEAR account ID: ${validation.error}`);
		return nearAccountId.split(".")[0];
	}
	/**
	* Generate a NEAR account ID from a username and domain
	* @param username - The username to use for the account ID
	* @param domain - The domain to use for the account ID
	* @returns The generated NEAR account ID
	*/
	generateNearAccountId(username, domain) {
		const sanitizedName = username.toLowerCase().replace(/[^a-z0-9_\\-]/g, "").substring(0, 32);
		return `${sanitizedName}.${domain}`;
	}
	async getUser(nearAccountId) {
		if (!nearAccountId) return null;
		const validation = this.validateNearAccountId(nearAccountId);
		if (!validation.valid) {
			console.warn(`Invalid account ID format: ${nearAccountId}`);
			return null;
		}
		const db = await this.getDB();
		const accountId = toAccountId(nearAccountId);
		const index = db.transaction(DB_CONFIG.userStore).store.index("nearAccountId");
		const results = await index.getAll(accountId);
		return results.length > 0 ? results[0] : null;
	}
	/**
	* Get the current/last user
	* This is maintained via app state and updated whenever a user is stored or updated
	*/
	async getLastUser() {
		const lastUserState = await this.getAppState("lastUserAccountId");
		if (!lastUserState) return null;
		return this.getUser(lastUserState.accountId);
	}
	async hasPasskeyCredential(nearAccountId) {
		try {
			const authenticators = await this.getAuthenticatorsByUser(nearAccountId);
			return !!authenticators[0]?.credentialId;
		} catch (error) {
			console.warn("Error checking passkey credential:", error);
			return false;
		}
	}
	/**
	* Register a new user with the given NEAR account ID
	* @param nearAccountId - Full NEAR account ID (e.g., "username.testnet" or "username.relayer.testnet")
	* @param additionalData - Additional user data to store
	*/
	async registerUser(storeUserData) {
		const validation = this.validateNearAccountId(storeUserData.nearAccountId);
		if (!validation.valid) throw new Error(`Cannot register user with invalid account ID: ${validation.error}`);
		const now = Date.now();
		const userData = {
			nearAccountId: toAccountId(storeUserData.nearAccountId),
			deviceNumber: storeUserData.deviceNumber || 1,
			registeredAt: now,
			lastLogin: now,
			lastUpdated: now,
			clientNearPublicKey: storeUserData.clientNearPublicKey,
			passkeyCredential: storeUserData.passkeyCredential,
			preferences: {
				useRelayer: false,
				useNetwork: "testnet",
				confirmationConfig: {
					uiMode: "modal",
					behavior: "autoProceed",
					autoProceedDelay: 1e3,
					theme: "light"
				}
			},
			encryptedVrfKeypair: storeUserData.encryptedVrfKeypair,
			serverEncryptedVrfKeypair: storeUserData.serverEncryptedVrfKeypair
		};
		await this.storeUser(userData);
		return userData;
	}
	async updateUser(nearAccountId, updates) {
		const user = await this.getUser(nearAccountId);
		if (user) {
			const updatedUser = {
				...user,
				...updates,
				lastUpdated: Date.now()
			};
			await this.storeUser(updatedUser);
			this.emitEvent({
				type: "user-updated",
				accountId: nearAccountId,
				data: {
					updates,
					updatedUser
				}
			});
		}
	}
	async updateLastLogin(nearAccountId) {
		await this.updateUser(nearAccountId, { lastLogin: Date.now() });
	}
	/**
	* Set the last logged-in user
	* @param nearAccountId - The account ID of the user
	* @param deviceNumber - The device number (defaults to 1)
	*/
	async setLastUser(nearAccountId, deviceNumber = 1) {
		const lastUserState = {
			accountId: nearAccountId,
			deviceNumber
		};
		await this.setAppState("lastUserAccountId", lastUserState);
	}
	async updatePreferences(nearAccountId, preferences) {
		const user = await this.getUser(nearAccountId);
		if (user) {
			const updatedPreferences = {
				...user.preferences,
				...preferences
			};
			await this.updateUser(nearAccountId, { preferences: updatedPreferences });
			this.emitEvent({
				type: "preferences-updated",
				accountId: nearAccountId,
				data: { preferences: updatedPreferences }
			});
		}
	}
	async storeUser(userData) {
		const validation = this.validateNearAccountId(userData.nearAccountId);
		if (!validation.valid) throw new Error(`Cannot store user with invalid account ID: ${validation.error}`);
		const db = await this.getDB();
		await db.put(DB_CONFIG.userStore, userData);
		const lastUserState = {
			accountId: userData.nearAccountId,
			deviceNumber: userData.deviceNumber
		};
		await this.setAppState("lastUserAccountId", lastUserState);
	}
	/**
	* Store WebAuthn user data (compatibility with WebAuthnManager)
	* @param userData - User data with nearAccountId as primary identifier
	*/
	async storeWebAuthnUserData(userData) {
		if (userData.deviceNumber === void 0) console.warn("WARNING: deviceNumber is undefined in storeWebAuthnUserData, will default to 1");
		const validation = this.validateNearAccountId(userData.nearAccountId);
		if (!validation.valid) throw new Error(`Cannot store WebAuthn data for invalid account ID: ${validation.error}`);
		let existingUser = await this.getUser(userData.nearAccountId);
		if (!existingUser) {
			const deviceNumberToUse = userData.deviceNumber || 1;
			existingUser = await this.registerUser({
				nearAccountId: userData.nearAccountId,
				deviceNumber: deviceNumberToUse,
				clientNearPublicKey: userData.clientNearPublicKey,
				passkeyCredential: userData.passkeyCredential,
				encryptedVrfKeypair: userData.encryptedVrfKeypair,
				serverEncryptedVrfKeypair: userData.serverEncryptedVrfKeypair
			});
		}
		const finalDeviceNumber = userData.deviceNumber || existingUser.deviceNumber;
		await this.updateUser(userData.nearAccountId, {
			clientNearPublicKey: userData.clientNearPublicKey,
			encryptedVrfKeypair: userData.encryptedVrfKeypair,
			serverEncryptedVrfKeypair: userData.serverEncryptedVrfKeypair,
			deviceNumber: finalDeviceNumber,
			lastUpdated: userData.lastUpdated || Date.now()
		});
	}
	async getAllUsers() {
		const db = await this.getDB();
		return db.getAll(DB_CONFIG.userStore);
	}
	async deleteUser(nearAccountId) {
		const db = await this.getDB();
		await db.delete(DB_CONFIG.userStore, nearAccountId);
		await this.clearAuthenticatorsForUser(nearAccountId);
	}
	async clearAllUsers() {
		const db = await this.getDB();
		await db.clear(DB_CONFIG.userStore);
	}
	async clearAllAppState() {
		const db = await this.getDB();
		await db.clear(DB_CONFIG.appStateStore);
	}
	/**
	* Store authenticator data for a user
	*/
	async storeAuthenticator(authenticatorData) {
		const db = await this.getDB();
		await db.put(DB_CONFIG.authenticatorStore, authenticatorData);
	}
	/**
	* Get all authenticators for a user (optionally for a specific device)
	*/
	async getAuthenticatorsByUser(nearAccountId) {
		const db = await this.getDB();
		const tx = db.transaction(DB_CONFIG.authenticatorStore, "readonly");
		const store = tx.objectStore(DB_CONFIG.authenticatorStore);
		const accountId = toAccountId(nearAccountId);
		const index = store.index("nearAccountId");
		return await index.getAll(accountId);
	}
	/**
	* Get a specific authenticator by credential ID
	*/
	async getAuthenticatorByCredentialId(nearAccountId, credentialId) {
		const db = await this.getDB();
		const result = await db.get(DB_CONFIG.authenticatorStore, [nearAccountId, credentialId]);
		return result || null;
	}
	/**
	* Clear all authenticators for a user
	*/
	async clearAuthenticatorsForUser(nearAccountId) {
		const authenticators = await this.getAuthenticatorsByUser(nearAccountId);
		const db = await this.getDB();
		const tx = db.transaction(DB_CONFIG.authenticatorStore, "readwrite");
		const store = tx.objectStore(DB_CONFIG.authenticatorStore);
		for (const auth of authenticators) await store.delete([nearAccountId, auth.credentialId]);
	}
	/**
	* Sync authenticators from contract data
	*/
	async syncAuthenticatorsFromContract(nearAccountId, contractAuthenticators) {
		await this.clearAuthenticatorsForUser(nearAccountId);
		const syncedAt = (/* @__PURE__ */ new Date()).toISOString();
		for (const auth of contractAuthenticators) {
			const rawTransports = auth.transports || [];
			const validTransports = rawTransports.filter((transport) => transport !== void 0 && transport !== null && typeof transport === "string");
			const transports = validTransports.length > 0 ? validTransports : ["internal"];
			const clientAuth = {
				credentialId: auth.credentialId,
				credentialPublicKey: auth.credentialPublicKey,
				transports,
				name: auth.name,
				nearAccountId: toAccountId(nearAccountId),
				deviceNumber: auth.deviceNumber || 1,
				registered: auth.registered,
				syncedAt,
				vrfPublicKey: auth.vrfPublicKey
			};
			await this.storeAuthenticator(clientAuth);
		}
	}
	/**
	* Delete all authenticators for a user
	*/
	async deleteAllAuthenticatorsForUser(nearAccountId) {
		const authenticators = await this.getAuthenticatorsByUser(nearAccountId);
		if (authenticators.length === 0) {
			console.warn(`No authenticators found for user ${nearAccountId}`);
			return;
		}
		const db = await this.getDB();
		const tx = db.transaction(DB_CONFIG.authenticatorStore, "readwrite");
		const store = tx.objectStore(DB_CONFIG.authenticatorStore);
		for (const auth of authenticators) await store.delete([nearAccountId, auth.credentialId]);
		console.debug(`Deleted ${authenticators.length} authenticators for user ${nearAccountId}`);
	}
	/**
	* Get user's confirmation config from IndexedDB
	* @param nearAccountId - The user's account ID
	* @returns ConfirmationConfig or undefined
	*/
	async getConfirmationConfig(nearAccountId) {
		const user = await this.getUser(nearAccountId);
		return user?.preferences?.confirmationConfig || DEFAULT_CONFIRMATION_CONFIG;
	}
	/**
	* Get user's theme preference from IndexedDB
	* @param nearAccountId - The user's account ID
	* @returns 'dark' | 'light' | null
	*/
	async getTheme(nearAccountId) {
		const user = await this.getUser(nearAccountId);
		return user?.preferences?.confirmationConfig.theme || null;
	}
	/**
	* Set user's theme preference in IndexedDB
	* @param nearAccountId - The user's account ID
	* @param theme - The theme to set ('dark' | 'light')
	*/
	async setTheme(nearAccountId, theme) {
		const existingConfig = await this.getConfirmationConfig(nearAccountId);
		const confirmationConfig = {
			...existingConfig,
			theme
		};
		await this.updatePreferences(nearAccountId, { confirmationConfig });
	}
	/**
	* Get user's theme with fallback to 'dark'
	* @param nearAccountId - The user's account ID
	* @returns 'dark' | 'light'
	*/
	async getThemeOrDefault(nearAccountId) {
		const theme = await this.getTheme(nearAccountId);
		return theme || "dark";
	}
	/**
	* Toggle between dark and light theme for a user
	* @param nearAccountId - The user's account ID
	* @returns The new theme that was set
	*/
	async toggleTheme(nearAccountId) {
		const currentTheme = await this.getThemeOrDefault(nearAccountId);
		const newTheme = currentTheme === "dark" ? "light" : "dark";
		await this.setTheme(nearAccountId, newTheme);
		return newTheme;
	}
	/**
	* Atomic operation wrapper for multiple IndexedDB operations
	* Either all operations succeed or all are rolled back
	*/
	async atomicOperation(operation) {
		const db = await this.getDB();
		try {
			const result = await operation(db);
			return result;
		} catch (error) {
			console.error("Atomic operation failed:", error);
			throw error;
		}
	}
	/**
	* Complete rollback of user registration data
	* Deletes user, authenticators, and WebAuthn data atomically
	*/
	async rollbackUserRegistration(nearAccountId) {
		console.debug(`Rolling back registration data for ${nearAccountId}`);
		await this.atomicOperation(async (db) => {
			await this.deleteAllAuthenticatorsForUser(nearAccountId);
			await db.delete(DB_CONFIG.userStore, nearAccountId);
			const lastUserAccount = await this.getAppState("lastUserAccountId");
			if (lastUserAccount === nearAccountId) await this.setAppState("lastUserAccountId", null);
			console.debug(`Rolled back all registration data for ${nearAccountId}`);
			return true;
		});
	}
};

//#endregion
export { PasskeyClientDBManager };
//# sourceMappingURL=passkeyClientDB.js.map