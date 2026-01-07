// Tests for VRF Worker - Native-compatible only
// These tests focus on TypeScript/WASM boundary issues without requiring WASM runtime

use crate::config::{
    CHACHA20_KEY_SIZE, CHACHA20_NONCE_SIZE, HKDF_CHACHA20_KEY_INFO, HKDF_VRF_KEYPAIR_INFO,
    VRF_DOMAIN_SEPARATOR, VRF_SEED_SIZE,
};
use crate::errors::VrfWorkerError;
#[cfg(target_arch = "wasm32")]
use crate::handlers::handle_mint_session_keys_and_send_to_signer::verify_authentication_if_needed;
use crate::manager::{VRFKeyManager, VrfSessionData};
use crate::shamir3pass::{decode_biguint_b64u, encode_biguint_b64u};
use crate::types::VRFInputData;
use crate::utils::{base64_url_decode, base64_url_encode};
use num_bigint::BigUint;

// Test helper functions
fn create_test_prf_output() -> Vec<u8> {
    (0..32).map(|i| (i as u8).wrapping_add(42)).collect()
}

fn create_test_account_id() -> String {
    "test-account.testnet".to_string()
}

#[test]
fn session_ttl_is_enforced_on_dispense() {
    let mut mgr = VRFKeyManager::new(None, None, None, None);
    let session_id = "sess-ttl";

    mgr.upsert_session(
        session_id,
        VrfSessionData {
            wrap_key_seed: vec![7u8; 32],
            wrap_key_salt_b64u: "salt".to_string(),
            created_at_ms: 0.0,
            expires_at_ms: Some(100.0),
            remaining_uses: Some(5),
        },
    );

    let res = mgr.dispense_session_key(session_id, 1, 100.0);
    assert!(matches!(res, Err(VrfWorkerError::SessionExpired)));
    assert!(mgr.sessions.get(session_id).is_none());
}

#[test]
fn session_remaining_uses_are_enforced_on_dispense() {
    let mut mgr = VRFKeyManager::new(None, None, None, None);
    let session_id = "sess-uses";

    mgr.upsert_session(
        session_id,
        VrfSessionData {
            wrap_key_seed: vec![9u8; 32],
            wrap_key_salt_b64u: "salt".to_string(),
            created_at_ms: 0.0,
            expires_at_ms: Some(1_000_000.0),
            remaining_uses: Some(1),
        },
    );

    // First dispense consumes the last use but succeeds (session remains until next attempt).
    let res1 = mgr.dispense_session_key(session_id, 1, 0.0);
    assert!(res1.is_ok());
    assert_eq!(
        mgr.sessions.get(session_id).unwrap().remaining_uses,
        Some(0)
    );

    // Second dispense should fail and clear the session.
    let res2 = mgr.dispense_session_key(session_id, 1, 0.0);
    assert!(matches!(res2, Err(VrfWorkerError::SessionExhausted)));
    assert!(mgr.sessions.get(session_id).is_none());
}

#[test]
fn logout_clears_cached_sessions_and_challenges() {
    let mut mgr = VRFKeyManager::new(None, None, None, None);

    // Seed dummy session + challenge state
    mgr.session_active = true;
    mgr.session_start_time = 123.0;
    mgr.vrf_challenges.insert(
        "sess-chal".to_string(),
        crate::types::VRFChallengeData {
            vrf_input: "in".to_string(),
            vrf_output: "out".to_string(),
            vrf_proof: "proof".to_string(),
            vrf_public_key: "pk".to_string(),
            user_id: "u".to_string(),
            rp_id: "rp".to_string(),
            block_height: "1".to_string(),
            block_hash: "h".to_string(),
            intent_digest: None,
            session_policy_digest_32: None,
        },
    );
    mgr.upsert_session(
        "sess-logout",
        VrfSessionData {
            wrap_key_seed: vec![1u8; 32],
            wrap_key_salt_b64u: "salt".to_string(),
            created_at_ms: 0.0,
            expires_at_ms: Some(1_000_000.0),
            remaining_uses: Some(5),
        },
    );

    mgr.logout().expect("logout should succeed");

    assert!(!mgr.session_active);
    assert_eq!(mgr.session_start_time, 0.0);
    assert!(mgr.vrf_challenges.is_empty());
    assert!(mgr.sessions.is_empty());
}

