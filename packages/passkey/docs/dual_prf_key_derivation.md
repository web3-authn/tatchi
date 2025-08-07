# Dual PRF Key Derivation Implementation Plan

## Overview

This document outlines the implementation of a dual PRF (Pseudo-Random Function) key derivation system that separates encryption and signing key derivation for improved security and operational flexibility.

## Current State vs Proposed State

### Current Single PRF System ❌
```typescript
// Single PRF output used for both purposes
const prf_output = credential.getClientExtensionResults().prf.results.first;
const aes_key = derive_aes_key(prf_output);           // Encryption
const ed25519_key = derive_ed25519_key(prf_output);   // Signing
```

### Dual PRF System ✅
```typescript
// Separate PRF outputs for different purposes
const prf_output_1 = credential.getClientExtensionResults().prf.results.first;   // AES-GCM
const prf_output_2 = credential.getClientExtensionResults().prf.results.second;  // Ed25519
```

## Technical Architecture

### 1. HKDF-Based Salt Generation

### 2. PRF Request Structure

```typescript
const credential = await navigator.credentials.get({
  publicKey: {
    challenge,
    allowCredentials: [/* passkey info */],
    extensions: {
      prf: {
        eval: {
          first: generateAesGcmSalt(nearAccountId),    // AES-GCM derivation in Rust wasm worker
          second: generateEd25519Salt(nearAccountId)   // Ed25519 derivation in Rust wasm worker
        }
      }
    }
  }
});
```

### 3. Key Derivation Workflows

| Purpose | Domain Separator | PRF Salt | PRF Output | Key Derivation | Usage |
|---------|------------------|----------|------------|----------------|-------|
| **Encryption** | `aes-gcm-salt` | `HKDF(accountId, "aes-gcm-salt")` | `prf.results.first` | `derive_aes_gcm_key_from_prf(prf_output_1)` | 🔐 Encrypt/decrypt stored Ed25519 keys |
| **Signing** | `ed25519-salt` | `HKDF(accountId, "ed25519-salt")` | `prf.results.second` | `derive_ed25519_key_from_prf(prf_output_2, accountId)` | 🖊️ Sign NEAR blockchain transactions |

**Note**: COSE public key coordinates are **no longer used for key derivation**. COSE data is only used for:
- Verification and attestation purposes
- Contract registration (storing public key for verification)
- **NOT for deriving private keys** (security vulnerability fixed!)

## Implementation Plan

### Phase 1: Update Salt Generation

#### 1.1 Install HKDF Dependencies
```bash
npm install @noble/hashes
```

#### 1.2 Update TouchIdPrompt Methods
- [ ] Replace SHA256-based salt generation with HKDF
- [ ] Update `getCredentials()` to use dual PRF
- [ ] Update `getCredentialsForRecovery()` to use dual PRF
- [ ] Update `generateRegistrationCredentials()` to use dual PRF

### Phase 2: Update WASM Signer Worker

#### 2.1 Update Rust Types
```rust
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct DualPrfOutputs {
    pub aes_prf_output_base64: String,     // base64 encoded prf.results.first
    pub ed25519_prf_output_base64: String, // base64 encoded prf.results.second
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct DeriveKeypairRequest {
    pub attestation_object_b64u: String,
    pub dual_prf_outputs: DualPrfOutputs,
    pub account_id: String,
}
```

#### 2.2 Replace COSE-Based Key Derivation Functions
- [ ] **REMOVE/DEPRECATE**: `internal_derive_near_keypair_from_cose_p256()` (security vulnerability)
- [ ] **REMOVE/DEPRECATE**: `internal_derive_near_keypair_from_cose_and_encrypt_with_prf()` (mixed approach)
- [ ] **ADD NEW**: `derive_aes_gcm_key_from_prf_output()` - pure PRF-based AES key derivation
- [ ] **ADD NEW**: `derive_ed25519_key_from_prf_output()` - pure PRF-based Ed25519 key derivation
- [ ] **ADD NEW**: `derive_and_encrypt_keypair_from_dual_prf()` - complete dual PRF workflow

#### 2.3 New Secure Function Signatures
```rust
// NEW: Secure AES key derivation from PRF
pub(crate) fn derive_aes_gcm_key_from_prf_output(
    prf_output_base64: &str
) -> Result<[u8; 32], String>

// NEW: Secure Ed25519 key derivation from PRF
pub(crate) fn derive_ed25519_key_from_prf_output(
    prf_output_base64: &str,
    account_id: &str
) -> Result<(String, String), String>

// NEW: Complete dual PRF workflow
pub(crate) fn derive_and_encrypt_keypair_from_dual_prf(
    dual_prf_outputs: &DualPrfOutputs,
    account_id: &str
) -> Result<(String, EncryptedDataAesGcmResponse), String>
```

### Phase 3: Update TypeScript Types

#### 3.1 Core Types
```typescript
interface DualPrfOutputs {
  aesPrfOutput: string;     // base64 encoded prf.results.first
  ed25519PrfOutput: string; // base64 encoded prf.results.second
}

interface DeriveKeypairRequest {
  attestationObjectB64u: string; // Only for verification/attestation
  dualPrfOutputs: DualPrfOutputs;
  accountId: string;
}
```

