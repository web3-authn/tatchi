---
title: VRF Sessions
---

# VRF Sessions

VRF sessions turn the VRF‑WebAuthn unlock into a short‑lived **session capability**: the user approves once (TouchID/WebAuthn), then the wallet can sign multiple actions for a limited window without re‑prompting.

Instead of keeping decrypted keys around, the wallet caches only the *minimum capability* needed to unwrap the vault inside workers:

- **VRF worker (WASM)** keeps `{WrapKeySeed, wrapKeySalt}` + policy (`ttl_ms`, `remaining_uses`) in memory.
- **Signer workers (WASM)** remain **one‑shot**; each request gets key material over a fresh `MessageChannel`, signs, then terminates.


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
2. Run the normal VRF‑WebAuthn confirmation flow (confirm UI + TouchID/WebAuthn → `PRF.first_auth`).
3. VRF worker derives `WrapKeySeed` (from `PRF.first_auth` + in‑memory `vrf_sk`) and stores `{WrapKeySeed, wrapKeySalt}` with TTL/uses in a VRF‑owned session.
4. VRF worker sends `{WrapKeySeed, wrapKeySalt}` to the signer worker over the attached port; signer stores it and signals readiness.
5. Main thread sends the signing request; signer decrypts, signs, and terminates.

### Warm path: reuse a VRF session (no WebAuthn prompt)

1. Create a fresh `MessageChannel` and a new signer worker for the same `sessionId`.
2. Call `DISPENSE_SESSION_KEY(sessionId)` in the VRF worker:
   - VRF enforces TTL/remaining‑uses
   - If valid, VRF sends `{WrapKeySeed, wrapKeySalt}` over the attached port and closes it
3. Signer signals `WRAP_KEY_SEED_READY`, then signs and terminates.
4. If the session is missing/expired/exhausted, fall back to the cold path to re‑mint.


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
        VRF-->>Signer: MessagePort {WrapKeySeed, wrapKeySalt}
        Signer-->>UI: WRAP_KEY_SEED_READY
    else Cold session (mint/refresh)
        UI->>UI: Show wallet confirm UI
        UI->>UI: WebAuthn (TouchID) → PRF.first_auth
        UI->>VRF: MINT_SESSION_KEYS_AND_SEND_TO_SIGNER(sessionId, PRF.first_auth, ttl/uses)
        VRF->>Chain: (optional) verify_authentication_response
        Chain-->>VRF: verified
        VRF->>VRF: Derive WrapKeySeed; cache TTL/uses
        VRF-->>Signer: MessagePort {WrapKeySeed, wrapKeySalt}
        Signer-->>UI: WRAP_KEY_SEED_READY
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