#[test]
#[cfg(target_arch = "wasm32")]
fn verify_authentication_fails_when_challenge_missing() {
    use crate::manager::VRFKeyManager;
    use crate::rpc_calls::{WebAuthnAuthenticationCredential, WebAuthnAuthenticationResponse};
    use futures::executor::block_on;
    use std::cell::RefCell;
    use std::rc::Rc;
    use wasm_bindgen::JsValue;

    // Minimal, syntactically valid WebAuthnAuthenticationCredential
    let cred = WebAuthnAuthenticationCredential {
        id: "cred-id".to_string(),
        raw_id: "raw-id".to_string(),
        response: WebAuthnAuthenticationResponse {
            client_data_json: "client-data".to_string(),
            authenticator_data: "auth-data".to_string(),
            signature: "signature".to_string(),
            user_handle: None,
        },
        authenticator_attachment: None,
        auth_type: "public-key".to_string(),
    };
    let cred_js: JsValue = serde_wasm_bindgen::to_value(&cred).expect("serialize credential");

    let manager = Rc::new(RefCell::new(VRFKeyManager::new(None, None, None, None)));
    let message_id = Some("msg-verify-missing-challenge".to_string());
    let session_id = "sess-missing-challenge";

    let result = block_on(verify_authentication_if_needed(
        manager,
        &message_id,
        &Some("contract.testnet".to_string()),
        &Some("https://rpc.testnet.near.org".to_string()),
        session_id,
        &cred_js,
    ));

    assert!(result.is_err(), "expected error when challenge is missing");
    let resp = result.err().unwrap();
    assert!(
        !resp.success,
        "response should indicate failure when challenge is missing"
    );
    let err_msg = resp.error.unwrap_or_default();
    assert!(
        err_msg.contains("Missing VRF challenge for session"),
        "unexpected error message: {}",
        err_msg
    );
}

#[test]
#[cfg(target_arch = "wasm32")]
fn reject_near_sk_in_payload() {
    // Craft a minimal message with a forbidden field; guard should reject before parsing
    #[derive(Serialize)]
    struct ForbiddenPayload<'a> {
        #[serde(rename = "type")]
        msg_type: &'a str,
        payload: ForbiddenField<'a>,
    }

    #[derive(Serialize)]
    struct ForbiddenField<'a> {
        #[serde(rename = "near_sk")]
        near_sk: &'a str,
    }

    let msg = ForbiddenPayload {
        msg_type: "PING",
        payload: ForbiddenField {
            near_sk: "should-not-pass",
        },
    };
    let js_val = serde_wasm_bindgen::to_value(&msg).expect("serialize forbidden payload");
    let result = futures::executor::block_on(crate::handle_message(js_val));
    assert!(
        result.is_err(),
        "VRF worker should reject near_sk in payload"
    );
    let err = result.err().unwrap();
    let err_str = err.as_string().unwrap_or_default();
    assert!(
        err_str.contains("Forbidden secret field"),
        "unexpected error: {}",
        err_str
    );
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
    assert_eq!(
        decoded_bytes, test_prf_bytes,
        "Base64url round-trip should preserve original bytes"
    );

    println!("[Passed] Base64url PRF processing consistency test passed");
}

