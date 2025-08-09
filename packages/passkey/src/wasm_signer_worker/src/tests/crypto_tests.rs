// Use the crypto functions that are needed for tests
use crate::crypto::*;
use crate::types::DualPrfOutputs;

#[test]
fn test_account_specific_chacha20_key_edge_cases() {
    // Test with empty PRF output
    let empty_prf = "";
    let account_id = "test.testnet";
    let result = derive_chacha20_key_from_prf(empty_prf, account_id);
    assert!(result.is_err());

    // Test with invalid base64
    let invalid_b64 = "not_valid_base64!!!";
    let result = derive_chacha20_key_from_prf(invalid_b64, account_id);
    assert!(result.is_err());

    // Test with short PRF output
    let short_prf = "YQ"; // base64 for "a"
    let result = derive_chacha20_key_from_prf(short_prf, account_id);
    assert!(result.is_ok()); // Should work with HKDF expansion

    // Test with different accounts producing different keys
    let test_prf = "dGVzdC1wcmYtb3V0cHV0";
    let key1 = derive_chacha20_key_from_prf(test_prf, "account1.testnet").unwrap();
    let key2 = derive_chacha20_key_from_prf(test_prf, "account2.testnet").unwrap();
    assert_ne!(key1, key2);
}

#[test]
fn test_encrypt_decrypt_chacha20_edge_cases() {
    let key = vec![0u8; 32];

    // Test empty string
    let encrypted = encrypt_data_chacha20("", &key).unwrap();
    let decrypted = decrypt_data_chacha20(
        &encrypted.encrypted_near_key_data_b64u,
        &encrypted.chacha20_nonce_b64u,
        &key
    ).unwrap();
    assert_eq!(decrypted, "");

    // Test large string
    let large_data = "x".repeat(10000);
    let encrypted = encrypt_data_chacha20(&large_data, &key).unwrap();
    let decrypted = decrypt_data_chacha20(
        &encrypted.encrypted_near_key_data_b64u,
        &encrypted.chacha20_nonce_b64u,
        &key
    ).unwrap();
    assert_eq!(decrypted, large_data);

    // Test Unicode data
    let unicode_data = "Hello 世界 🌍 مرحبا עולם";
    let encrypted = encrypt_data_chacha20(unicode_data, &key).unwrap();
    let decrypted = decrypt_data_chacha20(
        &encrypted.encrypted_near_key_data_b64u,
        &encrypted.chacha20_nonce_b64u,
        &key
    ).unwrap();
    assert_eq!(decrypted, unicode_data);
}

#[test]
fn test_decrypt_chacha20_invalid_data() {
    let key = vec![0u8; 32];

    // Test with invalid base64url data
    let result = decrypt_data_chacha20("invalid_base64!!!", "dmFsaWRfbm9uY2U", &key);
            assert!(result.is_err());

    // Test with invalid nonce
    let result = decrypt_data_chacha20("dGVzdA", "invalid_nonce!!!", &key);
    assert!(result.is_err());

    // Test with wrong key
    let encrypted = encrypt_data_chacha20("test", &key).unwrap();
    let wrong_key = vec![1u8; 32];
    let result = decrypt_data_chacha20(
        &encrypted.encrypted_near_key_data_b64u,
        &encrypted.chacha20_nonce_b64u,
        &wrong_key
    );
    assert!(result.is_err());

    // Test with corrupted ciphertext
    let encrypted = encrypt_data_chacha20("test", &key).unwrap();
    let mut corrupted_data = encrypted.encrypted_near_key_data_b64u;
    corrupted_data.push('x'); // Corrupt the data
    let result = decrypt_data_chacha20(&corrupted_data, &encrypted.chacha20_nonce_b64u, &key);
    assert!(result.is_err());
}

