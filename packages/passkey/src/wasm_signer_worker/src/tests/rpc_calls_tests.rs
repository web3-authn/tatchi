use crate::rpc_calls::*;
use crate::types::*;
use crate::encoders::base64_url_decode;
use serde_json::json;

#[test]
fn test_base64_url_decode() {
    // Test valid base64url
    let input = "SGVsbG8gV29ybGQ";
    let result = base64_url_decode(input).unwrap();
    assert_eq!(result, b"Hello World");

    // Test base64url with URL-safe characters
    let input_urlsafe = "SGVsbG8gV29ybGQ";
    let result_urlsafe = base64_url_decode(input_urlsafe).unwrap();
    assert_eq!(result_urlsafe, b"Hello World");

    // Test with padding needed
    let input_padding = "SGVsbG8";
    let result_padding = base64_url_decode(input_padding).unwrap();
    assert_eq!(result_padding, b"Hello");

    // Test invalid base64url
    let invalid_input = "Invalid@#$%";
    assert!(base64_url_decode(invalid_input).is_err());

    // Test empty string
    let empty_result = base64_url_decode("").unwrap();
    assert_eq!(empty_result, b"");
}

#[test]
fn test_vrf_data_serialization() {
    let vrf_data = VrfData {
        vrf_input_data: vec![0x01, 0x02, 0x03],
        vrf_output: vec![0x04, 0x05, 0x06],
        vrf_proof: vec![0x07, 0x08, 0x09],
        public_key: vec![0x0a, 0x0b, 0x0c],
        user_id: "test.testnet".to_string(),
        rp_id: "example.com".to_string(),
        block_height: 12345,
        block_hash: vec![0x0d, 0x0e, 0x0f],
    };

    // Test serialization
    let serialized = serde_json::to_string(&vrf_data).unwrap();
    assert!(serialized.contains("test.testnet"));
    assert!(serialized.contains("example.com"));
    assert!(serialized.contains("12345"));

    // Test deserialization
    let deserialized: VrfData = serde_json::from_str(&serialized).unwrap();
    assert_eq!(deserialized.user_id, vrf_data.user_id);
    assert_eq!(deserialized.rp_id, vrf_data.rp_id);
    assert_eq!(deserialized.block_height, vrf_data.block_height);
    assert_eq!(deserialized.vrf_input_data, vrf_data.vrf_input_data);
}

#[test]
fn test_webauthn_authentication_credential_serialization() {
    let auth_credential = WebAuthnAuthenticationCredential {
        id: "credential_id_123".to_string(),
        raw_id: "cmF3X2lk".to_string(),
        response: WebAuthnAuthenticationResponse {
            client_data_json: "eyJ0eXBlIjoid2ViYXV0aG4uZ2V0In0".to_string(),
            authenticator_data: "SZYN5YgOjGh0NBcPZHZgW4_krrmihjLHmVzzuoMdl2MFAAAAAQ".to_string(),
            signature: "MEUCIQDTGVxqmWd_BstOm8K-".to_string(),
            user_handle: Some("dXNlcl9oYW5kbGU".to_string()),
        },
        authenticator_attachment: Some("platform".to_string()),
        auth_type: "public-key".to_string(),
    };

    // Test serialization
    let serialized = serde_json::to_string(&auth_credential).unwrap();
    assert!(serialized.contains("credential_id_123"));
    assert!(serialized.contains("public-key"));
    assert!(serialized.contains("platform"));

    // Test deserialization
    let deserialized: WebAuthnAuthenticationCredential = serde_json::from_str(&serialized).unwrap();
    assert_eq!(deserialized.id, auth_credential.id);
    assert_eq!(deserialized.auth_type, auth_credential.auth_type);
    assert_eq!(deserialized.authenticator_attachment, auth_credential.authenticator_attachment);
}

