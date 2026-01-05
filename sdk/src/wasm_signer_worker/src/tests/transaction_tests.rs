use borsh;
use ed25519_dalek::SigningKey;

use crate::actions::ActionParams;
use crate::transaction::{
    build_actions_from_params, build_transaction_with_actions, calculate_transaction_hash,
    sign_transaction,
};
use crate::types::{NearAction, Transaction};

/// Build a simple transaction with a single transfer action and sign it end-to-end.
#[test]
fn build_and_sign_transaction_round_trip() {
    // Deterministic signing key from a fixed 32-byte seed.
    let seed = [7u8; 32];
    let signing_key = SigningKey::from_bytes(&seed);
    let public_key_bytes = signing_key.verifying_key().to_bytes();

    // Single transfer action: 1 yoctoNEAR.
    let params = vec![ActionParams::Transfer {
        deposit: "1".to_string(),
    }];
    let actions: Vec<NearAction> = build_actions_from_params(params).expect("actions should build");

    // Dummy 32-byte block hash.
    let block_hash_bytes = [5u8; 32];

    let tx: Transaction = build_transaction_with_actions(
        "alice.near",
        "bob.near",
        1,
        &block_hash_bytes,
        &public_key_bytes,
        actions,
    )
    .expect("transaction should build");

    // Sign the transaction and ensure we get non-empty Borsh bytes and a stable hash.
    use ed25519_dalek::Signer;
    let (tx_hash_to_sign, _size) = tx.get_hash_and_size();
    let signature_bytes = signing_key.sign(&tx_hash_to_sign.0).to_bytes();
    let signed_bytes = sign_transaction(tx, &signature_bytes).expect("signing should succeed");
    assert!(!signed_bytes.is_empty());

    let hash_hex = calculate_transaction_hash(&signed_bytes);
    assert_eq!(hash_hex.len(), 64, "SHA256 hex hash should be 64 chars");

    // SignedTransaction should be decodable from the produced bytes.
    let _signed: crate::types::SignedTransaction =
        borsh::from_slice(&signed_bytes).expect("signed tx should be valid Borsh");
}

/// Ensure build_transaction_with_actions rejects invalid block hash sizes.
#[test]
fn build_transaction_rejects_invalid_block_hash_size() {
    let seed = [1u8; 32];
    let signing_key = SigningKey::from_bytes(&seed);
    let public_key_bytes = signing_key.verifying_key().to_bytes();

    let params = vec![ActionParams::Transfer {
        deposit: "1".to_string(),
    }];
    let actions = build_actions_from_params(params).expect("actions should build");

    // Block hash with incorrect length (not 32 bytes) should error.
    let bad_block_hash = [0u8; 16];
    let err = build_transaction_with_actions(
        "alice.near",
        "bob.near",
        1,
        &bad_block_hash,
        &public_key_bytes,
        actions,
    )
    .unwrap_err();

    assert!(err.contains("Block hash must be 32 bytes"));
}