#[test]
fn test_decrypt_private_key_with_prf_invalid_formats() {
    let prf_output_b64 = "dGVzdC1wcmYtb3V0cHV0";
    let account_id = "test.testnet";

    // Test with empty encrypted data
    let result = decrypt_private_key_with_prf(account_id, prf_output_b64, "", "dGVzdA");
    assert!(result.is_err());

    // Test with empty IV
    let result = decrypt_private_key_with_prf(account_id, prf_output_b64, "dGVzdA", "");
    assert!(result.is_err());

    // Test with invalid base64
    let result = decrypt_private_key_with_prf(account_id, prf_output_b64, "invalid!!!", "dGVzdA");
    assert!(result.is_err());

    // Test with empty PRF output
    let result = decrypt_private_key_with_prf(account_id, "", "dGVzdA", "dGVzdA");
    assert!(result.is_err());

    // Test with empty account ID
    let result = decrypt_private_key_with_prf("", prf_output_b64, "dGVzdA", "dGVzdA");
    assert!(result.is_err());
}

#[test]
fn test_base64_url_decode_edge_cases() {
    // This function is private, so we'll test through public functions that use it
    // Test valid PRF output that would use base64_url_decode internally
    let prf_output_b64 = "dGVzdC1wcmYtb3V0cHV0";
    let account_id = "test.testnet";

    // This will internally use base64_url_decode
    let result = derive_chacha20_key_from_prf(prf_output_b64, account_id);
    assert!(result.is_ok());

    // Test invalid base64 (should fail in base64_url_decode)
    let invalid_b64 = "invalid!!!";
    let result = derive_chacha20_key_from_prf(invalid_b64, account_id);
    assert!(result.is_err());
}

#[test]
fn test_encryption_key_consistency() {
    let prf_output_b64 = "dGVzdC1wcmYtb3V0cHV0";
    let account_id = "test.testnet";

    // Test that the same inputs always produce the same key
    for _ in 0..10 {
        let key1 = derive_chacha20_key_from_prf(prf_output_b64, account_id).unwrap();
        let key2 = derive_chacha20_key_from_prf(prf_output_b64, account_id).unwrap();
        assert_eq!(key1, key2);
    }
}

#[test]
fn test_near_key_format_validation() {
    let prf_output_b64 = "dGVzdC1wcmYtb3V0cHV0";
    let account_id = "test.testnet";

    let (private_key, public_key) = derive_ed25519_key_from_prf_output(prf_output_b64, account_id).unwrap();

    // Validate format
    assert!(private_key.starts_with("ed25519:"));
    assert!(public_key.starts_with("ed25519:"));

    // Validate base58 encoding
    let private_b58 = &private_key[8..];
    let public_b58 = &public_key[8..];

    let private_bytes = bs58::decode(private_b58).into_vec().unwrap();
    let public_bytes = bs58::decode(public_b58).into_vec().unwrap();

    // Private key should be 64 bytes (32-byte seed + 32-byte public key)
    assert_eq!(private_bytes.len(), 64);
    // Public key should be 32 bytes
    assert_eq!(public_bytes.len(), 32);

    // Last 32 bytes of private key should match public key
    assert_eq!(&private_bytes[32..], &public_bytes[..]);
}

#[test]
fn test_derive_account_specific_chacha20_key() {
    let prf_output = "dGVzdC1wcmYtb3V0cHV0LWFhYWFhYWFhYWFhYQ";
    let account_id = "test.testnet";

    // Test normal operation
    let key = derive_chacha20_key_from_prf(prf_output, account_id).unwrap();
    assert_eq!(key.len(), 32);

    // Test deterministic behavior
    let key2 = derive_chacha20_key_from_prf(prf_output, account_id).unwrap();
    assert_eq!(key, key2);

    // Test different accounts produce different keys
    let key3 = derive_chacha20_key_from_prf(prf_output, "different.testnet").unwrap();
    assert_ne!(key, key3);
}

#[test]
fn test_derive_ed25519_key_from_prf_output() {
    let prf_output = "dGVzdC1wcmYtb3V0cHV0LWFhYWFhYWFhYWFhYQ";
    let account_id = "test.testnet";

    // Test normal operation
    let (private_key, public_key) = derive_ed25519_key_from_prf_output(prf_output, account_id).unwrap();
    assert!(private_key.starts_with("ed25519:"));
    assert!(public_key.starts_with("ed25519:"));

    // Test deterministic behavior
    let (private_key2, public_key2) = derive_ed25519_key_from_prf_output(prf_output, account_id).unwrap();
    assert_eq!(private_key, private_key2);
    assert_eq!(public_key, public_key2);

    // Test different account produces different keys
    let (private_key3, public_key3) = derive_ed25519_key_from_prf_output(prf_output, "different.testnet").unwrap();
    assert_ne!(private_key, private_key3);
    assert_ne!(public_key, public_key3);
}

