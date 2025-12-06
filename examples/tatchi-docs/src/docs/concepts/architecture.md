---
title: Architecture
---

# Architecture

- [Overview](#overview)
- [Transaction Lifecycle](#transaction-lifecycle)
  - [Registration Flow](#registration-flow)
  - [Login Flow](#login-flow)
  - [Transaction Flow](#transaction-flow)
- [VRF Webauthn](./vrf-webauthn)
- [Passkey Scope](./passkey-scope)

## Overview

The wallet runs in an isolated iframe context, separate from application code. Think of it as a mini web app in an iframe that your app "dials into" for secure operations.

![Iframe Isolation Architecture](/diagrams/architecture.png)

The transaction signing flow follows this lifecycle:
1. **Mount**: SDK creates hidden iframe pointing at wallet origin
2. **Request**: App calls methods like `registerPasskey()` or `signTransactionsWithActions()` by sending typed messages.
3. **User Confirmation**: Wallet routes requests to workers, which requests user TouchId confirmation and mounts UI with transaction payload information.
4. **Execute**: VRF Webauthn verification completes (TouchID) and runs transaction signing operations. Read more about stateless [VRF WebAuthn here](./vrf-webauthn).
5. **Response**: Wallet streams progress events back to your app, then returns signed transaction payloads.

<div style="margin-top: 6rem;"></div>

# Transaction Lifecycle

This sections outlines the core stages of the transaction lifecycle for:
1. registration flows,
2. login flows, and
3. transaction signing flows (webauthn authentication).

Each section illustrates how the wallet handles VRF operations, onchain verification, transaction signing, and dispatch.

## Registration Flow

Registration creates a passkey and derives deterministic keys from it from a single biometric prompt. The flow uses a bootstrap VRF keypair to generate an initial challenge, then derives permanent keys from the passkey's PRF outputs.

```mermaid
sequenceDiagram
    box rgb(243, 244, 246) Iframe Wallet
    participant UI as Wallet (iframe main)
    participant VRF as VRF Worker
    participant Signer as Signer Worker
    end
    participant Relay as Relay
    participant Contract as Web3Authn Contract

    Note over UI,VRF: Single WebAuthn prompt (dual PRF)
    UI->>VRF: requestRegistrationCredentialConfirmation()
    VRF->>UI: TouchID prompt + confirm UI
    UI->>VRF: Credential with PRF outputs
    VRF->>VRF: Derive deterministic VRF keypair + WrapKeySeed + wrapKeySalt<br/>Prepare tx context (nonce, block hash)
    VRF-->>Signer: MessageChannel: WrapKeySeed + wrapKeySalt + PRF.second
    Signer->>Signer: Derive deterministic NEAR keypair<br/>Encrypt near_sk<br/>Sign registration tx
    Signer-->>UI: near_pk + encrypted NEAR key + signed tx
    UI->>Relay: Submit create_account_and_register_user (or direct)
    Relay->>Contract: Forward registration tx
    Contract-->>UI: Registration receipt / txId
    UI->>UI: Store encrypted VRF/NEAR keys + authenticator in IndexedDB
```

::: tip **Steps:**
1. **WebAuthn Registration** – Single prompt via VRF worker confirm UI collects credential with dual PRF.
2. **Derive Deterministic Keys** – VRF worker derives deterministic VRF + WrapKeySeed; sends WrapKeySeed/wrapKeySalt to signer over MessageChannel; signer derives deterministic NEAR key, encrypts it, and signs the registration tx.
3. **Contract Registration** – Signed registration is relayed to the contract; verification happens on-chain.
4. **Client-side Storage** – Encrypted deterministic VRF/NEAR keys and authenticator metadata are stored in the wallet’s IndexedDB.
:::

**Key cryptographic properties:**
- **Origin-bound key derivation** - PRF extension binds all derived keys to the wallet origin
- **Challenge binding** - Bootstrap VRF cryptographically binds fresh NEAR block data (height + hash) to the WebAuthn challenge
- **Atomic verification** - Contract verifies both VRF proof and WebAuthn registration in a single transaction
- **Stateless verification** - No server state required; all verification happens on-chain

We use a bootstrap VRF to avoid forcing two TouchID prompts (one to derive VRF key, another to bind challenge), with the deterministic VRF key generated afterwards.


## Login Flow

Session initialization by unlocking the VRF keypair, enabling subsequent VRF challenge generation without repeated biometric prompts.

During login:

1. (Optional) Shamir 3-pass unlocks VRF keypair without biometric prompt
2. If that fails, WebAuthn ceremony with PRF unlocks VRF keypair
3. VRF keypair decrypted into Web Worker memory
4. Worker can generate challenges without additional prompts

**Login unlocks VRF session** enabling challenge generation without repeated biometric prompts.

### Path A: Shamir 3-Pass Unlock (No Biometric)

```mermaid
sequenceDiagram
    box rgb(243, 244, 246) Iframe Wallet
    participant Wallet as Wallet
    participant Worker as VRF Worker
    end
    participant Relay as Relay Server (Optional)

    Note over Wallet,Worker: Phase 1: Load Encrypted VRF
    Wallet->>Wallet: 1. Retrieve encrypted VRF from IndexedDB

    Note over Wallet,Relay: Phase 2: Shamir 3-Pass Unlock (No TouchID)
    Wallet->>Relay: 2. Request Shamir 3-pass decrypt
    Relay->>Wallet: Server KEK component
    Wallet->>Worker: 3. Decrypt VRF with combined KEK
    Worker->>Worker: 4. VRF keypair loaded into memory
    Worker->>Wallet: 5. VRF session active ✓
    Note over Wallet: No biometric prompt required

    Note over Wallet,Worker: VRF unlocked - ready to generate WebAuthn challenges
```

::: tip **Steps**:
1. Load encrypted VRF keypair from IndexedDB
2. Client wraps the encrypted VRF with its own lock (encryption)
3. Server adds its lock on top, then removes the client's inner lock
4. Server returns the result (still encrypted under server's lock + original client encryption)
5. Client removes server's lock, revealing the VRF encrypted only with client keys
6. Client decrypts using Key Encryption Key (KEK) derived from passkey
7. Load VRF keypair into Web Worker memory
8. VRF session active - ready for challenges

**No biometric prompt required** for this path.
:::

The Shamir 3-pass protocol uses commutative encryption: locks can be added and removed in any order. The server never sees the plaintext VRF key, it only strips its own lock from a doubly-encrypted package, ensuring the VRF remains encrypted at rest client-side while enabling frictionless unlock.

### Path B: WebAuthn PRF Unlock (Biometric Fallback)

```mermaid
sequenceDiagram
    box rgb(243, 244, 246) Iframe Wallet
    participant Wallet as Wallet
    participant Worker as VRF Worker
    end
    participant Relay as Relay Server (Optional)

    Note over Wallet,Worker: Phase 1: Load Encrypted VRF
    Wallet->>Wallet: 1. Retrieve encrypted VRF from IndexedDB

    Note over Wallet,Relay: Phase 2: WebAuthn Unlock (TouchID Fallback)
    Wallet->>Wallet: 2. WebAuthn authentication (TouchID prompt)
    Note over Wallet: PRF extension returns chacha20 output
    Wallet->>Worker: 3. Decrypt VRF with PRF output
    Worker->>Worker: 4. VRF keypair loaded into memory
    Worker->>Wallet: 5. VRF session active ✓
    Note over Wallet,Relay: Optional: Refresh Shamir encryption
    Wallet->>Relay: 6. Store new server-encrypted VRF

    Note over Wallet,Worker: VRF unlocked - ready to generate WebAuthn challenges
```

::: tip **Steps**:
1. Trigger WebAuthn authentication ceremony (TouchID/FaceID)
2. Extract PRF output from WebAuthn response
3. Decrypt VRF keypair using PRF-derived key
4. Load VRF keypair into Web Worker memory
5. VRF session active - ready for challenges
6. (Optional) Re-wrap VRF with new Shamir encryption for future logins

**Single biometric prompt** to unlock the session.
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
- **Session-scoped**: VRF keypair remains in memory for the session
- **Optional Shamir**: Reduces friction without compromising security
- **PRF fallback**: Always works even if Shamir unavailable
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
    UI->>VRF: WebAuthn authentication (TouchID)
    VRF->>VRF: Derive WrapKeySeed; generate VRF proof for contract
    VRF-->>Signer: MessageChannel: WrapKeySeed + wrapKeySalt + PRF.second

    Note over VRF,Signer: Phase 3: Signing in signer worker
    Signer->>Signer: Derive KEK; decrypt/derive deterministic NEAR key
    Signer->>Signer: Sign NEAR transaction(s)
    Signer-->>UI: Signed transaction(s)

    Note over UI,NEAR: Phase 4: Broadcast
    UI->>NEAR: Broadcast signed transaction(s)
    NEAR-->>UI: Transaction result(s)
    UI->>UI: Reconcile nonce (async)
```

::: tip **Steps:**
1. **Preparation** – Validate inputs and fetch nonce/block hash; compute canonical intent digest in the VRF worker.
2. **ConfirmTxFlow** – Single TouchID prompt in the VRF worker; derive WrapKeySeed and VRF proof; send WrapKeySeed/wrapKeySalt to the signer over MessageChannel.
3. **Signing** – Signer worker derives/decrypts the deterministic NEAR key and signs the transaction(s).
4. **Broadcasting** – Wallet broadcasts signed txs to NEAR RPC, receives results, and reconciles nonce.

**Single biometric prompt** per transaction.
:::



## Next Steps

- [VRF WebAuthn](vrf-webauthn) discusses how the VRF webauthn system works
- Read about the [Security Model](security-model)
- Explore [Passkey Scope Strategy](passkey-scope) for deployment options
- Review [Shamir 3-Pass Protocol](../guides/shamir-3-pass-protocol) for frictionless login