#[test]
fn test_webauthn_registration_credential_serialization() {
    let reg_credential = WebAuthnRegistrationCredential {
        id: "reg_credential_id_456".to_string(),
        raw_id: "cmVnX3Jhd19pZA".to_string(),
        response: WebAuthnRegistrationResponse {
            client_data_json: "eyJ0eXBlIjoid2ViYXV0aG4uY3JlYXRlIn0".to_string(),
            attestation_object: "o2NmbXRkbm9uZWdhdHRTdG10oGhhdXRoRGF0YVjE".to_string(),
            transports: Some(vec!["internal".to_string(), "hybrid".to_string()]),
        },
        authenticator_attachment: Some("platform".to_string()),
        reg_type: "public-key".to_string(),
    };

    // Test serialization
    let serialized = serde_json::to_string(&reg_credential).unwrap();
    assert!(serialized.contains("reg_credential_id_456"));
    assert!(serialized.contains("internal"));
    assert!(serialized.contains("hybrid"));

    // Test deserialization
    let deserialized: WebAuthnRegistrationCredential = serde_json::from_str(&serialized).unwrap();
    assert_eq!(deserialized.id, reg_credential.id);
    assert_eq!(deserialized.reg_type, reg_credential.reg_type);
    assert_eq!(deserialized.response.transports, reg_credential.response.transports);
}

#[test]
fn test_contract_verification_result() {
    let result = ContractVerificationResult {
        success: true,
        verified: true,
        error: None,
        logs: vec!["Verification successful".to_string()],
    };

    assert_eq!(result.success, true);
    assert_eq!(result.verified, true);
    assert!(result.error.is_none());
    assert_eq!(result.logs.len(), 1);
}

#[test]
fn test_contract_registration_result() {
    let result = ContractRegistrationResult {
        success: true,
        verified: true,
        error: None,
        logs: vec!["Registration completed".to_string()],
        registration_info: Some(RegistrationInfo {
            credential_id: vec![0x01, 0x02, 0x03],
            credential_public_key: vec![0x04, 0x05, 0x06],
        }),
        signed_transaction_borsh: Some(vec![0x0a, 0x0b, 0x0c]),
        pre_signed_delete_transaction: Some(vec![0x0d, 0x0e, 0x0f]),
    };

    assert_eq!(result.success, true);
    assert_eq!(result.verified, true);
    assert!(result.registration_info.is_some());
    assert!(result.signed_transaction_borsh.is_some());
}

#[test]
fn test_registration_info_serialization() {
    let reg_info = RegistrationInfo {
        credential_id: vec![0x01, 0x02, 0x03, 0x04],
        credential_public_key: vec![0x05, 0x06, 0x07, 0x08],
    };

    // Test serialization
    let serialized = serde_json::to_string(&reg_info).unwrap();
    let deserialized: RegistrationInfo = serde_json::from_str(&serialized).unwrap();

    assert_eq!(deserialized.credential_id, reg_info.credential_id);
    assert_eq!(deserialized.credential_public_key, reg_info.credential_public_key);
}

