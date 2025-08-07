use crate::actions::*;
use crate::types::*;

#[test]
fn test_add_key_action_handler() {
    let handler = AddKeyActionHandler;

    let valid_params = ActionParams::AddKey {
        public_key: "ed25519:6E8sCci9badyRkXb3JoRpBj5p8C6Tw41ELDZoiihKEtp".to_string(),
        access_key: serde_json::json!({
            "nonce": 0,
            "permission": {"FullAccess": {}}
        }).to_string(),
    };

    assert!(handler.validate_params(&valid_params).is_ok());

    let action = handler.build_action(&valid_params).unwrap();
    match action {
        Action::AddKey { public_key, access_key: _ } => {
            // Verify the action was built correctly
            // Just verify the action built successfully - string comparison is complex for PublicKey
            assert_eq!(public_key.key_type, 0); // ED25519
            assert_eq!(public_key.key_data.len(), 32);
            // Note: access_key structure validation is complex, but the action built successfully
        }
        _ => panic!("Expected AddKey action"),
    }

    assert_eq!(handler.get_action_type(), ActionType::AddKey);
}

#[test]
fn test_add_key_function_call_permission() {
    let handler = AddKeyActionHandler;

    let function_call_params = ActionParams::AddKey {
        public_key: "ed25519:6E8sCci9badyRkXb3JoRpBj5p8C6Tw41ELDZoiihKEtp".to_string(),
        access_key: serde_json::json!({
            "nonce": 0,
            "permission": {
                "FunctionCall": {
                    "allowance": "1000000000000000000000000",
                    "receiver_id": "example.near",
                    "method_names": ["method1", "method2"]
                }
            }
        }).to_string(),
    };

    assert!(handler.validate_params(&function_call_params).is_ok());

    let action = handler.build_action(&function_call_params).unwrap();
    match action {
        Action::AddKey { access_key, .. } => {
            // Verify it's a FunctionCall permission
            match access_key.permission {
                crate::types::AccessKeyPermission::FunctionCall(_) => {},
                _ => panic!("Expected FunctionCall permission"),
            }
        }
        _ => panic!("Expected AddKey action"),
    }
}

#[test]
fn test_add_key_validation_errors() {
    let handler = AddKeyActionHandler;

    // Test invalid public key format
    let invalid_key_params = ActionParams::AddKey {
        public_key: "invalid_key".to_string(),
        access_key: r#"{"nonce": 0, "permission": {"FullAccess": {}}}"#.to_string(),
    };
    assert!(handler.validate_params(&invalid_key_params).is_err());

    // Test invalid access key JSON
    let invalid_access_key_params = ActionParams::AddKey {
        public_key: "ed25519:6E8sCci9badyRkXb3JoRpBj5p8C6Tw41ELDZoiihKEtp".to_string(),
        access_key: "invalid json".to_string(),
    };
    assert!(handler.validate_params(&invalid_access_key_params).is_err());
}

#[test]
fn test_delete_key_action_handler() {
    let handler = DeleteKeyActionHandler;

    let valid_params = ActionParams::DeleteKey {
        public_key: "ed25519:6E8sCci9badyRkXb3JoRpBj5p8C6Tw41ELDZoiihKEtp".to_string(),
    };

    assert!(handler.validate_params(&valid_params).is_ok());

    let action = handler.build_action(&valid_params).unwrap();
    match action {
        Action::DeleteKey { public_key } => {
            // Verify the public key was parsed correctly
            assert_eq!(public_key.key_type, 0); // ED25519
            assert_eq!(public_key.key_data.len(), 32);
        }
        _ => panic!("Expected DeleteKey action"),
    }

    assert_eq!(handler.get_action_type(), ActionType::DeleteKey);
}

#[test]
fn test_delete_key_validation_errors() {
    let handler = DeleteKeyActionHandler;

    // Test invalid public key format
    let invalid_params = ActionParams::DeleteKey {
        public_key: "invalid_key".to_string(),
    };
    assert!(handler.validate_params(&invalid_params).is_err());

    // Test missing ed25519 prefix with short key (should fail)
    let no_prefix_params = ActionParams::DeleteKey {
        public_key: "shortkey".to_string(), // Too short and no prefix
    };
    assert!(handler.validate_params(&no_prefix_params).is_err());
}

#[test]
fn test_delete_account_action_handler() {
    let handler = DeleteAccountActionHandler;

    let valid_params = ActionParams::DeleteAccount {
        beneficiary_id: "beneficiary.near".to_string(),
    };

    assert!(handler.validate_params(&valid_params).is_ok());

    let action = handler.build_action(&valid_params).unwrap();
    match action {
        Action::DeleteAccount { beneficiary_id } => {
            assert_eq!(beneficiary_id.0, "beneficiary.near");
        }
        _ => panic!("Expected DeleteAccount action"),
    }

    assert_eq!(handler.get_action_type(), ActionType::DeleteAccount);
}

#[test]
fn test_delete_account_validation_errors() {
    let handler = DeleteAccountActionHandler;

    // Test empty beneficiary ID
    let empty_params = ActionParams::DeleteAccount {
        beneficiary_id: "".to_string(),
    };
    assert!(handler.validate_params(&empty_params).is_err());
}

