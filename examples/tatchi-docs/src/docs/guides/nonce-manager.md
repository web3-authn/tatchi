---
title: Nonce Manager
---

# Nonce Manager

Blockchain transactions require careful sequencing. The Nonce Manager ensures your NEAR transactions stay correctly ordered, even when sending multiple transactions concurrently.

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
- Users have your app open in multiple tabs
- Transactions are sent in quick succession

## How the Nonce Manager Works

The Nonce Manager provides a **concurrency-safe API** that eliminates these race conditions through careful state management.

### Core Capabilities

**Prefetching**: Fetches blockchain metadata (block height, block hash, current nonce) in the background before you need it.

**Coalescing**: Multiple concurrent requests share the same RPC call instead of hammering the blockchain with duplicate queries.

**Reservation**: Reserves nonces per browser tab/session so components can't accidentally reuse values.

**Batch Support**: Reserves multiple consecutive nonces at once for transaction batches.

**State Tracking**: Maintains an internal view of nonce state and synchronizes with the blockchain after each transaction.

### Three-Phase Lifecycle

#### 1. Prefetch Phase

The manager proactively fetches:
- Latest block height and hash (needed to build valid transactions)
- Current nonce for your access key
- Caches this data so concurrent operations don't trigger redundant RPC calls

#### 2. Reserve Phase

When you request a nonce:
- The manager calculates the next available value
- Marks it as reserved in local state (isolated per browser tab)
- For batches, call `reserveNonces(n)` to get `n` consecutive nonces atomically

#### 3. Update Phase

After submitting a transaction:
- The manager queries the blockchain to confirm the new state
- Updates its internal pointer to reflect what actually happened on-chain
- Handles edge cases where the blockchain moved ahead independently

### Automatic Integration

Most developers never call the Nonce Manager directly. All high-level signing APIs use it automatically:

```javascript
// The SDK handles nonces for you
const signed = await tatchi.signTransactionsWithActions({
  nearAccountId: 'user.near',
  transactions: [tx1, tx2, tx3],
})
// Nonces are assigned correctly, even for concurrent calls
```

The Nonce Manager is an internal component of the signing flow; the public API is intentionally higher-level (sign/send helpers).

## Lifecycle Management

**Initialization**: The Nonce Manager is created when you log in with a passkey and gain access to an access key.

**Reset**: When you log out, the manager's state is cleared to prevent stale data.

**Per-Session**: Each browser tab maintains its own reservation state, but all tabs eventually synchronize with the blockchain's ground truth.

## Why This Matters

Without proper nonce management, you'd need to:
- Build your own queuing system for transactions
- Handle race conditions manually
- Deal with subtle timing bugs in production
- Implement retry logic for nonce conflicts

The Nonce Manager handles all of this automatically, letting you focus on building features instead of fighting blockchain sequencing issues.

---

**Next**: Learn about the [Security Model](../concepts/security-model.md) that protects your users' keys and credentials.
