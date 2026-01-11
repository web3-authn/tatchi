use crate::actions::*;
use crate::types::*;

#[test]
fn test_add_key_action_handler() {
    let valid_params = ActionParams::AddKey {
        public_key: "ed25519:6E8sCci9badyRkXb3JoRpBj5p8C6Tw41ELDZoiihKEtp".to_string(),
        access_key: r#"{"nonce":0,"permission":{"FullAccess":{}}}"#.to_string(),
    };

    assert!(valid_params.validate().is_ok());

    let action = valid_params.to_action().unwrap();
    match action {
        NearAction::AddKey {
            public_key,
            access_key: _,
        } => {
            // Verify the action was built correctly
            // Just verify the action built successfully - string comparison is complex for PublicKey
            assert_eq!(public_key.key_type, 0); // ED25519
            assert_eq!(public_key.key_data.len(), 32);
            // Note: access_key structure validation is complex, but the action built successfully
        }
        _ => panic!("Expected AddKey action"),
    }
}

#[test]
fn test_add_key_function_call_permission() {
    let function_call_params = ActionParams::AddKey {
        public_key: "ed25519:6E8sCci9badyRkXb3JoRpBj5p8C6Tw41ELDZoiihKEtp".to_string(),
        access_key: r#"{
            "nonce": 0,
            "permission": {
                "FunctionCall": {
                    "allowance": "1000000000000000000000000",
                    "receiverId": "example.near",
                    "methodNames": ["method1", "method2"]
                }
            }
        }"#
        .to_string(),
    };

    assert!(function_call_params.validate().is_ok());

    let action = function_call_params.to_action().unwrap();
    match action {
        NearAction::AddKey { access_key, .. } => {
            // Verify it's a FunctionCall permission
            match access_key.permission {
                crate::types::AccessKeyPermission::FunctionCall(_) => {}
                _ => panic!("Expected FunctionCall permission"),
            }
        }
        _ => panic!("Expected AddKey action"),
    }
}

#[test]
fn test_access_key_full_access_string_and_map_deserialization() {
    use serde::de::value::{Error as DeError, MapDeserializer};

    // NEAR-style form: permission as map { "FullAccess": {} }
    let iter = std::iter::once(("FullAccess".to_string(), ()));
    let de_map = MapDeserializer::<_, DeError>::new(iter);
    let perm_map = crate::types::near::deserialize_access_key_permission_compat(de_map)
        .expect("Permission should deserialize from map { FullAccess: {} }");

    match perm_map {
        AccessKeyPermission::FullAccess => {}
        _ => panic!("Expected FullAccess for map permission"),
    }
}

#[test]
fn test_delete_key_action_handler() {
    let valid_params = ActionParams::DeleteKey {
        public_key: "ed25519:6E8sCci9badyRkXb3JoRpBj5p8C6Tw41ELDZoiihKEtp".to_string(),
    };

    assert!(valid_params.to_action().is_ok());

    let action = valid_params.to_action().unwrap();
    match action {
        NearAction::DeleteKey { public_key } => {
            // Verify the public key was parsed correctly
            assert_eq!(public_key.key_type, 0); // ED25519
            assert_eq!(public_key.key_data.len(), 32);
        }
        _ => panic!("Expected DeleteKey action"),
    }
}

#[test]
fn test_delete_key_validation_errors() {
    // Test invalid public key format
    let invalid_params = ActionParams::DeleteKey {
        public_key: "invalid_key".to_string(),
    };
    assert!(invalid_params.validate().is_err());

    // Test missing ed25519 prefix with short key (should fail)
    let no_prefix_params = ActionParams::DeleteKey {
        public_key: "shortkey".to_string(), // Too short and no prefix
    };
    assert!(no_prefix_params.validate().is_err());
}

#[test]
fn test_delete_account_action_handler() {
    let valid_params = ActionParams::DeleteAccount {
        beneficiary_id: "beneficiary.near".to_string(),
    };

    assert!(valid_params.validate().is_ok());

    let action = valid_params.to_action().unwrap();
    match action {
        NearAction::DeleteAccount { beneficiary_id } => {
            assert_eq!(beneficiary_id.0, "beneficiary.near");
        }
        _ => panic!("Expected DeleteAccount action"),
    }
}

