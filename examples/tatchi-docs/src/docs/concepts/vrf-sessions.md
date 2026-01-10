---
title: VRF Sessions
---

# VRF Sessions

VRF sessions turn the VRF‑WebAuthn unlock into a short‑lived **session capability**: the user approves once (TouchID/WebAuthn), then the wallet can sign multiple actions for a limited window without re‑prompting.

Instead of keeping decrypted keys around, the wallet caches only the *minimum capability* needed to unwrap the vault inside workers:

- **VRF worker (WASM)** keeps `{WrapKeySeed, wrapKeySalt}` + policy (`ttl_ms`, `remaining_uses`) in memory.
- **Signer workers (WASM)** remain **one‑shot**; each request gets key material over a fresh `MessageChannel`, signs, then terminates.

## Why sessions exist

Running a full VRF challenge + WebAuthn assertion for every local signing request adds latency with no extra security when the PRF output never leaves the device. Sessions keep the VRF‑WebAuthn handshake as a **mint-once capability**:

- Unlock once with TouchID/WebAuthn, then sign multiple actions for a short time or usage budget.
- Reserve per-transaction VRF checks for remote attestation or high-risk actions.

## Security properties

- **Freshness + replay resistance**: VRF challenges are unique; proofs bind the session to a fresh challenge.
- **Block binding**: Challenges can include recent block height/hash to prevent stale-session reuse.
- **User presence**: WebAuthn assertion proves touch/biometric presence over the exact VRF challenge.
- **Policy enforcement**: The worker enforces TTL and usage caps encoded in the challenge or local defaults.
- **Auditability**: Session minting can be logged with challenge digest + block height without exposing secrets.

## Two layers of “session”

**1) VRF‑owned session (capability)**
- Stored in the VRF worker’s memory and keyed by `sessionId`.
- Contains `WrapKeySeed` bytes and `wrapKeySalt` plus TTL/usage budget.
- Enforced in the VRF worker (expire/exhaust → refuse to dispense).

**2) Per‑request signing handshake**
- For each signing request, the wallet creates a fresh `MessageChannel`.
- One port is transferred to the VRF worker and one port to a new signer worker.
- VRF sends `{WrapKeySeed, wrapKeySalt}` *only over that port*; it is never put into a main‑thread JS payload.


## Flow (cold vs warm)

### Cold path: mint/refresh a VRF session (requires WebAuthn)

1. Create a fresh `MessageChannel` and attach ports to VRF + signer workers for `sessionId`.
2. Run the normal VRF‑WebAuthn confirmation flow (confirm UI + TouchID/WebAuthn → credential with PRF outputs in `clientExtensionResults`).
3. VRF worker derives `WrapKeySeed` (from `PRF.first_auth` + in‑memory `vrf_sk`) and stores `{WrapKeySeed, wrapKeySalt}` with TTL/uses in a VRF‑owned session.
4. VRF worker sends `{WrapKeySeed, wrapKeySalt}` to the signer worker over the attached port; signer stores it.
5. Main thread sends the signing request; if the seed hasn’t arrived yet the signer waits internally, then decrypts, signs, and terminates.

### Warm path: reuse a VRF session (no WebAuthn prompt)

1. Create a fresh `MessageChannel` and a new signer worker for the same `sessionId`.
2. Call `DISPENSE_SESSION_KEY(sessionId)` in the VRF worker:
   - VRF enforces TTL/remaining‑uses
   - If valid, VRF sends `{WrapKeySeed, wrapKeySalt}` over the attached port and closes it
3. Main thread sends the signing request; signer waits internally for the seed if needed, then signs and terminates.
4. If the session is missing/expired/exhausted, fall back to the cold path to re‑mint.

## Enabling warm signing sessions

Warm signing sessions are **opt-in** and controlled by `signingSessionDefaults` (global) or `signingSession` (per login call).

- When `ttlMs: 0` or `remainingUses: 0`, warm signing is effectively disabled (a TouchID/WebAuthn prompt is required for each signing operation).
- Warm sessions are **in-memory only** (cleared on page refresh/close).

### Configure defaults

```ts
import { PASSKEY_MANAGER_DEFAULT_CONFIGS } from '@tatchi-xyz/sdk/react';

const config = {
  ...PASSKEY_MANAGER_DEFAULT_CONFIGS,
  signingSessionDefaults: {
    ttlMs: 5 * 60 * 1000,
    remainingUses: 3,
  },
};
```

### Override per login

```ts
await tatchi.loginAndCreateSession('alice.testnet', {
  signingSession: { ttlMs: 10 * 60 * 1000, remainingUses: 10 },
});
```

### Inspect session status

`loginAndCreateSession()` returns a `signingSession` status object when available:

```ts
const login = await tatchi.loginAndCreateSession('alice.testnet');
console.log(login.signingSession); // { status: 'active' | 'expired' | ... }
```


## Session handshake diagram

```mermaid
sequenceDiagram
    participant App as dApp (app origin)
    box rgb(243, 244, 246) Wallet origin (iframe)
    participant UI as Wallet (main thread)
    participant VRF as VRF Worker (WASM)
    participant Signer as Signer Worker (WASM, one-shot)
    end
    participant Chain as NEAR RPC / Web3Authn Contract

    App->>UI: signTransaction / signTransactionsWithActions

    Note over UI,Signer: Fresh MessageChannel per signing request
    UI->>VRF: ATTACH_WRAP_KEY_SEED_PORT(sessionId, port1)
    UI->>Signer: ATTACH_WRAP_KEY_SEED_PORT(sessionId, port2)
    Signer-->>UI: ATTACH_WRAP_KEY_SEED_PORT_OK

    alt Warm session available (no prompt)
        UI->>VRF: DISPENSE_SESSION_KEY(sessionId, uses)
        VRF-->>Signer: MessagePort: WrapKeySeed + wrapKeySalt
    else Cold session (mint/refresh)
        UI->>UI: Show wallet confirm UI
        UI->>UI: WebAuthn (TouchID) → credential (PRF outputs in extensions)
        UI->>VRF: MINT_SESSION_KEYS_AND_SEND_TO_SIGNER(sessionId, credential, ttl/uses)
        VRF->>Chain: (optional) verify_authentication_response
        Chain-->>VRF: verified
        VRF->>VRF: Derive WrapKeySeed, cache TTL/uses
        VRF-->>Signer: MessagePort: WrapKeySeed + wrapKeySalt
    end

    UI->>Signer: SIGN_* request (sessionId + vault ciphertext)
    Signer-->>UI: signed payload(s)
    Signer-->>Signer: zeroize + self.close()
    UI-->>App: return signed result(s)
```


::: info Security properties
- `WrapKeySeed` never enters main‑thread JS; it is transferred worker‑to‑worker over a `MessagePort`.
- The signer worker is one‑shot and holds no cross‑request state; session enforcement lives in the VRF worker.
- Warm signing is only possible if the VRF worker has a valid (unexpired, unexhausted) session capability.
:::

## Operational invariants

- VRF worker never handles `near_sk` or vault material; only `{WrapKeySeed, wrapKeySalt}` crosses workers.
- PRF outputs and session secrets never touch the main thread or dApp payloads.
- All prompts originate from the VRF worker flows; signer worker never calls SecureConfirm.
