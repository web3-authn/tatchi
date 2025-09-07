import type { NearClient } from './NearClient';
import type { AccountId } from './types/accountIds';
import { fetchNonceBlockHashAndHeight } from './rpcCalls';
import type { TransactionContext } from './types/rpc';

/**
 * NonceManager - Singleton for managing NEAR transaction context
 *
 * This class pre-fetches nonce and block height asynchronously at the start
 * of executeAction calls to avoid blocking renderUserConfirmUI().
 *
 * The manager is cleared on logout and instantiated with new user on login.
 */
export class NonceManager {
  private static instance: NonceManager | null = null;

  public lastNonceUpdate: number | null = null;
  public lastBlockHeightUpdate: number | null = null;
  public nearAccountId: AccountId | null = null;
  public nearPublicKeyStr: string | null = null;
  public transactionContext: TransactionContext | null = null;
  private inflightFetch: Promise<TransactionContext> | null = null;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;
  private prefetchTimer: ReturnType<typeof setTimeout> | null = null;

  // Freshness thresholds (ms)
  private readonly NONCE_FRESHNESS_THRESHOLD = 20 * 1000; // 20 seconds
  private readonly BLOCK_FRESHNESS_THRESHOLD = 10 * 1000; // 10 seconds
  private readonly PREFETCH_DEBOUNCE_MS = 150; // small debounce to avoid hover spam

  // Private constructor for singleton pattern
  private constructor() {}

  /**
   * Get singleton instance
   */
  public static getInstance(): NonceManager {
    if (!NonceManager.instance) {
      NonceManager.instance = new NonceManager();
    }
    return NonceManager.instance;
  }

  /**
   * Prefetch block height/hash (and nonce if missing) in the background.
   * - If block info is stale or context missing, triggers a non-blocking refresh.
   * - Safe to call frequently (coalesces concurrent fetches).
   */
  public async prefetchBlockheight(nearClient: NearClient): Promise<void> {
    if (!this.nearAccountId || !this.nearPublicKeyStr) return;
    // Debounce prefetch to avoid repeated calls on quick hover/focus toggles
    this.clearPrefetchTimer();
    this.prefetchTimer = setTimeout(async () => {
      this.prefetchTimer = null;
      if (this.inflightFetch) return; // already fetching

      const now = Date.now();
      const isBlockStale = !this.lastBlockHeightUpdate || (now - this.lastBlockHeightUpdate) >= this.BLOCK_FRESHNESS_THRESHOLD;
      const missingContext = !this.transactionContext;
      if (!isBlockStale && !missingContext) return;

      try {
        await this.fetchFreshData(nearClient);
      } catch (e) {
        // Swallow errors during prefetch; runtime path will retry as needed
        console.debug('[NonceManager]: prefetchBlockheight ignored error:', e);
      }
    }, this.PREFETCH_DEBOUNCE_MS);
  }

  /**
   * Initialize or update the manager with user information
   */
  public initializeUser(nearAccountId: AccountId, nearPublicKeyStr: string): void {
    this.nearAccountId = nearAccountId;
    this.nearPublicKeyStr = nearPublicKeyStr;
    this.clearTransactionContext();
  }

  /**
   * Clear all data when user logs out
   */
  public clear(): void {
    this.lastNonceUpdate = null;
    this.lastBlockHeightUpdate = null;
    this.nearAccountId = null;
    this.nearPublicKeyStr = null;
    this.transactionContext = null;
    this.clearRefreshTimer();
    this.clearPrefetchTimer();
    this.inflightFetch = null;
  }

  /**
   * Smart caching method for nonce and block height data
   * Returns cached data if fresh, otherwise fetches synchronously
   */
  public async getNonceBlockHashAndHeight(nearClient: NearClient): Promise<TransactionContext> {
    if (!this.nearAccountId || !this.nearPublicKeyStr) {
      throw new Error('NonceManager not initialized with user data');
    }

    const now = Date.now();
    // Check if both nonce and block height data are fresh
    const isNonceFresh = !!this.lastNonceUpdate && (now - this.lastNonceUpdate) < this.NONCE_FRESHNESS_THRESHOLD;
    const isBlockHeightFresh = !!this.lastBlockHeightUpdate && (now - this.lastBlockHeightUpdate) < this.BLOCK_FRESHNESS_THRESHOLD;

    // If both are fresh, return cached data and schedule async refresh
    if (isNonceFresh && isBlockHeightFresh && this.transactionContext) {
      // Gate background refresh: only schedule if approaching staleness and no inflight fetch
      this.maybeScheduleBackgroundRefresh(nearClient);
      return this.transactionContext;
    }

    // If either is stale, fetch synchronously and return fresh data
    console.debug('[NonceManager]: Data is stale, fetching synchronously');
    return await this.fetchFreshData(nearClient);
  }