#[test]
fn test_parse_check_can_register_response_success() {
    let _mock_rpc_response = json!({
        "result": {
            "result": [118, 101, 114, 105, 102, 105, 101, 100, 58, 116, 114, 117, 101], // "verified:true" as bytes
            "logs": ["VRF verification successful", "WebAuthn validation passed"]
        }
    });

#[test]
fn test_vrf_challenge_camelcase_deserialization() {
    // Test that VrfChallenge correctly deserializes from camelCase JSON
    // This verifies the #[serde(rename_all = "camelCase")] attribute works correctly

    // Create a JSON string with camelCase field names (as TypeScript would send)
    let camelcase_json = r#"{
        "vrfInput": "dGVzdF9pbnB1dF9kYXRh",
        "vrfOutput": "dGVzdF9vdXRwdXRfZGF0YQ",
        "vrfProof": "dGVzdF9wcm9vZl9kYXRh",
        "vrfPublicKey": "UiY6KfPKeLP5XDAri5eyepbmQuxMHERaIZp6vR_eHxc",
        "userId": "serp147.web3-authn-v2.testnet",
        "rpId": "example.localhost",
        "blockHeight": 207498332,
        "blockHash": "dGVzdF9ibG9ja19oYXNoX2RhdGE"
    }"#;

    // Deserialize the JSON into VrfChallenge
    let vrf_challenge: VrfChallenge = serde_json::from_str(camelcase_json)
        .expect("Should deserialize VrfChallenge from camelCase JSON");

    // Verify all fields are correctly mapped from camelCase to snake_case
    assert_eq!(vrf_challenge.vrf_input, "dGVzdF9pbnB1dF9kYXRh");
    assert_eq!(vrf_challenge.vrf_output, "dGVzdF9vdXRwdXRfZGF0YQ");
    assert_eq!(vrf_challenge.vrf_proof, "dGVzdF9wcm9vZl9kYXRh");
    assert_eq!(vrf_challenge.vrf_public_key, "UiY6KfPKeLP5XDAri5eyepbmQuxMHERaIZp6vR_eHxc");
    assert_eq!(vrf_challenge.user_id, "serp147.web3-authn-v2.testnet");
    assert_eq!(vrf_challenge.rp_id, "example.localhost");
    assert_eq!(vrf_challenge.block_height, 207498332);
    assert_eq!(vrf_challenge.block_hash, "dGVzdF9ibG9ja19oYXNoX2RhdGE");

    // Test round-trip serialization/deserialization
    let serialized_json = serde_json::to_string(&vrf_challenge)
        .expect("Should serialize VrfChallenge to JSON");

    let round_trip_challenge: VrfChallenge = serde_json::from_str(&serialized_json)
        .expect("Should deserialize VrfChallenge from round-trip JSON");

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

    println!("[Passed] VrfChallenge camelCase deserialization test passed");

    // Create a simplified contract response that matches what would be in the bytes
    let contract_response = json!({
        "verified": true,
        "user_exists": false
    });

    // Convert to bytes as the RPC would
    let response_bytes: Vec<u8> = contract_response.to_string().as_bytes().to_vec();
    let response_u8_array: Vec<serde_json::Value> = response_bytes.iter().map(|&b| json!(b)).collect();

    let mock_response_with_bytes = json!({
        "result": {
            "result": response_u8_array,
            "logs": ["VRF verification successful", "WebAuthn validation passed"]
        }
    });

    let result = parse_check_can_register_response(mock_response_with_bytes).unwrap();
    assert_eq!(result.success, true);
    assert_eq!(result.verified, true);
    assert_eq!(result.logs.len(), 2);
    assert!(result.logs.contains(&"VRF verification successful".to_string()));
}

#[test]
fn test_parse_check_can_register_response_with_error() {
    let mock_error_response = json!({
        "error": {
            "message": "Contract call failed"
        }
    });

    let result = parse_check_can_register_response(mock_error_response).unwrap();
    assert_eq!(result.success, false);
    assert_eq!(result.verified, false);
    assert!(result.error.is_some());
    assert!(result.error.unwrap().contains("Contract call failed"));
}

#[test]
fn test_parse_check_can_register_response_missing_result() {
    let mock_invalid_response = json!({
        "jsonrpc": "2.0",
        "id": "test"
        // Missing "result" field
    });

    let result = parse_check_can_register_response(mock_invalid_response);
    assert!(result.is_err());
    assert!(result.unwrap_err().contains("Missing result in RPC response"));
}

#[test]
fn test_extract_detailed_execution_error_function_call_error() {
    let execution_outcome = json!({
        "Failure": {
            "ActionError": {
                "index": 0,
                "kind": {
                    "FunctionCallError": {
                        "ExecutionError": "Smart contract panicked: assertion failed"
                    }
                }
            }
        }
    });

    let error_msg = extract_detailed_execution_error(&execution_outcome);
    assert!(error_msg.contains("FunctionCall execution error"));
    assert!(error_msg.contains("assertion failed"));
    assert!(error_msg.contains("action 0"));
}

