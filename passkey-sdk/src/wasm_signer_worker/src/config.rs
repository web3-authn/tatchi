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

/// Info string for ChaCha20Poly1305 encryption key derivation using HKDF
pub const CHACHA20_ENCRYPTION_INFO: &str = "chacha20poly1305-encryption-key-v1";

/// Info string for Ed25519 signing key derivation from dual PRF
pub const ED25519_HKDF_KEY_INFO: &str = "ed25519-signing-key-dual-prf-v1";

// === GAS CONSTANTS ===

/// Standard gas amount for contract verification calls (30 TGas)
pub const VERIFY_REGISTRATION_GAS: &str = "30000000000000";

/// Higher gas amount for device linking registration calls (30 TGas)
pub const LINK_DEVICE_REGISTRATION_GAS: &str = "30000000000000";

// === ERROR MESSAGES ===

/// Error message for empty PRF output
pub const ERROR_EMPTY_PRF_OUTPUT: &str = "PRF output cannot be empty";

/// Error message for invalid key size
pub const ERROR_INVALID_KEY_SIZE: &str = "Invalid key size for ChaCha20Poly1305";

// === UTILITY FUNCTIONS ===

/// Generate account-specific ChaCha20Poly1305 salt
pub fn chacha_salt_for_account(account_id: &str) -> String {
    format!("chacha20poly1305-salt:{}", account_id)
}

/// Generate account-specific NEAR key derivation salt
pub fn near_key_salt_for_account(account_id: &str) -> String {
    format!("near-key-derivation:{}", account_id)
}