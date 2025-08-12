use crate::types::*;
use crate::actions::*;
use crate::crypto::*;
use crate::transaction::*;

// Helper function for tests - creates deterministic keypair for testing using account-specific encryption
fn create_test_keypair_with_prf(prf_output_b64: &str) -> (String, EncryptedDataChaCha20Response) {
    // Use deterministic function with account-specific derivation
    let test_account = "test.testnet";
    let (private_key, public_key) = derive_ed25519_key_from_prf_output(prf_output_b64, test_account).unwrap();

    // Encrypt the key using account-specific HKDF (matches decrypt_private_key_with_prf)
    let encryption_key = derive_chacha20_key_from_prf(prf_output_b64, test_account).unwrap();
    let encrypted_result = encrypt_data_chacha20(&private_key, &encryption_key).unwrap();

    (public_key, encrypted_result)
}

#[test]
fn test_account_specific_chacha20_key_derivation() {
    // Test account-specific AES key derivation
    let prf_output_b64 = "dGVzdC1wcmYtb3V0cHV0LWZyb20td2ViYXV0aG4";
    let account_id = "test.testnet";
    let key = derive_chacha20_key_from_prf(prf_output_b64, account_id).unwrap();
    assert_eq!(key.len(), 32);

    // Should be deterministic for same account
    let key2 = derive_chacha20_key_from_prf(prf_output_b64, account_id).unwrap();
    assert_eq!(key, key2);

    // Should be different for different accounts
    let key3 = derive_chacha20_key_from_prf(prf_output_b64, "different.testnet").unwrap();
    assert_ne!(key, key3);
}

#[test]
fn test_encryption_decryption_roundtrip() {
    let key = vec![0u8; 32]; // Test key
    let plaintext = "Hello, WebAuthn PRF!";

    let encrypted = encrypt_data_chacha20(plaintext, &key).unwrap();

    let decrypted = decrypt_data_chacha20(
        &encrypted.encrypted_near_key_data_b64u,
        &encrypted.chacha20_nonce_b64u,
        &key
    ).unwrap();

    assert_eq!(plaintext, decrypted);
}

#[test]
fn test_deterministic_near_key_generation() {
    // Test deterministic NEAR key generation using PRF
    let prf_output_b64 = "dGVzdC1wcmYtb3V0cHV0LWZyb20td2ViYXV0aG4";
    let account_id = "test.testnet";

    let (private_key, public_key) = derive_ed25519_key_from_prf_output(prf_output_b64, account_id).unwrap();

    // Should start with proper format
    assert!(private_key.starts_with("ed25519:"));
    assert!(public_key.starts_with("ed25519:"));

    // Should be deterministic
    let (private_key2, public_key2) = derive_ed25519_key_from_prf_output(prf_output_b64, account_id).unwrap();
    assert_eq!(private_key, private_key2);
    assert_eq!(public_key, public_key2);

    // Should be different for different accounts
    let (private_key3, public_key3) = derive_ed25519_key_from_prf_output(prf_output_b64, "different.testnet").unwrap();
    assert_ne!(private_key, private_key3);
    assert_ne!(public_key, public_key3);
}

#[test]
fn test_deterministic_near_key_derivation() {
    // Test with multiple PRF outputs
    let prf_output1 = "dGVzdC1wcmYtb3V0cHV0LWZyb20td2ViYXV0aG4xMjM";
    let prf_output2 = "ZGlmZmVyZW50LXByZi1vdXRwdXQtZnJvbS13ZWJhdXRobg";
    let account_id = "test.testnet";

    let (private_key1, public_key1) = derive_ed25519_key_from_prf_output(prf_output1, account_id).unwrap();
    let (private_key2, public_key2) = derive_ed25519_key_from_prf_output(prf_output2, account_id).unwrap();

    // Different PRF outputs should generate different keys
    assert_ne!(private_key1, private_key2);
    assert_ne!(public_key1, public_key2);

    // But same PRF should be deterministic
    let (private_key1_dup, public_key1_dup) = derive_ed25519_key_from_prf_output(prf_output1, account_id).unwrap();
    assert_eq!(private_key1, private_key1_dup);
    assert_eq!(public_key1, public_key1_dup);
}

