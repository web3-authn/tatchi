import { ConfirmationConfig, DEFAULT_CONFIRMATION_CONFIG } from '../types/signer-worker';
import type { AccountId } from '../types/accountIds';
import { IndexedDBManager, type IndexedDBEvent } from '../IndexedDBManager';


export class UserPreferencesManager {
  private themeChangeListeners: Set<(theme: 'dark' | 'light') => void> = new Set();
  private currentUserAccountId: AccountId | undefined;
  private confirmationConfig: ConfirmationConfig = DEFAULT_CONFIRMATION_CONFIG;
  // Optional app-provided default theme (e.g., configs.walletTheme). This is NOT a per-user preference.
  private walletThemeOverride: 'dark' | 'light' | null = null;
  // Prevent multiple one-time environment syncs per session
  private envThemeSyncedForSession = false;

  constructor() {
    // Subscribe to IndexedDB change events for automatic sync
    this.subscribeToIndexedDBChanges();
  }

  /**
   * Apply an app-provided default theme (e.g., `configs.walletTheme`) without
   * persisting it as a per-user preference in IndexedDB.
   *
   * This also disables the one-time environment theme sync so host appearance
   * (e.g., VitePress `html.dark`) cannot override an explicit config.
   */
  configureWalletTheme(theme?: 'dark' | 'light'): void {
    if (theme !== 'dark' && theme !== 'light') return;
    this.walletThemeOverride = theme;
    // If integrator explicitly configured a theme, do not auto-sync from environment.
    this.envThemeSyncedForSession = true;
    if (this.confirmationConfig.theme !== theme) {
      this.confirmationConfig = {
        ...this.confirmationConfig,
        theme,
      };
      this.notifyThemeChange(theme);
    }
  }

  /**
   * Register a callback for theme change events
   */
  onThemeChange(callback: (theme: 'dark' | 'light') => void): () => void {
    this.themeChangeListeners.add(callback);
    return () => {
      this.themeChangeListeners.delete(callback);
    };
  }

  /**
   * Notify all registered listeners of theme changes
   */
  private notifyThemeChange(theme: 'dark' | 'light'): void {
    if (this.themeChangeListeners.size === 0) {
      // In many environments (e.g., wallet iframe host), there may be no UI subscribers.
      // Use debug to avoid noisy warnings while still being helpful during development.
      console.debug(`[UserPreferencesManager]: No listeners registered, theme change will not propagate.`);
      return;
    }

    let index = 0;
    this.themeChangeListeners.forEach((listener) => {
      index++;
      try {
        listener(theme);
      } catch (error: any) {
      }
    });
  }