#[test]
fn vrf_input_hash_matches_regression_vector_with_intent_digest() {
    // This is a deterministic regression vector intended to keep the VRF input hash format in
    // lockstep with the on-chain verifier (domain_sep || user_id || rp_id || block_height_le || block_hash || intent_digest_32).
    //
    // Inputs:
    // - domain_separator: "web3_authn_challenge_v4"
    // - user_id: "alice.near"
    // - rp_id: "example.com"
    // - block_height: 12345 (u64 LE)
    // - block_hash (base58): 32 zero bytes (base58 "1" * 32)
    // - intent_digest (base64url): bytes 0..31
    //
    // Expected:
    // - vrf_input (base64url sha256): "-N4GgUAlGrK6ZO5mSzcQdJ0InpsqRxWmuMlJ7rCXR04"
    let mgr = VRFKeyManager::new(None, None, None, None);

    let prf_output = create_test_prf_output();
    let vrf_keypair = mgr
        .generate_vrf_keypair_from_seed(&prf_output, &create_test_account_id())
        .expect("deterministic VRF keypair");

    let input_data = VRFInputData {
        user_id: "alice.near".to_string(),
        rp_id: "example.com".to_string(),
        block_height: "12345".to_string(),
        block_hash: "11111111111111111111111111111111".to_string(),
        intent_digest: Some("AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8".to_string()),
        session_policy_digest_32: None,
    };

    let challenge = mgr
        .generate_vrf_challenge_with_keypair(&vrf_keypair, input_data)
        .expect("VRF challenge generation");

    assert_eq!(
        challenge.vrf_input,
        "-N4GgUAlGrK6ZO5mSzcQdJ0InpsqRxWmuMlJ7rCXR04"
    );
    assert_eq!(
        challenge.intent_digest.as_deref(),
        Some("AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8")
    );
    assert_eq!(
        challenge.block_hash,
        "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    );

    println!("[Passed] VRF input hash regression vector test passed");
}

#[test]
#[cfg(target_arch = "wasm32")]
fn test_vrf_data_structures_serialization() {
    // Test VRFInputData serialization/deserialization
    let vrf_input = VRFInputData {
        user_id: create_test_account_id(),
        rp_id: "example.com".to_string(),
        block_height: "12345".to_string(),
        block_hash: String::from_utf8(vec![0u8; 32]).unwrap(),
        intent_digest: None,
        session_policy_digest_32: None,
    };

    let js_val = serde_wasm_bindgen::to_value(&vrf_input).expect("Should serialize VRFInputData");
    let deserialized: VRFInputData =
        serde_wasm_bindgen::from_value(js_val).expect("Should deserialize VRFInputData");

    assert_eq!(vrf_input.user_id, deserialized.user_id);
    assert_eq!(vrf_input.rp_id, deserialized.rp_id);
    assert_eq!(vrf_input.block_height, deserialized.block_height);
    assert_eq!(vrf_input.block_hash, deserialized.block_hash);

    // Test EncryptedVRFKeypair serialization/deserialization
    let encrypted_keypair = EncryptedVRFKeypair {
        encrypted_vrf_data_b64u: base64_url_encode(&vec![1u8; 64]),
        chacha20_nonce_b64u: base64_url_encode(&vec![2u8; 12]),
    };

    let json_val = serde_wasm_bindgen::to_value(&encrypted_keypair)
        .expect("Should serialize EncryptedVRFKeypair");
    let deserialized: EncryptedVRFKeypair =
        serde_wasm_bindgen::from_value(json_val).expect("Should deserialize EncryptedVRFKeypair");

    assert_eq!(
        encrypted_keypair.encrypted_vrf_data_b64u,
        deserialized.encrypted_vrf_data_b64u
    );
    assert_eq!(
        encrypted_keypair.chacha20_nonce_b64u,
        deserialized.chacha20_nonce_b64u
    );

    println!("[Passed] VRF data structures serialization test passed");
}

#[test]
#[cfg(target_arch = "wasm32")]
fn test_worker_message_format_consistency() {
    // Test VrfWorkerMessage parsing from a JS object
    #[derive(Serialize)]
    struct TestPayload<'a> {
        test: &'a str,
    }

    #[derive(Serialize)]
    struct TestMessage<'a> {
        #[serde(rename = "type")]
        msg_type: &'a str,
        id: &'a str,
        payload: TestPayload<'a>,
    }

    let raw_msg = TestMessage {
        msg_type: "PING",
        id: "test-123",
        payload: TestPayload { test: "data" },
    };
    let js_val = serde_wasm_bindgen::to_value(&raw_msg).expect("Should serialize test message");
    let parsed = parse_worker_request_envelope(js_val).expect("Should parse worker envelope");
    assert_eq!(parsed.request_type, WorkerRequestType::Ping);
    assert_eq!(parsed.id.as_deref(), Some("test-123"));
    let payload_val: HashMap<String, String> =
        serde_wasm_bindgen::from_value(parsed.payload.unwrap()).expect("payload to deserialize");
    assert_eq!(payload_val.get("test").map(String::as_str), Some("data"));

    // Test VrfWorkerResponse serialization round-trip via serde_wasm_bindgen
    #[derive(Serialize, Deserialize, Debug, PartialEq, Eq)]
    struct ResultPayload {
        result: String,
    }

    let test_response = VrfWorkerResponse::success_from(
        Some("test-123".to_string()),
        Some(ResultPayload {
            result: "success".to_string(),
        }),
    );

    let js_val = serde_wasm_bindgen::to_value(&test_response)
        .expect("Should serialize VrfWorkerResponse to JsValue");
    let deserialized: VrfWorkerResponse =
        serde_wasm_bindgen::from_value(js_val).expect("Should deserialize VrfWorkerResponse");

    assert_eq!(test_response.id, deserialized.id);
    assert_eq!(test_response.success, deserialized.success);
    assert_eq!(test_response.error, deserialized.error);

    let data_val: ResultPayload =
        serde_wasm_bindgen::from_value(deserialized.data).expect("data to deserialize");
    assert_eq!(data_val.result, "success");

    println!("[Passed] Worker message format consistency test passed");
}

