
//#region src/core/nonceManager.ts
/**
* NonceManager - Singleton for managing NEAR transaction context
*
* This class pre-fetches nonce and block height asynchronously at the start
* of executeAction calls to avoid blocking renderUserConfirmUI().
*
* The manager is cleared on logout and instantiated with new user on login.
*/
var NonceManager = class NonceManager {
	static instance = null;
	lastNonceUpdate = null;
	lastBlockHeightUpdate = null;
	nearAccountId = null;
	nearPublicKeyStr = null;
	transactionContext = null;
	inflightFetch = null;
	refreshTimer = null;
	prefetchTimer = null;
	reservedNonces = /* @__PURE__ */ new Set();
	lastReservedNonce = null;
	NONCE_FRESHNESS_THRESHOLD = 20 * 1e3;
	BLOCK_FRESHNESS_THRESHOLD = 10 * 1e3;
	PREFETCH_DEBOUNCE_MS = 150;
	constructor() {}
	/**
	* Get singleton instance
	*/
	static getInstance() {
		if (!NonceManager.instance) NonceManager.instance = new NonceManager();
		return NonceManager.instance;
	}
	/**
	* Prefetch block height/hash (and nonce if missing) in the background.
	* - If block info is stale or context missing, triggers a non-blocking refresh.
	* - Safe to call frequently (coalesces concurrent fetches).
	*/
	async prefetchBlockheight(nearClient) {
		if (!this.nearAccountId || !this.nearPublicKeyStr) return;
		this.clearPrefetchTimer();
		this.prefetchTimer = setTimeout(async () => {
			this.prefetchTimer = null;
			if (this.inflightFetch) return;
			const now = Date.now();
			const isBlockStale = !this.lastBlockHeightUpdate || now - this.lastBlockHeightUpdate >= this.BLOCK_FRESHNESS_THRESHOLD;
			const missingContext = !this.transactionContext;
			if (!isBlockStale && !missingContext) return;
			try {
				await this.fetchFreshData(nearClient);
			} catch (e) {
				console.debug("[NonceManager]: prefetchBlockheight ignored error:", e);
			}
		}, this.PREFETCH_DEBOUNCE_MS);
	}
	/**
	* Initialize or update the manager with user information
	*/
	initializeUser(nearAccountId, nearPublicKeyStr) {
		this.nearAccountId = nearAccountId;
		this.nearPublicKeyStr = nearPublicKeyStr;
		this.clearTransactionContext();
	}
	/**
	* Clear all data when user logs out
	*/
	clear() {
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
	async getNonceBlockHashAndHeight(nearClient) {
		if (!this.nearAccountId || !this.nearPublicKeyStr) throw new Error("NonceManager not initialized with user data");
		const now = Date.now();
		const isNonceFresh = !!this.lastNonceUpdate && now - this.lastNonceUpdate < this.NONCE_FRESHNESS_THRESHOLD;
		const isBlockHeightFresh = !!this.lastBlockHeightUpdate && now - this.lastBlockHeightUpdate < this.BLOCK_FRESHNESS_THRESHOLD;
		if (isNonceFresh && isBlockHeightFresh && this.transactionContext) {
			this.maybeScheduleBackgroundRefresh(nearClient);
			return this.transactionContext;
		}
		console.debug("[NonceManager]: Data is stale, fetching synchronously");
		return await this.fetchFreshData(nearClient);
	}
	/**
	* Schedule an asynchronous refresh of the transaction context
	*/
	maybeScheduleBackgroundRefresh(nearClient) {
		if (!this.lastNonceUpdate || !this.lastBlockHeightUpdate) return;
		if (this.inflightFetch) return;
		const now = Date.now();
		const nonceAge = now - this.lastNonceUpdate;
		const blockAge = now - this.lastBlockHeightUpdate;
		const halfNonceTtl = this.NONCE_FRESHNESS_THRESHOLD / 2;
		const halfBlockTtl = this.BLOCK_FRESHNESS_THRESHOLD / 2;
		if (nonceAge >= halfNonceTtl || blockAge >= halfBlockTtl) {
			this.clearRefreshTimer();
			this.fetchFreshData(nearClient).then(() => console.debug("[NonceManager]: Background refresh completed")).catch((error) => console.warn("[NonceManager]: Background refresh failed:", error));
			return;
		}
		const delayToHalfNonce = Math.max(0, halfNonceTtl - nonceAge);
		const delayToHalfBlock = Math.max(0, halfBlockTtl - blockAge);
		const delay = Math.min(delayToHalfNonce, delayToHalfBlock);
		this.clearRefreshTimer();
		this.refreshTimer = setTimeout(() => {
			this.refreshTimer = null;
			if (this.inflightFetch) return;
			this.fetchFreshData(nearClient).then(() => console.debug("[NonceManager]: Background refresh completed")).catch((error) => console.warn("[NonceManager]: Background refresh failed:", error));
		}, delay);
	}
	/**
	* Fetch fresh transaction context data from NEAR RPC
	*/
	async fetchFreshData(nearClient) {
		if (this.inflightFetch) return this.inflightFetch;
		const capturedAccountId = this.nearAccountId;
		const capturedPublicKey = this.nearPublicKeyStr;
		this.inflightFetch = (async () => {
			try {
				const now = Date.now();
				const isNonceStale = !this.lastNonceUpdate || now - this.lastNonceUpdate >= this.NONCE_FRESHNESS_THRESHOLD;
				const isBlockStale = !this.lastBlockHeightUpdate || now - this.lastBlockHeightUpdate >= this.BLOCK_FRESHNESS_THRESHOLD;
				let accessKeyInfo = this.transactionContext?.accessKeyInfo;
				let txBlockHeight = this.transactionContext?.txBlockHeight;
				let txBlockHash = this.transactionContext?.txBlockHash;
				const fetchAccessKey = isNonceStale || !accessKeyInfo;
				const fetchBlock = isBlockStale || !txBlockHeight || !txBlockHash;
				const [maybeAccessKey, maybeBlock] = await Promise.all([fetchAccessKey ? nearClient.viewAccessKey(capturedAccountId, capturedPublicKey) : Promise.resolve(null), fetchBlock ? nearClient.viewBlock({ finality: "final" }) : Promise.resolve(null)]);
				if (fetchAccessKey) {
					if (!maybeAccessKey || maybeAccessKey.nonce === void 0) throw new Error(`Access key not found or invalid for account ${capturedAccountId} with public key ${capturedPublicKey}.`);
					accessKeyInfo = maybeAccessKey;
				}
				if (fetchBlock) {
					const blockInfo = maybeBlock;
					if (!blockInfo?.header?.hash || blockInfo?.header?.height === void 0) throw new Error("Failed to fetch Block Info");
					txBlockHeight = String(blockInfo.header.height);
					txBlockHash = blockInfo.header.hash;
				}
				const nextNonce = this.maxBigInt(BigInt(accessKeyInfo.nonce) + 1n, this.transactionContext?.nextNonce ? BigInt(this.transactionContext.nextNonce) : 0n, this.lastReservedNonce ? BigInt(this.lastReservedNonce) + 1n : 0n).toString();
				const transactionContext = {
					nearPublicKeyStr: capturedPublicKey,
					accessKeyInfo,
					nextNonce,
					txBlockHeight,
					txBlockHash
				};
				if (capturedAccountId === this.nearAccountId && capturedPublicKey === this.nearPublicKeyStr) {
					this.transactionContext = transactionContext;
					const now$1 = Date.now();
					if (fetchAccessKey) this.lastNonceUpdate = now$1;
					if (fetchBlock) this.lastBlockHeightUpdate = now$1;
				} else console.debug("[NonceManager]: Discarded fetch result due to identity change");
				return transactionContext;
			} catch (error) {
				console.error("[NonceManager]: Failed to fetch fresh transaction context:", error);
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
	getTransactionContext() {
		if (!this.transactionContext) throw new Error("Transaction context not available - call getNonceBlockHashAndHeight() first");
		const now = Date.now();
		const maxAge = 30 * 1e3;
		if (this.lastNonceUpdate && now - this.lastNonceUpdate > maxAge) console.warn("[NonceManager]: Transaction context is stale, consider refreshing");
		return this.transactionContext;
	}
	/**
	* Check if transaction context is available and not stale
	*/
	isTransactionContextAvailable(maxAgeMs = 3e4) {
		if (!this.transactionContext || !this.lastNonceUpdate) return false;
		const now = Date.now();
		return now - this.lastNonceUpdate <= maxAgeMs;
	}
	/**
	* Clear transaction context (useful when nonce might be invalidated)
	*/
	clearTransactionContext() {
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
	* Reserve a nonce for batch transactions
	* This increments the nonce locally to prevent conflicts in batch operations
	* @param count - Number of nonces to reserve (default: 1)
	* @returns Array of reserved nonces
	*/
	reserveNonces(count = 1) {
		if (!this.transactionContext) throw new Error("Transaction context not available - call getNonceBlockHashAndHeight() first");
		if (count <= 0) return [];
		const start = this.lastReservedNonce ? BigInt(this.lastReservedNonce) + 1n : BigInt(this.transactionContext.nextNonce);
		const planned = [];
		for (let i = 0; i < count; i++) {
			const candidate = (start + BigInt(i)).toString();
			if (this.reservedNonces.has(candidate)) throw new Error(`Nonce ${candidate} is already reserved`);
			planned.push(candidate);
		}
		const newSet = new Set(this.reservedNonces);
		for (const n of planned) newSet.add(n);
		this.reservedNonces = newSet;
		this.lastReservedNonce = planned[planned.length - 1];
		console.debug(`[NonceManager]: Reserved ${count} nonces:`, planned);
		return planned;
	}
	/**
	* Release a reserved nonce (call when transaction is completed or failed)
	* @param nonce - The nonce to release
	*/
	releaseNonce(nonce) {
		if (this.reservedNonces.has(nonce)) {
			this.reservedNonces.delete(nonce);
			console.debug(`[NonceManager]: Released nonce ${nonce}`);
		}
	}
	/**
	* Release all reserved nonces
	*/
	releaseAllNonces() {
		const count = this.reservedNonces.size;
		this.reservedNonces.clear();
		this.lastReservedNonce = null;
		console.debug(`[NonceManager]: Released all ${count} reserved nonces`);
	}
	/**
	* Update nonce from blockchain after transaction completion
	* This should be called after a transaction is successfully broadcasted
	* @param nearClient - NEAR client for RPC calls
	* @param actualNonce - The actual nonce used in the completed transaction
	*/
	async updateNonceFromBlockchain(nearClient, actualNonce) {
		if (!this.nearAccountId || !this.nearPublicKeyStr) throw new Error("NonceManager not initialized with user data");
		try {
			const accessKeyInfo = await nearClient.viewAccessKey(this.nearAccountId, this.nearPublicKeyStr);
			if (!accessKeyInfo || accessKeyInfo.nonce === void 0) throw new Error(`Access key not found or invalid for account ${this.nearAccountId}`);
			const chainNonceBigInt = BigInt(accessKeyInfo.nonce);
			const actualNonceBigInt = BigInt(actualNonce);
			if (chainNonceBigInt < actualNonceBigInt - BigInt(1)) console.warn(`[NonceManager]: Chain nonce (${chainNonceBigInt}) behind expected (${actualNonceBigInt - BigInt(1)}). Proceeding with tolerant update.`);
			const candidateNext = this.maxBigInt(chainNonceBigInt + 1n, this.transactionContext?.nextNonce ? BigInt(this.transactionContext.nextNonce) : 0n, this.lastReservedNonce ? BigInt(this.lastReservedNonce) + 1n : 0n);
			if (this.transactionContext) {
				this.transactionContext.accessKeyInfo = accessKeyInfo;
				this.transactionContext.nextNonce = candidateNext.toString();
			} else this.transactionContext = {
				nearPublicKeyStr: this.nearPublicKeyStr,
				accessKeyInfo,
				nextNonce: candidateNext.toString(),
				txBlockHeight: "0",
				txBlockHash: ""
			};
			this.lastNonceUpdate = Date.now();
			this.releaseNonce(actualNonce);
			if (this.reservedNonces.size > 0) {
				const { set: prunedSet, lastReserved } = this.pruneReserved(chainNonceBigInt, this.reservedNonces);
				this.reservedNonces = prunedSet;
				this.lastReservedNonce = lastReserved;
			}
			console.debug(`[NonceManager]: Updated from chain nonce=${chainNonceBigInt} actual=${actualNonceBigInt} next=${this.transactionContext.nextNonce}`);
		} catch (error) {
			console.error("[NonceManager]: Failed to update nonce from blockchain:", error);
		}
	}
	/**
	* Get the next available nonce for a single transaction
	* This is a convenience method that reserves exactly one nonce
	* @returns The next nonce to use
	*/
	getNextNonce() {
		const nonces = this.reserveNonces(1);
		return nonces[0];
	}
	clearRefreshTimer() {
		if (this.refreshTimer) {
			clearTimeout(this.refreshTimer);
			this.refreshTimer = null;
		}
	}
	clearPrefetchTimer() {
		if (this.prefetchTimer) {
			clearTimeout(this.prefetchTimer);
			this.prefetchTimer = null;
		}
	}
	maxBigInt(...values) {
		if (values.length === 0) return 0n;
		return values.reduce((a, b) => a > b ? a : b);
	}
	pruneReserved(chainNonceBigInt, reserved) {
		const newSet = /* @__PURE__ */ new Set();
		let newLast = null;
		for (const r of reserved) try {
			const rb = BigInt(r);
			if (rb > chainNonceBigInt) {
				newSet.add(r);
				if (newLast === null || rb > newLast) newLast = rb;
			}
		} catch {}
		return {
			set: newSet,
			lastReserved: newLast ? newLast.toString() : null
		};
	}
};
const NonceManagerInstance = NonceManager.getInstance();
var nonceManager_default = NonceManagerInstance;

//#endregion
exports.default = nonceManager_default;
//# sourceMappingURL=nonceManager.js.map