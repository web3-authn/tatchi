---
title: VRF Webauthn
---

# VRF Webauthn

The wallet pairs WebAuthn PRF with **verifiable random function (VRF)** challenges to gate every session on fresh chain data. WebAuthn proves user presence; the VRF proves freshness against NEAR block data. A dual-worker pipeline keeps PRF outputs and `vrf_sk` in the VRF worker and only shares `WrapKeySeed + wrapKeySalt` with the signer worker.

- **Traditional WebAuthn** requires a server to generate challenges, verify signatures, and maintain session state.
- **In Web3Authn** the VRF worker generates challenges client-side, binds them to NEAR block data, and the contract verifies the VRF proof + WebAuthn signature together before any transaction signing.


## VRF Challenge Construction

VRF challenges bind fresh blockchain data to prevent replay attacks. The VRF worker builds the input from NEAR chain state:

| Field | Purpose | Source |
|-------|---------|--------|
| `domain_separator` | Prevents cross-protocol collisions | Fixed constant (`"web3_authn_vrf_challenge_v1"`) |
| `user_id` | Binds challenge to the NEAR account | Client (NEAR account ID) |
| `relying_party_id` | Binds to the wallet origin | Client config (wallet origin / rpId) |
| `block_height` | Enforces freshness window | NEAR RPC |
| `block_hash` | Protects across forks/reorgs | NEAR RPC |

The challenge input is `hash(domain_separator || user_id || rp_id || block_height || block_hash)`. Canonical intents (`{receiverId, actions}` only) are enforced separately before signing to avoid payload tampering.

**VRF security properties:**
- **Unpredictable** - VRF outputs indistinguishable from random
- **Verifiable** - Anyone can verify the challenge came from the user's public key
- **Non-malleable** - Requires private key to generate valid proofs
- **Fresh** - Blockheight and blockhash bound challenges expire rapidly, preventing replay attacks
- **Account-scoped** - VRF public keys are tied to NEAR accounts onchain

### Meeting WebAuthn Challenge Freshness Requirements

Traditional WebAuthn requires a server to mint and track challenges. VRF challenges meet these requirements via blockchain state and on-chain verification—no server storage needed:

**Challenge Uniqueness**
- Traditional: Server generates cryptographically random nonce for each request
- VRF: Combines `domain_separator` + `user_id` + `rp_id` + `block_height` + `block_hash`; the VRF output is deterministic for that exact chain state and origin but indistinguishable from random.

**Time-Limited Validity**
- Traditional: Server sets timeout and rejects expired challenges
- VRF: the contract enforces a block-height freshness window on-chain. Older challenges are rejected.

**Stateless Verification**
- Traditional: Server validates signed challenge matches the stored one
- VRF: Contract recomputes the VRF input and verifies the proof; no storage required.

**Replay Attack Prevention**
- Traditional: Server marks used challenges to prevent reuse
- VRF: Combination of block height freshness and account/origin-bound inputs prevents replay. An attacker cannot reuse a signed challenge because:
  - The block height becomes stale (outside the contract’s freshness window)
  - The challenge is bound to a specific user account, origin, and blockchain state
  - The VRF proof cryptographically links the challenge to that exact input (user_id + rp_id + block data)

### Replay Attack Window and Mitigation

**The Time Window:** An attacker who intercepts a valid VRF proof + WebAuthn signature has a narrow window (up to 60 seconds). Within this window, they could try to replay the authentication (WebAuthn approval—not the NEAR transaction, which has nonce protection).

1. **NEAR Transaction Nonces** - NEAR blockchain has accounts nonces tied to the account's access key. Even if an attacker replays a valid WebAuthn authentication, they cannot replay the same transaction.

2. **Transaction Binding** For additional security, the VRF challenge could include a transaction digest hash, preventing an attacker from substituting different transaction actions while reusing the same authentication.

3. **Include NEAR nonce in VRF challenges** - Alternatively we could include the NEAR nonce in the VRF challenge and make it cryptographically binding, however this requirements nonce synchronization and makes it a bit more difficult to sign concurrent webauthn actions with little extra benefits

### Summary
VRF challenges provide equivalent security to traditional WebAuthn challenge freshness, but verified on-chain without requiring server-side state or challenge storage.


## WebAuthn Contract Verification

During transaction signing, the VRF worker generates a challenge and the user approves with biometric authentication. The contract verifies both artifacts before the signer worker receives `WrapKeySeed`.

