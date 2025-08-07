// Tests for VRF Worker - Native-compatible only
// These tests focus on TypeScript/WASM boundary issues without requiring WASM runtime

use serde_json;

// Import existing types, functions, and constants from other modules
use crate::types::{VRFInputData, EncryptedVRFKeypair, VRFWorkerMessage, VRFWorkerResponse, VRFChallengeData};
use crate::utils::{base64_url_encode, base64_url_decode};
use crate::config::{
    CHACHA20_KEY_SIZE,
    CHACHA20_NONCE_SIZE,
    VRF_SEED_SIZE,
    VRF_DOMAIN_SEPARATOR,
    HKDF_CHACHA20_KEY_INFO,
    HKDF_VRF_KEYPAIR_INFO
};

// Test helper functions
fn create_test_prf_output() -> Vec<u8> {
    (0..32).map(|i| (i as u8).wrapping_add(42)).collect()
}

fn create_test_account_id() -> String {
    "test-account.testnet".to_string()
}

#[test]
fn test_base64url_prf_processing_consistency() {
    let test_prf_bytes = create_test_prf_output();
    let test_prf_base64url = base64_url_encode(&test_prf_bytes);

    // Test that base64url encoding/decoding is consistent
    let decoded_result = base64_url_decode(&test_prf_base64url);
    assert!(decoded_result.is_ok(), "Base64url decoding should succeed");

    let decoded_bytes = decoded_result.unwrap();
    assert_eq!(decoded_bytes.len(), 32, "PRF should be exactly 32 bytes");
    assert_eq!(decoded_bytes, test_prf_bytes, "Base64url round-trip should preserve original bytes");

    println!("[Passed] Base64url PRF processing consistency test passed");
}

#[test]
fn test_vrf_data_structures_serialization() {
    // Test VRFInputData serialization/deserialization
    let vrf_input = VRFInputData {
        user_id: create_test_account_id(),
        rp_id: "example.com".to_string(),
        block_height: 12345,
        block_hash: vec![0u8; 32],
    };

    let json_str = serde_json::to_string(&vrf_input).expect("Should serialize VRFInputData");
    let deserialized: VRFInputData = serde_json::from_str(&json_str).expect("Should deserialize VRFInputData");

    assert_eq!(vrf_input.user_id, deserialized.user_id);
    assert_eq!(vrf_input.rp_id, deserialized.rp_id);
    assert_eq!(vrf_input.block_height, deserialized.block_height);
    assert_eq!(vrf_input.block_hash, deserialized.block_hash);

    // Test EncryptedVRFKeypair serialization/deserialization
    let encrypted_keypair = EncryptedVRFKeypair {
        encrypted_vrf_data_b64u: base64_url_encode(&vec![1u8; 64]),
        chacha20_nonce_b64u: base64_url_encode(&vec![2u8; 12]),
    };

    let json_str = serde_json::to_string(&encrypted_keypair).expect("Should serialize EncryptedVRFKeypair");
    let deserialized: EncryptedVRFKeypair = serde_json::from_str(&json_str).expect("Should deserialize EncryptedVRFKeypair");

    assert_eq!(encrypted_keypair.encrypted_vrf_data_b64u, deserialized.encrypted_vrf_data_b64u);
    assert_eq!(encrypted_keypair.chacha20_nonce_b64u, deserialized.chacha20_nonce_b64u);

    println!("[Passed] VRF data structures serialization test passed");
}

#[test]
fn test_worker_message_format_consistency() {
    // Test VRFWorkerMessage structure
    let test_message = VRFWorkerMessage {
        msg_type: "PING".to_string(),
        id: Some("test-123".to_string()),
        data: Some(serde_json::json!({"test": "data"})),
    };

    let json_str = serde_json::to_string(&test_message).expect("Should serialize VRFWorkerMessage");
    let deserialized: VRFWorkerMessage = serde_json::from_str(&json_str).expect("Should deserialize VRFWorkerMessage");

    assert_eq!(test_message.msg_type, deserialized.msg_type);
    assert_eq!(test_message.id, deserialized.id);

    // Test VRFWorkerResponse structure
    let test_response = VRFWorkerResponse {
        id: Some("test-123".to_string()),
        success: true,
        data: Some(serde_json::json!({"result": "success"})),
        error: None,
    };

    let json_str = serde_json::to_string(&test_response).expect("Should serialize VRFWorkerResponse");
    let deserialized: VRFWorkerResponse = serde_json::from_str(&json_str).expect("Should deserialize VRFWorkerResponse");

    assert_eq!(test_response.id, deserialized.id);
    assert_eq!(test_response.success, deserialized.success);
    assert_eq!(test_response.error, deserialized.error);

    println!("[Passed] Worker message format consistency test passed");
}

