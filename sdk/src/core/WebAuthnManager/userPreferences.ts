import {
  ConfirmationConfig,
  type ConfirmationBehavior,
  DEFAULT_CONFIRMATION_CONFIG,
  type SignerMode,
  DEFAULT_SIGNING_MODE,
  coerceSignerMode,
  mergeSignerMode,
  coerceConfirmationBehavior,
  coerceConfirmationUIMode,
} from '../types/signer-worker';
import type { AccountId } from '../types/accountIds';
import { IndexedDBManager, type IndexedDBEvent } from '../IndexedDBManager';

const USE_EXTENSION_WALLET_KEY = 'w3a_use_extension_wallet';

function parseStoredBoolean(v: string | null): boolean | undefined {
  if (v == null) return undefined;
  const s = String(v).trim().toLowerCase();
  if (s === '1' || s === 'true' || s === 'yes' || s === 'on') return true;
  if (s === '0' || s === 'false' || s === 'no' || s === 'off') return false;
  return undefined;
}

function getUseExtensionWalletUserKey(accountId: AccountId): string {
  return `${USE_EXTENSION_WALLET_KEY}:${String(accountId)}`;
}

function safeLocalStorageGet(key: string): string | null {
  try {
    const ls = (globalThis as any)?.localStorage as Storage | undefined;
    if (!ls || typeof ls.getItem !== 'function') return null;
    return ls.getItem(key);
  } catch {
    return null;
  }
}

function safeLocalStorageSet(key: string, value: string): void {
  try {
    const ls = (globalThis as any)?.localStorage as Storage | undefined;
    if (!ls || typeof ls.setItem !== 'function') return;
    ls.setItem(key, value);
  } catch {
    // ignore
  }
}


export class UserPreferencesManager {

  private confirmationConfigChangeListeners: Set<(config: ConfirmationConfig) => void> = new Set();
  private signerModeChangeListeners: Set<(mode: SignerMode) => void> = new Set();
  private useExtensionWalletChangeListeners: Set<(enabled: boolean) => void> = new Set();

  private currentUserAccountId: AccountId | undefined;
  private confirmationConfig: ConfirmationConfig = DEFAULT_CONFIRMATION_CONFIG;
  private signerMode: SignerMode = DEFAULT_SIGNING_MODE;
  private useExtensionWallet: boolean = false;

  // Optional app-provided default signer mode (e.g., configs.signerMode). This is NOT a per-user preference.
  private signerModeOverride: SignerMode | null = null;
  // Wallet-iframe app-origin: delegate signerMode persistence to the wallet host.
  private walletIframeSignerModeWriter: ((signerMode: SignerMode) => Promise<void>) | null = null;

