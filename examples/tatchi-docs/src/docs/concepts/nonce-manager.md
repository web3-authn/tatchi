---
title: Nonce Manager
---

# Nonce Manager

`NonceManager` is an internal SDK component that helps the signing flow pick correct NEAR nonces and block context (block hash/height) without adding extra latency to UI confirmation.

You generally should not interact with it directly. Use the higher-level APIs (`executeAction`, `signTransactionsWithActions`, `signAndSendTransactions`, etc.) and the SDK will manage nonces for you.

## The Blockchain Nonce Problem

On the NEAR blockchain, every access key maintains a **nonce**—a counter that must strictly increase with each transaction. This mechanism prevents replay attacks, but creates challenges for application developers:

### What Can Go Wrong

**Nonce Reuse**: If two transactions use the same nonce, the blockchain rejects the second one as a replay attack.

**Stale Data**: When you query the RPC for the current nonce, the value might already be outdated by the time you use it.

**Concurrent Operations**: If multiple UI components or browser tabs send transactions simultaneously, they might all fetch the same nonce and try to use it.

**Race Conditions**: The gap between "what the blockchain knows" and "what your application knows" creates timing bugs that are hard to reproduce.

### The Naive Approach Fails

A typical implementation looks like this:

```javascript
// DON'T DO THIS - it breaks with concurrent transactions
const nonce = await rpc.getAccessKeyNonce(accountId, publicKey);
const transaction = buildTransaction({ nonce: nonce + 1, ... });
await rpc.sendTransaction(transaction);
```

This works fine for single transactions, but fails catastrophically when:
- Multiple components trigger transactions at once
- Users have your app open in multiple tabs (or multiple devices sign with the same key)
- Transactions are sent in quick succession

## What the SDK’s Nonce Manager Actually Does

`NonceManager` is a singleton held in memory inside the SDK. In a browser, that means “per tab” (per JS runtime) — it does not coordinate between tabs or devices. It reduces nonce-related race conditions inside a single app instance, but it cannot prevent conflicts if the same access key is used concurrently elsewhere.

### Responsibilities

**Fetch transaction context**: Pulls the latest final block hash/height and the current access-key nonce from NEAR RPC (as needed) so the signer can build valid transactions.

**Coalesce concurrent fetches**: Multiple overlapping calls in the same tab share the same in-flight RPC work (unless a “force refresh” is requested).

**Reserve nonces locally**: For signing batches, it reserves a consecutive nonce range in memory so concurrent signing requests in the same tab don’t reuse the same nonce.

**Reconcile after broadcast (best-effort)**: When the SDK successfully broadcasts a transaction via its send helpers, it fetches the latest access-key nonce and advances the local “next nonce” pointer. This is tolerant of finality lag by advancing based on `max(chainNonce + 1, actualNonce + 1, localNextNonce, lastReserved + 1)`.

### Caching & Freshness

To reduce latency and avoid redundant RPC calls, the SDK caches:

- Access-key nonce for ~5 seconds
- Block hash/height for ~20 seconds
- Background prefetch is debounced (~400ms) and is best-effort (errors are swallowed)

### What it does *not* do

- **Cross-tab / cross-device locking**: There is no shared lock or persistence across tabs. If two tabs (or devices) send transactions using the same access key at the same time, NEAR can still reject one with an invalid/stale nonce. In that case, retrying the action is the correct recovery path.
- **A public, stable API**: The methods exist on the TypeScript class, but they are internal implementation details and may change.

### Automatic Integration

Most developers never call the Nonce Manager directly. All high-level signing APIs use it automatically:

```javascript
// The SDK handles nonces for you
const signed = await tatchi.signTransactionsWithActions({
  nearAccountId: 'user.near',
  transactions: [tx1, tx2, tx3],
})
// Nonces are assigned correctly for concurrent calls within the same tab/runtime
```

The Nonce Manager is an internal component of the signing flow; the public API is intentionally higher-level (sign/send helpers).

## Lifecycle Management

**Initialization**: The SDK initializes the `NonceManager` with the active user’s `nearAccountId` and `nearPublicKey` after login/unlock.

**Reset**: When you log out, the manager's state is cleared to prevent stale data.

**Per-tab**: Reservations and cached values are in-memory only (cleared on refresh, and not shared across tabs).

## Internal Options (for advanced debugging)

These knobs are used internally by the SDK. They’re documented here so you know what’s happening when reading logs or debugging edge cases:

- `getNonceBlockHashAndHeight(nearClient, { force?: boolean })`: fetches/returns transaction context. With `force: true`, bypasses freshness checks and starts a new RPC fetch (used in a few “just-in-time refresh” paths).
- `refreshNow(nearClient, { clearReservations?: boolean })`: forces a refresh and can optionally drop any locally reserved nonces.
- `reserveNonces(count)`: reserves `count` consecutive nonce strings in local memory (requires that a transaction context has already been fetched).
- `updateNonceFromBlockchain(nearClient, actualNonce)`: after a successful broadcast, refreshes the access-key nonce and advances the local pointer; also releases/prunes any now-stale reservations.

## Why This Matters

Without proper nonce management, you'd need to:
- Build your own queuing system for transactions
- Handle race conditions manually
- Deal with subtle timing bugs in production
- Implement retry logic for nonce conflicts

The Nonce Manager handles all of this automatically, letting you focus on building features instead of fighting blockchain sequencing issues.

---

**Next**: Learn about the [Security Model](security-model) that protects your users' keys and credentials.
