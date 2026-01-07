import type { NearClient } from './NearClient';
import type { AccountId } from './types/accountIds';
import type { TransactionContext } from './types/rpc';
import type { AccessKeyView, BlockResult } from '@near-js/types';
import { isObject, isNumber, isString } from './WalletIframe/validation';
import { errorMessage } from '../utils/errors';

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
  // Monotonic identifier to disambiguate concurrent fetches and prevent stale commits/clears
  private inflightId: number = 0;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;
  private prefetchTimer: ReturnType<typeof setTimeout> | null = null;

  // Nonce reservation system for batch transactions
  private reservedNonces: Set<string> = new Set();
  private lastReservedNonce: string | null = null;

  // Freshness thresholds (ms)
  // Treat context older than 5s as stale enough to refetch
  private readonly NONCE_FRESHNESS_THRESHOLD = 5 * 1000; // 5 seconds
  private readonly BLOCK_FRESHNESS_THRESHOLD = 20 * 1000; // 20 seconds (less frequent block refreshes)
  private readonly PREFETCH_DEBOUNCE_MS = 400; // less aggressive prefetch debounce to reduce churn

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
    this.reservedNonces.clear();
    this.lastReservedNonce = null;
  }

  /**
   * Smart caching method for nonce and block height data
   * Returns cached data if fresh, otherwise fetches synchronously
   */
  public async getNonceBlockHashAndHeight(nearClient: NearClient, opts?: { force?: boolean }): Promise<TransactionContext> {
    // Always prefer a fresh fetch for critical paths; coalesced by fetchFreshData.
    // This minimizes subtle cache bugs after key rotations/linking and across devices.
    if (!this.nearAccountId || !this.nearPublicKeyStr) {
      throw new Error('NonceManager not initialized with user data');
    }
    // Respect caller's intent to force or use freshness thresholds
    const force = opts?.force === true;
    return await this.fetchFreshData(nearClient, force);
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
        .catch((error) => console.warn('[NonceManager]: Background refresh failed:', error));
    }, delay);
  }

  /**
   * Fetch fresh transaction context data from NEAR RPC
   */
  private async fetchFreshData(nearClient: NearClient, force: boolean = false): Promise<TransactionContext> {
    // Coalesce concurrent refreshes when not forced to reduce redundant network calls.
    // Force=true is used by latency-critical paths (e.g., JIT VRF refresh) to guarantee a fresh block height.
    if (this.inflightFetch && !force) {
      return this.inflightFetch;
    }

    const capturedAccountId = this.nearAccountId;
    const capturedPublicKey = this.nearPublicKeyStr;
    // Start a new fetch; assign a unique id to guard commit and cleanup
    const requestId = (++this.inflightId);
    const fetchPromise = (async () => {
      try {
        // Determine what is actually stale so we only fetch what we need
        const now = Date.now();
        const isNonceStale = force || !this.lastNonceUpdate || (now - this.lastNonceUpdate) >= this.NONCE_FRESHNESS_THRESHOLD;
        const isBlockStale = force || !this.lastBlockHeightUpdate || (now - this.lastBlockHeightUpdate) >= this.BLOCK_FRESHNESS_THRESHOLD;

        let accessKeyInfo = this.transactionContext?.accessKeyInfo;
        let txBlockHeight = this.transactionContext?.txBlockHeight;
        let txBlockHash = this.transactionContext?.txBlockHash;

        const fetchAccessKey = isNonceStale || !accessKeyInfo;
        const fetchBlock = isBlockStale || !txBlockHeight || !txBlockHash;

        // Fetch required parts with tolerance for missing access key just after creation
        let maybeAccessKey: unknown = accessKeyInfo ?? null;
        let maybeBlock: unknown = null;

        // Run RPC calls in parallel where applicable, while preserving tolerant error handling
        let accessKeyError: unknown = null;
        let blockError: unknown = null;
        const tasks: Promise<void>[] = [];

        if (fetchAccessKey) {
          tasks.push((async () => {
            try {
              maybeAccessKey = await nearClient.viewAccessKey(capturedAccountId!, capturedPublicKey!);
            } catch (akErr: unknown) {
              const msg = errorMessage(akErr);
              const missingAk = msg.includes('does not exist while viewing')
                || msg.includes('Access key not found')
                || msg.includes('unknown public key')
                || msg.includes('does not exist');
              if (missingAk) {
                // Non-fatal: proceed without live AK; compute nextNonce conservatively
                maybeAccessKey = null;
              } else {
                accessKeyError = akErr;
              }
            }
          })());
        }

        if (fetchBlock) {
          tasks.push((async () => {
            try {
              maybeBlock = await nearClient.viewBlock({ finality: 'final' });
            } catch (err: unknown) {
              // Block info is required
              blockError = err;
            }
          })());
        }

        if (tasks.length > 0) {
          await Promise.all(tasks);
        }

        if (accessKeyError) {
          throw accessKeyError;
        }
        if (blockError) {
          throw blockError;
        }

        // Commit results
        if (fetchAccessKey) {
          if (isAccessKeyView(maybeAccessKey)) {
            accessKeyInfo = maybeAccessKey;
          } else {
            // Keep previous accessKeyInfo if present; else set minimal placeholder
            accessKeyInfo = this.transactionContext?.accessKeyInfo || makePlaceholderAccessKey();
          }
        }

        if (fetchBlock) {
          if (!isBlockResult(maybeBlock)) {
            throw new Error('Failed to fetch Block Info');
          }
          txBlockHeight = String(maybeBlock.header.height);
          txBlockHash = maybeBlock.header.hash;
        }

        // Derive nextNonce from access key info + current context + reservations
        let nextCandidate = this.maxBigInt(
          accessKeyInfo?.nonce !== undefined ? (BigInt(accessKeyInfo.nonce) + 1n) : 0n,
          this.transactionContext?.nextNonce ? BigInt(this.transactionContext.nextNonce) : 0n,
          this.lastReservedNonce ? BigInt(this.lastReservedNonce) + 1n : 0n
        );
        if (nextCandidate <= 0n) nextCandidate = 1n; // never use 0
        const nextNonce = nextCandidate.toString();

        const transactionContext: TransactionContext = {
          nearPublicKeyStr: capturedPublicKey!,
          accessKeyInfo: accessKeyInfo!,
          nextNonce,
          txBlockHeight: txBlockHeight!,
          txBlockHash: txBlockHash!,
        };

        // Only commit if identity did not change AND this fetch is still the latest.
        // This guards against stale commits from races when a forced refresh overtakes a cached one.
        if (
          capturedAccountId === this.nearAccountId &&
          capturedPublicKey === this.nearPublicKeyStr &&
          requestId === this.inflightId
        ) {
          this.transactionContext = transactionContext;
          const now = Date.now();
          if (fetchAccessKey) this.lastNonceUpdate = now;
          if (fetchBlock) this.lastBlockHeightUpdate = now;
        } else {
          // Discard results from outdated or identity-mismatched fetches; a newer fetch has already committed.
        }

        return transactionContext;
      } catch (error) {
        console.error('[NonceManager]: Failed to fetch fresh transaction context:', error);
        throw error;
      } finally {
        // Only clear inflight if this promise is still the latest.
        if (requestId === this.inflightId) {
          this.inflightFetch = null;
        }
      }
    })();

    this.inflightFetch = fetchPromise;
    return fetchPromise;
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
    this.reservedNonces.clear();
    this.lastReservedNonce = null;
  }

  /**
   * Force a synchronous refresh of nonce + block context.
   * Useful after key rotations (e.g., link-device) or when encountering INVALID_NONCE.
   * Optionally clears any locally reserved nonces to avoid collisions.
   */
  public async refreshNow(nearClient: NearClient, opts?: { clearReservations?: boolean }): Promise<TransactionContext> {
    if (opts?.clearReservations) {
      try { this.releaseAllNonces(); } catch {}
    }
    return await this.fetchFreshData(nearClient, true);
  }

  /**
   * Reserve a nonce for batch transactions
   * This increments the nonce locally to prevent conflicts in batch operations
   * @param count - Number of nonces to reserve (default: 1)
   * @returns Array of reserved nonces
   */
  public reserveNonces(count: number = 1): string[] {
    if (!this.transactionContext) {
      throw new Error('Transaction context not available - call getNonceBlockHashAndHeight() first');
    }

    if (count <= 0) return [];

    const start = this.lastReservedNonce
      ? BigInt(this.lastReservedNonce) + 1n
      : BigInt(this.transactionContext.nextNonce);

    // Plan reservations first (pure), then commit atomically
    const planned: string[] = [];
    for (let i = 0; i < count; i++) {
      const candidate = (start + BigInt(i)).toString();
      if (this.reservedNonces.has(candidate)) {
        throw new Error(`Nonce ${candidate} is already reserved`);
      }
      planned.push(candidate);
    }

    // Commit: extend set and bump lastReservedNonce
    const newSet = new Set(this.reservedNonces);
    for (const n of planned) newSet.add(n);
    this.reservedNonces = newSet;
    this.lastReservedNonce = planned[planned.length - 1];

    return planned;
  }

  /**
   * Release a reserved nonce (call when transaction is completed or failed)
   * @param nonce - The nonce to release
   */
  public releaseNonce(nonce: string): void {
    if (this.reservedNonces.has(nonce)) {
      this.reservedNonces.delete(nonce);
    }
  }

  /**
   * Release all reserved nonces
   */
  public releaseAllNonces(): void {
    const count = this.reservedNonces.size;
    this.reservedNonces.clear();
    this.lastReservedNonce = null;
  }

  /**
   * Update nonce from blockchain after transaction completion
   * This should be called after a transaction is successfully broadcasted
   * @param nearClient - NEAR client for RPC calls
   * @param actualNonce - The actual nonce used in the completed transaction
   */
  public async updateNonceFromBlockchain(nearClient: NearClient, actualNonce: string): Promise<void> {
    if (!this.nearAccountId || !this.nearPublicKeyStr) {
      throw new Error('NonceManager not initialized with user data');
    }

    try {
      // Fetch fresh access key info to get the latest nonce
      const accessKeyInfo = await nearClient.viewAccessKey(this.nearAccountId, this.nearPublicKeyStr);

      if (!accessKeyInfo || accessKeyInfo.nonce === undefined) {
        throw new Error(`Access key not found or invalid for account ${this.nearAccountId}`);
      }

      const chainNonceBigInt = BigInt(accessKeyInfo.nonce);
      const actualNonceBigInt = BigInt(actualNonce);

      // Tolerate both pre- and post-final states:
      // - pre-final: chainNonce == actualNonce - 1
      // - post-final: chainNonce >= actualNonce
      if (chainNonceBigInt < actualNonceBigInt - BigInt(1)) {
        console.warn(
          `[NonceManager]: Chain nonce (${chainNonceBigInt}) behind expected (${actualNonceBigInt - BigInt(1)}). Updating...`
        );
      }

      // Compute next usable nonce using maxBigInt for clarity
      // Include (actualNonce + 1) to immediately advance locally after broadcast,
      // even if chain finality has not reflected the new nonce yet.
      const candidateNext = this.maxBigInt(
        chainNonceBigInt + 1n,
        actualNonceBigInt + 1n,
        this.transactionContext?.nextNonce ? BigInt(this.transactionContext.nextNonce) : 0n,
        this.lastReservedNonce ? BigInt(this.lastReservedNonce) + 1n : 0n,
      );

      // Update cached context with fresh access key info and computed next nonce
      if (this.transactionContext) {
        this.transactionContext.accessKeyInfo = accessKeyInfo;
        this.transactionContext.nextNonce = candidateNext.toString();
      } else {
        // If no context exists (should be rare here), construct a minimal one
        this.transactionContext = {
          nearPublicKeyStr: this.nearPublicKeyStr!,
          accessKeyInfo: accessKeyInfo,
          nextNonce: candidateNext.toString(),
          // Block values are unknown here; leave stale ones to be refreshed later
          txBlockHeight: '0',
          txBlockHash: '',
        } as TransactionContext; // We'll refresh these via fetchFreshData when needed
      }
      this.lastNonceUpdate = Date.now();

      // Release the used nonce (idempotent)
      this.releaseNonce(actualNonce);

      // Prune any reserved nonces that are now <= chain nonce (already used or invalid)
      if (this.reservedNonces.size > 0) {
        const { set: prunedSet, lastReserved } = this.pruneReserved(chainNonceBigInt, this.reservedNonces);
        this.reservedNonces = prunedSet;
        this.lastReservedNonce = lastReserved;
      }

      console.debug(
        `[NonceManager]: Updated from chain nonce=${chainNonceBigInt} actual=${actualNonceBigInt} next=${this.transactionContext!.nextNonce}`
      );

      } catch (error: unknown) {
        const msg = errorMessage(error);
        // Tolerate missing/rotated keys: avoid noisy error and advance nextNonce optimistically
        if (msg.includes('does not exist while viewing') || msg.includes('Access key not found')) {
          try {
            const actualNonceBigInt = BigInt(actualNonce);
            const candidateNext = this.maxBigInt(
              actualNonceBigInt + 1n,
              this.transactionContext?.nextNonce ? BigInt(this.transactionContext.nextNonce) : 0n,
              this.lastReservedNonce ? BigInt(this.lastReservedNonce) + 1n : 0n,
            );
            if (this.transactionContext) {
              this.transactionContext.nextNonce = candidateNext.toString();
            } else {
            this.transactionContext = {
              nearPublicKeyStr: this.nearPublicKeyStr!,
              accessKeyInfo: makePlaceholderAccessKey(),
              nextNonce: candidateNext.toString(),
              txBlockHeight: '0',
              txBlockHash: '',
            } as TransactionContext;
          }
          this.lastNonceUpdate = Date.now();
          console.debug('[NonceManager]: Access key missing; advanced nextNonce optimistically to', this.transactionContext?.nextNonce);
          return;
        } catch {}
      }
      console.warn('[NonceManager]: Failed to update nonce from blockchain:', error);
      // Don't throw - this is a best-effort update
    }
  }

  /**
   * Get the next available nonce for a single transaction
   * This is a convenience method that reserves exactly one nonce
   * @returns The next nonce to use
   */
  public getNextNonce(): string {
    const nonces = this.reserveNonces(1);
    return nonces[0];
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

  // Small helper to get max of BigInt values elegantly
  private maxBigInt(...values: bigint[]): bigint {
    if (values.length === 0) return 0n;
    return values.reduce((a, b) => (a > b ? a : b));
  }

  // Return a new reserved set that excludes entries <= chain nonce, and compute new lastReserved
  private pruneReserved(chainNonceBigInt: bigint, reserved: Set<string>): { set: Set<string>, lastReserved: string | null } {
    const newSet = new Set<string>();
    let newLast: bigint | null = null;
    for (const r of reserved) {
      try {
        const rb = BigInt(r);
        if (rb > chainNonceBigInt) {
          newSet.add(r);
          if (newLast === null || rb > newLast) newLast = rb;
        }
      } catch {
        // skip malformed entries
      }
    }
    return {
      set: newSet,
      lastReserved: newLast ? newLast.toString() : null
    };
  }

}

// ===== Type guards for NEAR RPC return shapes =====
function isAccessKeyView(x: unknown): x is AccessKeyView {
  if (!isObject(x)) return false;
  // Only validate the fields we actually use
  return isNumber((x as { nonce?: unknown }).nonce);
}

function isBlockResult(x: unknown): x is BlockResult {
  if (!isObject(x)) return false;
  const h = (x as { header?: unknown }).header;
  if (!isObject(h)) return false;
  const height = (h as { height?: unknown }).height;
  const hash = (h as { hash?: unknown }).hash;
  return isNumber(height) && isString(hash);
}

function makePlaceholderAccessKey(): AccessKeyView {
  return {
    nonce: BigInt(0),
    permission: 'FullAccess',
    block_hash: '',
    block_height: 0
  }
}

// Create and export singleton instance
const NonceManagerInstance = NonceManager.getInstance();
export default NonceManagerInstance;
