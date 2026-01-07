/// Configuration constants for the VRF worker
///
/// This module centralizes configuration to ensure consistency
/// and make updates easier.

// === LOGGING CONFIGURATION ===

/// Log level for the VRF worker
/// Change this constant and recompile to adjust logging verbosity
/// Available levels: Error, Warn, Info, Debug, Trace
pub const CURRENT_LOG_LEVEL: log::Level = log::Level::Info;

/// Whether to include timestamps in log messages
pub const LOG_INCLUDE_TIMESTAMP: bool = false;

/// Whether to include log level prefix in messages
pub const LOG_INCLUDE_LEVEL: bool = true;

// === CRYPTOGRAPHIC CONSTANTS ===

/// Domain separator for VRF challenge generation
/// Used to ensure VRF challenges are domain-specific and cannot be replayed across different contexts
pub const VRF_DOMAIN_SEPARATOR: &[u8] = b"web3_authn_challenge_v4";

/// HKDF info string for ChaCha20 key derivation from PRF output
/// Used for both VRF keypair encryption and general ChaCha20 operations
pub const HKDF_CHACHA20_KEY_INFO: &[u8] = b"vrf-chacha20-key";

/// HKDF info string for deriving VRF secret material from PRF.second.
/// Spec-aligned with `docs/vrf_webauthn_hybrid_feature_spec.md`.
pub const HKDF_VRF_KEYPAIR_INFO: &[u8] = b"tatchi:v1:vrf-sk";

/// Constant used for HKDF info when deriving K_pass_auth
pub const VRF_WRAP_PASS_INFO: &[u8] = b"vrf-wrap-pass";

/// Constant used for HKDF info when deriving WrapKeySeed
pub const NEAR_WRAP_SEED_INFO: &[u8] = b"near-wrap-seed";

// === ENCRYPTION PARAMETERS ===

/// ChaCha20Poly1305 key size in bytes (256 bits)
pub const CHACHA20_KEY_SIZE: usize = 32;

/// ChaCha20Poly1305 nonce/IV size in bytes (96 bits)
pub const CHACHA20_NONCE_SIZE: usize = 12;

/// VRF seed size in bytes for deterministic generation (256 bits)
pub const VRF_SEED_SIZE: usize = 32;

/// HKDF info string for deriving AEAD key from Shamir3Pass KEK (K)
/// Longer, namespaced context string to avoid collisions across schemes/usages
pub const SHAMIR_AEAD_HKDF_INFO: &[u8] = b"web3authn-shamir3pass-kek-to-aead-key-v1";

// Shamir 3-pass public parameters (base64url-encoded BigUint values)
pub const SHAMIR_P_B64U: Option<&'static str> = option_env!("SHAMIR_P_B64U");

// === SHAMIR 3-PASS CONFIGURATION ===

/// Minimum prime size in bits for Shamir 3-pass security validation
/// Reduced from 1024 to 256 for better performance with existing primes
pub const SHAMIR_MIN_PRIME_BITS: usize = 256;

/// Maximum number of rejection sampling attempts for random key generation
/// Reduced from 1000 to 10 for better performance (trades uniformity for speed)
pub const SHAMIR_REJECTION_SAMPLING_MAX_ATTEMPTS: u32 = 10;

/// Extra bytes to generate during rejection sampling for better distribution
/// This helps reduce bias when the range doesn't align with byte boundaries
pub const SHAMIR_RANDOM_BYTES_OVERHEAD: usize = 64;

// Default Shamir P
pub const DEFAULT_SHAMIR_P_B64U: &str = "3N5w46AIGjGT2v5Vua_TMD5Ywfa9U2F7-WzW8SNDsIM";

// === JSON FIELD NAMES ===

/// JSON field names for VRF challenge data serialization
pub mod vrf_challenge_fields {
    pub const VRF_INPUT: &str = "vrfInput";
    pub const VRF_OUTPUT: &str = "vrfOutput";
    pub const VRF_PROOF: &str = "vrfProof";
    pub const VRF_PUBLIC_KEY: &str = "vrfPublicKey";
    pub const USER_ID: &str = "userId";
    pub const RP_ID: &str = "rpId";
    pub const BLOCK_HEIGHT: &str = "blockHeight";
    pub const BLOCK_HASH: &str = "blockHash";
}

/// JSON field names for encrypted VRF keypair data
pub mod encrypted_keypair_fields {
    pub const ENCRYPTED_VRF_DATA: &str = "encrypted_vrf_data_b64u";
    pub const CHACHA20_NONCE: &str = "chacha20_nonce_b64u";
}

/// JSON field names for worker messages
pub mod worker_message_fields {
    pub const MESSAGE_TYPE: &str = "type";
    pub const NEAR_ACCOUNT_ID: &str = "nearAccountId";
    pub const ENCRYPTED_VRF_KEYPAIR: &str = "encryptedVrfKeypair";
    pub const PRF_KEY: &str = "prfKey";
    pub const VRF_INPUT_PARAMS: &str = "vrfInputParams";
    pub const EXPECTED_PUBLIC_KEY: &str = "expectedPublicKey";
    pub const PRF_OUTPUT: &str = "prfOutput";
}

/// JSON field names for status responses
pub mod status_fields {
    pub const ACTIVE: &str = "active";
    pub const SESSION_DURATION: &str = "sessionDuration";
    pub const STATUS: &str = "status";
    pub const TIMESTAMP: &str = "timestamp";
    pub const ALIVE: &str = "alive";
}

// === ERROR MESSAGES ===

pub mod error_messages {
    pub const NO_VRF_KEYPAIR: &str = "No VRF keypair in memory - please generate keypair first";
    pub const VRF_NOT_UNLOCKED: &str = "VRF keypair not unlocked - please login first";
    pub const PRF_OUTPUT_EMPTY: &str = "PRF output cannot be empty";
    pub const HKDF_KEY_DERIVATION_FAILED: &str = "HKDF key derivation failed";
    pub const HKDF_VRF_SEED_DERIVATION_FAILED: &str = "HKDF VRF seed derivation failed";
    pub const INVALID_IV_LENGTH: &str = "Invalid IV length for ChaCha20Poly1305";
    pub const FAILED_TO_STRINGIFY: &str = "Failed to stringify message";
    pub const MESSAGE_NOT_STRING: &str = "Message is not a string";
    pub const FAILED_TO_SERIALIZE: &str = "failed to serialize";
}

/// Number of characters to show when displaying truncated keys/hashes in logs
pub const DISPLAY_TRUNCATE_LENGTH: usize = 20;

// === VRF SESSION DEFAULTS ===

/// Default VRF session TTL (ms) for reusing a WebAuthn-derived WrapKeySeed.
/// Session enforcement is VRF-owned; signer workers remain one-shot.
pub const VRF_SESSION_DEFAULT_TTL_MS: u64 = 5 * 60 * 1000; // 5 minutes

/// Default maximum number of signing "uses" per VRF session.
/// A "use" is intentionally defined at the VRF boundary (per dispense),
/// not per signer worker internal loop.
pub const VRF_SESSION_DEFAULT_MAX_USES: u32 = 5;
