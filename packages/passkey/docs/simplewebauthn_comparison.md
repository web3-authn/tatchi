# SimpleWebAuthn vs Web3Authn Contract Comparison

This document compares the authentication verification implementation between SimpleWebAuthn (TypeScript) and our Web3Authn contract (Rust).

### 3. Flexible Verification Configuration

The current contract has hardcoded verification behavior that could be made configurable:

#### Current Limitations:
- Fixed user verification requirements (`verify_authentication_response.rs:274-280`)
- Single origin validation (`verify_authentication_response.rs:231-237`)
- Strict counter increment enforcement (`verify_authentication_response.rs:294-300`)

#### Proposed Flexibility Enhancements:

**User Verification Policy:**
```rust
pub enum UserVerificationRequirement {
    Required,     // UV flag must be set
    Preferred,    // UV preferred but not required
    Discouraged,  // UV should not be used
}
```

**Multi-Origin Support:**
```rust
pub struct OriginPolicy {
    pub allowed_origins: Vec<String>,        // Multiple valid origins
    pub allowed_rp_ids: Vec<String>,         // Multiple valid RP IDs
    pub require_exact_match: bool,           // Strict vs subdomain matching
}
```

**Counter Handling Policies:**
```rust
pub enum CounterPolicy {
    Strict,                    // Counter must increment
    AllowZero,                 // Allow zero counters (current behavior)
    IgnoreCounter,             // Skip counter validation entirely
    CustomThreshold(u32),      // Allow counter resets below threshold
}
```

**Time and Freshness Controls:**
```rust
pub struct TimeValidation {
    pub max_age_seconds: Option<u64>,     // How old can authentication be
    pub clock_skew_tolerance: u64,        // Allow for clock differences
    pub require_recent_block: bool,       // VRF must use recent block height
}
```

**Credential Access Control:**
```rust
pub struct CredentialPolicy {
    pub allowed_credentials: Option<Vec<String>>, // Allowlist of credential IDs
    pub blocked_credentials: Vec<String>,         // Blocklist of credential IDs
    pub require_resident_key: Option<bool>,       // Discoverable credentials only
}
```

**Algorithm and Security Requirements:**
```rust
pub struct SecurityPolicy {
    pub allowed_algorithms: Vec<i32>,        // COSE algorithm IDs allowed
    pub minimum_key_size: Option<u32>,       // Minimum key size in bits
    pub require_hardware_key: bool,          // Hardware-backed keys only
    pub attestation_required: bool,          // Must have valid attestation
}
```

**Complete Flexible Options:**
```rust
#[near_sdk::near(serializers = [borsh, json])]
pub struct FlexibleAuthenticationOptions {
    pub user_verification: UserVerificationRequirement,
    pub origin_policy: OriginPolicy,
    pub counter_policy: CounterPolicy,
    pub time_validation: TimeValidation,
    pub credential_policy: CredentialPolicy,
    pub security_policy: SecurityPolicy,
}

impl WebAuthnContract {
    pub fn verify_authentication_response_flexible(
        &self,
        vrf_data: VRFVerificationData,
        webauthn_authentication: WebAuthnAuthenticationCredential,
        options: FlexibleAuthenticationOptions,
    ) -> VerifiedAuthenticationResponse {
        // Apply flexible verification logic based on options
    }
}
```

**Use Cases:**
- **Development vs Production**: Relaxed verification during testing
- **Multi-domain apps**: Support authentication across subdomains
- **Legacy authenticators**: Handle devices with non-incrementing counters
- **High-security contexts**: Require hardware keys with user verification
- **Cross-platform compatibility**: Different requirements per platform

### 4. Server-Side Enhancement Option

For maximum flexibility, consider an optional server component:

```rust
// Optional server for advanced features
pub struct Web3AuthnServer {
    pub contract_account: AccountId,
    pub extension_processors: BTreeMap<String, Box<dyn ExtensionProcessor>>,
    pub metadata_collectors: Vec<Box<dyn MetadataCollector>>,
}

impl Web3AuthnServer {
    pub async fn verify_with_extensions(
        &self,
        authentication: WebAuthnAuthenticationCredential,
        options: AuthenticationOptions,
    ) -> EnhancedVerificationResult {
        // Process extensions server-side
        // Collect enhanced metadata
        // Call contract for final verification
    }
}
```

## Implementation Priority

Based on the analysis, here are the recommended enhancement priorities:

### High Priority
1. **Flexible Verification Configuration**: Most impactful improvement
   - User verification policy options (Required/Preferred/Discouraged)
   - Multi-origin support for cross-domain applications
   - Configurable counter policies for different authenticator types

### Medium Priority
2. **Enhanced Device Metadata Collection**: Improves UX and debugging
   - Authenticator attachment type (platform vs cross-platform)
   - Transport methods and AAGUID tracking
   - Public key algorithm transparency

3. **Client SDK Extension Handling**: Improve client-side capabilities
   - Better APIs for requesting WebAuthn extensions
   - Local processing of PRF values for key derivation
   - Extension result validation and error handling

### Low Priority
4. **Optional Server Component**: For maximum SimpleWebAuthn compatibility
   - Extension metadata aggregation (non-sensitive data only)
   - Advanced validation logic that's too complex for contracts
   - Integration bridge for existing SimpleWebAuthn applications

### Critical Security Note
**Extension values like PRF outputs must remain client-side only.** The contract should never receive sensitive extension results - only non-sensitive metadata about which extensions were used.

This prioritization maintains Web3Authn's blockchain-native advantages while adding the flexibility and metadata richness that makes SimpleWebAuthn superior for diverse deployment scenarios.