  constructor() {
    this.useExtensionWallet = this.readUseExtensionWalletFromLocalStorage() ?? false;
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

  /**
   * Register a callback for "use extension wallet" preference changes.
   *
   * This preference is non-sensitive and is typically used by apps to decide whether to
   * route wallet operations to an extension-hosted wallet origin.
   */
  onUseExtensionWalletChange(callback: (enabled: boolean) => void): () => void {
    this.useExtensionWalletChangeListeners.add(callback);
    return () => {
      this.useExtensionWalletChangeListeners.delete(callback);
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

  private notifyUseExtensionWalletChange(enabled: boolean): void {
    if (this.useExtensionWalletChangeListeners.size === 0) return;
    for (const listener of this.useExtensionWalletChangeListeners) {
      listener(enabled);
    }
  }

  private sanitizeConfirmationConfig(
    config?: Partial<ConfirmationConfig> | null
  ): Partial<ConfirmationConfig> {
    if (!config) return {};
    const raw = config as Record<string, unknown>;
    const uiMode = raw.uiMode;
    const behavior = raw.behavior;
    const autoProceedDelay = raw.autoProceedDelay;
    const next: Partial<ConfirmationConfig> = {};
    if (uiMode != null) next.uiMode = coerceConfirmationUIMode(uiMode);
    if (behavior != null) next.behavior = coerceConfirmationBehavior(behavior);
    if (typeof autoProceedDelay === 'number') next.autoProceedDelay = autoProceedDelay;
    return next;
  }

  private mergeConfirmationConfig(
    base: Partial<ConfirmationConfig>,
    patch: Partial<ConfirmationConfig>
  ): ConfirmationConfig {
    const merged = { ...base, ...patch } as Partial<ConfirmationConfig>;
    return {
      uiMode: coerceConfirmationUIMode(merged.uiMode, DEFAULT_CONFIRMATION_CONFIG.uiMode),
      behavior: coerceConfirmationBehavior(merged.behavior, DEFAULT_CONFIRMATION_CONFIG.behavior),
      autoProceedDelay: typeof merged.autoProceedDelay === 'number' ? merged.autoProceedDelay : DEFAULT_CONFIRMATION_CONFIG.autoProceedDelay,
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
          this.useExtensionWallet = this.readUseExtensionWalletFromLocalStorage() ?? false;
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
    this.useExtensionWalletChangeListeners.clear();
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

  getUseExtensionWallet(): boolean {
    return this.useExtensionWallet;
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
    } else {
      // When IndexedDB is disabled (wallet-iframe mode on the app origin), fall back to localStorage.
      const next = this.readUseExtensionWalletFromLocalStorage(nearAccountId);
      if (typeof next === 'boolean') {
        this.setUseExtensionWalletInternal(next, { notify: true });
      }
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

    const useExtensionWallet = user?.preferences?.useExtensionWallet;
    if (typeof useExtensionWallet === 'boolean') {
      this.setUseExtensionWalletInternal(useExtensionWallet, { notify: true });
    } else {
      const fallback = this.readUseExtensionWalletFromLocalStorage(nearAccountId);
      if (typeof fallback === 'boolean') {
        this.setUseExtensionWalletInternal(fallback, { notify: true });
      }
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
  setConfirmBehavior(behavior: ConfirmationBehavior): void {
    const nextBehavior = coerceConfirmationBehavior(behavior);
    this.confirmationConfig = this.mergeConfirmationConfig(this.confirmationConfig, { behavior: nextBehavior });
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

      const useExtensionWallet = user?.preferences?.useExtensionWallet;
      if (typeof useExtensionWallet === 'boolean') {
        this.setUseExtensionWalletInternal(useExtensionWallet, { notify: true });
      } else {
        const fallback = this.readUseExtensionWalletFromLocalStorage(user.nearAccountId);
        if (typeof fallback === 'boolean') {
          this.setUseExtensionWalletInternal(fallback, { notify: true });
        }
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

  /**
   * Set the "use extension wallet" preference (non-sensitive).
   *
   * Persistence behavior:
   * - Always writes a best-effort localStorage flag for early startup gating.
   * - Also writes to IndexedDB per-user when available and a current user is set.
   */
  setUseExtensionWallet(enabled: boolean, opts?: { persist?: boolean }): void {
    const next = !!enabled;
    this.setUseExtensionWalletInternal(next, { notify: true });

    if (opts?.persist === false) return;

    // Best-effort localStorage cache (used by apps before SDK init).
    const encoded = next ? '1' : '0';
    safeLocalStorageSet(USE_EXTENSION_WALLET_KEY, encoded);
    const id = this.currentUserAccountId;
    if (id) {
      safeLocalStorageSet(getUseExtensionWalletUserKey(id), encoded);
    }

    // Best-effort IndexedDB persistence when allowed.
    if (!id || IndexedDBManager.clientDB.isDisabled()) return;
    void IndexedDBManager.clientDB.updatePreferences(id, { useExtensionWallet: next }).catch(() => undefined);
  }

  private readUseExtensionWalletFromLocalStorage(accountId?: AccountId): boolean | undefined {
    const perUser = accountId ? parseStoredBoolean(safeLocalStorageGet(getUseExtensionWalletUserKey(accountId))) : undefined;
    if (typeof perUser === 'boolean') return perUser;
    return parseStoredBoolean(safeLocalStorageGet(USE_EXTENSION_WALLET_KEY));
  }

  private setUseExtensionWalletInternal(next: boolean, opts: { notify: boolean }): void {
    const prev = this.useExtensionWallet;
    this.useExtensionWallet = next;
    if (opts.notify && prev !== next) {
      this.notifyUseExtensionWalletChange(next);
    }
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
