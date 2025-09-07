# Device Linking by QR Code

## Overview

The device linking flow enables users to add a companion device (Device2) to their existing NEAR account by scanning a QR code with their original device (Device1). This creates a **1:N mapping** where multiple devices can authenticate for the same account.

## Flow Types

### **Option E: Account ID Provided (Faster)**
User provides account ID upfront → Generate proper NEAR keypair immediately

### **Option F: Account Discovery (Seamless UX)**
No account ID needed → Generate temp keypair → Discover account → Replace with proper keypair

## Complete Flow Diagram

```mermaid
graph TD
    A[Device2: Start Device Linking] --> B{Account ID provided?}

    B -->|Yes - Option E| C[Generate proper NEAR keypair with TouchID]
    B -->|No - Option F| D[Generate temp NEAR keypair without TouchID]

    C --> E[Create QR code with proper public key]
    D --> F[Create QR code with temp public key]

    E --> G[Device1: Scan QR code]
    F --> G

    G --> H[Device1: TouchID + AddKey transaction]
    H --> I[Device1: Store device linking mapping on contract]

    I --> J[Device2: Poll contract for mapping]
    J --> K{Mapping found?}
    K -->|No| L[Continue polling...]
    L --> J
    K -->|Yes| M[Device2: Discover real account ID]

    M --> N{Option F flow?}
    N -->|Yes| O[TouchID + Generate proper credentials]
    N -->|No| P[Credentials already proper]

    O --> Q[Key replacement: AddKey new + DeleteKey old]
    Q --> R[Register Device2 authenticator on-chain]

    P --> R
    R --> S[✅ Device linking complete]

    style C fill:#e1f5fe
    style D fill:#fff3e0
    style Q fill:#f3e5f5
    style R fill:#e8f5e8
```

## Technical Implementation

### 1. Device2 QR Generation

**Option E (Account Provided):**
```typescript
import { outputAs32Bytes } from '../types/vrf-worker';

// Generate proper NEAR keypair immediately
const vrfChallenge = await generateBootstrapVrfChallenge(context, accountId);
const credential = await webAuthnManager.touchIdPrompt.generateRegistrationCredentials({
  nearAccountId: accountId,
  challenge: vrfChallenge,
});
const nearKeyResult = await webAuthnManager.deriveNearKeypairAndEncrypt({
  credential,
  nearAccountId: accountId
});
```

**Option F (Account Discovery):**
```typescript
// Generate temporary Ed25519 keypair without TouchID
const tempNearKeyResult = await generateTemporaryNearKeypair();
// Store temp private key for later key replacement
session.tempPrivateKey = tempNearKeyResult.privateKey;
```

### 2. Device1 Authorization

```typescript
// Single TouchID prompt for both transactions
const vrfChallenge = await webAuthnManager.generateVrfChallenge(vrfInputData);
const credential = await webAuthnManager.touchIdPrompt.getCredentials({
  nearAccountId: device1AccountId,
  challenge: vrfChallenge,
  authenticators,
});

// Execute two transactions atomically
const results = await webAuthnManager.signTransactionsWithActions({
  transactions: [
    // Transaction 1: AddKey - Add Device2's key
    {
      nearAccountId: device1AccountId,
      receiverId: device1AccountId,
      actions: [{
        actionType: ActionType.AddKey,
        public_key: devicePublicKey,
        access_key: JSON.stringify({ nonce: 0, permission: { FullAccess: {} } })
      }]
    },
    // Transaction 2: Store mapping in contract
    {
      nearAccountId: device1AccountId,
      receiverId: contractId,
      actions: [{
        actionType: ActionType.FunctionCall,
        method_name: 'store_device_linking_mapping',
        args: JSON.stringify({
          device_public_key: devicePublicKey,
          target_account_id: device1AccountId,
        }),
        gas: '50000000000000', // 50 TGas
        deposit: '0'
      }]
    }
  ],
  // ... other parameters
});
```

### 3. Device2 Account Discovery

```typescript
// Poll contract for device linking mapping
const linkingResult = await nearClient.view({
  account: contractId,
  method: 'get_device_linking_account',
  args: { device_public_key: tempPublicKey }
});

if (linkingResult && Array.isArray(linkingResult) && linkingResult.length >= 2) {
  const [linkedAccountId, accessKeyPermission] = linkingResult;
  session.accountId = linkedAccountId;
  return true; // Found mapping
}
```

