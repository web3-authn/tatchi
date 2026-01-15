---
title: Architecture
---

# Architecture

- [Overview](#overview)
- [Transaction Lifecycle](#transaction-lifecycle)
  - [Registration Flow](#registration-flow)
  - [Login Flow](#login-flow)
  - [Transaction Flow](#transaction-flow)
- [VRF WebAuthn](./vrf-webauthn)
- [Passkey Scope](./passkey-scope)

## Overview

The wallet runs in an isolated iframe context, separate from application code. Think of it as a mini web app in an iframe that your app "dials into" for secure operations.

![Iframe Isolation Architecture](/diagrams/architecture.png)

The wallet mounts a hidden iframe at its own origin. Inside that iframe, two WASM workers hold secrets:

- **VRF worker** – owns WebAuthn/PRF handling, Shamir 3-pass with the relay, derives `WrapKeySeed`, enforces canonical digests.
- **Signer worker** – receives only `WrapKeySeed + wrapKeySalt` over an internal `MessageChannel`, derives the KEK, unwraps `near_sk`, and signs.

Normal sessions are **2-of-2** (device + relay via Shamir 3-pass) and always require fresh WebAuthn for `PRF.first`. A high-friction **PRF.second recovery** path exists only for registration, device linking, or explicit recovery.

The transaction signing flow follows this lifecycle:
1. **Mount**: SDK creates hidden iframe pointing at wallet origin.
2. **Request**: App calls methods like `registerPasskey()` or `signTransactionsWithActions()` by sending typed messages.
3. **User Confirmation**: Wallet routes requests to workers, triggers a TouchID/WebAuthn prompt, and shows intent UI from the wallet origin.
4. **Execute**: VRF-WebAuthn completes, VRF worker runs Shamir 3-pass (or explicit recovery), derives `WrapKeySeed`, and signer worker signs.
5. **Response**: Wallet streams progress events back to your app, then returns signed transaction payloads.

<div style="margin-top: 6rem;"></div>

# Transaction Lifecycle

This section outlines the core stages of the transaction lifecycle for:
1. registration flows,
2. login flows, and
3. transaction signing flows (WebAuthn authentication).

Each section illustrates how the wallet handles VRF operations, onchain verification, transaction signing, and dispatch.

## Registration Flow

Registration creates the passkey, derives deterministic keys, and seals them with the dual-worker pipeline from a single TouchID prompt. PRF outputs stay VRF-side; the signer only receives `WrapKeySeed + wrapKeySalt` over the internal channel.

```mermaid
sequenceDiagram
    box rgb(243, 244, 246) Iframe Wallet
    participant UI as Wallet (iframe main)
    participant VRF as VRF Worker
    participant Signer as Signer Worker
    end
    participant Relay as Relay
    participant Contract as Web3Authn Contract

    Note over UI,VRF: Single WebAuthn prompt (PRF.first + PRF.second)
    UI->>VRF: requestRegistrationCredentialConfirmation()
    VRF->>UI: TouchID prompt + confirm UI
    UI->>VRF: Credential with PRF outputs
    VRF->>VRF: Derive deterministic VRF keypair<br/>Compute WrapKeySeed + wrapKeySalt<br/>Seal vault ciphertext
    VRF-->>Signer: MessageChannel: WrapKeySeed + wrapKeySalt
    Signer->>Signer: Derive KEK, wrap deterministic NEAR key, sign registration tx
    Signer-->>UI: near_pk + encrypted NEAR key + signed tx
    UI->>Relay: Submit create_account_and_register_user (or direct)
    Relay->>Contract: Forward registration tx
    Contract-->>UI: Registration receipt / txId
    UI->>UI: Store encrypted VRF/NEAR keys + authenticator in IndexedDB
```

::: tip **Steps:**
1. **WebAuthn registration** – VRF worker collects the credential (PRF.first + PRF.second) from the wallet-origin UI.
2. **Derive deterministic keys** – VRF worker derives deterministic VRF/NEAR keys, `WrapKeySeed`, and `wrapKeySalt`; only the seed + salt cross to the signer via `MessageChannel`.
3. **Sign and register** – Signer worker seals the deterministic NEAR key with the KEK and signs the registration tx.
4. **Store vault** – Encrypted deterministic keys, salts, and authenticator metadata live in the wallet’s IndexedDB; plaintext never leaves workers.
:::

**Key cryptographic properties:**
- **Origin-bound PRF** – WebAuthn PRF binds all derived keys to the wallet origin.
- **Challenge binding** – Bootstrap VRF ties fresh NEAR block data to the WebAuthn challenge for replay resistance.
- **Atomic verification** – Contract verifies VRF proof + WebAuthn registration together.
- **Isolation** – Only `WrapKeySeed + wrapKeySalt` cross the worker boundary; PRF outputs and `vrf_sk` stay VRF-side.


## Login Flow

Session unlock reconstructs `vrf_sk` and derives a fresh `WrapKeySeed`. Primary mode is Shamir 3-pass (relay + device), always gated by fresh WebAuthn (`PRF.first_auth`). Backup mode uses `PRF.second` only in explicit Recovery Mode.

### Path A: Primary Shamir 3-Pass (fresh TouchID)

```mermaid
sequenceDiagram
    box rgb(243, 244, 246) Iframe Wallet
    participant Wallet as Wallet
    participant Worker as VRF Worker
    end
    participant Relay as Relay Server (Optional)

    Note over Wallet,Worker: Phase 1: Fresh PRF.first_auth
    Wallet->>Worker: WebAuthn authentication (TouchID) → PRF.first_auth

    Note over Wallet,Relay: Phase 2: Shamir 3-pass (2-of-2)
    Worker->>Relay: shareA derived from PRF.first_auth
    Relay->>Worker: shareB response
    Worker->>Worker: Reconstruct vrf_sk, derive WrapKeySeed
    Worker-->>Wallet: Session unlocked ✓ (WrapKeySeed retained VRF-side)
```

::: tip **Steps**:
1. Trigger WebAuthn PRF for `PRF.first_auth` (TouchID).
2. VRF worker derives shareA and runs Shamir 3-pass with the relay to reconstruct `vrf_sk`.
3. Derive `WrapKeySeed` from `PRF.first_auth || vrf_sk`; keep it inside the VRF worker.
4. Session is ready to derive KEKs for signing. No secrets leave workers; main thread never sees PRF/`vrf_sk`.
:::

### Path B: Explicit PRF.second Recovery

```mermaid
sequenceDiagram
    box rgb(243, 244, 246) Iframe Wallet
    participant Wallet as Wallet
    participant Worker as VRF Worker
    end
    participant Relay as Relay Server (Optional)

    Note over Wallet,Worker: Recovery Mode only
    Wallet->>Worker: WebAuthn authentication (TouchID) requesting PRF.second
    Worker->>Worker: Re-derive vrf_sk deterministically from PRF.second
    Worker->>Worker: Derive WrapKeySeed, zeroize PRF.second after use
    Worker-->>Wallet: Session unlocked ✓ (relay not required)
```

::: tip **Steps**:
1. User opts into Recovery Mode; wallet requests `PRF.second` in addition to `PRF.first`.
2. VRF worker re-derives `vrf_sk` deterministically (no relay needed).
3. Derive `WrapKeySeed` and proceed with signing/unwrapping.
4. PRF.second is zeroized immediately; this path is high-friction and logged.
:::


### Optional: JWT Session Token

After login, you can optionally mint a JWT session token for web2 authentication:

```mermaid
sequenceDiagram
    box Iframe Wallet
    participant Wallet as Wallet
    participant Worker as VRF Worker
    end
    participant Relay as Relay Server (Optional)

    Note over Wallet,Relay: Optional JWT Session (After VRF Unlock)
    Wallet->>Worker: 1. Generate fresh VRF challenge
    Worker->>Wallet: VRF challenge + proof
    Wallet->>Wallet: 2. WebAuthn authentication (TouchID prompt)
    Wallet->>Relay: 3. Verify authentication + VRF proof
    Relay->>Wallet: 4. JWT token
```

::: info **Security properties:**
- **VRF stays in worker**: Never exposed to main thread
- **Session-scoped**: VRF keypair is reconstructed per session with fresh WebAuthn
- **Primary 2-of-2**: Shamir 3-pass uses relay + device
- **PRF.second backup**: Only in Recovery Mode; zeroized immediately
:::


## Transaction Flow

```mermaid
sequenceDiagram
    box rgb(243, 244, 246) Iframe Wallet
    participant UI as Wallet (iframe main)
    participant VRF as VRF Worker
    participant Signer as Signer Worker
    end
    participant NEAR as NEAR RPC
    participant Contract as Web3Authn Contract

    Note over UI,VRF: Phase 1: Preparation
    UI->>UI: Validate action inputs
    UI->>VRF: signTransactionsWithActions(request)
    VRF->>NEAR: Fetch nonce + block hash
    NEAR-->>VRF: Nonce + block hash
    VRF->>VRF: Canonical intent digest (receiverId + normalized actions)

    Note over UI,VRF: Phase 2: ConfirmTxFlow (single TouchID)
    VRF->>UI: Render confirm UI with intent digest
    UI->>VRF: WebAuthn authentication (TouchID) → PRF.first_auth
    VRF->>VRF: Shamir 3-pass (primary) or Recovery Mode (PRF.second) → vrf_sk
    VRF->>VRF: Derive WrapKeySeed, generate VRF proof for contract
    VRF-->>Signer: MessageChannel: WrapKeySeed + wrapKeySalt

    Note over VRF,Signer: Phase 3: Signing in signer worker
    Signer->>Signer: Derive KEK, decrypt/derive deterministic NEAR key
    Signer->>Signer: Sign NEAR transaction(s)
    Signer-->>UI: Signed transaction(s)

    Note over UI,NEAR: Phase 4: Broadcast
    UI->>NEAR: Broadcast signed transaction(s)
    NEAR-->>UI: Transaction result(s)
    UI->>UI: Reconcile nonce (async)
```

::: tip **Steps:**
1. **Preparation** – Validate inputs and fetch nonce/block hash; compute canonical intent digest in the VRF worker.
2. **ConfirmTxFlow** – Single TouchID prompt; VRF worker runs Shamir 3-pass (or explicit Recovery Mode), derives `WrapKeySeed`, and produces the VRF proof; only the seed + salt cross to the signer.
3. **Signing** – Signer worker derives/decrypts the deterministic NEAR key with the KEK and signs the transaction(s).
4. **Broadcasting** – Wallet broadcasts signed txs to NEAR RPC, receives results, and reconciles nonce.

**Single biometric prompt** per transaction.
:::



## Next Steps

- [VRF WebAuthn](vrf-webauthn) discusses how the VRF-WebAuthn system works
- Read about the [Security Model](security-model)
- Explore [Passkey Scope Strategy](passkey-scope) for deployment options
- Review [Shamir 3-Pass Protocol](../guides/shamir-3-pass-protocol) for the primary 2-of-2 unlock path
