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
- [Credential Scope](./credential-scope-rpid)

## Overview

The wallet runs in an isolated iframe context, separate from application code. Think of it as a mini web app in an iframe that your app "dials into" for secure operations.

![Iframe Isolation Architecture](/diagrams/architecture.png)

The transaction signing flow follows this lifecycle:
1. **Mount**: SDK creates hidden iframe pointing at wallet origin
2. **Request**: App calls methods like `registerPasskey()` or `signTransactionsWithActions()` by sending typed messages.
3. **User Confirmation**: Wallet routes requests to workers, which requests user TouchId confirmation and mounts UI with transaction payload information.
4. **Execute**: Webauthn verification completes (TouchID) and runs WebAuthn/VRF/NEAR operations
5. **Response**: Wallet streams progress events back to your app, then returns signed transaction payloads.

<div style="margin-top: 6rem;"></div>

# Transaction Lifecycle

This sections outlines the core stages of the transaction lifecycle for:
1. registration flows,
2. login flows, and
3. transaction signing flows (webauthn authentication).

Each section illustrates how the wallet handles key derivation, VRF operations, and on-chain verification.

## Registration Flow

First-time registration with key derivation, VRF keypair generation, and on-chain authenticator storage.

During registration:

1. WebAuthn PRF output derives NEAR and VRF keys
2. VRF keypair generated and stored in Web Worker memory
3. VRF output becomes the WebAuthn challenge
4. Keys encrypted and stored in IndexedDB
5. (Optional) VRF key wrapped under Shamir KEK

**Single passkey prompt** for entire registration.

![Registration Flow](/diagrams/contract-registration-flow.svg)

- **Single passkey prompt** for entire registration
- **Bootstrap VRF keypair** generates initial challenge
- **Dual PRF outputs** (chacha20 + ed25519) derive deterministic keys
- **Deterministic VRF keypair** encrypted with ChaCha20-Poly1305
- **NEAR keypair** encrypted with ChaCha20-Poly1305
- **Contract verifies** VRF proof and WebAuthn registration atomically


- **Origin binding**: PRF output is bound to the wallet origin
- **Deterministic derivation**: Keys can be re-derived from the same passkey
- **Encrypted storage**: All keys stored encrypted in IndexedDB
- **On-chain verification**: Contract validates VRF proof and WebAuthn response
- **No server secrets**: All cryptographic operations happen client-side

## Login Flow

Session initialization by unlocking the VRF keypair, enabling subsequent authentication operations without repeated biometric prompts.

During login:

1. (Optional) Shamir 3-pass unlocks VRF keypair without biometric prompt
2. If that fails, WebAuthn ceremony with PRF unlocks VRF keypair
3. VRF keypair decrypted into Web Worker memory
4. Worker can generate challenges without additional prompts

**Login unlocks VRF session** enabling challenge generation without repeated biometric prompts.

### Path A: Shamir 3-Pass Unlock (No Biometric)

![Login Option A: Shamir 3-Pass](/diagrams/login-option-a-shamir.svg)

1. Load encrypted VRF keypair from IndexedDB
2. Request server KEK component via Shamir 3-pass protocol
3. Combine KEK components and decrypt VRF keypair
4. Load VRF keypair into Web Worker memory
5. VRF session active - ready for challenges

**No biometric prompt required** for this path.

### Path B: WebAuthn PRF Unlock (Biometric Fallback)

![Login Option B: WebAuthn PRF](/diagrams/login-option-b-webauthn.svg)

1. Trigger WebAuthn authentication ceremony (TouchID/FaceID)
2. Extract PRF output from WebAuthn response
3. Decrypt VRF keypair using PRF-derived key
4. Load VRF keypair into Web Worker memory
5. VRF session active - ready for challenges
6. (Optional) Re-wrap VRF with new Shamir encryption for future logins

**Single biometric prompt** to unlock the session.

### Optional: JWT Session Token

After login, you can optionally mint a JWT session token for web2 authentication:

![Login Optional: JWT Token](/diagrams/login-optional-jwt.svg)

**Security properties:**
- **VRF stays in worker**: Never exposed to main thread
- **Session-scoped**: VRF keypair remains in memory for the session
- **Optional Shamir**: Reduces friction without compromising security
- **PRF fallback**: Always works even if Shamir unavailable


## Transaction Flow

During transaction signing:

1. VRF worker builds challenge from:
   - User and session identifiers
   - Relying party ID
   - Fresh NEAR block data (height + hash)
2. VRF generates output + proof (no additional prompt)
3. Output becomes the WebAuthn challenge
4. User confirms with biometric
5. Proof verified on-chain with WebAuthn response

**Single passkey prompt** per transaction.

![Transaction Flow](/diagrams/contract-transaction-flow.svg)

- **Single passkey prompt** per authentication
- **Worker generates VRF challenge automatically** (no additional prompt)
- **Contract verifies** VRF proof and WebAuthn authentication atomically
- **Fresh block data** ensures challenge freshness
- **On-chain verification** validates both VRF proof and WebAuthn response

### Challenge Construction

The VRF challenge includes:

| Component | Purpose |
|-----------|---------|
| **Domain separator** | Prevents cross-protocol reuse |
| **User ID** | Binds challenge to specific user |
| **Session ID** | Keeps challenges unique per session |
| **Relying party ID** | Pins challenge to expected origin |
| **Block height + hash** | Provides freshness and fork protection |
| **Timestamp** | Supports audit logs and expiry logic |

### Security Properties

- **Freshness**: Block height ensures challenges aren't replayed
- **Origin binding**: rpId in VRF input reinforces phishing protection
- **Verifiability**: Contract verifies VRF proof on-chain
- **No server state**: Challenge verification requires no database
- **User presence**: WebAuthn ensures real user approval



## Next Steps

- Learn about [VRF WebAuthn](vrf-webauthn) cryptographic primitives
- Understand the [Security Model](security-model) for defense-in-depth approach
- Review [Shamir 3-Pass Protocol](../guides/shamir-3-pass-protocol) for frictionless login
- Explore [Credential Scope Strategy](credential-scope-rpid) for deployment options