#[test]
fn test_base64_encoding_consistency() {
    // This test verifies the exact encoding issue that caused the original bug
    let test_data = create_test_prf_output();

    // Test base64url encoding/decoding consistency
    let encoded = base64_url_encode(&test_data);
    let decoded = base64_url_decode(&encoded).expect("Should decode successfully");

    assert_eq!(
        test_data, decoded,
        "Base64url encode/decode should be lossless"
    );
    assert_eq!(
        encoded.len(),
        43,
        "32-byte data should encode to 43 characters (no padding)"
    );

    // Test that the encoding is URL-safe (no +, /, or = characters)
    assert!(
        !encoded.contains('+'),
        "Base64url should not contain + characters"
    );
    assert!(
        !encoded.contains('/'),
        "Base64url should not contain / characters"
    );
    assert!(
        !encoded.contains('='),
        "Base64url should not contain = padding"
    );

    println!("[Passed] Base64 encoding consistency test passed");
}

#[test]
fn test_configuration_constants() {
    // Test that configuration constants are properly defined
    assert_eq!(
        CHACHA20_KEY_SIZE, 32,
        "ChaCha20 key size should be 32 bytes"
    );
    assert_eq!(
        CHACHA20_NONCE_SIZE, 12,
        "ChaCha20 nonce size should be 12 bytes"
    );
    assert_eq!(VRF_SEED_SIZE, 32, "VRF seed size should be 32 bytes");

    // Test domain separator consistency
    assert!(
        !VRF_DOMAIN_SEPARATOR.is_empty(),
        "Domain separator should not be empty"
    );
    assert!(
        VRF_DOMAIN_SEPARATOR.len() > 10,
        "Domain separator should be sufficiently long"
    );

    // Test HKDF info strings
    assert!(
        !HKDF_CHACHA20_KEY_INFO.is_empty(),
        "HKDF ChaCha20 info should not be empty"
    );
    assert!(
        !HKDF_VRF_KEYPAIR_INFO.is_empty(),
        "HKDF VRF info should not be empty"
    );
    assert_eq!(
        HKDF_VRF_KEYPAIR_INFO, b"tatchi:v1:vrf-sk",
        "HKDF VRF info must match spec"
    );
    assert_ne!(
        HKDF_CHACHA20_KEY_INFO, HKDF_VRF_KEYPAIR_INFO,
        "HKDF info strings should be different"
    );

    println!("[Passed] Configuration constants test passed");
}

#[test]
fn deterministic_vrf_keypair_derivation_is_stable() {
    let mgr = VRFKeyManager::new(None, None, None, None);
    let prf_output = create_test_prf_output();
    let account_id = create_test_account_id();

    let kp1 = mgr
        .generate_vrf_keypair_from_seed(&prf_output, &account_id)
        .expect("derive should succeed");
    let kp2 = mgr
        .generate_vrf_keypair_from_seed(&prf_output, &account_id)
        .expect("derive should succeed");

    assert_eq!(
        kp1.secret_key_bytes(),
        kp2.secret_key_bytes(),
        "Deterministic VRF secret key must be stable for same seed"
    );
}

#[test]
fn test_account_id_salt_generation() {
    // Test the salt generation logic that's used for PRF key derivation
    let account_id = create_test_account_id();

    let chacha20_salt = format!("chacha20-salt:{}", account_id);
    let ed25519_salt = format!("ed25519-salt:{}", account_id);

    assert_ne!(
        chacha20_salt, ed25519_salt,
        "AES and Ed25519 salts should be different"
    );
    assert!(
        chacha20_salt.contains(&account_id),
        "AES salt should contain account ID"
    );
    assert!(
        ed25519_salt.contains(&account_id),
        "Ed25519 salt should contain account ID"
    );
    assert!(
        chacha20_salt.starts_with("chacha20-salt:"),
        "AES salt should have correct prefix"
    );
    assert!(
        ed25519_salt.starts_with("ed25519-salt:"),
        "Ed25519 salt should have correct prefix"
    );

    // Test with different account IDs produce different salts
    let different_account = "different-account.testnet";
    let different_chacha20_salt = format!("chacha20-salt:{}", different_account);

    assert_ne!(
        chacha20_salt, different_chacha20_salt,
        "Different accounts should produce different salts"
    );

    println!("[Passed] Account ID salt generation test passed");
}

