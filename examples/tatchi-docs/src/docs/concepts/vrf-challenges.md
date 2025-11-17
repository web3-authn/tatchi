---
title: VRF, PRF & Challenge Construction
---

# VRF, PRF & Challenge Construction

The wallet uses cryptographic building blocks to keep keys secure and transactions verifiable. This page explains the pieces and how they fit together.

You don't need to know the underlying math—understanding *why* these exist helps you reason about security and debug issues.

## The building blocks

**PRF (Pseudorandom Function)** - A WebAuthn extension that provides origin-bound secret material.

**VRF (Verifiable Random Function)** - Used with NEAR blockchain data to build verifiable challenges.

**[Shamir 3-pass](shamir-3pass)** - An optional protocol for smoother login without repeated biometric prompts.

Together, these enable:

- Deterministic key derivation bound to origins
- Fresh, verifiable challenges tied to blockchain state
- Session-like UX without sacrificing security

## The user journey

Here's how these pieces work across registration, login, and signing:

### Registration (One-Time Setup)

1. WebAuthn PRF output derives NEAR and VRF keys
2. VRF keypair generated and stored in Web Worker memory
3. VRF output becomes the WebAuthn challenge
4. Keys encrypted and stored in IndexedDB
5. (Optional) VRF key wrapped under Shamir KEK

**Single passkey prompt** for entire registration.

### Login (Session Initialization)

1. (Optional) Shamir 3-pass unlocks VRF keypair without biometric prompt
2. If that fails, WebAuthn ceremony with PRF unlocks VRF keypair
3. VRF keypair decrypted into Web Worker memory
4. Worker can generate challenges without additional prompts

**Single passkey prompt** to unlock VRF session.

### Signing and Transactions

1. VRF worker builds challenge from:
   - User and session identifiers
   - Relying party ID
   - Fresh NEAR block data (height + hash)
2. VRF generates output + proof (no additional prompt)
3. Output becomes WebAuthn challenge
4. User confirms with biometric
5. Proof verified on-chain with WebAuthn response

**Single passkey prompt** per transaction.

---

## WebAuthn PRF - origin-bound secrets

We need high-entropy bytes that are:

- Bound to the WebAuthn credential and origin
- Impossible to guess
- Re-derivable when a user logs in again
- Never exposed to untrusted code

WebAuthn defines a PRF (Pseudorandom Function) extension that returns pseudorandom bytes tied to:

- The specific credential
- The relying party ID (`rpId`)

Think of it as "secret material that only this origin can request via WebAuthn."

**Deriving NEAR keys:**

The wallet combines PRF output with an account-specific salt:

```
PRF output + account salt → NEAR keypair (deterministic)
```

This makes key derivation:

- Deterministic for a given account + credential
- Different across accounts (via the salt)
- Bound to the origin (via the `rpId`)

**Encrypting keys at rest:**

PRF output is fed into a key derivation function (like HKDF):

```
PRF output → KDF → encryption keys
```

These keys encrypt private keys before storing them in IndexedDB.

**Security properties:**

- PRF output never leaves the wallet origin
- Your app never sees it
- Relay servers never see it
- It's only available via WebAuthn ceremonies

**Key takeaway:** PRF gives us deterministic, origin-bound key material without managing passwords or separate key storage.

---

## VRF - verifiable randomness

When building a WebAuthn challenge, we want it to be:

- Fresh (tied to current blockchain state)
- Unique per user and session
- Verifiable on-chain without server-side state
- Impossible to replay or forge

A **Verifiable Random Function (VRF)** is like a keyed hash that produces:

- A random-looking **output**
- A **proof** that the output came from a specific input and key

Anyone with the VRF public key can verify the proof and confirm:

- The output matches the given input
- No one tampered with it
- It came from the holder of the VRF private key

**Challenge construction:**

For each WebAuthn ceremony, the wallet:

1. Collects inputs:
   - Domain separator (e.g., `web3_authn_vrf_challenge_v1`)
   - User ID
   - Session ID
   - Relying party ID (`rpId`)
   - NEAR block height and hash
   - Optional timestamp
2. Concatenates and hashes these inputs
3. Sends the hash to the VRF worker
4. Receives `output` + `proof`

The **output** becomes the WebAuthn challenge. The **proof** is later verified by the smart contract.

**On-chain verification:**

When a transaction reaches the contract:

1. Contract receives the VRF proof and input
2. Contract verifies the proof against the user's VRF public key
3. Contract checks the block height is recent (not too old, not from a fork)
4. Contract verifies the WebAuthn response against the challenge (VRF output)

If any step fails, the transaction is rejected.

**Key takeaway:** VRF lets contracts verify challenges without storing server-side state or trusting external oracles.

---

## VRF-backed WebAuthn challenges

### Challenge input components

| Field | Purpose |
|-------|---------|
| **Domain separator** | Prevents cross-protocol reuse |
| **User ID** | Binds challenge to a specific user |
| **Session ID** | Keeps challenges unique per browser session |
| **Relying party ID** | Pins challenge to expected origin |
| **Block height + hash** | Provides freshness and fork protection |
| **Timestamp** | Supports audit logs and expiry logic |

All fields are concatenated and hashed before being passed to the VRF.

