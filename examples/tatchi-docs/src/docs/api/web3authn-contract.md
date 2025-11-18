# Web3Authn Contract

The Web3Authn contract implements VRF-based WebAuthn authentication on NEAR blockchain, enabling serverless passkey wallets with on-chain credential storage.

**Source**: [github.com/web3-authn/web3-authn-contract](https://github.com/web3-authn/web3-authn-contract)

## Overview

**Features:**
- Passkey authenticators stored on-chain (no server required for recovery)
- VRF-based challenges eliminate server roundtrips for WebAuthn
- Deterministic wallet derivation from passkey PRF credentials
- Multi-device linking and passkey sync support (Google, Apple)


## VRF Challenge Construction

Challenges bind fresh blockchain data with user identity:

| Field | Purpose | Source |
|-------|---------|--------|
| `domain_separator` | Prevents cross-protocol collisions | Fixed constant (`"web3_authn_challenge_v3"`) |
| `user_id` | Binds challenge to user identity | Client session |
| `relying_party_id` | Binds to origin (e.g., `"example.com"`) | Client config |
| `block_height` | Ensures freshness and replay protection | NEAR RPC |
| `block_hash` | Prevents reuse across forks/reorgs | NEAR RPC |

**VRF security properties:**
- Unpredictable outputs (indistinguishable from random)
- Verifiable proofs (anyone can verify with public key)
- Deterministic (same input → same output)
- Non-malleable (requires private key to forge)
- Block-bound freshness (challenges expire with old blocks)
- Account-bound (VRF public keys tied to NEAR accounts)

## Contract Methods

### Registration

```rust
// Combined account creation and registration
create_account_and_register_user(
    new_account_id: AccountId,
    new_public_key: PublicKey,
    vrf_data: VrfData,
    webauthn_registration: PublicKeyCredentialJSON,
    deterministic_vrf_public_key: Vec<u8>
)

// Register VRF credentials for existing account
verify_registration_response(
    vrf_data: VrfData,
    webauthn_data: PublicKeyCredentialJSON
)
```

### Authentication

```rust
// Verify VRF-backed WebAuthn authentication
verify_authentication_response(
    vrf_data: VrfData,
    webauthn_data: PublicKeyCredentialJSON
)
```

See the [contract repository](https://github.com/web3-authn/web3-authn-contract) for deployment instructions and full API documentation.

## Integration

The SDK provides a WASM worker that handles contract calls, key decryption, and transaction signing. See the [Getting Started](/docs/getting-started/overview) guide for integration details.