#[test]
fn test_extract_detailed_execution_error_account_not_exist() {
    let execution_outcome = json!({
        "Failure": {
            "ActionError": {
                "index": 1,
                "kind": {
                    "AccountDoesNotExist": {
                        "account_id": "nonexistent.testnet"
                    }
                }
            }
        }
    });

    let error_msg = extract_detailed_execution_error(&execution_outcome);
    assert!(error_msg.contains("Account does not exist"));
    assert!(error_msg.contains("nonexistent.testnet"));
    assert!(error_msg.contains("action 1"));
}

#[test]
fn test_extract_detailed_execution_error_method_not_found() {
    let execution_outcome = json!({
        "Failure": {
            "ActionError": {
                "index": 0,
                "kind": {
                    "FunctionCallError": {
                        "MethodResolveError": "unknown_method"
                    }
                }
            }
        }
    });

    let error_msg = extract_detailed_execution_error(&execution_outcome);
    assert!(error_msg.contains("Method not found"));
    assert!(error_msg.contains("unknown_method"));
}

#[test]
fn test_extract_detailed_execution_error_insufficient_stake() {
    let execution_outcome = json!({
        "Failure": {
            "ActionError": {
                "index": 2,
                "kind": {
                    "InsufficientStake": {
                        "minimum_stake": "100000000000000000000000000",
                        "user_stake": "50000000000000000000000000"
                    }
                }
            }
        }
    });

    let error_msg = extract_detailed_execution_error(&execution_outcome);
    assert!(error_msg.contains("Insufficient stake"));
    assert!(error_msg.contains("minimum_stake=100000000000000000000000000"));
    assert!(error_msg.contains("user_stake=50000000000000000000000000"));
}

#[test]
fn test_extract_detailed_execution_error_simple_failure() {
    let execution_outcome = json!({
        "Failure": "Transaction validation failed"
    });

    let error_msg = extract_detailed_execution_error(&execution_outcome);
    assert_eq!(error_msg, "Transaction validation failed");
}

#[test]
fn test_extract_detailed_execution_error_invalid_tx() {
    let execution_outcome = json!({
        "Failure": {
            "InvalidTxError": {
                "InvalidNonce": {
                    "tx_nonce": 42,
                    "ak_nonce": 41
                }
            }
        }
    });

    let error_msg = extract_detailed_execution_error(&execution_outcome);
    assert!(error_msg.contains("Invalid transaction"));
    assert!(error_msg.contains("InvalidNonce"));
}

#[test]
fn test_extract_detailed_execution_error_unknown_format() {
    let execution_outcome = json!({
        "Failure": {
            "UnknownErrorType": {
                "data": "some unknown error data"
            }
        }
    });

    let error_msg = extract_detailed_execution_error(&execution_outcome);
    assert!(error_msg.contains("Transaction failure"));
    assert!(error_msg.contains("UnknownErrorType"));
}

#[test]
fn test_bs58_encode_decode() {
    let test_data = vec![0x01, 0x02, 0x03, 0x04, 0x05];
    let encoded = bs58::encode(&test_data).into_string();
    let decoded = bs58::decode(&encoded).into_vec().unwrap();
    assert_eq!(decoded, test_data);

    // Test invalid base58
    let invalid_b58 = "0OIl"; // Contains invalid characters
    assert!(bs58::decode(invalid_b58).into_vec().is_err());
}

