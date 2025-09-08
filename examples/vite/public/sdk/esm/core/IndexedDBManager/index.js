import { PasskeyClientDBManager } from "./passkeyClientDB.js";
import { PasskeyNearKeysDBManager } from "./passkeyNearKeysDB.js";

//#region src/core/IndexedDBManager/index.ts
const passkeyClientDB = new PasskeyClientDBManager();
const passkeyNearKeysDB = new PasskeyNearKeysDBManager();
/**
* Unified IndexedDB interface providing access to both databases
* This allows centralized access while maintaining separation of concerns
*/
var UnifiedIndexedDBManager = class {
	clientDB;
	nearKeysDB;
	_initialized = false;
	constructor() {
		this.clientDB = passkeyClientDB;
		this.nearKeysDB = passkeyNearKeysDB;
	}
	/**
	* Initialize both databases proactively
	* This ensures both databases are created and ready for use
	*/
	async initialize() {
		if (this._initialized) return;
		try {
			await Promise.all([this.clientDB.getAppState("_init_check"), this.nearKeysDB.hasEncryptedKey("_init_check")]);
			this._initialized = true;
		} catch (error) {
			console.warn("Failed to initialize IndexedDB databases:", error);
		}
	}
	/**
	* Check if databases have been initialized
	*/
	get isInitialized() {
		return this._initialized;
	}
	/**
	* Get user data and check if they have encrypted NEAR keys
	*/
	async getUserWithKeys(nearAccountId) {
		const [userData, hasKeys, keyData] = await Promise.all([
			this.clientDB.getUser(nearAccountId),
			this.nearKeysDB.hasEncryptedKey(nearAccountId),
			this.nearKeysDB.getEncryptedKey(nearAccountId)
		]);
		return {
			userData,
			hasKeys,
			keyData: hasKeys ? keyData : void 0
		};
	}
};
const IndexedDBManager = new UnifiedIndexedDBManager();
IndexedDBManager.initialize().catch((error) => {
	console.warn("Failed to proactively initialize IndexedDB on module load:", error);
});

//#endregion
export { IndexedDBManager };
//# sourceMappingURL=index.js.map