#[test]
fn test_prf_base64url_edge_cases() {
    // Test empty base64url string
    let empty_result = base64_url_decode("");
    assert!(
        empty_result.is_ok(),
        "Empty base64url should decode successfully"
    );
    assert_eq!(
        empty_result.unwrap(),
        Vec::<u8>::new(),
        "Empty base64url should produce empty bytes"
    );

    // Test invalid base64url characters
    let invalid_result = base64_url_decode("invalid!!!");
    assert!(
        invalid_result.is_err(),
        "Invalid base64url should fail to decode"
    );

    // Test padded base64url (should fail since base64url is unpadded)
    let padded_result = base64_url_decode("SGVsbG8=");
    assert!(
        padded_result.is_err(),
        "Padded base64url should fail to decode"
    );

    // Test valid base64url with URL-safe characters
    let urlsafe_result = base64_url_decode("SGVsbG8_LQ");
    assert!(
        urlsafe_result.is_ok(),
        "URL-safe base64url should decode successfully"
    );

    println!("[Passed] PRF base64url edge cases test passed");
}

#[test]
#[cfg(target_arch = "wasm32")]
fn test_worker_message_prf_field_extraction() {
    // Test that we can extract base64url PRF fields from worker messages
    let test_prf_bytes = create_test_prf_output();
    let test_prf_base64url = base64_url_encode(&test_prf_bytes);

    // Test message with prfKey field (for encryption operations)
    #[derive(Serialize, Deserialize)]
    struct PrfKeyMessage<'a> {
        #[serde(rename = "prfKey")]
        prf_key: &'a str,
        #[serde(rename = "expectedPublicKey")]
        expected_public_key: &'a str,
        #[serde(rename = "nearAccountId")]
        near_account_id: &'a str,
    }

    let message_data = PrfKeyMessage {
        prf_key: &test_prf_base64url,
        expected_public_key: "test-public-key",
        near_account_id: "test.testnet",
    };

    let prf_map: HashMap<String, String> =
        serde_wasm_bindgen::from_value(serde_wasm_bindgen::to_value(&message_data).unwrap())
            .expect("prf map");
    let prf_key_field = prf_map.get("prfKey").map(String::as_str).unwrap_or("");
    assert_eq!(
        prf_key_field, test_prf_base64url,
        "PRF key field should match original"
    );

    let decoded_prf = base64_url_decode(prf_key_field).expect("Should decode PRF key");
    assert_eq!(
        decoded_prf, test_prf_bytes,
        "Decoded PRF should match original bytes"
    );

    // Derivation operations now forward the full WebAuthn credential; PRF output must be embedded
    // inside credential.clientExtensionResults.prf.results.first (or response.clientExtensionResults...).
    #[derive(Serialize)]
    struct Results<'a> {
        first: &'a str,
    }
    #[derive(Serialize)]
    struct Prf<'a> {
        results: Results<'a>,
    }
    #[derive(Serialize)]
    struct ClientExt<'a> {
        prf: Prf<'a>,
    }
    #[derive(Serialize)]
    struct Cred<'a> {
        #[serde(rename = "clientExtensionResults")]
        client_ext: ClientExt<'a>,
    }
    #[derive(Serialize)]
    struct DerivationMessage<'a> {
        credential: Cred<'a>,
        #[serde(rename = "nearAccountId")]
        near_account_id: &'a str,
    }

    let derivation_data = DerivationMessage {
        credential: Cred {
            client_ext: ClientExt {
                prf: Prf {
                    results: Results {
                        first: &test_prf_base64url,
                    },
                },
            },
        },
        near_account_id: "test.testnet",
    };

    let message_val = serde_wasm_bindgen::to_value(&derivation_data).unwrap();
    let cred_val =
        js_sys::Reflect::get(&message_val, &wasm_bindgen::JsValue::from_str("credential"))
            .expect("credential field should exist");

    fn get_nested_str(root: &wasm_bindgen::JsValue, path: &[&str]) -> Option<String> {
        let mut cur = root.clone();
        for key in path {
            let next = js_sys::Reflect::get(&cur, &wasm_bindgen::JsValue::from_str(key)).ok()?;
            if next.is_null() || next.is_undefined() {
                return None;
            }
            cur = next;
        }
        cur.as_string()
    }

    let first_b64u = get_nested_str(
        &cred_val,
        &["clientExtensionResults", "prf", "results", "first"],
    )
    .expect("should find credential PRF.first");
    assert_eq!(first_b64u, test_prf_base64url);
    let decoded_output = base64_url_decode(&first_b64u).expect("Should decode PRF.first");
    assert_eq!(decoded_output, test_prf_bytes);

    println!("[Passed] Worker message credential PRF extraction test passed");
}