// Helper functions for testing
#[cfg(test)]
pub fn extract_detailed_execution_error(execution_outcome: &serde_json::Value) -> String {
    // Handle direct failure object (test format)
    if let Some(failure) = execution_outcome.get("Failure") {
        if failure.is_string() {
            return failure.as_str().unwrap_or("Transaction validation failed").to_string();
        }

        // Handle ActionError format
        if let Some(action_error) = failure.get("ActionError") {
            let index = action_error.get("index").and_then(|i| i.as_u64()).unwrap_or(0);
            if let Some(kind) = action_error.get("kind") {
                return extract_action_error_message(kind, index);
            }
        }

        // Handle InvalidTxError format (direct under Failure)
        if let Some(invalid_tx) = failure.get("InvalidTxError") {
            return format!("Invalid transaction: {}", invalid_tx);
        }

        // Handle unknown error formats
        return format!("Transaction failure: {}", failure);
    }

    // Handle transaction outcome format
    if let Some(status) = execution_outcome.get("status") {
        if let Some(failure) = status.get("Failure") {
            if failure.is_string() {
                return failure.as_str().unwrap_or("Transaction validation failed").to_string();
            }
            if let Some(action_error) = failure.get("ActionError") {
                let index = action_error.get("index").and_then(|i| i.as_u64()).unwrap_or(0);
                if let Some(kind) = action_error.get("kind") {
                    return extract_action_error_message(kind, index);
                }
            }
            return format!("Transaction validation failed: {}", failure);
        }
    }

    // Check receipts for execution errors
    if let Some(receipts) = execution_outcome.get("receipts") {
        if let serde_json::Value::Array(receipts_array) = receipts {
            for receipt in receipts_array {
                if let Some(outcome) = receipt.get("outcome") {
                    if let Some(status) = outcome.get("status") {
                        if let Some(failure) = status.get("Failure") {
                            if let Some(action_error) = failure.get("ActionError") {
                                let index = action_error.get("index").and_then(|i| i.as_u64()).unwrap_or(0);
                                if let Some(kind) = action_error.get("kind") {
                                    return extract_action_error_message(kind, index);
                                }
                            }
                            return format!("Receipt execution failed: {}", failure);
                        }
                    }
                }
            }
        }
    }

    "Unknown execution error".to_string()
}

#[cfg(test)]
fn extract_action_error_message(kind: &serde_json::Value, index: u64) -> String {
    if let Some(function_call_error) = kind.get("FunctionCallError") {
        if let Some(method_resolve_error) = function_call_error.get("MethodResolveError") {
            return format!("Method not found: {} (action {})", method_resolve_error, index);
        }
        if let Some(execution_error) = function_call_error.get("ExecutionError") {
            return format!("FunctionCall execution error: {} (action {})", execution_error, index);
        }
        return format!("FunctionCall execution error (action {})", index);
    }

    if let Some(account_error) = kind.get("AccountDoesNotExist") {
        if let Some(account_id) = account_error.get("account_id") {
            return format!("Account does not exist: {} (action {})", account_id, index);
        }
        return format!("Account does not exist (action {})", index);
    }

    if let Some(insufficient_stake) = kind.get("InsufficientStake") {
        let mut msg = "Insufficient stake".to_string();
        if let Some(min_stake) = insufficient_stake.get("minimum_stake") {
            let min_stake_str = min_stake.as_str().map(|s| s.to_string()).unwrap_or_else(|| min_stake.to_string());
            msg.push_str(&format!(" minimum_stake={}", min_stake_str.trim_matches('"')));
        }
        if let Some(user_stake) = insufficient_stake.get("user_stake") {
            let user_stake_str = user_stake.as_str().map(|s| s.to_string()).unwrap_or_else(|| user_stake.to_string());
            msg.push_str(&format!(" user_stake={}", user_stake_str.trim_matches('"')));
        }
        msg.push_str(&format!(" (action {})", index));
        return msg;
    }

    if kind.get("InvalidTxError").is_some() {
        return format!("Invalid transaction (action {})", index);
    }

    format!("Transaction failure: {} (action {})", kind, index)
}