#[test]
fn test_derive_and_encrypt_keypair_from_dual_prf() {
    let dual_prf = DualPrfOutputs {
        chacha20_prf_output_base64: "dGVzdC1hZXMtcHJmLW91dHB1dA".to_string(),
        ed25519_prf_output_base64: "dGVzdC1lZDI1NTE5LXByZi1vdXRwdXQ".to_string(),
    };
    let account_id = "test.testnet";

    // Test normal operation
    let (public_key, encrypted_data) = derive_and_encrypt_keypair_from_dual_prf(&dual_prf, account_id).unwrap();
    assert!(public_key.starts_with("ed25519:"));
    assert!(!encrypted_data.encrypted_near_key_data_b64u.is_empty());
    assert!(!encrypted_data.chacha20_nonce_b64u.is_empty());

    // Test deterministic behavior
    let (public_key2, _encrypted_data2) = derive_and_encrypt_keypair_from_dual_prf(&dual_prf, account_id).unwrap();
    assert_eq!(public_key, public_key2);

    // Test different account produces different keys
    let (public_key3, _) = derive_and_encrypt_keypair_from_dual_prf(&dual_prf, "different.testnet").unwrap();
    assert_ne!(public_key, public_key3);
}

#[test]
fn test_dual_prf_key_isolation() {
    let dual_prf = DualPrfOutputs {
        chacha20_prf_output_base64: "dGVzdC1hZXMtcHJmLW91dHB1dA".to_string(),
        ed25519_prf_output_base64: "dGVzdC1lZDI1NTE5LXByZi1vdXRwdXQ".to_string(),
    };
    let account_id = "test.testnet";

    // Derive AES key separately
    let _chacha20_key = derive_chacha20_key_from_prf(&dual_prf.chacha20_prf_output_base64, account_id).unwrap();

    // Derive Ed25519 key separately
    let (_ed25519_private, _ed25519_public) = derive_ed25519_key_from_prf_output(&dual_prf.ed25519_prf_output_base64, account_id).unwrap();

    // Test that changing AES PRF doesn't affect Ed25519 derivation
    let modified_dual_prf = DualPrfOutputs {
        chacha20_prf_output_base64: "ZGlmZmVyZW50LWFlcy1wcmYtb3V0cHV0".to_string(),
        ed25519_prf_output_base64: dual_prf.ed25519_prf_output_base64.clone(),
    };

    let (ed25519_private2, ed25519_public2) = derive_ed25519_key_from_prf_output(&modified_dual_prf.ed25519_prf_output_base64, account_id).unwrap();

    // Ed25519 keys should be the same since we didn't change the Ed25519 PRF
    assert_eq!(_ed25519_private, ed25519_private2);
    assert_eq!(_ed25519_public, ed25519_public2);
}

#[test]
fn test_dual_prf_edge_cases() {
    let account_id = "test.testnet";

    // Test with minimal PRF outputs
    let minimal_dual_prf = DualPrfOutputs {
        chacha20_prf_output_base64: "YQ".to_string(), // base64 for "a"
        ed25519_prf_output_base64: "YQ".to_string(),
    };

    let result = derive_and_encrypt_keypair_from_dual_prf(&minimal_dual_prf, account_id);
    assert!(result.is_ok());

    // Test with empty PRF outputs (should fail)
    let empty_dual_prf = DualPrfOutputs {
        chacha20_prf_output_base64: "".to_string(),
        ed25519_prf_output_base64: "".to_string(),
    };

    let result = derive_and_encrypt_keypair_from_dual_prf(&empty_dual_prf, account_id);
    assert!(result.is_err());

    // Test with invalid base64 (should fail)
    let invalid_dual_prf = DualPrfOutputs {
        chacha20_prf_output_base64: "invalid!!!".to_string(),
        ed25519_prf_output_base64: "dGVzdA".to_string(),
    };

    let result = derive_and_encrypt_keypair_from_dual_prf(&invalid_dual_prf, account_id);
    assert!(result.is_err());
}