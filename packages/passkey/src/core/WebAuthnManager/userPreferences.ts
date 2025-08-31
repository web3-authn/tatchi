import { ConfirmationConfig, DEFAULT_CONFIRMATION_CONFIG } from '../types/signer-worker';
import type { AccountId } from '../types/accountIds';
import { IndexedDBManager, type IndexedDBEvent } from '../IndexedDBManager';


export class UserPreferencesManager {

  private currentUserAccountId: AccountId | undefined;
  private confirmationConfig: ConfirmationConfig = DEFAULT_CONFIRMATION_CONFIG;

  constructor() {
    // Load user settings asynchronously - don't block constructor
    this.initializeUserSettings();

    // Subscribe to IndexedDB change events for automatic sync
    this.subscribeToIndexedDBChanges();
  }

  private async initializeUserSettings(): Promise<void> {
    try {
      await this.loadUserSettings();
    } catch (error) {
      console.warn('[WebAuthnManager]: Failed to initialize user settings:', error);
      // Keep default settings if loading fails
    }
  }

  /**
   * Subscribe to IndexedDB change events for automatic synchronization
   */
  private subscribeToIndexedDBChanges(): void {
    // Subscribe to IndexedDB change events
    this.unsubscribeFromIndexedDB = IndexedDBManager.clientDB.onChange((event) => {
      this.handleIndexedDBEvent(event);
    });
  }

  /**
   * Handle IndexedDB change events
   */
  private async handleIndexedDBEvent(event: IndexedDBEvent): Promise<void> {
    try {
      switch (event.type) {
        case 'preferences-updated':
          // Check if this affects the current user
          if (event.accountId === this.currentUserAccountId) {
            console.debug('[WebAuthnManager]: Preferences updated for current user, reloading settings');
            await this.reloadUserSettings();
          }
          break;

        case 'user-updated':
          // Check if this affects the current user
          if (event.accountId === this.currentUserAccountId) {
            console.debug('[WebAuthnManager]: User data updated for current user, reloading settings');
            await this.reloadUserSettings();
          }
          break;

        case 'user-deleted':
          // Check if the deleted user was the current user
          if (event.accountId === this.currentUserAccountId) {
            console.debug('[WebAuthnManager]: Current user deleted, resetting to defaults');
            this.currentUserAccountId = undefined;
            this.confirmationConfig = DEFAULT_CONFIRMATION_CONFIG;
          }
          break;
      }
    } catch (error) {
      console.warn('[WebAuthnManager]: Error handling IndexedDB event:', error);
    }
  }

  /**
   * Unsubscribe function for IndexedDB events
   */
  private unsubscribeFromIndexedDB?: () => void;

  /**
   * Clean up resources and unsubscribe from events
   */
  destroy(): void {
    if (this.unsubscribeFromIndexedDB) {
      this.unsubscribeFromIndexedDB();
      this.unsubscribeFromIndexedDB = undefined;
    }
  }

  getCurrentUserAccountId(): AccountId {
    if (!this.currentUserAccountId) {
      throw new Error('No current user set');
    }
    return this.currentUserAccountId;
  }

  getConfirmationConfig(): ConfirmationConfig {
    return this.confirmationConfig;
  }

  setCurrentUser(nearAccountId: AccountId): void {
    this.currentUserAccountId = nearAccountId;
    // Load settings for the new user
    this.loadSettingsForUser(nearAccountId);
  }

  /**
   * Load settings for a specific user
   */
  private async loadSettingsForUser(nearAccountId: AccountId): Promise<void> {
    try {
      const user = await IndexedDBManager.clientDB.getUser(nearAccountId);
      if (user?.preferences?.confirmationConfig) {
        this.confirmationConfig = {
          ...DEFAULT_CONFIRMATION_CONFIG,
          ...user.preferences.confirmationConfig
        };
        console.debug('[WebAuthnManager]: Loaded settings for user', nearAccountId);
      } else {
        // Reset to defaults if user has no preferences
        this.confirmationConfig = DEFAULT_CONFIRMATION_CONFIG;
        console.debug('[WebAuthnManager]: Using default settings for user', nearAccountId);
      }
    } catch (error) {
      console.warn('[WebAuthnManager]: Error loading settings for user', nearAccountId, ':', error);
      // Keep current settings on error
    }
  }

  /**
   * Reload current user settings from IndexedDB
   */
  async reloadUserSettings(): Promise<void> {
    await this.loadSettingsForUser(this.getCurrentUserAccountId());
  }

  /**
   * Set confirmation behavior
   */
  setConfirmBehavior(behavior: 'requireClick' | 'autoProceed'): void {
    this.confirmationConfig = {
      ...this.confirmationConfig,
      behavior
    };
    this.saveUserSettings();
  }

  /**
   * Set confirmation configuration
   */
  setConfirmationConfig(config: ConfirmationConfig): void {
    this.confirmationConfig = {
      ...DEFAULT_CONFIRMATION_CONFIG,
      ...config
    };
    this.saveUserSettings();
  }

  /**
   * Load user confirmation settings from IndexedDB
   */
  async loadUserSettings(): Promise<void> {
    const user = await IndexedDBManager.clientDB.getLastUser();
    if (user) {
      this.currentUserAccountId = user.nearAccountId;
      // Load user's confirmation config if it exists, otherwise keep defaults
      if (user.preferences?.confirmationConfig) {
        this.confirmationConfig = {
          ...DEFAULT_CONFIRMATION_CONFIG,
          ...user.preferences.confirmationConfig
        };
      } else {
        console.debug('[WebAuthnManager]: No user preferences found, using defaults');
      }
    } else {
      console.debug('[WebAuthnManager]: No last user found, using default settings');
    }
  }

  /**
   * Save current confirmation settings to IndexedDB
   */
  async saveUserSettings(): Promise<void> {
    const currentUserAccountId = this.getCurrentUserAccountId();
    try {
      // Save confirmation config (which includes theme)
      await IndexedDBManager.clientDB.updatePreferences(currentUserAccountId, {
        confirmationConfig: this.confirmationConfig,
      });
    } catch (error) {
      console.warn('[WebAuthnManager]: Failed to save user settings:', error);
    }
  }

  /**
   * Get user theme preference from IndexedDB
   */
  async getCurrentUserAccountIdTheme(): Promise<'dark' | 'light' | null> {
    const currentUserAccountId = this.getCurrentUserAccountId();
    try {
      return await IndexedDBManager.clientDB.getTheme(currentUserAccountId);
    } catch (error) {
      console.warn('[WebAuthnManager]: Failed to get user theme:', error);
      return null;
    }
  }

  getUserTheme(): 'dark' | 'light' {
    return this.confirmationConfig.theme;
  }

  /**
   * Set user theme preference in IndexedDB
   */
  async setUserTheme(theme: 'dark' | 'light'): Promise<void> {
    const currentUserAccountId = this.getCurrentUserAccountId();
    try {
      await IndexedDBManager.clientDB.setTheme(currentUserAccountId, theme);
      // Also update the current context
      this.confirmationConfig = {
        ...this.confirmationConfig,
        theme
      };
      console.debug('[WebAuthnManager]: Saved user theme:', theme);
    } catch (error) {
      console.warn('[WebAuthnManager]: Failed to save user theme:', error);
    }
  }

}