  /**
   * Best-effort async initialization from IndexedDB.
   *
   * Callers decide when to invoke this so environments that must avoid
   * app-origin IndexedDB (wallet-iframe mode) can skip it entirely.
   */
  async initFromIndexedDB(): Promise<void> {
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
   * Handle IndexedDB change events.
   * @param event - The IndexedDBEvent: `user-updated`, `preferences-updated`, `user-deleted` to handle.
   */
  private async handleIndexedDBEvent(event: IndexedDBEvent): Promise<void> {
    try {
      switch (event.type) {
        case 'preferences-updated':
          // Check if this affects the current user
          if (event.accountId === this.currentUserAccountId) {
            await this.reloadUserSettings();
          }
          break;

        case 'user-updated':
          // Check if this affects the current user
          if (event.accountId === this.currentUserAccountId) {
            await this.reloadUserSettings();
          }
          break;

        case 'user-deleted':
          // Check if the deleted user was the current user
          if (event.accountId === this.currentUserAccountId) {
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
    // Clear all theme change listeners
    this.themeChangeListeners.clear();
  }

  getCurrentUserAccountId(): AccountId {
    if (!this.currentUserAccountId) {
      console.debug('[UserPreferencesManager]: getCurrentUserAccountId called with no current user; returning empty id');
      // Return an empty string to keep callers defensive; most consumers
      // already treat falsy accountIds as "no-op"/logged‑out.
      return '' as AccountId;
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

    // One-time: align user theme to current host appearance (e.g., VitePress html.dark)
    if (!this.envThemeSyncedForSession && !this.walletThemeOverride) {
      let envTheme: 'dark' | 'light' | null = null;
      const isDark = (globalThis as any)?.document?.documentElement?.classList?.contains?.('dark');
      if (typeof isDark === 'boolean') envTheme = isDark ? 'dark' : 'light';
      if (!envTheme) {
        try {
          const stored = (globalThis as any)?.localStorage?.getItem?.('vitepress-theme-appearance');
          if (stored === 'dark' || stored === 'light') envTheme = stored;
        } catch {
          // Storage may be blocked by the environment (e.g., third-party iframes)
        }
      }
      if (envTheme && envTheme !== this.confirmationConfig.theme) {
        // Fire-and-forget; listeners will propagate the change
        void this.setUserTheme(envTheme);
      }
      this.envThemeSyncedForSession = true;
    }
  }

  /**
   * Set the current user in-memory only.
   *
   * Intended for iframe-wallet mode where the wallet origin owns persistence and the
   * app origin must not write `PasskeyClientDB.appState:lastUserAccountId`.
   */
  setCurrentUserLocalOnly(nearAccountId: AccountId): void {
    this.currentUserAccountId = nearAccountId;
  }

  /**
   * Load settings for a specific user
   */
  private async loadSettingsForUser(nearAccountId: AccountId): Promise<void> {
    const user = await IndexedDBManager.clientDB.getLastUser();
    if (!user || user.nearAccountId !== nearAccountId) return;
    if (user?.preferences?.confirmationConfig) {
      this.confirmationConfig = {
        ...this.confirmationConfig,
        ...user.preferences.confirmationConfig
      };
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
   * Update confirm behavior without persisting to IndexedDB.
   * Used by the app origin when wallet-iframe mode is active.
   */
  setConfirmBehaviorLocalOnly(behavior: 'requireClick' | 'autoProceed'): void {
    this.confirmationConfig = {
      ...this.confirmationConfig,
      behavior,
    };
  }

  /**
   * Set confirmation configuration
   */
  setConfirmationConfig(config: ConfirmationConfig): void {
    this.confirmationConfig = {
      ...this.confirmationConfig,
      ...config
    };
    this.saveUserSettings();
  }

  /**
   * Update confirmation config without persisting to IndexedDB.
   * Used by the app origin when wallet-iframe mode is active.
   */
  setConfirmationConfigLocalOnly(config: ConfirmationConfig): void {
    const prevTheme = this.confirmationConfig.theme;
    this.confirmationConfig = {
      ...this.confirmationConfig,
      ...config,
    };
    if (this.confirmationConfig.theme !== prevTheme) {
      this.notifyThemeChange(this.confirmationConfig.theme);
    }
  }

  /**
   * Load user confirmation settings from IndexedDB
   */
  async loadUserSettings(): Promise<void> {
    const user = await IndexedDBManager.clientDB.getLastUser();
    if (user) {
      this.currentUserAccountId = user.nearAccountId;
      // Load user's confirmation config if it exists, otherwise keep existing settings/defaults
      if (user.preferences?.confirmationConfig) {
        this.confirmationConfig = {
          ...this.confirmationConfig,
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
    try {
      let accountId: AccountId | undefined = this.currentUserAccountId ?? undefined;
      if (!accountId) {
        const last = await IndexedDBManager.clientDB.getLastUser().catch(() => undefined as any);
        accountId = (last as any)?.nearAccountId;
      }

      if (!accountId) {
        console.warn('[UserPreferences]: No current user set; keeping confirmation config in memory only');
        return;
      }

      // Save confirmation config (which includes theme)
      await IndexedDBManager.clientDB.updatePreferences(accountId, {
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
    const id = this.currentUserAccountId;
    if (!id) return null;
    try {
      return await IndexedDBManager.clientDB.getTheme(id);
    } catch (error) {
      console.debug('[WebAuthnManager]: getCurrentUserAccountIdTheme:', error);
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
    const id = this.currentUserAccountId;
    if (!id) return; // No-op when no user is set (logged-out state)
    // Always update local UI state immediately; persistence is best-effort.
    this.confirmationConfig = {
      ...this.confirmationConfig,
      theme
    };
    // Notify all listeners of theme change
    this.notifyThemeChange(theme);
    try {
      await IndexedDBManager.clientDB.setTheme(id, theme);
    } catch (error) {
      console.warn('[UserPreferencesManager]: Failed to save user theme:', error);
    }
  }

  /**
   * Update the current theme in-memory only and notify listeners.
   * Used by the app origin when wallet-iframe mode is active.
   */
  setUserThemeLocalOnly(theme: 'dark' | 'light'): void {
    this.confirmationConfig = {
      ...this.confirmationConfig,
      theme,
    };
    this.notifyThemeChange(theme);
  }
}

// Create and export singleton instance
const UserPreferencesInstance = new UserPreferencesManager();
export default UserPreferencesInstance;