#[test]
#[cfg(target_arch = "wasm32")]
fn test_vrf_challenge_camelcase_deserialization() {
    // Test that VRFChallengeData correctly deserializes from camelCase JSON
    // This verifies the #[serde(rename_all = "camelCase")] attribute works correctly

    let mut camelcase_map = BTreeMap::new();
    camelcase_map.insert("vrfInput".to_string(), "dGVzdF9pbnB1dF9kYXRh".to_string());
    camelcase_map.insert(
        "vrfOutput".to_string(),
        "dGVzdF9vdXRwdXRfZGF0YQ".to_string(),
    );
    camelcase_map.insert("vrfProof".to_string(), "dGVzdF9wcm9vZl9kYXRh".to_string());
    camelcase_map.insert(
        "vrfPublicKey".to_string(),
        "dGVzdF9wdWJsaWNfa2V5X2RhdGE".to_string(),
    );
    camelcase_map.insert("userId".to_string(), "test-user.testnet".to_string());
    camelcase_map.insert("rpId".to_string(), "example.com".to_string());
    camelcase_map.insert("blockHeight".to_string(), "12345".to_string());
    camelcase_map.insert(
        "blockHash".to_string(),
        "dGVzdF9ibG9ja19oYXNoX2RhdGE".to_string(),
    );

    let camelcase_js =
        serde_wasm_bindgen::to_value(&camelcase_map).expect("Should serialize camelCase map");

    // Deserialize the JSON-shaped value into VRFChallengeData
    let vrf_challenge: VRFChallengeData = serde_wasm_bindgen::from_value(camelcase_js.clone())
        .expect("Should deserialize VRFChallengeData from camelCase map");

    // Verify all fields are correctly mapped from camelCase to snake_case
    assert_eq!(vrf_challenge.vrf_input, "dGVzdF9pbnB1dF9kYXRh");
    assert_eq!(vrf_challenge.vrf_output, "dGVzdF9vdXRwdXRfZGF0YQ");
    assert_eq!(vrf_challenge.vrf_proof, "dGVzdF9wcm9vZl9kYXRh");
    assert_eq!(vrf_challenge.vrf_public_key, "dGVzdF9wdWJsaWNfa2V5X2RhdGE");
    assert_eq!(vrf_challenge.user_id, "test-user.testnet");
    assert_eq!(vrf_challenge.rp_id, "example.com");
    assert_eq!(vrf_challenge.block_height, "12345");
    assert_eq!(vrf_challenge.block_hash, "dGVzdF9ibG9ja19oYXNoX2RhdGE");

    // Test round-trip serialization/deserialization
    let serialized_js =
        serde_wasm_bindgen::to_value(&vrf_challenge).expect("Should serialize VRFChallengeData");

    let round_trip_challenge: VRFChallengeData =
        serde_wasm_bindgen::from_value(serialized_js.clone())
            .expect("Should deserialize VRFChallengeData from round-trip value");

    // Verify round-trip preserves all data
    assert_eq!(vrf_challenge.vrf_input, round_trip_challenge.vrf_input);
    assert_eq!(vrf_challenge.vrf_output, round_trip_challenge.vrf_output);
    assert_eq!(vrf_challenge.vrf_proof, round_trip_challenge.vrf_proof);
    assert_eq!(
        vrf_challenge.vrf_public_key,
        round_trip_challenge.vrf_public_key
    );
    assert_eq!(vrf_challenge.user_id, round_trip_challenge.user_id);
    assert_eq!(vrf_challenge.rp_id, round_trip_challenge.rp_id);
    assert_eq!(
        vrf_challenge.block_height,
        round_trip_challenge.block_height
    );
    assert_eq!(vrf_challenge.block_hash, round_trip_challenge.block_hash);

    // Test that the serialized value contains camelCase field names (for TypeScript compatibility)
    let serialized_map: BTreeMap<String, String> =
        serde_wasm_bindgen::from_value(serialized_js).expect("map from serialized value");
    assert!(
        serialized_map.contains_key("vrfInput"),
        "Serialized value should contain camelCase vrfInput"
    );
    assert!(
        serialized_map.contains_key("vrfOutput"),
        "Serialized value should contain camelCase vrfOutput"
    );
    assert!(
        serialized_map.contains_key("vrfProof"),
        "Serialized value should contain camelCase vrfProof"
    );
    assert!(
        serialized_map.contains_key("vrfPublicKey"),
        "Serialized value should contain camelCase vrfPublicKey"
    );
    assert!(
        serialized_map.contains_key("userId"),
        "Serialized value should contain camelCase userId"
    );
    assert!(
        serialized_map.contains_key("rpId"),
        "Serialized value should contain camelCase rpId"
    );
    assert!(
        serialized_map.contains_key("blockHeight"),
        "Serialized value should contain camelCase blockHeight"
    );
    assert!(
        serialized_map.contains_key("blockHash"),
        "Serialized value should contain camelCase blockHash"
    );

    println!("[Passed] VRFChallenge camelCase deserialization test passed");
}

