use crate::types::*;
use base64ct::{Base64UrlUnpadded, Encoding};

// === BASE64 UTILITIES ===

/// Base64 URL encode bytes
pub fn base64_url_encode(bytes: &[u8]) -> String {
    Base64UrlUnpadded::encode_string(bytes)
}

/// Base64 URL decode string
pub fn base64_url_decode(s: &str) -> Result<Vec<u8>, String> {
    Base64UrlUnpadded::decode_vec(s)
        .map_err(|e| format!("Base64 decode error: {}", e))
}