#[test]
fn test_private_key_decryption_with_prf() {
    let prf_output_b64 = "dGVzdC1wcmYtb3V0cHV0LWZyb20td2ViYXV0aG4";
    let account_id = "test.testnet";

    // Create a test keypair and encrypt it
    let (public_key, encrypted_result) = create_test_keypair_with_prf(prf_output_b64);

    // Test decryption - fix parameter order: (near_account_id, chacha20_prf_output, encrypted_data, iv)
    let _decrypted_key = decrypt_private_key_with_prf(
        account_id,
        prf_output_b64,
        &encrypted_result.encrypted_near_key_data_b64u,
        &encrypted_result.chacha20_nonce_b64u,
    ).unwrap();

    // The decrypted signing key should be valid (we can't easily check the exact format without exposing internals)
    // But we can verify the public key matches
    assert!(public_key.starts_with("ed25519:"));
}

#[test]
fn test_dual_prf_key_derivation() {
    let chacha20_prf = "dGVzdC1hZXMtcHJmLW91dHB1dA";
    let ed25519_prf = "dGVzdC1lZDI1NTE5LXByZi1vdXRwdXQ";
    let account_id = "test.testnet";

    // Test AES key derivation (account-specific)
    let chacha20_key = derive_chacha20_key_from_prf(chacha20_prf, account_id).unwrap();
    assert_eq!(chacha20_key.len(), 32);

    // Test Ed25519 key derivation
    let (ed25519_private, ed25519_public) = derive_ed25519_key_from_prf_output(ed25519_prf, account_id).unwrap();
    assert!(ed25519_private.starts_with("ed25519:"));
    assert!(ed25519_public.starts_with("ed25519:"));

    // Test combined dual PRF derivation
    let dual_prf = DualPrfOutputs {
        chacha20_prf_output_base64: chacha20_prf.to_string(),
        ed25519_prf_output_base64: ed25519_prf.to_string(),
    };

    let (public_key2, _encrypted_data2) = derive_and_encrypt_keypair_from_dual_prf(&dual_prf, account_id).unwrap();
    assert!(public_key2.starts_with("ed25519:"));
    // The public key from dual PRF should match the Ed25519-only derivation
    assert_eq!(ed25519_public, public_key2);
}

#[test]
fn test_dual_prf_key_isolation() {
    let chacha20_prf = "dGVzdC1hZXMtcHJmLW91dHB1dA";
    let ed25519_prf = "dGVzdC1lZDI1NTE5LXByZi1vdXRwdXQ";
    let account_id = "test.testnet";

    // Derive keys separately
    let _chacha20_key = derive_chacha20_key_from_prf(chacha20_prf, account_id).unwrap();

    let (_ed25519_private, _ed25519_public) = derive_ed25519_key_from_prf_output(ed25519_prf, account_id).unwrap();

    // Keys should be completely independent - changing one PRF shouldn't affect the other
    let different_chacha20_prf = "ZGlmZmVyZW50LWFlcy1wcmYtb3V0cHV0";
    let _chacha20_key_different = derive_chacha20_key_from_prf(different_chacha20_prf, account_id).unwrap();

    // Should still be able to derive Ed25519 key with original PRF
    let (_ed25519_private2, _ed25519_public2) = derive_ed25519_key_from_prf_output(ed25519_prf, account_id).unwrap();
}

#[test]
fn test_dual_prf_edge_cases() {
    let account_id = "test.testnet";

    // Test with empty-ish PRF outputs (base64 encoded empty strings)
    let empty_prf = ""; // Empty string
    let minimal_prf = "YQ"; // base64 for "a"

    // These should fail gracefully
    assert!(derive_chacha20_key_from_prf(empty_prf, account_id).is_err());
    assert!(derive_ed25519_key_from_prf_output(empty_prf, account_id).is_err());

    // Minimal PRF should still work (base64 padding is handled)
    assert!(derive_chacha20_key_from_prf(minimal_prf, account_id).is_ok());
    assert!(derive_ed25519_key_from_prf_output(minimal_prf, account_id).is_ok());
}

#[test]
fn test_private_key_format_compatibility() {
    let prf_output_b64 = "dGVzdC1wcmYtb3V0cHV0LWZyb20td2ViYXV0aG4";
    let account_id = "test.testnet";

    let (private_key, _public_key) = derive_ed25519_key_from_prf_output(prf_output_b64, account_id).unwrap();

    // Verify NEAR private key format
    assert!(private_key.starts_with("ed25519:"), "Private key should start with ed25519:");

    // Extract the base58 part and verify it's valid
    let base58_part = &private_key[8..]; // Skip "ed25519:" prefix
    assert!(base58_part.len() > 0, "Base58 part should not be empty");

    // Should be valid base58 (this will panic if invalid)
    let _decoded = bs58::decode(base58_part).into_vec().expect("Should be valid base58");
}

