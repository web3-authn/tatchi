---
title: VRF Webauthn
---

# VRF Webauthn

The Web3Authn contract uses **verifiable random function (VRF)** based challenges, enabling stateless and serverless WebAuthn authentication with an onchain contract.

- **Traditional WebAuthn** requires a server to generate challenges, verify signatures, and maintain session state.
- **In Web3Authn** we use VRFs to generate challenges client-side, bind fresh blockchain data for freshness and to verify user presence, and verify both the VRF proof and WebAuthn signature onchain before unlocking wallet keys for transaction signing.


## VRF Challenge Construction

VRF challenges bind fresh blockchain data with user identity to prevent replay attacks. The client-side VRF worker constructs the challenge input by concatenating and hashing these fields:

| Field | Purpose | Source |
|-------|---------|--------|
| `domain_separator` | Prevents cross-protocol collisions | Fixed constant (`"web3_authn_challenge_v3"`) |
| `user_id` | Binds challenge to user identity | Client (NEAR account ID) |
| `relying_party_id` | Binds to origin (e.g., `"example.com"`) | Client config (wallet origin) |
| `block_height` | Ensures freshness and replay protection | NEAR RPC |
| `block_hash` | Prevents reuse across forks/reorgs | NEAR RPC |

These fields are concatenated and SHA-256 hashed client-side, then the VRF proof is generated from the hash. The contract receives:

```rust
pub struct VRFInputComponents {
    pub account_id: String,            // User account for binding
    pub block_height: u64,             // NEAR block height for freshness
    pub challenge_data: Vec<u8>,       // SHA-256 hash of concatenated fields
    pub expiration_block: Option<u64>, // Optional expiration
}
```

**VRF security properties:**
- **Unpredictable** - VRF outputs indistinguishable from random
- **Verifiable** - Anyone can verify the challenge came from the user's public key
- **Non-malleable** - Requires private key to generate valid proofs
- **Fresh** - Blockheight and blockhash bound challenges expire rapidly, preventing replay attacks
- **Account-scoped** - VRF public keys are tied to NEAR accounts onchain

### Meeting WebAuthn Challenge Freshness Requirements

Traditional WebAuthn requires the relying party server to generate unique challenges, store them server-side, and validate them within a timeout window to prevent replay attacks. VRF challenges meet these requirements through cryptographic verification and blockchain state, eliminating the need for server-side storage:

**Challenge Uniqueness**
- Traditional: Server generates cryptographically random nonce for each request
- VRF: Combines `user_id` + `rp_id` + `block_height` + `block_hash` to ensure each challenge is unique. VRF output appears random but is deterministically derived from these inputs.

**Time-Limited Validity**
- Traditional: Server sets timeout and rejects expired challenges
- VRF: `MAX_BLOCK_AGE` window (defaults to 100 blocks ≈ 60 seconds with 600ms NEAR block times) enforces temporal freshness. Challenges older than MAX_BLOCK_AGE are rejected on-chain.

**Stateless Verification**
- Traditional: Server validates signed challenge matches the stored one
- VRF: Contract verifies the VRF proof cryptographically proves the challenge was generated correctly from the claimed input. No storage required.

**Replay Attack Prevention**
- Traditional: Server marks used challenges to prevent reuse
- VRF: Combination of block height freshness and user/origin-specific inputs prevents replay. An attacker cannot reuse a signed challenge because:
  - The block height becomes stale (older than MAX_BLOCK_AGE blocks)
  - The challenge is bound to specific user account and blockchain state
  - The VRF proof cryptographically links the challenge to that exact input (user_id + rp_id + block data)

### Replay Attack Window and Mitigation

**The Time Window:** An attacker who intercepts a valid VRF proof + WebAuthn signature has a narrow window (up to 60 seconds) where the authentication remains valid on-chain. Within this window, they could theoretically replay the authentication (note this is the Webauthn authentication, not the NEAR transactions which have nonces + replay protection).

1. **NEAR Transaction Nonces** - NEAR blockchain has accounts nonces tied to the account's access key. Even if an attacker replays a valid WebAuthn authentication, they cannot replay the same transaction.

2. **Transaction Binding** For additional security, the VRF challenge could include a transaction digest hash, preventing an attacker from substituting different transaction actions while reusing the same authentication.

3. **Include NEAR nonce in VRF challenges** - Alternatively we could include the NEAR nonce in the VRF challenge and make it cryptographically binding, however this requirements nonce synchronization and makes it a bit more difficult to sign concurrent webauthn actions with little extra benefits

### Summary
VRF challenges provide equivalent security to traditional WebAuthn challenge freshness, but verified on-chain without requiring server-side state or challenge storage.


## WebAuthn Contract Verification

During transaction signing, the VRF worker generates a challenge and the user approves with biometric authentication:

**1. Generate VRF challenge**

The WASM worker builds the VRF input from blockchain state and session data, then generates a verifiable challenge:

```ts
const challengeData = await vrfWorker.generate_vrf_challenge({
  user_id: userId,
  rp_id: rpId,
  block_height: blockHeight,
  block_hash: blockHash
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

    // 2. Check freshness (block height within MAX_BLOCK_AGE, default 100 blocks ≈ 60s)
    assert!(vrf_data.block_height >= env::block_height() - MAX_BLOCK_AGE);

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
3. **Freshness** - Validates block height is recent (within MAX_BLOCK_AGE blocks, defaults to 100 blocks ≈ 60 seconds), preventing replay attacks with old challenges
4. **WebAuthn Signature** - Verifies the ECDSA P256 signature against the passkey's public key stored on-chain

**This gives us the following properties:**
- **Atomic verification** - Both VRF and WebAuthn must pass in a single transaction
- **Stateless** - No server state required; all verification happens on-chain
- **Cryptographically bound** - VRF output links blockchain state to biometric authentication
- **Replay protection** - Block-bound challenges prevent reuse


## Next steps

- Explore the [Shamir 3-pass protocol](../guides/shamir-3-pass-protocol) for smoother VRF unlocking UX
- Review [passkey scope strategies](passkey-scope)