### Flow in detail

**1. Build the input**

```ts
const input = concat(
  DOMAIN_SEPARATOR,
  userId,
  sessionId,
  rpId,
  blockHeight,
  blockHash,
  timestamp
)
const inputHash = sha256(input)
```

**2. Generate VRF output and proof**

```ts
const { output, proof } = vrfWorker.evaluate(inputHash)
```

**3. Use output as WebAuthn challenge**

```ts
const credential = await navigator.credentials.create({
  publicKey: {
    challenge: output,  // VRF output
    // ... other options
  }
})
```

**4. Send proof to contract**

When submitting the transaction:

```ts
contract.verify_and_execute({
  vrf_input: input,
  vrf_proof: proof,
  webauthn_response: credential.response,
  // ...
})
```

**5. Contract verification**

```rust
// Pseudocode
fn verify_and_execute(input, proof, webauthn_response) {
    // Verify VRF proof
    let output = vrf_verify(user_vrf_pubkey, input, proof)?;

    // Check block data is recent
    assert!(input.block_height >= env::block_height() - MAX_AGE);

    // Verify WebAuthn response
    verify_webauthn(webauthn_response, output)?;

    // Execute transaction
    execute(...);
}
```

### Security properties

**Uniqueness:** Domain separator, user ID, and session ID ensure each challenge is unique.

**Origin binding:** Including `rpId` reinforces phishing protection by pinning challenges to the expected origin.

**Freshness:** Block height and hash let contracts reject old or off-fork challenges.

**Non-repudiation:** The VRF proof shows the challenge came from the correct key and input.

**No server state:** Contracts verify challenges directly using VRF proofs—no database lookups needed.

**Secret hygiene:** The VRF private key lives only in WASM worker memory inside the wallet origin.

**Key takeaway:** VRF challenges turn blockchain data into verifiable, fresh, unique WebAuthn challenges.

---

## Detailed flow diagrams

### VRF Registration Flow

![VRF Registration Flow](/diagrams/vrf-registration-flow.svg)

**Key points:**
- Single passkey prompt for entire registration
- VRF keypair generated, used for challenge, then encrypted with PRF output
- Contract verifies VRF proof and WebAuthn registration atomically

### VRF Login Flow

![VRF Login Flow](/diagrams/vrf-login-flow.svg)

**Key points:**
- Single passkey prompt to unlock VRF session
- VRF keypair decrypted into Web Worker memory
- Worker can generate challenges without additional user prompts

### VRF Authentication Flow

![VRF Authentication Flow](/diagrams/vrf-authentication-flow.svg)

**Key points:**
- Single passkey prompt per authentication
- Worker generates VRF challenge automatically (no additional prompt)
- Contract verifies VRF proof and WebAuthn authentication atomically

---

## Security model

**VRF Guarantees:**
- **Unpredictability**: outputs indistinguishable from random
- **Verifiability**: anyone can verify proof validity
- **Uniqueness**: deterministic for same input
- **Non-malleability**: requires private key to generate proofs

**WASM Isolation:**
- VRF private keys secured in WASM linear memory
- No JavaScript access to sensitive key material
- Sandboxed execution environment
- Keys zeroized immediately after use

**NEAR Integration:**
- Block height/hash provide freshness and fork protection
- VRF public keys bound to account IDs
- On-chain verification of all proofs
- No server-side state required

**WebAuthn Security:**
- Origin binding via RP ID in VRF input
- User presence/verification flags validated
- Signature verification (ECDSA/EdDSA)
- Biometric prompts scoped to wallet origin

---

## Putting it all together

Here's how PRF, VRF, and Shamir 3-pass work together:

### First-time registration

```
1. User creates passkey → WebAuthn returns PRF output
2. Derive NEAR keys from PRF output
3. Generate VRF keypair
4. Encrypt VRF keypair with random KEK
5. (Optional) Wrap KEK with Shamir 3-pass
6. Store encrypted data in IndexedDB
```

### Subsequent login

```
1. Try Shamir 3-pass unlock (no biometric prompt)
2. If successful, VRF keypair loaded in worker
3. If failed, fall back to PRF-based unlock
4. Check for key rotation and re-wrap if needed
```

### Every transaction

```
1. Fetch fresh NEAR block data
2. Build VRF input from user/session/rpId/block data
3. VRF worker generates output + proof
4. Use output as WebAuthn challenge
5. User approves with biometric
6. Send VRF proof + WebAuthn response to contract
7. Contract verifies both before executing
```

## Summary

The wallet uses:

- **WebAuthn PRF** to derive and protect keys bound to origins
- **VRF** to build blockchain-aware, verifiable WebAuthn challenges
- **Shamir 3-pass** to reduce biometric prompts without leaking secrets

Together these provide:

- Strong origin binding
- Fresh, verifiable challenges
- No server-side state
- Practical user experience
- Defense in depth

You get cryptographic guarantees without managing passwords, storing challenges, or trusting external oracles.

## Next steps

- Explore the [Shamir 3-pass protocol](shamir-3pass) for smoother login UX
- Learn how the [nonce manager](../guides/nonce-manager.md) prevents transaction replay
- Review [credential scope strategies](wallet-scoped-credentials)