#[test]
fn test_base64_encoding_consistency() {
    // This test verifies the exact encoding issue that caused the original bug
    let test_data = create_test_prf_output();

    // Test base64url encoding/decoding consistency
    let encoded = base64_url_encode(&test_data);
    let decoded = base64_url_decode(&encoded).expect("Should decode successfully");

    assert_eq!(test_data, decoded, "Base64url encode/decode should be lossless");
    assert_eq!(encoded.len(), 43, "32-byte data should encode to 43 characters (no padding)");

    // Test that the encoding is URL-safe (no +, /, or = characters)
    assert!(!encoded.contains('+'), "Base64url should not contain + characters");
    assert!(!encoded.contains('/'), "Base64url should not contain / characters");
    assert!(!encoded.contains('='), "Base64url should not contain = padding");

    println!("[Passed] Base64 encoding consistency test passed");
}

#[test]
fn test_configuration_constants() {
    // Test that configuration constants are properly defined
    assert_eq!(CHACHA20_KEY_SIZE, 32, "ChaCha20 key size should be 32 bytes");
    assert_eq!(CHACHA20_NONCE_SIZE, 12, "ChaCha20 nonce size should be 12 bytes");
    assert_eq!(VRF_SEED_SIZE, 32, "VRF seed size should be 32 bytes");

    // Test domain separator consistency
    assert!(!VRF_DOMAIN_SEPARATOR.is_empty(), "Domain separator should not be empty");
    assert!(VRF_DOMAIN_SEPARATOR.len() > 10, "Domain separator should be sufficiently long");

    // Test HKDF info strings
    assert!(!HKDF_CHACHA20_KEY_INFO.is_empty(), "HKDF ChaCha20 info should not be empty");
    assert!(!HKDF_VRF_KEYPAIR_INFO.is_empty(), "HKDF VRF info should not be empty");
    assert_ne!(HKDF_CHACHA20_KEY_INFO, HKDF_VRF_KEYPAIR_INFO, "HKDF info strings should be different");

    println!("[Passed] Configuration constants test passed");
}

#[test]
fn test_account_id_salt_generation() {
    // Test the salt generation logic that's used for PRF key derivation
    let account_id = create_test_account_id();

    let chacha20_salt = format!("chacha20-salt:{}", account_id);
    let ed25519_salt = format!("ed25519-salt:{}", account_id);

    assert_ne!(chacha20_salt, ed25519_salt, "AES and Ed25519 salts should be different");
    assert!(chacha20_salt.contains(&account_id), "AES salt should contain account ID");
    assert!(ed25519_salt.contains(&account_id), "Ed25519 salt should contain account ID");
    assert!(chacha20_salt.starts_with("chacha20-salt:"), "AES salt should have correct prefix");
    assert!(ed25519_salt.starts_with("ed25519-salt:"), "Ed25519 salt should have correct prefix");

    // Test with different account IDs produce different salts
    let different_account = "different-account.testnet";
    let different_chacha20_salt = format!("chacha20-salt:{}", different_account);

    assert_ne!(chacha20_salt, different_chacha20_salt, "Different accounts should produce different salts");

    println!("[Passed] Account ID salt generation test passed");
}

#[test]
fn test_prf_base64url_edge_cases() {
    // Test empty base64url string
    let empty_result = base64_url_decode("");
    assert!(empty_result.is_ok(), "Empty base64url should decode successfully");
    assert_eq!(empty_result.unwrap(), Vec::<u8>::new(), "Empty base64url should produce empty bytes");

    // Test invalid base64url characters
    let invalid_result = base64_url_decode("invalid!!!");
    assert!(invalid_result.is_err(), "Invalid base64url should fail to decode");

    // Test padded base64url (should fail since base64url is unpadded)
    let padded_result = base64_url_decode("SGVsbG8=");
    assert!(padded_result.is_err(), "Padded base64url should fail to decode");

    // Test valid base64url with URL-safe characters
    let urlsafe_result = base64_url_decode("SGVsbG8_LQ");
    assert!(urlsafe_result.is_ok(), "URL-safe base64url should decode successfully");

    println!("[Passed] PRF base64url edge cases test passed");
}

#[test]
fn test_worker_message_prf_field_extraction() {
    // Test that we can extract base64url PRF fields from worker messages
    let test_prf_bytes = create_test_prf_output();
    let test_prf_base64url = base64_url_encode(&test_prf_bytes);

    // Test message with prfKey field (for encryption operations)
    let message_data = serde_json::json!({
        "prfKey": test_prf_base64url,
        "expectedPublicKey": "test-public-key",
        "nearAccountId": "test.testnet"
    });

    let prf_key_field = message_data["prfKey"].as_str().unwrap_or("");
    assert_eq!(prf_key_field, test_prf_base64url, "PRF key field should match original");

    let decoded_prf = base64_url_decode(prf_key_field).expect("Should decode PRF key");
    assert_eq!(decoded_prf, test_prf_bytes, "Decoded PRF should match original bytes");

    // Test message with prfOutput field (for derivation operations)
    let derivation_data = serde_json::json!({
        "prfOutput": test_prf_base64url,
        "nearAccountId": "test.testnet"
    });

    let prf_output_field = derivation_data["prfOutput"].as_str().unwrap_or("");
    assert_eq!(prf_output_field, test_prf_base64url, "PRF output field should match original");

    let decoded_output = base64_url_decode(prf_output_field).expect("Should decode PRF output");
    assert_eq!(decoded_output, test_prf_bytes, "Decoded PRF output should match original bytes");

    println!("[Passed] Worker message PRF field extraction test passed");
}

