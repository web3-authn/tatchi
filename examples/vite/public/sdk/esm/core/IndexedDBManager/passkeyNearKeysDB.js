import { openDB } from "idb";

//#region src/core/IndexedDBManager/passkeyNearKeysDB.ts
const DB_CONFIG = {
	dbName: "PasskeyNearKeys",
	dbVersion: 1,
	storeName: "encryptedKeys",
	keyPath: "nearAccountId"
};
var PasskeyNearKeysDBManager = class {
	config;
	db = null;
	constructor(config = DB_CONFIG) {
		this.config = config;
	}
	/**
	* Get database connection, initializing if necessary
	*/
	async getDB() {
		if (this.db) return this.db;
		this.db = await openDB(this.config.dbName, this.config.dbVersion, {
			upgrade(db, oldVersion) {
				if (!db.objectStoreNames.contains(DB_CONFIG.storeName)) db.createObjectStore(DB_CONFIG.storeName, { keyPath: DB_CONFIG.keyPath });
			},
			blocked() {
				console.warn("PasskeyNearKeysDB connection is blocked.");
			},
			blocking() {
				console.warn("PasskeyNearKeysDB connection is blocking another connection.");
			},
			terminated: () => {
				console.warn("PasskeyNearKeysDB connection has been terminated.");
				this.db = null;
			}
		});
		return this.db;
	}
	/**
	* Store encrypted key data
	*/
	async storeEncryptedKey(data) {
		const db = await this.getDB();
		await db.put(this.config.storeName, data);
	}
	/**
	* Retrieve encrypted key data
	*/
	async getEncryptedKey(nearAccountId) {
		const db = await this.getDB();
		const result = await db.get(this.config.storeName, nearAccountId);
		if (!result?.encryptedData && nearAccountId !== "_init_check") console.warn("PasskeyNearKeysDB: getEncryptedKey - No result found");
		return result || null;
	}
	/**
	* Verify key storage by attempting retrieval
	*/
	async verifyKeyStorage(nearAccountId) {
		try {
			const retrievedKey = await this.getEncryptedKey(nearAccountId);
			return !!retrievedKey;
		} catch (error) {
			console.error("PasskeyNearKeysDB: verifyKeyStorage - Error:", error);
			return false;
		}
	}
	/**
	* Delete encrypted key data for a specific account
	*/
	async deleteEncryptedKey(nearAccountId) {
		const db = await this.getDB();
		await db.delete(this.config.storeName, nearAccountId);
		console.debug("PasskeyNearKeysDB: deleteEncryptedKey - Successfully deleted");
	}
	/**
	* Get all encrypted keys (for migration or debugging purposes)
	*/
	async getAllEncryptedKeys() {
		const db = await this.getDB();
		return await db.getAll(this.config.storeName);
	}
	/**
	* Check if a key exists for the given account
	*/
	async hasEncryptedKey(nearAccountId) {
		try {
			const keyData = await this.getEncryptedKey(nearAccountId);
			return !!keyData;
		} catch (error) {
			console.error("PasskeyNearKeysDB: hasEncryptedKey - Error:", error);
			return false;
		}
	}
};

//#endregion
export { PasskeyNearKeysDBManager };
//# sourceMappingURL=passkeyNearKeysDB.js.map