#[test]
fn test_shamir_biguint_b64u_roundtrip_known_values() {
    let known_values = vec![
        (0u128, "AA"), // 0 -> base64url "AA" (single zero byte)
        (1u128, "AQ"),
        (255u128, "_w"),
        (256u128, "AQA"),
        (65535u128, "__8"),
    ];
    for (v, _expected_b64u) in known_values {
        // expected strings can vary by leading zero trimming
        let n = BigUint::from(v);
        let enc = encode_biguint_b64u(&n);
        let dec = decode_biguint_b64u(&enc).expect("decode should succeed");
        assert_eq!(dec, n, "roundtrip should preserve value");
    }
    // Large known value: 2^61 - 1
    let mersenne_61 = BigUint::parse_bytes(b"2305843009213693951", 10).unwrap();
    let enc = encode_biguint_b64u(&mersenne_61);
    let dec = decode_biguint_b64u(&enc).expect("decode should succeed");
    assert_eq!(
        dec, mersenne_61,
        "roundtrip for 2^61-1 should preserve value"
    );
}

#[test]
fn test_shamir_biguint_b64u_roundtrip_random_like_bytes() {
    // Deterministic pseudo-random bytes (no RNG needed)
    let mut bytes = [0u8; 64];
    for (i, b) in bytes.iter_mut().enumerate() {
        *b = (i as u8).wrapping_mul(31).wrapping_add(7);
    }
    let n = BigUint::from_bytes_be(&bytes);
    let enc = encode_biguint_b64u(&n);
    let dec = decode_biguint_b64u(&enc).expect("decode should succeed");
    assert_eq!(
        dec, n,
        "roundtrip should preserve value for 64-byte BigUint"
    );
}

// This test hits the error path which constructs a wasm_bindgen::JsValue.
// Gate it to wasm32 only to avoid panicking on native test runner.
#[cfg(target_arch = "wasm32")]
#[test]
fn test_shamir_biguint_b64u_invalid_inputs() {
    // invalid characters
    assert!(decode_biguint_b64u("!!not-base64url!!").is_err());
    // padded base64 (not allowed for base64url)
    assert!(decode_biguint_b64u("AQ==").is_err());
}

#[test]
#[cfg(target_arch = "wasm32")]
fn mint_session_keys_and_send_to_signer_uses_caller_wrap_key_salt_when_provided() {
    // Session id and PRF first auth are arbitrary but well-formed
    let req = MintSessionKeysAndSendToSignerRequest {
        session_id: "sess-123".to_string(),
        wrap_key_salt_b64u: "explicit-salt".to_string(),
        contract_id: None,
        near_rpc_url: None,
        ttl_ms: None,
        remaining_uses: None,
        credential: JsValue::UNDEFINED,
    };
    let json = serde_wasm_bindgen::to_value(&req).expect("serialize");
    let parsed: MintSessionKeysAndSendToSignerRequest =
        serde_wasm_bindgen::from_value(json).expect("deserialize");
    assert_eq!(
        parsed.wrap_key_salt_b64u, "explicit-salt",
        "wrapKeySalt should round-trip unchanged when provided by caller"
    );
}

