import {
  ConfirmationConfig,
  DEFAULT_CONFIRMATION_CONFIG,
  type SignerMode,
  DEFAULT_SIGNING_MODE,
  coerceSignerMode,
  mergeSignerMode,
} from '../types/signer-worker';
import type { AccountId } from '../types/accountIds';
import { IndexedDBManager, type IndexedDBEvent } from '../IndexedDBManager';


export class UserPreferencesManager {

  private themeChangeListeners: Set<(theme: 'dark' | 'light') => void> = new Set();
  private confirmationConfigChangeListeners: Set<(config: ConfirmationConfig) => void> = new Set();
  private signerModeChangeListeners: Set<(mode: SignerMode) => void> = new Set();

  private currentUserAccountId: AccountId | undefined;
  private confirmationConfig: ConfirmationConfig = DEFAULT_CONFIRMATION_CONFIG;
  private signerMode: SignerMode = DEFAULT_SIGNING_MODE;

  // Optional app-provided default theme (e.g., configs.initialTheme). This is NOT a per-user preference.
  private walletThemeOverride: 'dark' | 'light' | null = null;
  // Optional app-provided default signer mode (e.g., configs.signerMode). This is NOT a per-user preference.
  private signerModeOverride: SignerMode | null = null;
  // Wallet-iframe app-origin: delegate signerMode persistence to the wallet host.
  private walletIframeSignerModeWriter: ((signerMode: SignerMode) => Promise<void>) | null = null;
  // Prevent multiple one-time environment syncs per session
  private envThemeSyncedForSession = false;

  constructor() {
    // Subscribe to IndexedDB change events for automatic sync
    this.subscribeToIndexedDBChanges();
  }

  /**
   * Apply an app-provided default theme (e.g., `configs.initialTheme`) without
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
      this.notifyConfirmationConfigChange(this.confirmationConfig);
      this.notifyThemeChange(theme);
    }
  }

  /**
   * Apply an app-provided default signer mode (e.g., `configs.signerMode`) without
   * persisting it as a per-user preference in IndexedDB.
   */
  configureDefaultSignerMode(signerMode?: SignerMode | SignerMode['mode'] | null): void {
    const next = coerceSignerMode(signerMode, DEFAULT_SIGNING_MODE);
    this.signerModeOverride = next;
    // When no user is active, keep in-memory default aligned to config.
    if (!this.currentUserAccountId) {
      this.setSignerModeInternal(next, { persist: false, notify: true });
    }
  }

