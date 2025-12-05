use crate::errors::VrfWorkerError;
use base64ct::{Base64UrlUnpadded, Encoding};
use getrandom::getrandom;

// === BASE64 UTILITIES ===

/// Base64 URL encode bytes
pub fn base64_url_encode(bytes: &[u8]) -> String {
    Base64UrlUnpadded::encode_string(bytes)
}

/// Base64 URL decode string
pub fn base64_url_decode(s: &str) -> Result<Vec<u8>, String> {
    Base64UrlUnpadded::decode_vec(s).map_err(|e| format!("Base64 decode error: {}", e))
}

/// Generate a random 32-byte salt and return it as base64url-encoded string.
/// Used as wrap_key_salt for WrapKeySeed → KEK derivation when no caller-provided salt is available.
pub fn generate_wrap_key_salt_b64u() -> Result<String, String> {
    let mut bytes = [0u8; 32];
    if let Err(e) = getrandom(&mut bytes) {
        return Err(format!("Failed to generate wrapKeySalt: {}", e));
    }
    Ok(base64_url_encode(&bytes))
}

pub fn parse_block_height(block_height: &str) -> Result<u64, VrfWorkerError> {
    block_height.parse().map_err(|_| {
        VrfWorkerError::BlockHeightParsingError(format!("Invalid block height: {}", block_height))
    })
}