#[test]
fn test_vrf_challenge_camelcase_deserialization() {
    // Test that VRFChallengeData correctly deserializes from camelCase JSON
    // This verifies the #[serde(rename_all = "camelCase")] attribute works correctly

    // Create a JSON string with camelCase field names (as TypeScript would send)
    let camelcase_json = r#"{
        "vrfInput": "dGVzdF9pbnB1dF9kYXRh",
        "vrfOutput": "dGVzdF9vdXRwdXRfZGF0YQ",
        "vrfProof": "dGVzdF9wcm9vZl9kYXRh",
        "vrfPublicKey": "dGVzdF9wdWJsaWNfa2V5X2RhdGE",
        "userId": "test-user.testnet",
        "rpId": "example.com",
        "blockHeight": 12345,
        "blockHash": "dGVzdF9ibG9ja19oYXNoX2RhdGE"
    }"#;

    // Deserialize the JSON into VRFChallengeData
    let vrf_challenge: VRFChallengeData = serde_json::from_str(camelcase_json)
        .expect("Should deserialize VRFChallengeData from camelCase JSON");

    // Verify all fields are correctly mapped from camelCase to snake_case
    assert_eq!(vrf_challenge.vrf_input, "dGVzdF9pbnB1dF9kYXRh");
    assert_eq!(vrf_challenge.vrf_output, "dGVzdF9vdXRwdXRfZGF0YQ");
    assert_eq!(vrf_challenge.vrf_proof, "dGVzdF9wcm9vZl9kYXRh");
    assert_eq!(vrf_challenge.vrf_public_key, "dGVzdF9wdWJsaWNfa2V5X2RhdGE");
    assert_eq!(vrf_challenge.user_id, "test-user.testnet");
    assert_eq!(vrf_challenge.rp_id, "example.com");
    assert_eq!(vrf_challenge.block_height, 12345);
    assert_eq!(vrf_challenge.block_hash, "dGVzdF9ibG9ja19oYXNoX2RhdGE");

    // Test round-trip serialization/deserialization
    let serialized_json = serde_json::to_string(&vrf_challenge)
        .expect("Should serialize VRFChallengeData to JSON");

    let round_trip_challenge: VRFChallengeData = serde_json::from_str(&serialized_json)
        .expect("Should deserialize VRFChallengeData from round-trip JSON");

    // Verify round-trip preserves all data
    assert_eq!(vrf_challenge.vrf_input, round_trip_challenge.vrf_input);
    assert_eq!(vrf_challenge.vrf_output, round_trip_challenge.vrf_output);
    assert_eq!(vrf_challenge.vrf_proof, round_trip_challenge.vrf_proof);
    assert_eq!(vrf_challenge.vrf_public_key, round_trip_challenge.vrf_public_key);
    assert_eq!(vrf_challenge.user_id, round_trip_challenge.user_id);
    assert_eq!(vrf_challenge.rp_id, round_trip_challenge.rp_id);
    assert_eq!(vrf_challenge.block_height, round_trip_challenge.block_height);
    assert_eq!(vrf_challenge.block_hash, round_trip_challenge.block_hash);

    // Test that the serialized JSON contains camelCase field names (for TypeScript compatibility)
    assert!(serialized_json.contains("\"vrfInput\""), "Serialized JSON should contain camelCase vrfInput");
    assert!(serialized_json.contains("\"vrfOutput\""), "Serialized JSON should contain camelCase vrfOutput");
    assert!(serialized_json.contains("\"vrfProof\""), "Serialized JSON should contain camelCase vrfProof");
    assert!(serialized_json.contains("\"vrfPublicKey\""), "Serialized JSON should contain camelCase vrfPublicKey");
    assert!(serialized_json.contains("\"userId\""), "Serialized JSON should contain camelCase userId");
    assert!(serialized_json.contains("\"rpId\""), "Serialized JSON should contain camelCase rpId");
    assert!(serialized_json.contains("\"blockHeight\""), "Serialized JSON should contain camelCase blockHeight");
    assert!(serialized_json.contains("\"blockHash\""), "Serialized JSON should contain camelCase blockHash");

    println!("[Passed] VRFChallenge camelCase deserialization test passed");
}