  /**
   * In wallet-iframe mode on the app origin, user preferences must be persisted by the wallet host
   * (not the app origin). This configures a best-effort writer used by `setSignerMode(...)` when
   * IndexedDB is disabled.
   */
  configureWalletIframeSignerModeWriter(writer: ((signerMode: SignerMode) => Promise<void>) | null): void {
    this.walletIframeSignerModeWriter = writer;
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
   * Register a callback for confirmation config changes.
   * Used to keep app UI in sync with the wallet host in wallet-iframe mode.
   */
  onConfirmationConfigChange(callback: (config: ConfirmationConfig) => void): () => void {
    this.confirmationConfigChangeListeners.add(callback);
    return () => {
      this.confirmationConfigChangeListeners.delete(callback);
    };
  }

  /**
   * Register a callback for signer mode changes.
   */
  onSignerModeChange(callback: (mode: SignerMode) => void): () => void {
    this.signerModeChangeListeners.add(callback);
    return () => {
      this.signerModeChangeListeners.delete(callback);
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

    for (const listener of this.themeChangeListeners) {
      listener(theme);
    }
  }

  private notifyConfirmationConfigChange(config: ConfirmationConfig): void {
    if (this.confirmationConfigChangeListeners.size === 0) return;
    for (const listener of this.confirmationConfigChangeListeners) {
      listener(config);
    }
  }

  private notifySignerModeChange(mode: SignerMode): void {
    if (this.signerModeChangeListeners.size === 0) return;
    for (const listener of this.signerModeChangeListeners) {
      listener(mode);
    }
  }

  /**
   * Best-effort async initialization from IndexedDB.
   *
   * Callers decide when to invoke this so environments that must avoid
   * app-origin IndexedDB (wallet-iframe mode) can skip it entirely.
   */
  async initFromIndexedDB(): Promise<void> {
    await this.loadUserSettings().catch((error) => {
      console.warn('[WebAuthnManager]: Failed to initialize user settings:', error);
    });
  }

  /**
   * Subscribe to IndexedDB change events for automatic synchronization
   */
  private subscribeToIndexedDBChanges(): void {
    // Subscribe to IndexedDB change events
    this.unsubscribeFromIndexedDB = IndexedDBManager.clientDB.onChange((event) => {
      void this.handleIndexedDBEvent(event).catch((error) => {
        console.warn('[WebAuthnManager]: Error handling IndexedDB event:', error);
      });
    });
  }

  /**
   * Handle IndexedDB change events.
   * @param event - The IndexedDBEvent: `user-updated`, `preferences-updated`, `user-deleted` to handle.
   */
  private async handleIndexedDBEvent(event: IndexedDBEvent): Promise<void> {
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
    this.walletIframeSignerModeWriter = null;
    // Clear all theme change listeners
    this.themeChangeListeners.clear();
    this.confirmationConfigChangeListeners.clear();
    this.signerModeChangeListeners.clear();
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

  getSignerMode(): SignerMode {
    return this.signerMode;
  }

  /**
   * Apply an authoritative confirmation config snapshot from the wallet-iframe host.
   * This updates in-memory state only; persistence remains owned by the wallet origin.
   */
  applyWalletHostConfirmationConfig(args: {
    nearAccountId?: AccountId | null;
    confirmationConfig: ConfirmationConfig;
  }): void {
    const { nearAccountId, confirmationConfig } = args || ({} as any);
    const prevTheme = this.confirmationConfig.theme;
    const next: ConfirmationConfig = {
      ...DEFAULT_CONFIRMATION_CONFIG,
      ...(confirmationConfig || {}),
    } as ConfirmationConfig;

    if (nearAccountId) {
      this.currentUserAccountId = nearAccountId;
    }

    // Prevent environment heuristics on the app origin from overriding wallet-host state.
    this.envThemeSyncedForSession = true;

    this.confirmationConfig = next;
    this.notifyConfirmationConfigChange(this.confirmationConfig);
    if (this.confirmationConfig.theme !== prevTheme) {
      this.notifyThemeChange(this.confirmationConfig.theme);
    }
  }

  /**
   * Apply an authoritative signer mode snapshot from the wallet-iframe host.
   * This updates in-memory state only; persistence remains owned by the wallet origin.
   */
  applyWalletHostSignerMode(args: {
    nearAccountId?: AccountId | null;
    signerMode: SignerMode;
  }): void {
    const { nearAccountId, signerMode } = args || ({} as any);
    if (nearAccountId) {
      this.currentUserAccountId = nearAccountId;
    }
    const base = this.signerModeOverride ?? DEFAULT_SIGNING_MODE;
    const next = coerceSignerMode(signerMode, base);
    this.setSignerModeInternal(next, { persist: false, notify: true });
  }

  setCurrentUser(nearAccountId: AccountId): void {
    this.currentUserAccountId = nearAccountId;
    // Load settings for the new user (best-effort). In wallet-iframe mode on the app origin,
    // IndexedDB is intentionally disabled to avoid creating any tables.
    if (!IndexedDBManager.clientDB.isDisabled()) {
      void this.loadSettingsForUser(nearAccountId).catch(() => undefined);
    }

    // One-time: align user theme to current host appearance (e.g., VitePress html.dark)
    // In wallet-iframe mode (app origin), the wallet host owns preferences; do not override.
    if (!IndexedDBManager.clientDB.isDisabled() && !this.envThemeSyncedForSession && !this.walletThemeOverride) {
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
   * Load settings for a specific user
   */
  private async loadSettingsForUser(nearAccountId: AccountId): Promise<void> {
    if (IndexedDBManager.clientDB.isDisabled()) return;
    const user = await IndexedDBManager.clientDB.getLastUser().catch(() => null);
    if (!user || user.nearAccountId !== nearAccountId) return;
    if (user?.preferences?.confirmationConfig) {
      const prevTheme = this.confirmationConfig.theme;
      this.confirmationConfig = {
        ...this.confirmationConfig,
        ...user.preferences.confirmationConfig
      };
      this.notifyConfirmationConfigChange(this.confirmationConfig);
      if (this.confirmationConfig.theme !== prevTheme) {
        this.notifyThemeChange(this.confirmationConfig.theme);
      }
    }

    // Signer mode: stored per-user preference (optional).
    const base = this.signerModeOverride ?? DEFAULT_SIGNING_MODE;
    const stored = user?.preferences?.signerMode as SignerMode | SignerMode['mode'] | null | undefined;
    const nextSignerMode = stored != null ? coerceSignerMode(stored, base) : base;
    this.setSignerModeInternal(nextSignerMode, { persist: false, notify: true });
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
    this.notifyConfirmationConfigChange(this.confirmationConfig);
    this.saveUserSettings();
  }

  /**
   * Set confirmation configuration
   */
  setConfirmationConfig(config: ConfirmationConfig): void {
    const prevTheme = this.confirmationConfig.theme;
    this.confirmationConfig = {
      ...this.confirmationConfig,
      ...config
    };
    this.notifyConfirmationConfigChange(this.confirmationConfig);
    if (this.confirmationConfig.theme !== prevTheme) {
      this.notifyThemeChange(this.confirmationConfig.theme);
    }
    this.saveUserSettings();
  }

  /**
   * Load user confirmation settings from IndexedDB
   */
  async loadUserSettings(): Promise<void> {
    if (IndexedDBManager.clientDB.isDisabled()) return;
    const user = await IndexedDBManager.clientDB.getLastUser().catch(() => null);
    if (user) {
      const prevTheme = this.confirmationConfig.theme;
      this.currentUserAccountId = user.nearAccountId;
      // Load user's confirmation config if it exists, otherwise keep existing settings/defaults
      if (user.preferences?.confirmationConfig) {
        this.confirmationConfig = {
          ...this.confirmationConfig,
          ...user.preferences.confirmationConfig
        };
        this.notifyConfirmationConfigChange(this.confirmationConfig);
        if (this.confirmationConfig.theme !== prevTheme) {
          this.notifyThemeChange(this.confirmationConfig.theme);
        }
      } else {
        console.debug('[WebAuthnManager]: No user preferences found, using defaults');
      }

      // Load signer mode preference if available; otherwise use app default (configs.signerMode).
      const base = this.signerModeOverride ?? DEFAULT_SIGNING_MODE;
      const stored = user?.preferences?.signerMode as SignerMode | SignerMode['mode'] | null | undefined;
      const nextSignerMode = stored != null ? coerceSignerMode(stored, base) : base;
      this.setSignerModeInternal(nextSignerMode, { persist: false, notify: true });
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
    this.notifyConfirmationConfigChange(this.confirmationConfig);
    this.notifyThemeChange(theme);
    try {
      await IndexedDBManager.clientDB.setTheme(id, theme);
    } catch (error) {
      console.warn('[UserPreferencesManager]: Failed to save user theme:', error);
    }
  }

  /**
   * Set signer mode preference (in-memory immediately; IndexedDB persistence is best-effort).
   */
  setSignerMode(signerMode: SignerMode | SignerMode['mode']): void {
    const next = mergeSignerMode(this.signerMode, signerMode);
    // In wallet-iframe mode on the app origin, persistence is owned by the wallet host.
    // Forward to the host and rely on PREFERENCES_CHANGED mirroring for local state updates.
    if (this.walletIframeSignerModeWriter && IndexedDBManager.clientDB.isDisabled()) {
      void this.walletIframeSignerModeWriter(next).catch(() => undefined);
      return;
    }
    this.setSignerModeInternal(next, { persist: true, notify: true });
  }

  private isSignerModeEqual(a: SignerMode, b: SignerMode): boolean {
    if (a.mode !== b.mode) return false;
    if (a.mode !== 'threshold-signer' || b.mode !== 'threshold-signer') return true;
    return (a.behavior ?? null) === (b.behavior ?? null);
  }

  private setSignerModeInternal(next: SignerMode, opts: { persist: boolean; notify: boolean }): void {
    const prev = this.signerMode;
    this.signerMode = next;
    if (opts.notify && !this.isSignerModeEqual(prev, next)) {
      this.notifySignerModeChange(next);
    }
    if (opts.persist) {
      // Best-effort persistence: only write when we have a current user context.
      const id = this.currentUserAccountId;
      if (!id || IndexedDBManager.clientDB.isDisabled()) return;
      void IndexedDBManager.clientDB.setSignerMode(id, next).catch(() => undefined);
    }
  }
}

// Create and export singleton instance
const UserPreferencesInstance = new UserPreferencesManager();
export default UserPreferencesInstance;