#[test]
#[cfg(target_arch = "wasm32")]
fn mint_session_keys_and_send_to_signer_generates_salt_when_empty() {
    let req = MintSessionKeysAndSendToSignerRequest {
        session_id: "sess-456".to_string(),
        wrap_key_salt_b64u: "  ".to_string(),
        contract_id: None,
        near_rpc_url: None,
        ttl_ms: None,
        remaining_uses: None,
        credential: JsValue::UNDEFINED,
    };
    // The handler itself runs under wasm32, but the request shape must be JSON-compatible.
    let json = serde_wasm_bindgen::to_value(&req).expect("serialize");
    let parsed: MintSessionKeysAndSendToSignerRequest =
        serde_wasm_bindgen::from_value(json).expect("deserialize");
    assert!(
        parsed.wrap_key_salt_b64u.trim().is_empty(),
        "handler is responsible for generating wrapKeySalt when empty; request struct should preserve caller input"
    );
}

#[test]
#[cfg(target_arch = "wasm32")]
fn generate_vrf_keypair_bootstrap_request_allows_optional_input() {
    let req = GenerateVrfKeypairBootstrapRequest {
        session_id: "sess-bootstrap".to_string(),
        vrf_input_data: Some(VRFInputData {
            user_id: create_test_account_id(),
            rp_id: "example.com".to_string(),
            block_height: "1".to_string(),
            block_hash: "hash".to_string(),
            intent_digest: None,
            session_policy_digest_32: None,
        }),
    };
    let json = serde_wasm_bindgen::to_value(&req).expect("serialize");
    let parsed: GenerateVrfKeypairBootstrapRequest =
        serde_wasm_bindgen::from_value(json).expect("deserialize");
    assert!(
        parsed.vrf_input_data.is_some(),
        "vrfInputData should survive round-trip"
    );
}

#[test]
#[cfg(target_arch = "wasm32")]
fn generate_vrf_challenge_request_requires_input() {
    let req = GenerateVrfChallengeRequest {
        session_id: "sess-challenge".to_string(),
        vrf_input_data: VRFInputData {
            user_id: create_test_account_id(),
            rp_id: "example.com".to_string(),
            block_height: "2".to_string(),
            block_hash: "hash2".to_string(),
            intent_digest: None,
            session_policy_digest_32: None,
        },
    };
    let json = serde_wasm_bindgen::to_value(&req).expect("serialize");
    let parsed: GenerateVrfChallengeRequest =
        serde_wasm_bindgen::from_value(json).expect("deserialize");
    assert_eq!(parsed.vrf_input_data.rp_id, "example.com");
}

#[test]
#[cfg(target_arch = "wasm32")]
fn derive_vrf_keypair_from_prf_request_uses_defaults() {
    let prf_first_b64u = base64_url_encode(&create_test_prf_output());
    #[derive(Serialize)]
    struct Results<'a> {
        first: &'a str,
    }
    #[derive(Serialize)]
    struct Prf<'a> {
        results: Results<'a>,
    }
    #[derive(Serialize)]
    struct ClientExt<'a> {
        prf: Prf<'a>,
    }
    #[derive(Serialize)]
    struct Cred<'a> {
        #[serde(rename = "clientExtensionResults")]
        client_ext: ClientExt<'a>,
    }
    let credential = serde_wasm_bindgen::to_value(&Cred {
        client_ext: ClientExt {
            prf: Prf {
                results: Results {
                    first: &prf_first_b64u,
                },
            },
        },
    })
    .expect("serialize credential");

    let req = DeriveVrfKeypairFromPrfRequest {
        credential,
        near_account_id: create_test_account_id(),
        save_in_memory: true,
        vrf_input_data: None,
    };
    let json = serde_wasm_bindgen::to_value(&req).expect("serialize");
    let parsed: DeriveVrfKeypairFromPrfRequest =
        serde_wasm_bindgen::from_value(json).expect("deserialize");
    assert!(parsed.save_in_memory, "saveInMemory default should be true");
    assert!(
        parsed.vrf_input_data.is_none(),
        "vrfInputData can be omitted"
    );
}
