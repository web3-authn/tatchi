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
    participant JSMain as JS Main Thread
    participant Worker as WASM Worker
    end
    participant NEAR as NEAR RPC
    participant Contract as Web3Authn Contract

    Note over JSMain,Worker: Phase 1: Bootstrap VRF Challenge
    JSMain->>NEAR: 1. Get block height + hash from RPC
    NEAR->>JSMain: Block data
    JSMain->>Worker: 2. generateVrfKeypairBootstrap()
    Worker->>Worker: 3. Generate bootstrap VRF keypair (temporary)
    Worker->>Worker: 4. Generate VRF proof + output (challenge)
    Worker->>JSMain: 5. VRF challenge for WebAuthn ceremony

    Note over JSMain,Worker: Phase 2: WebAuthn Registration with Dual PRF
    JSMain->>Worker: 6. requestRegistrationCredentialConfirmation()
    Note over Worker: WebAuthn registration (TouchID prompt)<br/>PRF extension returns dual outputs:<br/>first=chacha20, second=ed25519
    Worker->>JSMain: Registration credential

    Note over JSMain,Worker: Phase 3: Derive Deterministic Keys from PRF
    JSMain->>Worker: 7. deriveVrfKeypairFromRawPrf(ed25519PrfOutput)
    Worker->>Worker: 8. Derive deterministic VRF keypair from PRF
    Worker->>Worker: 9. Encrypt deterministic VRF with ChaCha20-Poly1305
    Worker->>JSMain: 10. Encrypted deterministic VRF keypair

    JSMain->>Worker: 11. deriveNearKeypairFromDualPrf(chacha20PrfOutput)
    Worker->>Worker: 12. Derive NEAR ed25519 keypair from PRF
    Worker->>Worker: 13. Encrypt NEAR keypair with ChaCha20-Poly1305
    Worker->>JSMain: 14. NEAR public key + encrypted keypair

    Note over JSMain,Contract: Phase 4: Contract Registration
    Note over JSMain: Routed through relayer to pay for gas
    JSMain->>Contract: 15. create_account_and_register_user()
    Contract->>Contract: 16. Registration verified, authenticator stored onchain ✓
    Contract->>JSMain: 17. Registration complete (txId)

    Note over JSMain,Worker: Phase 5: Client-side Storage
    JSMain->>JSMain: 18. Store encrypted deterministic VRF in IndexedDB
    JSMain->>JSMain: 19. Store encrypted NEAR keypair in IndexedDB
    JSMain->>JSMain: 20. Registration complete ✓
```

::: tip **Steps:**
1. **Bootstrap VRF Challenge** - Fetch fresh NEAR block data and generate a temporary VRF keypair in the WASM worker to create the initial WebAuthn challenge.

2. **WebAuthn Registration** - Request passkey creation with dual PRF extension (returns two outputs: one for ChaCha20 encryption, one for ed25519 derivation). This is the **only biometric prompt** in the entire flow.

3. **Derive Deterministic Keys** - Use the PRF outputs to deterministically derive:
   - A permanent VRF keypair (from PRF first output)
   - A NEAR ed25519 keypair (from PRF second output)
   - Encrypt both keypairs with ChaCha20-Poly1305 before storage

4. **Contract Registration** - Submit the WebAuthn registration response to the NEAR smart contract, which verifies and stores the passkey's public key on-chain.

5. **Client-side Storage** - Store both encrypted keypairs in isolated wallet origin-scoped IndexedDB for future use.
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
    participant JSMain as JS Main Thread
    participant Worker as WASM Worker
    end
    participant NEAR as NEAR RPC
    participant Contract as Web3Authn Contract

    Note over JSMain,Worker: Phase 1: Preparation
    JSMain->>JSMain: 1. Validate action inputs
    JSMain->>JSMain: 2. Pre-warm NonceManager (async)

    Note over JSMain,Worker: Phase 2: User Confirmation & VRF Challenge
    JSMain->>Worker: 3. Request user confirmation
    Note over Worker: UI mounts showing transaction details
    Worker->>NEAR: 4. Get nonce, block height + hash
    NEAR->>Worker: Block data + nonce
    Worker->>Worker: 5. Generate VRF challenge (no TouchID)

    Note over JSMain,Worker: Phase 3: WebAuthn Authentication
    Worker->>Worker: 6. WebAuthn authentication (TouchID prompt)
    Worker->>Contract: 7. verify_authentication_response(vrf_data, webauthn_authentication)
    Contract->>Contract: 8. Verify VRF proof against stored VRF pubkey ✓
    Contract->>Contract: 9. Check freshness (block_height within MAX_BLOCK_AGE) ✓
    Contract->>Contract: 10. Verify WebAuthn signature against stored passkey ✓
    Contract->>Worker: 11. Authentication verified ✓

    Note over JSMain,Worker: Phase 4: Transaction Signing
    Worker->>Worker: 12. Sign NEAR transaction with ed25519 keypair
    Worker->>JSMain: 13. Signed transaction

    Note over JSMain,NEAR: Phase 5: Broadcasting
    JSMain->>NEAR: 14. Broadcast signed transaction
    NEAR->>JSMain: 15. Transaction result (txId)
    JSMain->>JSMain: 16. Update nonce from blockchain (async)
    JSMain->>JSMain: 17. Transaction complete ✓
```

::: tip **Steps:**
1. **Preparation** - Validate action inputs and pre-warm the NonceManager to optimize nonce fetching for upcoming transactions.

2. **User Confirmation & VRF Challenge** - Request user confirmation by mounting the wallet UI with transaction details. Fetch fresh NEAR block data (nonce, block height + hash) and generate VRF challenge without prompting for biometric.

3. **WebAuthn Authentication** - User confirms transaction in wallet UI, triggering TouchID/FaceID prompt. Submit VRF proof + WebAuthn signature to Web3Authn contract for atomic on-chain verification (VRF proof, freshness check, WebAuthn signature).

4. **Transaction Signing** - After successful authentication, sign NEAR transaction with ed25519 keypair in the WASM worker.

5. **Broadcasting** - Broadcast signed transaction to NEAR RPC, receive transaction result, and asynchronously reconcile nonces from blockchain.

**Single biometric prompt** per transaction.
:::



## Next Steps

- [VRF WebAuthn](vrf-webauthn) discusses how the VRF webauthn system works
- Read about the [Security Model](security-model)
- Explore [Passkey Scope Strategy](passkey-scope) for deployment options
- Review [Shamir 3-Pass Protocol](../guides/shamir-3-pass-protocol) for frictionless login