### 4. Key Replacement (Option F Only)

```typescript
// Generate proper credentials with TouchID
const vrfChallenge = await generateBootstrapVrfChallenge(context, realAccountId);
const credential = await webAuthnManager.touchIdPrompt.generateRegistrationCredentials({
  nearAccountId: realAccountId,
  challenge: vrfChallenge,
});

// Re-derive NEAR keypair with proper account-specific salt
const nearKeyResult = await webAuthnManager.deriveNearKeypairAndEncrypt({
  credential: credential,
  nearAccountId: realAccountId
});

// Execute atomic key replacement transaction
const result = await webAuthnManager.signTransactionWithKeyPair({
  nearPrivateKey: tempPrivateKey,
  signerAccountId: realAccountId,
  receiverId: realAccountId,
  nonce: nextNonce,
  blockHashBytes: Array.from(txBlockHashBytes),
  actions: [
    {
      actionType: ActionType.AddKey,
      public_key: nearKeyResult.publicKey, // New proper key
      access_key: JSON.stringify({ nonce: 0, permission: { FullAccess: {} } })
    },
    {
      actionType: ActionType.DeleteKey,
      public_key: oldTempPublicKey // Remove temp key
    }
  ]
});
```

### 5. On-Chain Authenticator Registration

```typescript
// Register Device2's authenticator on-chain for account recovery
const actionResult = await executeAction(context, realAccountId, {
  type: ActionType.FunctionCall,
  receiverId: contractId,
  methodName: 'link_device_register_user',
  args: {
    vrf_data: {
      vrf_input_data: Array.from(base64UrlDecode(vrfChallenge.vrfInput)),
      vrf_output: Array.from(base64UrlDecode(vrfChallenge.vrfOutput)),
      vrf_proof: Array.from(base64UrlDecode(vrfChallenge.vrfProof)),
      public_key: Array.from(base64UrlDecode(vrfChallenge.vrfPublicKey)),
      user_id: realAccountId,
      rp_id: window.location.hostname,
      block_height: vrfChallenge.blockHeight,
      block_hash: Array.from(base64UrlDecode(vrfChallenge.blockHash))
    },
    webauthn_registration: {
      id: credential.id,
      raw_id: Array.from(new Uint8Array(credential.rawId)),
      type: credential.type,
      response: {
        client_data_json: credential.response.clientDataJSON,
        attestation_object: credential.response.attestationObject,
        transports: credential.response.transports || ['internal']
      }
    },
    deterministic_vrf_public_key: deterministicVrfPublicKey
  },
  gas: '50000000000000',
  deposit: '0'
});
```

## Contract Integration

### Device Linking Mapping Storage

```rust
// Store temporary mapping: Device2 public key -> Device1 account
pub fn store_device_linking_mapping(
    &mut self,
    device_public_key: String,
    target_account_id: AccountId,
) -> bool
```

### Account Discovery

```rust
// Get account ID from Device2's public key
pub fn get_device_linking_account(
    &self,
    device_public_key: String
) -> Option<(AccountId, AccessKeyPermission)>
```

### Authenticator Registration

```rust
// Add Device2's authenticator to existing account (1:N mapping)
pub fn link_device_register_user(
    &mut self,
    vrf_data: VRFVerificationData,
    webauthn_registration: WebAuthnRegistrationCredential,
    deterministic_vrf_public_key: Option<Vec<u8>>,
) -> VerifyRegistrationResponse
```

## VRF Key Derivation

### Account-Specific Salt Generation

```rust
// Generate account-specific salt for deterministic key derivation
fn near_key_salt_for_account(account_id: &str) -> String {
    format!("near-key-derivation:{}", account_id)
}
```

### Proper vs Temp Derivation

**Temp Account (Option F initial):**
```rust
// Salt: "near-key-derivation:temp-device-linking.testnet"
// Used only for QR generation, replaced later
```

**Real Account (both Options):**
```rust
// Salt: "near-key-derivation:serp117.web3-authn-v5.testnet"
// Used for actual authentication and account recovery
```