#[test]
fn test_get_action_handler_new_types() {
    // Test all action types can get handlers
    let transfer_params = ActionParams::Transfer { deposit: "1000000000000000000000000".to_string() };
    let handler = get_action_handler(&transfer_params);
    assert!(handler.is_ok());

    let add_key_params = ActionParams::AddKey {
        public_key: "ed25519:6E8sCci9badyRkXb3JoRpBj5p8C6Tw41ELDZoiihKEtp".to_string(),
        access_key: serde_json::json!({
            "nonce": 0,
            "permission": {"FullAccess": {}}
        }).to_string(),
    };
    let handler = get_action_handler(&add_key_params);
    assert!(handler.is_ok());

    let delete_key_params = ActionParams::DeleteKey {
        public_key: "ed25519:6E8sCci9badyRkXb3JoRpBj5p8C6Tw41ELDZoiihKEtp".to_string(),
    };
    let handler = get_action_handler(&delete_key_params);
    assert!(handler.is_ok());

    let delete_account_params = ActionParams::DeleteAccount {
        beneficiary_id: "beneficiary.near".to_string(),
    };
    let handler = get_action_handler(&delete_account_params);
    assert!(handler.is_ok());
}

#[test]
fn test_action_params_serialization() {
    // Test that ActionParams can be serialized/deserialized properly
    let transfer_params = ActionParams::Transfer {
        deposit: "1000000000000000000000000".to_string(),
    };

    let serialized = serde_json::to_string(&transfer_params).unwrap();
    let deserialized: ActionParams = serde_json::from_str(&serialized).unwrap();

    match deserialized {
        ActionParams::Transfer { deposit } => {
            assert_eq!(deposit, "1000000000000000000000000");
        }
        _ => panic!("Expected Transfer action"),
    }
}

// ===== AMOUNT PARSING TESTS =====
// These tests demonstrate the specific issue with amount parsing

#[test]
fn test_transfer_yocto_near_amounts() {
    let handler = TransferActionHandler;

    // Test case 1: Valid yoctoNEAR amounts (what the handler expects)
    let test_cases = vec![
        ("1000000000000000000000000", "1 NEAR in yoctoNEAR"),
        ("1000000000000000000000", "0.001 NEAR in yoctoNEAR"),
        ("1", "1 yoctoNEAR (smallest unit)"),
        ("0", "0 NEAR"),
    ];

    for (amount, description) in test_cases {
        let params = ActionParams::Transfer {
            deposit: amount.to_string(),
        };

        let result = handler.validate_params(&params);
        assert!(result.is_ok(), "Failed to validate {}: {:?}", description, result.err());

        let action = handler.build_action(&params);
        assert!(action.is_ok(), "Failed to build action for {}: {:?}", description, action.err());
    }
}

#[test]
fn test_transfer_decimal_near_amounts_fail() {
    let handler = TransferActionHandler;

    // Test case 2: Decimal NEAR amounts (what TypeScript was sending - these FAIL)
    let failing_cases = vec![
        ("0.001", "0.001 NEAR (decimal format)"),
        ("1.0", "1.0 NEAR (decimal format)"),
        ("0.5", "0.5 NEAR (decimal format)"),
        ("0.0000001", "0.0000001 NEAR (very small decimal)"),
        ("10.25", "10.25 NEAR (decimal with fractional part)"),
    ];

    for (amount, description) in failing_cases {
        let params = ActionParams::Transfer {
            deposit: amount.to_string(),
        };

        let result = handler.validate_params(&params);
        assert!(result.is_err(),
            "Expected {} to fail validation, but it passed. This demonstrates the parsing issue!",
            description
        );

        // The error should be about invalid deposit amount
        let error = result.err().unwrap();
        assert!(error.contains("Invalid deposit amount"),
            "Error should mention invalid deposit amount, got: {}", error
        );
    }
}

#[test]
fn test_transfer_invalid_formats_fail() {
    let handler = TransferActionHandler;

    // Test case 3: Other invalid formats
    let invalid_cases = vec![
        ("", "empty string"),
        ("not_a_number", "non-numeric string"),
        ("-1000", "negative number"),
        ("1.0.0", "invalid decimal format"),
        ("1e24", "scientific notation"),
    ];

    for (amount, description) in invalid_cases {
        let params = ActionParams::Transfer {
            deposit: amount.to_string(),
        };

        let result = handler.validate_params(&params);
        assert!(result.is_err(),
            "Expected {} to fail validation, but it passed",
            description
        );
    }
}

#[test]
fn test_amount_parsing_threshold_demonstration() {
    let handler = TransferActionHandler;

    // Demonstrate the exact threshold where parsing starts to fail
    println!("\n=== AMOUNT PARSING THRESHOLD DEMONSTRATION ===");

    // These work (integer yoctoNEAR strings)
    let working_amounts = vec![
        "1000000000000000000000000", // 1 NEAR
        "1000000000000000000000",    // 0.001 NEAR
        "100000000000000000000",     // 0.0001 NEAR
        "10000000000000000000",      // 0.00001 NEAR
        "1000000000000000000",       // 0.000001 NEAR
        "100000000000000000",        // 0.0000001 NEAR (smallest that would work as integer)
    ];

    for amount in working_amounts {
        let params = ActionParams::Transfer { deposit: amount.to_string() };
        let result = handler.validate_params(&params);
        println!("✓ {} yoctoNEAR: PASSES", amount);
        assert!(result.is_ok(), "Expected {} to pass", amount);
    }

    // These fail (decimal NEAR strings)
    let failing_amounts = vec![
        "1.0",        // 1 NEAR as decimal
        "0.001",      // 0.001 NEAR as decimal
        "0.0000001",  // 0.0000001 NEAR as decimal
    ];

    for amount in failing_amounts {
        let params = ActionParams::Transfer { deposit: amount.to_string() };
        let result = handler.validate_params(&params);
        println!("✗ {} NEAR: FAILS (cannot parse as u128)", amount);
        assert!(result.is_err(), "Expected {} to fail", amount);
    }

    println!("\nCONCLUSION: The handler expects yoctoNEAR integers, not decimal NEAR amounts");
}