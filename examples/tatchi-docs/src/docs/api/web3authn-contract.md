---
title: Web3Authn Contract
---

# Web3Authn Contract

The Web3Authn contract implements verifiable random function (VRF) based WebAuthn authentication on NEAR blockchain, enabling serverless passkey wallets with onchain authenticator storage.

See the [contract repository](https://github.com/web3-authn/web3-authn-contract) for deployment instructions and full API documentation.

## Main Contract Methods

### Registration

```rust
// Combines NEAR account creation and registration into 1 atomic step
pub fn create_account_and_register_user(
    &mut self,
    new_account_id: AccountId,
    new_public_key: PublicKey,
    vrf_data: VRFVerificationData,
    webauthn_registration: WebAuthnRegistrationCredential,
    deterministic_vrf_public_key: Vec<u8>,
    authenticator_options: Option<AuthenticatorOptions>,
) -> Promise
```

::: info
A relayer is needed to pay gas for initial account creation and registration. This is the only part that requires a relayer server (anyone can run a relayer).  Since it's creating accounts, it needs to know which `new_account_id` to associate to `new_public_key`. The client checks that this is correct before persisting and saving the account locally.

After account creation, the protocol is fully serverless.
:::


### Authentication

```rust
// Verify VRF-backed WebAuthn authentication
pub fn verify_authentication_response(
    vrf_data: VRFVerificationData,
    webauthn_authentication: WebAuthnAuthenticationCredential,
) -> VerifiedAuthenticationResponse

/// SHA256 hash of concatenated VRF input components:
/// domain_separator + user_id + rp_id + block_height + block_hash
pub struct VRFVerificationData {
    /// This hashed data is used for VRF proof verification
    pub vrf_input_data: Vec<u8>,
    /// Used as the WebAuthn challenge (VRF output)
    pub vrf_output: Vec<u8>,
    /// Proves vrf_output was correctly derived from vrf_input_data
    pub vrf_proof: Vec<u8>,
    /// VRF public key used to verify the proof
    pub public_key: Vec<u8>,
    /// User ID (account_id in NEAR protocol) - cryptographically bound in VRF input
    pub user_id: String,
    /// Relying Party ID (domain) used in VRF input construction
    pub rp_id: String,
    /// Block height for freshness validation (must be recent)
    pub block_height: u64,
    /// Block hash included in VRF input for additional entropy
    pub block_hash: Vec<u8>,
}
```

The `webauthn_registration` and `webauthn_authentication` types are standard WebAuthn credentials, generated in the browser with PRF extensions via `navigator.credentials` and TouchID. The PRF outputs are redacted so it's not revealed publicly.

These WebAuthn credentials are signed with a challenge: we use verifiable random function (VRF) outputs as challenges see [VRF WebAuthn](../concepts/vrf-webauthn.md), signed over a hash digest of the following data:

| Field | Purpose | Source |
|-------|---------|--------|
| `domain_separator` | Prevents cross-protocol collisions | Fixed constant (`"web3_authn_challenge_v3"`) |
| `user_id` | Binds challenge to user identity | Client session |
| `rp_id` | Binds to origin (e.g., `"example.com"`) | Client config |
| `block_height` | Ensures freshness and replay protection | NEAR RPC |
| `block_hash` | Prevents reuse across forks/reorgs | NEAR RPC |

In order for contract verification to pass, both `vrf_data` proofs and the `webauthn_authentication` checks must pass.

Additionally, the contract enforces an **account binding** between the NEAR account ID and the VRF input:

```rust
assert!(
    account_id.as_str() == vrf_data.user_id,
    "account_id must equal vrf_data.user_id"
);
```

Here `vrf_data.user_id` is the NEAR account ID that was included in the VRF input and is therefore cryptographically bound to the VRF output (which becomes the WebAuthn challenge). The effect is:

- `new_account_id` must equal `vrf_data.user_id`, and  
- the VRF proof ties that `user_id` to the WebAuthn challenge.

This ensures the account being created or authenticated is exactly the one encoded in the VRF/WebAuthn pair, preventing credential reuse across accounts.


## Integration

The SDK provides a WASM worker that handles contract calls, key decryption, and transaction signing. See the [Getting Started](/docs/getting-started/overview) guide for integration details.