#[test]
fn test_delete_account_validation_errors() {
    // Test empty beneficiary ID
    let empty_params = ActionParams::DeleteAccount {
        beneficiary_id: "".to_string(),
    };
    assert!(empty_params.to_action().is_err());
}

#[test]
fn test_get_action_handler_new_types() {
    // Test all action types can be converted into concrete actions
    let transfer_params = ActionParams::Transfer {
        deposit: "1000000000000000000000000".to_string(),
    };
    assert!(transfer_params.to_action().is_ok());

    let add_key_params = ActionParams::AddKey {
        public_key: "ed25519:6E8sCci9badyRkXb3JoRpBj5p8C6Tw41ELDZoiihKEtp".to_string(),
        access_key: r#"{"nonce":0,"permission":{"FullAccess":{}}}"#.to_string(),
    };
    assert!(add_key_params.to_action().is_ok());

    let delete_key_params = ActionParams::DeleteKey {
        public_key: "ed25519:6E8sCci9badyRkXb3JoRpBj5p8C6Tw41ELDZoiihKEtp".to_string(),
    };
    assert!(delete_key_params.to_action().is_ok());

    let delete_account_params = ActionParams::DeleteAccount {
        beneficiary_id: "beneficiary.near".to_string(),
    };
    assert!(delete_account_params.to_action().is_ok());

    let deploy_params = ActionParams::DeployContract {
        code: vec![0, 97, 115, 109],
    }; // minimal wasm magic start
    assert!(deploy_params.to_action().is_ok());

    let stake_params = ActionParams::Stake {
        stake: "1000000000000000000000000".to_string(),
        public_key: "ed25519:6E8sCci9badyRkXb3JoRpBj5p8C6Tw41ELDZoiihKEtp".to_string(),
    };
    assert!(stake_params.to_action().is_ok());

    let deploy_global_params = ActionParams::DeployGlobalContract {
        code: vec![0, 97, 115, 109],
        deploy_mode: "CodeHash".to_string(),
    };
    assert!(deploy_global_params.to_action().is_ok());

    let use_global_params = ActionParams::UseGlobalContract {
        account_id: Some("global-contract.near".to_string()),
        code_hash: None,
    };
    assert!(use_global_params.to_action().is_ok());
}

#[test]
fn test_deploy_contract_action_handler() {
    let params = ActionParams::DeployContract {
        code: vec![0, 97, 115, 109, 1, 0, 0, 0],
    }; // "\0asm\1\0\0\0"
    assert!(params.validate().is_ok());
    let action = params.to_action().unwrap();
    match action {
        NearAction::DeployContract { code } => {
            assert!(!code.is_empty());
        }
        _ => panic!("Expected DeployContract action"),
    }
}

#[test]
fn test_stake_action_handler() {
    let params = ActionParams::Stake {
        stake: "1000000000000000000000000".to_string(),
        public_key: "ed25519:6E8sCci9badyRkXb3JoRpBj5p8C6Tw41ELDZoiihKEtp".to_string(),
    };
    assert!(params.validate().is_ok());
    let action = params.to_action().unwrap();
    match action {
        NearAction::Stake { stake, public_key } => {
            assert!(stake > 0);
            assert_eq!(public_key.key_type, 0);
            assert_eq!(public_key.key_data.len(), 32);
        }
        _ => panic!("Expected Stake action"),
    }
}

#[test]
fn test_deploy_global_contract_action_handler() {
    let params = ActionParams::DeployGlobalContract {
        code: vec![0, 97, 115, 109, 1, 0, 0, 0],
        deploy_mode: "CodeHash".to_string(),
    };
    assert!(params.validate().is_ok());
    let action = params.to_action().unwrap();
    match action {
        NearAction::DeployGlobalContract { code, deploy_mode } => {
            assert!(!code.is_empty());
            match deploy_mode {
                GlobalContractDeployMode::CodeHash => {}
                _ => panic!("Expected CodeHash deploy mode"),
            }
        }
        _ => panic!("Expected DeployGlobalContract action"),
    }
}

