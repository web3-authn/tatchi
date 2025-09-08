const require_signer_worker = require('../types/signer-worker.js');
const require_index = require('../IndexedDBManager/index.js');

//#region src/core/WebAuthnManager/userPreferences.ts
var UserPreferencesManager = class {
	themeChangeListeners = /* @__PURE__ */ new Set();
	currentUserAccountId;
	confirmationConfig = require_signer_worker.DEFAULT_CONFIRMATION_CONFIG;
	constructor() {
		this.initializeUserSettings();
		this.subscribeToIndexedDBChanges();
	}
	/**
	* Register a callback for theme change events
	*/
	onThemeChange(callback) {
		this.themeChangeListeners.add(callback);
		return () => {
			this.themeChangeListeners.delete(callback);
		};
	}
	/**
	* Notify all registered listeners of theme changes
	*/
	notifyThemeChange(theme) {
		if (this.themeChangeListeners.size === 0) {
			console.warn(`[UserPreferencesManager]: No listeners registered, theme change will not propagate.`);
			return;
		}
		let index = 0;
		this.themeChangeListeners.forEach((listener) => {
			index++;
			try {
				listener(theme);
			} catch (error) {}
		});
	}
	async initializeUserSettings() {
		try {
			await this.loadUserSettings();
		} catch (error) {
			console.warn("[WebAuthnManager]: Failed to initialize user settings:", error);
		}
	}
	/**
	* Subscribe to IndexedDB change events for automatic synchronization
	*/
	subscribeToIndexedDBChanges() {
		this.unsubscribeFromIndexedDB = require_index.IndexedDBManager.clientDB.onChange((event) => {
			this.handleIndexedDBEvent(event);
		});
	}
	/**
	* Handle IndexedDB change events.
	* @param event - The IndexedDBEvent: `user-updated`, `preferences-updated`, `user-deleted` to handle.
	*/
	async handleIndexedDBEvent(event) {
		try {
			switch (event.type) {
				case "preferences-updated":
					if (event.accountId === this.currentUserAccountId) await this.reloadUserSettings();
					break;
				case "user-updated":
					if (event.accountId === this.currentUserAccountId) await this.reloadUserSettings();
					break;
				case "user-deleted":
					if (event.accountId === this.currentUserAccountId) {
						this.currentUserAccountId = void 0;
						this.confirmationConfig = require_signer_worker.DEFAULT_CONFIRMATION_CONFIG;
					}
					break;
			}
		} catch (error) {
			console.warn("[WebAuthnManager]: Error handling IndexedDB event:", error);
		}
	}
	/**
	* Unsubscribe function for IndexedDB events
	*/
	unsubscribeFromIndexedDB;
	/**
	* Clean up resources and unsubscribe from events
	*/
	destroy() {
		if (this.unsubscribeFromIndexedDB) {
			this.unsubscribeFromIndexedDB();
			this.unsubscribeFromIndexedDB = void 0;
		}
		this.themeChangeListeners.clear();
	}
	getCurrentUserAccountId() {
		if (!this.currentUserAccountId) throw new Error("No current user set");
		return this.currentUserAccountId;
	}
	getConfirmationConfig() {
		return this.confirmationConfig;
	}
	setCurrentUser(nearAccountId) {
		this.currentUserAccountId = nearAccountId;
		this.loadSettingsForUser(nearAccountId);
	}
	/**
	* Load settings for a specific user
	*/
	async loadSettingsForUser(nearAccountId) {
		const user = await require_index.IndexedDBManager.clientDB.getUser(nearAccountId);
		if (user?.preferences?.confirmationConfig) this.confirmationConfig = {
			...require_signer_worker.DEFAULT_CONFIRMATION_CONFIG,
			...user.preferences.confirmationConfig
		};
		else this.confirmationConfig = require_signer_worker.DEFAULT_CONFIRMATION_CONFIG;
	}
	/**
	* Reload current user settings from IndexedDB
	*/
	async reloadUserSettings() {
		await this.loadSettingsForUser(this.getCurrentUserAccountId());
	}
	/**
	* Set confirmation behavior
	*/
	setConfirmBehavior(behavior) {
		this.confirmationConfig = {
			...this.confirmationConfig,
			behavior
		};
		this.saveUserSettings();
	}
	/**
	* Set confirmation configuration
	*/
	setConfirmationConfig(config) {
		this.confirmationConfig = {
			...require_signer_worker.DEFAULT_CONFIRMATION_CONFIG,
			...config
		};
		this.saveUserSettings();
	}
	/**
	* Load user confirmation settings from IndexedDB
	*/
	async loadUserSettings() {
		const user = await require_index.IndexedDBManager.clientDB.getLastUser();
		if (user) {
			this.currentUserAccountId = user.nearAccountId;
			if (user.preferences?.confirmationConfig) this.confirmationConfig = {
				...require_signer_worker.DEFAULT_CONFIRMATION_CONFIG,
				...user.preferences.confirmationConfig
			};
			else console.debug("[WebAuthnManager]: No user preferences found, using defaults");
		} else console.debug("[WebAuthnManager]: No last user found, using default settings");
	}
	/**
	* Save current confirmation settings to IndexedDB
	*/
	async saveUserSettings() {
		const currentUserAccountId = this.getCurrentUserAccountId();
		try {
			await require_index.IndexedDBManager.clientDB.updatePreferences(currentUserAccountId, { confirmationConfig: this.confirmationConfig });
		} catch (error) {
			console.warn("[WebAuthnManager]: Failed to save user settings:", error);
		}
	}
	/**
	* Get user theme preference from IndexedDB
	*/
	async getCurrentUserAccountIdTheme() {
		const currentUserAccountId = this.getCurrentUserAccountId();
		try {
			return await require_index.IndexedDBManager.clientDB.getTheme(currentUserAccountId);
		} catch (error) {
			console.warn("[WebAuthnManager]: Failed to get user theme:", error);
			return null;
		}
	}
	getUserTheme() {
		return this.confirmationConfig.theme;
	}
	/**
	* Set user theme preference in IndexedDB
	*/
	async setUserTheme(theme) {
		const currentUserAccountId = this.getCurrentUserAccountId();
		try {
			await require_index.IndexedDBManager.clientDB.setTheme(currentUserAccountId, theme);
			this.confirmationConfig = {
				...this.confirmationConfig,
				theme
			};
			this.notifyThemeChange(theme);
		} catch (error) {
			console.error("[UserPreferencesManager]: Failed to save user theme:", error);
		}
	}
};
const UserPreferencesInstance = new UserPreferencesManager();
var userPreferences_default = UserPreferencesInstance;

//#endregion
exports.default = userPreferences_default;
//# sourceMappingURL=userPreferences.js.map