**1. Generate VRF challenge**

The WASM worker builds the VRF input from blockchain state and session data, then generates a verifiable challenge:

```ts
const challengeData = await vrfWorker.generate_vrf_challenge({
  user_id: userId,
  rp_id: rpId,
  block_height: blockHeight,
  block_hash: blockHash,
})
// Returns: { vrf_output, vrf_proof, vrf_input, vrf_public_key, ... }
```

**2. WebAuthn authentication**

The VRF output is used as the WebAuthn challenge, binding the VRF proof to the biometric signature:

```ts
const credential = await navigator.credentials.get({
  publicKey: {
    challenge: challengeData.vrf_output,  // VRF output as challenge
    // ... other options
  }
})
```

**3. Submit to WebAuthn Contract for verification**

The transaction includes both the VRF proof and WebAuthn signature for atomic onchain verification:

```rust
// Contract method signature
    pub fn verify_authentication_response(
        &self,
        vrf_data: VRFVerificationData,
        webauthn_authentication: WebAuthnAuthenticationCredential,
    ) -> VerifiedAuthenticationResponse
```

See the [Web3Authn contract section](../api/web3authn-contract.md) for implementation details.

The WASM signer worker waits for the Web3Authn contract verification of both the VRF proof and WebAuthn signature, before signing any transactions:

```rust
// Simplified verification flow
fn verify_authentication_response(vrf_data, webauthn_authentication) {
    // 1. Verify VRF proof against stored public key
    let vrf_output = vrf_verify(user_vrf_pubkey, vrf_data.input, vrf_data.proof)?;

    // 2. Check freshness (block height within the contract's configured window)
    assert!(is_fresh(vrf_data.block_height));

    // 3. Verify WebAuthn P256 signature against stored passkey
    verify_webauthn_signature(
        passkey_pubkey,
        webauthn_authentication,
        vrf_output  // Challenge must match VRF output
    )?;

    // 4. Return verified response
}
```

**The contract verifies:**

1. **VRF Proof** - Verifies the proof matches the user's VRF public key stored on-chain, confirming the challenge was generated by the correct private key
2. **Challenge Binding** - Ensures the WebAuthn challenge equals the VRF output, preventing challenge substitution attacks
3. **Freshness** - Validates block height is recent (within the contract’s freshness window), preventing replay attacks with old challenges
4. **WebAuthn Signature** - Verifies the ECDSA P256 signature against the passkey's public key stored on-chain

**This gives us the following properties:**
- **Atomic verification** - Both VRF and WebAuthn must pass in a single transaction
- **Stateless** - No server state required; all verification happens on-chain
- **Cryptographically bound** - VRF output links blockchain state to biometric authentication
- **Replay protection** - Block-bound challenges prevent reuse


## Hybrid session unlock (VRF + WebAuthn + Shamir)

After verification succeeds, the wallet derives the unwrapping key entirely inside workers:

1. **PRF.first_auth** – Fresh TouchID/WebAuthn in the VRF worker yields `PRF.first_auth`.
2. **Primary: Shamir 3-pass** – VRF worker derives `shareA` from `PRF.first_auth`, runs the relay round trips, and reconstructs `vrf_sk`. Backup Recovery Mode re-derives `vrf_sk` from `PRF.second` only when explicitly requested.
3. **WrapKeySeed** – VRF worker derives `WrapKeySeed = HKDF(PRF.first_auth || vrf_sk, "near-wrap-seed")`.
4. **KEK** – Signer worker receives only `WrapKeySeed + wrapKeySalt` over a dedicated `MessageChannel` and derives `KEK = HKDF(WrapKeySeed, wrapKeySalt)`.
5. **Decrypt + sign** – Signer worker decrypts `near_sk` with `KEK`, signs the NEAR transaction(s), and zeroizes secrets after the session.

**Isolation guarantees**
- PRF outputs and `vrf_sk` never leave the VRF worker.
- Only `WrapKeySeed + wrapKeySalt` cross the worker boundary; main thread JS never sees `WrapKeySeed` or `near_sk`.
- PRF.second is reserved for registration/device linking/recovery and is zeroized immediately after use.


## Next steps

- Explore the [Shamir 3-pass protocol](../guides/shamir-3-pass-protocol) for smoother VRF unlocking UX
- Review [passkey scope strategies](passkey-scope)
