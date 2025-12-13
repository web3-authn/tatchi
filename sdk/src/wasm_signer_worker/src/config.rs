// === CONFIGURATION CONSTANTS ===
// Configuration values for the WASM signer worker

/// Change this constant and recompile to adjust logging verbosity
/// Available levels: Error, Warn, Info, Debug, Trace
pub const CURRENT_LOG_LEVEL: log::Level = log::Level::Info;

// === CRYPTOGRAPHIC CONSTANTS ===

/// ChaCha20Poly1305 nonce size in bytes (96 bits / 12 bytes, same as AES-GCM)
pub const CHACHA20_NONCE_SIZE: usize = 12;

/// ChaCha20 key size in bytes (256 bits / 32 bytes)
pub const CHACHA20_KEY_SIZE: usize = 32;

/// Ed25519 private key size in bytes
pub const ED25519_PRIVATE_KEY_SIZE: usize = 32;

/// Info string for Ed25519 signing key derivation from dual PRF
pub const ED25519_HKDF_KEY_INFO: &str = "ed25519-signing-key-dual-prf-v1";

/// Constant used for HKDF info when deriving KEK from WrapKeySeed
pub const NEAR_KEK_INFO: &[u8] = b"near-kek";

/// Maximum session duration in milliseconds (30 minutes)
pub const SESSION_MAX_DURATION_MS: f64 = 30.0 * 60.0 * 1000.0;

// === ERROR MESSAGES ===

/// Error message for invalid key size
pub const ERROR_INVALID_KEY_SIZE: &str = "Invalid key size for ChaCha20Poly1305";

// === UTILITY FUNCTIONS ===

/// Generate account-specific NEAR key derivation salt
pub fn near_key_salt_for_account(account_id: &str) -> String {
    format!("near-key-derivation:{}", account_id)
}