  /**
   * Schedule an asynchronous refresh of the transaction context
   */
  private maybeScheduleBackgroundRefresh(nearClient: NearClient): void {
    if (!this.lastNonceUpdate || !this.lastBlockHeightUpdate) return;
    if (this.inflightFetch) return; // already fetching

    const now = Date.now();
    const nonceAge = now - this.lastNonceUpdate;
    const blockAge = now - this.lastBlockHeightUpdate;

    const halfNonceTtl = this.NONCE_FRESHNESS_THRESHOLD / 2;
    const halfBlockTtl = this.BLOCK_FRESHNESS_THRESHOLD / 2;

    // If we're past the half-life for either value, refresh NOW in background
    if (nonceAge >= halfNonceTtl || blockAge >= halfBlockTtl) {
      this.clearRefreshTimer();
      // Fire-and-forget refresh to keep cache warm
      void this.fetchFreshData(nearClient)
        .then(() => console.debug('[NonceManager]: Background refresh completed'))
        .catch((error) => console.warn('[NonceManager]: Background refresh failed:', error));
      return;
    }

    // Otherwise, schedule a refresh for when the earliest metric hits half-life
    const delayToHalfNonce = Math.max(0, halfNonceTtl - nonceAge);
    const delayToHalfBlock = Math.max(0, halfBlockTtl - blockAge);
    const delay = Math.min(delayToHalfNonce, delayToHalfBlock);

    // Avoid multiple timers
    this.clearRefreshTimer();
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = null;
      if (this.inflightFetch) return;
      void this.fetchFreshData(nearClient)
        .then(() => console.debug('[NonceManager]: Background refresh completed'))
        .catch((error) => console.warn('[NonceManager]: Background refresh failed:', error));
    }, delay);
  }

  /**
   * Fetch fresh transaction context data from NEAR RPC
   */
  private async fetchFreshData(nearClient: NearClient): Promise<TransactionContext> {
    // Coalesce concurrent fetches
    if (this.inflightFetch) return this.inflightFetch;

    const capturedAccountId = this.nearAccountId;
    const capturedPublicKey = this.nearPublicKeyStr;

    this.inflightFetch = (async () => {
      try {
        // Determine what is actually stale so we only fetch what we need
        const now = Date.now();
        const isNonceStale = !this.lastNonceUpdate || (now - this.lastNonceUpdate) >= this.NONCE_FRESHNESS_THRESHOLD;
        const isBlockStale = !this.lastBlockHeightUpdate || (now - this.lastBlockHeightUpdate) >= this.BLOCK_FRESHNESS_THRESHOLD;

        let nextNonce: string;
        let accessKeyInfo = this.transactionContext?.accessKeyInfo;
        let txBlockHeight = this.transactionContext?.txBlockHeight;
        let txBlockHash = this.transactionContext?.txBlockHash;

        const fetchAccessKey = isNonceStale || !accessKeyInfo;
        const fetchBlock = isBlockStale || !txBlockHeight || !txBlockHash;

        // Fetch required parts in parallel
        const [maybeAccessKey, maybeBlock] = await Promise.all([
          fetchAccessKey ? nearClient.viewAccessKey(capturedAccountId!, capturedPublicKey!) : Promise.resolve(null),
          fetchBlock ? nearClient.viewBlock({ finality: 'final' }) : Promise.resolve(null)
        ]);

        if (fetchAccessKey) {
          if (!maybeAccessKey || (maybeAccessKey as any).nonce === undefined) {
            throw new Error(`Access key not found or invalid for account ${capturedAccountId} with public key ${capturedPublicKey}.`);
          }
          accessKeyInfo = maybeAccessKey!;
        }

        if (fetchBlock) {
          const blockInfo = maybeBlock as any;
          if (!blockInfo?.header?.hash || blockInfo?.header?.height === undefined) {
            throw new Error('Failed to fetch Block Info');
          }
          txBlockHeight = String(blockInfo.header.height);
          txBlockHash = blockInfo.header.hash;
        }

        // Derive nextNonce from the (possibly updated) access key info
        nextNonce = (BigInt(accessKeyInfo!.nonce) + BigInt(1)).toString();

        const transactionContext: TransactionContext = {
          nearPublicKeyStr: capturedPublicKey!,
          accessKeyInfo: accessKeyInfo!,
          nextNonce,
          txBlockHeight: txBlockHeight!,
          txBlockHash: txBlockHash!,
        };

        // Only commit if identity did not change during fetch
        if (
          capturedAccountId === this.nearAccountId &&
          capturedPublicKey === this.nearPublicKeyStr
        ) {
          this.transactionContext = transactionContext;
          const now = Date.now();
          if (fetchAccessKey) this.lastNonceUpdate = now;
          if (fetchBlock) this.lastBlockHeightUpdate = now;
        } else {
          console.debug('[NonceManager]: Discarded fetch result due to identity change');
        }

        return transactionContext;
      } catch (error) {
        console.error('[NonceManager]: Failed to fetch fresh transaction context:', error);
        throw error;
      } finally {
        this.inflightFetch = null;
      }
    })();

    return this.inflightFetch;
  }

  /**
   * Get the current transaction context
   * Throws if data is not available or stale
   */
  public getTransactionContext(): TransactionContext {
    if (!this.transactionContext) {
      throw new Error('Transaction context not available - call getNonceBlockHashAndHeight() first');
    }

    // Check if data is stale (more than 30 seconds old)
    const now = Date.now();
    const maxAge = 30 * 1000; // 30 seconds

    if (this.lastNonceUpdate && (now - this.lastNonceUpdate) > maxAge) {
      console.warn('[NonceManager]: Transaction context is stale, consider refreshing');
    }

    return this.transactionContext;
  }

  /**
   * Check if transaction context is available and not stale
   */
  public isTransactionContextAvailable(maxAgeMs: number = 30000): boolean {
    if (!this.transactionContext || !this.lastNonceUpdate) {
      return false;
    }

    const now = Date.now();
    return (now - this.lastNonceUpdate) <= maxAgeMs;
  }

  /**
   * Clear transaction context (useful when nonce might be invalidated)
   */
  public clearTransactionContext(): void {
    this.transactionContext = null;
    this.lastNonceUpdate = null;
    this.lastBlockHeightUpdate = null;
    this.clearRefreshTimer();
    this.clearPrefetchTimer();
    this.inflightFetch = null;
  }

  private clearRefreshTimer(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
  }
  private clearPrefetchTimer(): void {
    if (this.prefetchTimer) {
      clearTimeout(this.prefetchTimer);
      this.prefetchTimer = null;
    }
  }
}

// Create and export singleton instance
const NonceManagerInstance = NonceManager.getInstance();
export default NonceManagerInstance;