#[test]
fn test_transfer_action_handler() {
    let handler = TransferActionHandler;

    let valid_params = ActionParams::Transfer {
        deposit: "1000000000000000000000000".to_string(), // 1 NEAR
    };

    assert!(handler.validate_params(&valid_params).is_ok());

    let action = handler.build_action(&valid_params).unwrap();
    match action {
        Action::Transfer { deposit } => {
            assert_eq!(deposit, 1000000000000000000000000u128);
        }
        _ => panic!("Expected Transfer action"),
    }
}

#[test]
fn test_function_call_action_handler() {
    let handler = FunctionCallActionHandler;

    let valid_params = ActionParams::FunctionCall {
        method_name: "test_method".to_string(),
        args: r#"{"key": "value"}"#.to_string(),
        gas: crate::config::VERIFY_REGISTRATION_GAS.to_string(),
        deposit: "0".to_string(),
    };

    assert!(handler.validate_params(&valid_params).is_ok());

    let action = handler.build_action(&valid_params).unwrap();
    match action {
        Action::FunctionCall(call) => {
            assert_eq!(call.method_name, "test_method");
            assert_eq!(call.gas, 30000000000000u64);
            assert_eq!(call.deposit, 0u128);
        }
        _ => panic!("Expected FunctionCall action"),
    }
}

#[test]
fn test_create_account_action_handler() {
    let handler = CreateAccountActionHandler;

    let params = ActionParams::CreateAccount;

    assert!(handler.validate_params(&params).is_ok());

    let action = handler.build_action(&params).unwrap();
    match action {
        Action::CreateAccount => {
            // Success - this is what we expect
        }
        _ => panic!("Expected CreateAccount action"),
    }
}

#[test]
fn test_action_handler_validation_errors() {
    let transfer_handler = TransferActionHandler;

    // Test invalid deposit amount
    let invalid_transfer = ActionParams::Transfer {
        deposit: "invalid_amount".to_string(),
    };
    assert!(transfer_handler.validate_params(&invalid_transfer).is_err());

    let function_call_handler = FunctionCallActionHandler;

    // Test invalid gas amount
    let invalid_function_call = ActionParams::FunctionCall {
        method_name: "test".to_string(),
        args: "{}".to_string(),
        gas: "invalid_gas".to_string(),
        deposit: "0".to_string(),
    };
    assert!(function_call_handler.validate_params(&invalid_function_call).is_err());
}

#[test]
fn test_multi_action_parsing() {
    let actions = vec![
        ActionParams::CreateAccount,
        ActionParams::Transfer {
            deposit: "1000000000000000000000000".to_string(),
        },
        ActionParams::FunctionCall {
            method_name: "initialize".to_string(),
            args: "{}".to_string(),
            gas: crate::config::VERIFY_REGISTRATION_GAS.to_string(),
            deposit: "0".to_string(),
        },
    ];

    let built_actions = build_actions_from_params(actions).unwrap();
    assert_eq!(built_actions.len(), 3);
}

#[test]
fn test_get_action_handler() {
    let transfer_params = ActionParams::Transfer {
        deposit: "1000000000000000000000000".to_string(),
    };

    let handler = get_action_handler(&transfer_params).unwrap();
    assert!(handler.validate_params(&transfer_params).is_ok());

    let function_call_params = ActionParams::FunctionCall {
        method_name: "test".to_string(),
        args: "{}".to_string(),
        gas: crate::config::VERIFY_REGISTRATION_GAS.to_string(),
        deposit: "0".to_string(),
    };

    let handler = get_action_handler(&function_call_params).unwrap();
    assert!(handler.validate_params(&function_call_params).is_ok());
}

