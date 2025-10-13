---
title: Nonce Manager
---

# Nonce Manager

Ensures correct NEAR transaction ordering and replay protection. Prefetches block height/hash and computes the next usable nonce, with concurrency‑safe reservations for batched txs.

## Behavior

- Prefetches block height/hash and access key nonce in the background
- Coalesces concurrent fetches; tolerates missing access keys right after creation
- Reserves nonces per tab/session to avoid collisions, supports `reserveNonces(n)` for batches
- Updates from chain finality after broadcast; advances optimistically when needed

## Usage

```ts
const nm = passkeyManager.webAuthnManager.getNonceManager()
await nm.prefetchBlockheight(nearClient)

const ctx = await nm.getNonceBlockHashAndHeight(nearClient)
const next = nm.getNextNonce() // or nm.reserveNonces(2)

// After sending a tx
await nm.updateNonceFromBlockchain(nearClient, next)
```

Notes:

- The manager is reset on logout and re‑initialized on login
- All signing helpers in the SDK use it under the hood; advanced apps can integrate directly

