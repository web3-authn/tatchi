# NEP-413 Message Signing Implementation Analysis

This document analyzes the feasibility of implementing NEP-413 message signing in the WASM signer worker.

## NEP-413 Specification Summary

NEP-413 defines a standardized way for NEAR wallets to sign arbitrary messages off-chain that cannot represent valid transactions.

### Key Requirements

1. **Message Structure**:
   - Message content
   - Recipient (prevents relay attacks)
   - Nonce (32-byte unique identifier, prevents replay)
   - Optional state (for authentication context)

2. **Signing Process**:
   - Create `Payload` with message data
   - Serialize using Borsh encoding
   - Prepend special prefix: `2^31 + 413` (2147484061)
   - Compute SHA-256 hash of prefixed data
   - Sign hash using a full-access key

3. **Output Format**:
   ```typescript
   interface SignedMessage {
     accountId: string;     // NEAR account name
     publicKey: string;     // Public key used for signing
     signature: string;     // Base64-encoded signature
     state?: string;        // Optional authentication state
   }
   ```

### Security Properties

- **Non-transaction**: Special prefix ensures signed data cannot be a valid NEAR transaction
- **Recipient binding**: Prevents signed messages from being used against other applications
- **Replay protection**: Nonce prevents reuse of signed messages
- **CSRF mitigation**: Optional state helps prevent cross-site request forgery

## Current WASM Signer Worker Analysis

### Existing Capabilities

The WASM signer worker (`packages/passkey/src/wasm_signer_worker/`) currently supports:

1. **Key Management**:
   - Derive NEAR keypairs from WebAuthn credentials
   - Recover keypairs using PRF values
   - Encrypt/decrypt private keys

2. **Transaction Signing**:
   - Sign NEAR transactions with derived keys
   - Support for function call actions
   - Batch transaction handling

3. **Message Types**:
   - `DeriveNearKeypairAndEncrypt`
   - `RecoverKeypairFromPasskey`
   - `SignTransactionsWithActions`
   - `SignTransactionWithKeyPair`

### Architecture Analysis

**Message Handling**:
- Uses `WorkerRequestType` enum for operation types (`worker_messages.rs:13-23`)
- JSON-based message passing with typed payloads
- Async handler functions for each operation

**Cryptographic Operations**:
- NEAR-compatible Ed25519 signing
- SHA-256 hashing capabilities
- Borsh serialization support

**Key Infrastructure**:
- Access to full-access keys derived from WebAuthn
- Secure key storage and recovery mechanisms

## NEP-413 Implementation Feasibility

The WASM signer worker has all necessary components:

1. **Cryptographic Primitives**:
   - Ed25519 signing ✓
   - SHA-256 hashing ✓
   - Borsh serialization ✓

2. **Key Access**:
   - Full-access keys available ✓
   - Secure key derivation ✓

3. **Message Infrastructure**:
   - Typed message handling ✓
   - Async operation support ✓
   - Error handling framework ✓

### Implementation Requirements

#### 1. Add NEP-413 Message Type

```rust
// In worker_messages.rs
pub enum WorkerRequestType {
    // ... existing types
    SignNep413Message,  // New message type
}
```

#### 2. Define Payload Structure

```rust
// In handlers.rs types
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct SignNep413Payload {
    pub message: String,           // Message to sign
    pub recipient: String,         // Recipient identifier
    pub nonce: [u8; 32],          // 32-byte nonce
    pub state: Option<String>,     // Optional state
    pub account_id: String,        // NEAR account ID
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct SignNep413Result {
    pub account_id: String,
    pub public_key: String,        // Base58-encoded public key
    pub signature: String,         // Base64-encoded signature
    pub state: Option<String>,
}
```

#### 3. Implement Signing Logic

```rust
// In handlers.rs
pub async fn handle_sign_nep413_message(
    request: SignNep413Payload,
) -> Result<SignNep413Result, String> {
    // 1. Create NEP-413 payload structure
    let payload = Nep413Payload {
        message: request.message,
        recipient: request.recipient,
        nonce: request.nonce,
        state: request.state.clone(),
    };

    // 2. Serialize with Borsh
    let serialized = borsh::to_vec(&payload)
        .map_err(|e| format!("Borsh serialization failed: {}", e))?;

    // 3. Prepend NEP-413 prefix (2^31 + 413)
    let prefix: u32 = 2147484061;
    let mut prefixed_data = prefix.to_le_bytes().to_vec();
    prefixed_data.extend_from_slice(&serialized);

    // 4. Hash the prefixed data
    let hash = sha256(&prefixed_data);

    // 5. Sign with full-access key
    let signature = sign_with_keypair(&hash, keypair)?;

    // 6. Return formatted result
    Ok(SignNep413Result {
        account_id: request.account_id,
        public_key: keypair.public_key().to_string(),
        signature: base64::encode(&signature.to_bytes()),
        state: request.state,
    })
}
```

#### 4. Register Handler

```rust
// In lib.rs handle_signer_message function
WorkerRequestType::SignNep413Message => {
    let request = msg.parse_payload::<Nep413SigningPayload>(request_type)?;
    let result = handlers::handle_sign_nep413_message(request).await?;
    result.to_json()
},
```

## Integration Benefits

### 1. **WebAuthn + NEP-413 Synergy**
- Use WebAuthn for secure key derivation (PRF outputs: used to derive ChaCha20 keys and NEAR keys, ChaCha20 encrypts the NEAR keys)
- NEP-413 for message signing with NEAR keys
- Unified authentication flow

### 2. **Cross-Application Authentication**
- Sign authentication challenges for external services
- Prove NEAR account ownership without transactions
- Enable Web3 SSO scenarios

### 3. **Enhanced Security**
- Hardware-backed key derivation via WebAuthn
- NEP-413 replay protection
- Recipient binding prevents misuse

## Implementation Effort

**Estimated Complexity**: **Low to Medium**

- **Time Estimate**: 1-2 days
- **Required Changes**:
  - Add 1 new message type
  - Implement 1 new handler function (~50 lines)
  - Add Borsh payload structures (~20 lines)
  - Update message routing (~5 lines)

**Dependencies**:
- `borsh` crate (likely already available)
- `base64` crate (already used)
- `sha2` crate (already used)

## Recommended Implementation

1. **Phase 1**: Core NEP-413 signing functionality
2. **Phase 2**: Integration with PasskeyManager APIs
3. **Phase 3**: Frontend UI for message signing workflows