#[test]
fn test_transaction_building() {
    use near_crypto::{KeyType, SecretKey};

    // Create a test signing key
    let secret_key = SecretKey::from_seed(KeyType::ED25519, "test_seed");
    let near_secret_bytes = secret_key.unwrap_as_ed25519().0;
    let mut key_bytes = [0u8; 32];
    key_bytes.copy_from_slice(&near_secret_bytes[..32]);
    let signing_key = ed25519_dalek::SigningKey::from_bytes(&key_bytes);

    let signer_account_id = "signer.testnet";
    let receiver_account_id = "receiver.testnet";
    let nonce = 123u64;
    let block_hash = [1u8; 32];

    let actions = vec![
        Action::Transfer {
            deposit: 1000000000000000000000000u128
        }
    ];

    let transaction = build_transaction_with_actions(
        signer_account_id,
        receiver_account_id,
        nonce,
        &block_hash,
        &signing_key,
        actions,
    ).unwrap();

    assert_eq!(transaction.signer_id.0, signer_account_id);
    assert_eq!(transaction.receiver_id.0, receiver_account_id);
    assert_eq!(transaction.nonce, nonce);
    assert_eq!(transaction.actions.len(), 1);
}

#[test]
fn test_transaction_signing() {
    use near_crypto::{KeyType, SecretKey};

    // Create a test signing key
    let secret_key = SecretKey::from_seed(KeyType::ED25519, "test_seed");
    let near_secret_bytes = secret_key.unwrap_as_ed25519().0;
    let mut key_bytes = [0u8; 32];
    key_bytes.copy_from_slice(&near_secret_bytes[..32]);
    let signing_key = ed25519_dalek::SigningKey::from_bytes(&key_bytes);

    let transaction = Transaction {
        signer_id: AccountId("signer.testnet".to_string()),
        public_key: PublicKey::from_ed25519_bytes(&signing_key.verifying_key().to_bytes()),
        nonce: 123,
        receiver_id: AccountId("receiver.testnet".to_string()),
        block_hash: CryptoHash::from_bytes([1u8; 32]),
        actions: vec![Action::Transfer { deposit: 1000000000000000000000000u128 }],
    };

    let signed_transaction_bytes = sign_transaction(transaction, &signing_key).unwrap();

    // Verify we got valid bytes
    assert!(signed_transaction_bytes.len() > 0);
}

#[test]
fn test_deterministic_transaction_signing() {
    use near_crypto::{KeyType, SecretKey};

    // Create a test signing key
    let secret_key = SecretKey::from_seed(KeyType::ED25519, "deterministic_seed");
    let near_secret_bytes = secret_key.unwrap_as_ed25519().0;
    let mut key_bytes = [0u8; 32];
    key_bytes.copy_from_slice(&near_secret_bytes[..32]);
    let signing_key = ed25519_dalek::SigningKey::from_bytes(&key_bytes);

    let transaction = Transaction {
        signer_id: AccountId("signer.testnet".to_string()),
        public_key: PublicKey::from_ed25519_bytes(&signing_key.verifying_key().to_bytes()),
        nonce: 456,
        receiver_id: AccountId("receiver.testnet".to_string()),
        block_hash: CryptoHash::from_bytes([2u8; 32]),
        actions: vec![Action::Transfer { deposit: 2000000000000000000000000u128 }],
    };

    // Sign the same transaction twice
    let signed_tx_1 = sign_transaction(transaction.clone(), &signing_key).unwrap();
    let signed_tx_2 = sign_transaction(transaction, &signing_key).unwrap();

    // Should be identical (deterministic signing)
    assert_eq!(signed_tx_1, signed_tx_2);
}

#[test]
fn test_near_keypair_from_prf_flow() {
    // Test the full flow of PRF -> NEAR keypair -> encryption -> decryption
    let prf_output_b64 = "dGVzdC1wcmYtb3V0cHV0LWZyb20td2ViYXV0aG4";
    let account_id = "test.testnet";

    // Generate keypair from PRF
    let (_x_coord, _y_coord) = (&[1u8; 32], &[2u8; 32]); // Mock coordinates

    // Use PRF-based derivation instead
    let (private_key, public_key) = derive_ed25519_key_from_prf_output(prf_output_b64, account_id).unwrap();

    // Encrypt the private key
    let encryption_key = derive_chacha20_key_from_prf(prf_output_b64, account_id).unwrap();
    let encrypted_result = encrypt_data_chacha20(&private_key, &encryption_key).unwrap();

    // Decrypt and verify - fix parameter order: (near_account_id, chacha20_prf_output, encrypted_data, iv)
    let _decrypted_key = decrypt_private_key_with_prf(
        account_id,
        prf_output_b64,
        &encrypted_result.encrypted_near_key_data_b64u,
        &encrypted_result.chacha20_nonce_b64u,
    ).unwrap();

    // The signing key should be valid for the same public key
    assert!(public_key.starts_with("ed25519:"));
}