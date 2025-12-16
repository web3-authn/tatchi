use bs58;

use crate::config::CHACHA20_KEY_SIZE;
use crate::crypto::{
    decrypt_data_chacha20, derive_ed25519_key_from_prf_output, encrypt_data_chacha20,
};
use crate::encoders::base64_url_encode;

/// Core round-trip test for ChaCha20 encryption/decryption and wrap-key salt tagging.
#[test]
fn chacha20_encrypt_then_decrypt_round_trip() {
    let key = vec![42u8; CHACHA20_KEY_SIZE];
    let plaintext = "hello chacha20 round-trip";

    let encrypted = encrypt_data_chacha20(plaintext, &key).unwrap();
    assert!(!encrypted.encrypted_near_key_data_b64u.is_empty());
    assert!(!encrypted.chacha20_nonce_b64u.is_empty());

    let decrypted = decrypt_data_chacha20(
        &encrypted.encrypted_near_key_data_b64u,
        &encrypted.chacha20_nonce_b64u,
        &key,
    )
    .unwrap();

    assert_eq!(decrypted, plaintext);

    // with_wrap_key_salt should attach a base64url-encoded salt
    let salted = encrypted.with_wrap_key_salt(b"wrap-salt");
    let salt_b64 = base64_url_encode(b"wrap-salt");
    assert_eq!(
        salted.wrap_key_salt_b64u.as_deref(),
        Some(salt_b64.as_str())
    );
}

/// Sanity test for Ed25519 key derivation from PRF output.
#[test]
fn derive_ed25519_key_from_prf_output_is_deterministic_and_prefixed() {
    let prf_bytes = b"deterministic-prf-output-for-tests";
    let prf_b64u = base64_url_encode(prf_bytes);
    let account_id = "alice.near";

    let (priv1, pub1) = derive_ed25519_key_from_prf_output(&prf_b64u, account_id).unwrap();
    let (priv2, pub2) = derive_ed25519_key_from_prf_output(&prf_b64u, account_id).unwrap();

    // Deterministic for same inputs
    assert_eq!(priv1, priv2);
    assert_eq!(pub1, pub2);

    // NEAR-style key prefixes and lengths
    assert!(priv1.starts_with("ed25519:"));
    assert!(pub1.starts_with("ed25519:"));

    let priv_bytes = bs58::decode(&priv1[8..]).into_vec().unwrap();
    let pub_bytes = bs58::decode(&pub1[8..]).into_vec().unwrap();

    // Private key is 64 bytes (32-byte seed + 32-byte public key), public key is 32 bytes
    assert_eq!(priv_bytes.len(), 64);
    assert_eq!(pub_bytes.len(), 32);
}
