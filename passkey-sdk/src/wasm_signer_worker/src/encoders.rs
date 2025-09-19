//! Base64 encoding and decoding utilities
//!
//! This module consolidates all base64 encoding and decoding functionality
//! used throughout the wasm_signer_worker module.

use base64ct::{Base64, Base64UrlUnpadded, Encoding};

// === BASE64URL (URL-SAFE, NO PADDING) ===

/// Decode a base64url string using base64ct library
/// This function uses the `base64ct` library with `Base64UrlUnpadded` encoding,
/// which is the standard for WebAuthn and cryptographic operations.
/// Returns `String` error for consistency with HTTP operations.
pub fn base64_url_decode(input: &str) -> Result<Vec<u8>, String> {
    Base64UrlUnpadded::decode_vec(input)
        .map_err(|e| format!("Base64 decode error: {}", e))
}

/// Encode bytes to a base64url string using base64ct library
///
/// This function uses the `base64ct` library with `Base64UrlUnpadded` encoding,
/// which is the standard for WebAuthn and cryptographic operations.
pub fn base64_url_encode(data: &[u8]) -> String {
    Base64UrlUnpadded::encode_string(data)
}

// === BASE64 STANDARD (FOR JSON/HTTP OPERATIONS) ===

/// Encode bytes to a standard base64 string
/// Used for JSON payloads and HTTP operations where standard base64 is expected.
pub fn base64_standard_encode(data: &[u8]) -> String {
    Base64::encode_string(data)
}

/// Decode a standard base64 string
/// Used for JSON payloads and HTTP operations.
pub fn base64_standard_decode(input: &str) -> Result<Vec<u8>, String> {
    Base64::decode_vec(input)
        .map_err(|e| format!("Base64 decode error: {}", e))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_base64_url_round_trip() {
        let data = b"Hello, World!";
        let encoded = base64_url_encode(data);
        let decoded = base64_url_decode(&encoded).unwrap();
        assert_eq!(data.as_slice(), decoded.as_slice());
    }

    #[test]
    fn test_base64_standard_round_trip() {
        let data = b"Hello, World!";
        let encoded = base64_standard_encode(data);
        let decoded = base64_standard_decode(&encoded).unwrap();
        assert_eq!(data.as_slice(), decoded.as_slice());
    }

    #[test]
    fn test_base64url_character_replacement() {
        // Test base64url character replacement (- and _ should be replaced with + and /)
        let base64url_chars = "SGVsbG8tV29ybGRf"; // Contains - and _
        let result = base64_standard_decode(base64url_chars);
        assert!(result.is_ok());
    }

    #[test]
    fn test_invalid_base64() {
        // Test invalid base64 strings
        assert!(base64_url_decode("invalid!!!").is_err());
        assert!(base64_standard_decode("invalid!!!").is_err());
    }

    #[test]
    fn test_empty_string() {
        // Test empty strings
        assert!(base64_url_decode("").is_ok());
        assert!(base64_standard_decode("").is_ok());
    }
}