#### 3.2 Helper Functions
```typescript
function extractDualPrfOutputs(credential: PublicKeyCredential): DualPrfOutputs {
  const extensions = credential.getClientExtensionResults();
  const prfResults = extensions.prf?.results;

  if (!prfResults?.first || !prfResults?.second) {
    throw new Error('Dual PRF outputs required but not available');
  }

  return {
    aesPrfOutput: arrayBufferToBase64(prfResults.first),
    ed25519PrfOutput: arrayBufferToBase64(prfResults.second)
  };
}
```

### Phase 4: Update WebAuthn Manager

#### 4.1 Remove COSE Key Derivation Dependencies
- [ ] **UPDATE**: `deriveNearKeypairAndEncrypt()` to use only PRF outputs
- [ ] **UPDATE**: `encryptVrfKeypairWithCredentials()` to use AES PRF output only
- [ ] **UPDATE**: `recoverKeypairFromPasskey()` to use Ed25519 PRF output only
- [ ] **REMOVE**: All calls to deprecated COSE-based derivation functions

#### 4.2 New Method Signatures (PRF-Only)
```typescript
async deriveNearKeypairAndEncrypt({
  credential,
  nearAccountId
}: {
  credential: PublicKeyCredential,
  nearAccountId: string,
}): Promise<{
  success: boolean;
  publicKey: string;
  encryptedPrivateKeyData: string;
  encryptedPrivateKeyIv: string;
}> {
  // Extract dual PRF outputs (no COSE coordinate extraction!)
  const dualPrfOutputs = extractDualPrfOutputs(credential);

  // Derive keys purely from PRF outputs
  return await this.signerWorkerManager.deriveAndEncryptKeypairFromDualPrf({
    dualPrfOutputs,
    accountId: nearAccountId
  });
}
```

## Security Benefits

### 1. Complete COSE Elimination
- **Before**: Private keys derived from **public** COSE coordinates (CATASTROPHIC!)
- **After**: Private keys derived from **secret** PRF outputs (SECURE!)
- **COSE Role**: Only used for verification/attestation, never key derivation

### 2. Key Role Separation
- **AES-GCM Keys**: Derived from `prf.results.first` (encryption only)
- **Ed25519 Keys**: Derived from `prf.results.second` (signing only)
- **Isolation**: Compromise of one type doesn't affect the other

### 3. HKDF Security Properties
- **Uniform Distribution**: HKDF provides cryptographically uniform key material
- **Domain Separation**: Different info parameters prevent cross-domain attacks
- **Standard Compliance**: Uses well-established cryptographic primitives

### 4. Deterministic but Secure
- **Same Input → Same Output**: Enables key recovery
- **Different Purposes → Different Keys**: Domain separation prevents reuse
- **Account Scoped**: Keys are unique per account

## Testing Strategy

### 1. Unit Tests
```typescript
describe('Dual PRF Salt Generation', () => {
  test('AES and Ed25519 salts are different', () => {
    const accountId = 'test.testnet';
    const aesSalt = generateAesGcmSalt(accountId);
    const ed25519Salt = generateEd25519Salt(accountId);
    expect(aesSalt).not.toEqual(ed25519Salt);
  });

  test('Salts are deterministic', () => {
    const accountId = 'test.testnet';
    const salt1 = generateAesGcmSalt(accountId);
    const salt2 = generateAesGcmSalt(accountId);
    expect(salt1).toEqual(salt2);
  });
});
```

### 2. Integration Tests
- [ ] End-to-end authentication with dual PRF
- [ ] Key derivation consistency tests
- [ ] Cross-platform authenticator testing

## File Changes Required

### Core Files
- [ ] `packages/passkey/src/core/WebAuthnManager/touchIdPrompt.ts`
- [ ] `packages/passkey/src/wasm_signer_worker/src/crypto.rs`
- [ ] `packages/passkey/src/wasm_signer_worker/src/types.rs`
- [ ] `packages/passkey/src/wasm_signer_worker/src/lib.rs`

### Type Definitions
- [ ] `packages/passkey/src/core/types/vrf-worker.ts`
- [ ] `packages/passkey/src/core/types/passkeyManager.ts`

### WebAuthn Manager
- [ ] `packages/passkey/src/core/WebAuthnManager/index.ts`
- [ ] `packages/passkey/src/core/WebAuthnManager/vrfWorkerManager.ts`

## Implementation Timeline

| Phase | Duration | Focus |
|-------|----------|-------|
| **Phase 1: Salt Generation** | 1 week | HKDF implementation |
| **Phase 2: WASM Updates** | 1 week | Rust key derivation |
| **Phase 3: TypeScript Types** | 0.5 weeks | Type definitions |
| **Phase 4: WebAuthn Manager** | 1 week | Integration |
| **Testing & Validation** | 0.5 weeks | End-to-end testing |
| **Total** | 4 weeks | Complete implementation |