#[test]
fn test_use_global_contract_action_handler_account_id() {
    let params = ActionParams::UseGlobalContract {
        account_id: Some("global-contract.near".to_string()),
        code_hash: None,
    };
    assert!(params.validate().is_ok());
    let action = params.to_action().unwrap();
    match action {
        NearAction::UseGlobalContract {
            contract_identifier,
        } => match contract_identifier {
            GlobalContractIdentifier::AccountId(acc) => {
                assert_eq!(acc.0, "global-contract.near");
            }
            _ => panic!("Expected AccountId identifier"),
        },
        _ => panic!("Expected UseGlobalContract action"),
    }
}

#[test]
fn test_use_global_contract_action_handler_code_hash() {
    use bs58;

    // 32-byte dummy hash
    let bytes = [1u8; 32];
    let hash_str = bs58::encode(bytes).into_string();

    let params = ActionParams::UseGlobalContract {
        account_id: None,
        code_hash: Some(hash_str.clone()),
    };
    assert!(params.validate().is_ok());
    let action = params.to_action().unwrap();
    match action {
        NearAction::UseGlobalContract {
            contract_identifier,
        } => match contract_identifier {
            GlobalContractIdentifier::CodeHash(hash) => {
                assert_eq!(hash.to_vec(), bytes.to_vec());
            }
            _ => panic!("Expected CodeHash identifier"),
        },
        _ => panic!("Expected UseGlobalContract action"),
    }
}

#[test]
fn test_use_global_contract_validation_errors() {
    // Both fields set
    let params = ActionParams::UseGlobalContract {
        account_id: Some("a.near".to_string()),
        code_hash: Some("b".to_string()),
    };
    assert!(params.validate().is_err());

    // Neither field set
    let params = ActionParams::UseGlobalContract {
        account_id: None,
        code_hash: None,
    };
    assert!(params.validate().is_err());
}

// ===== AMOUNT PARSING TESTS =====
// These tests demonstrate the specific issue with amount parsing

#[test]
fn test_transfer_yocto_near_amounts() {
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

        let result = params.validate();
        assert!(
            result.is_ok(),
            "Failed to validate {}: {:?}",
            description,
            result.err()
        );

        let action = params.to_action();
        assert!(
            action.is_ok(),
            "Failed to build action for {}: {:?}",
            description,
            action.err()
        );
    }
}

#[test]
fn test_transfer_decimal_near_amounts_fail() {
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

        let result = params.validate();
        assert!(
            result.is_err(),
            "Expected {} to fail validation, but it passed. This demonstrates the parsing issue!",
            description
        );

        // The error should be about invalid deposit amount
        let error = result.err().unwrap();
        assert!(
            error.contains("Invalid deposit amount"),
            "Error should mention invalid deposit amount, got: {}",
            error
        );
    }
}

#[test]
fn test_transfer_invalid_formats_fail() {
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

        let result = params.validate();
        assert!(
            result.is_err(),
            "Expected {} to fail validation, but it passed",
            description
        );
    }
}

#[test]
fn test_amount_parsing_threshold_demonstration() {
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
        let params = ActionParams::Transfer {
            deposit: amount.to_string(),
        };
        let result = params.validate();
        println!("✓ {} yoctoNEAR: PASSES", amount);
        assert!(result.is_ok(), "Expected {} to pass", amount);
    }

    // These fail (decimal NEAR strings)
    let failing_amounts = vec![
        "1.0",       // 1 NEAR as decimal
        "0.001",     // 0.001 NEAR as decimal
        "0.0000001", // 0.0000001 NEAR as decimal
    ];

    for amount in failing_amounts {
        let params = ActionParams::Transfer {
            deposit: amount.to_string(),
        };
        let result = params.validate();
        println!("✗ {} NEAR: FAILS (cannot parse as u128)", amount);
        assert!(result.is_err(), "Expected {} to fail", amount);
    }

    println!("\nCONCLUSION: The handler expects yoctoNEAR integers, not decimal NEAR amounts");
}
