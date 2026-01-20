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

  private confirmationConfigChangeListeners: Set<(config: ConfirmationConfig) => void> = new Set();
  private signerModeChangeListeners: Set<(mode: SignerMode) => void> = new Set();

  private currentUserAccountId: AccountId | undefined;
  private confirmationConfig: ConfirmationConfig = DEFAULT_CONFIRMATION_CONFIG;
  private signerMode: SignerMode = DEFAULT_SIGNING_MODE;

  // Optional app-provided default signer mode (e.g., configs.signerMode). This is NOT a per-user preference.
  private signerModeOverride: SignerMode | null = null;
  // Wallet-iframe app-origin: delegate signerMode persistence to the wallet host.
  private walletIframeSignerModeWriter: ((signerMode: SignerMode) => Promise<void>) | null = null;

  constructor() {
    // Subscribe to IndexedDB change events for automatic sync
    this.subscribeToIndexedDBChanges();
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

  private sanitizeConfirmationConfig(
    config?: Partial<ConfirmationConfig> | null
  ): Partial<ConfirmationConfig> {
    if (!config) return {};
    const { uiMode, behavior, autoProceedDelay } = config as ConfirmationConfig;
    const next: Partial<ConfirmationConfig> = {};
    if (uiMode != null) next.uiMode = uiMode;
    if (behavior != null) next.behavior = behavior;
    if (autoProceedDelay != null) next.autoProceedDelay = autoProceedDelay;
    return next;
  }

  private mergeConfirmationConfig(
    base: Partial<ConfirmationConfig>,
    patch: Partial<ConfirmationConfig>
  ): ConfirmationConfig {
    const merged = { ...base, ...patch } as Partial<ConfirmationConfig>;
    return {
      uiMode: merged.uiMode ?? DEFAULT_CONFIRMATION_CONFIG.uiMode,
      behavior: merged.behavior ?? DEFAULT_CONFIRMATION_CONFIG.behavior,
      autoProceedDelay: merged.autoProceedDelay ?? DEFAULT_CONFIRMATION_CONFIG.autoProceedDelay,
    };
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
    const sanitized = this.sanitizeConfirmationConfig(confirmationConfig);
    const next = this.mergeConfirmationConfig(DEFAULT_CONFIRMATION_CONFIG, sanitized);

    if (nearAccountId) {
      this.currentUserAccountId = nearAccountId;
    }

    this.confirmationConfig = next;
    this.notifyConfirmationConfigChange(this.confirmationConfig);
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
  }

  /**
   * Load settings for a specific user
   */
  private async loadSettingsForUser(nearAccountId: AccountId): Promise<void> {
    if (IndexedDBManager.clientDB.isDisabled()) return;
    const user = await IndexedDBManager.clientDB.getLastUser().catch(() => null);
    if (!user || user.nearAccountId !== nearAccountId) return;
    if (user?.preferences?.confirmationConfig) {
      const sanitized = this.sanitizeConfirmationConfig(user.preferences.confirmationConfig as ConfirmationConfig);
      this.confirmationConfig = this.mergeConfirmationConfig(this.confirmationConfig, sanitized);
      this.notifyConfirmationConfigChange(this.confirmationConfig);
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
    this.confirmationConfig = this.mergeConfirmationConfig(this.confirmationConfig, { behavior });
    this.notifyConfirmationConfigChange(this.confirmationConfig);
    this.saveUserSettings();
  }

  /**
   * Set confirmation configuration
   */
  setConfirmationConfig(config: Partial<ConfirmationConfig>, opts?: { persist?: boolean }): void {
    const sanitized = this.sanitizeConfirmationConfig(config);
    this.confirmationConfig = this.mergeConfirmationConfig(this.confirmationConfig, sanitized);
    this.notifyConfirmationConfigChange(this.confirmationConfig);
    if (opts?.persist !== false) {
      this.saveUserSettings();
    }
  }

  /**
   * Load user confirmation settings from IndexedDB
   */
  async loadUserSettings(): Promise<void> {
    if (IndexedDBManager.clientDB.isDisabled()) return;
    const user = await IndexedDBManager.clientDB.getLastUser().catch(() => null);
    if (user) {
      this.currentUserAccountId = user.nearAccountId;
      // Load user's confirmation config if it exists, otherwise keep existing settings/defaults
      if (user.preferences?.confirmationConfig) {
        const sanitized = this.sanitizeConfirmationConfig(user.preferences.confirmationConfig as ConfirmationConfig);
        this.confirmationConfig = this.mergeConfirmationConfig(this.confirmationConfig, sanitized);
        this.notifyConfirmationConfigChange(this.confirmationConfig);
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

      await IndexedDBManager.clientDB.updatePreferences(accountId, {
        confirmationConfig: this.confirmationConfig,
      });
    } catch (error) {
      console.warn('[WebAuthnManager]: Failed to save user settings:', error);
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
