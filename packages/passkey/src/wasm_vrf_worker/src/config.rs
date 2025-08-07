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
pub const VRF_DOMAIN_SEPARATOR: &[u8] = b"web3_authn_vrf_challenge_v1";

/// HKDF info string for ChaCha20 key derivation from PRF output
/// Used for both VRF keypair encryption and general ChaCha20 operations
pub const HKDF_CHACHA20_KEY_INFO: &[u8] = b"vrf-chacha20-key";

/// HKDF info string for VRF keypair derivation from PRF output
/// Used for deterministic VRF keypair generation during account recovery
pub const HKDF_VRF_KEYPAIR_INFO: &[u8] = b"vrf-keypair-derivation-v1";

// === ENCRYPTION PARAMETERS ===

/// ChaCha20Poly1305 key size in bytes (256 bits)
pub const CHACHA20_KEY_SIZE: usize = 32;

/// ChaCha20Poly1305 nonce/IV size in bytes (96 bits)
pub const CHACHA20_NONCE_SIZE: usize = 12;

/// VRF seed size in bytes for deterministic generation (256 bits)
pub const VRF_SEED_SIZE: usize = 32;

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
