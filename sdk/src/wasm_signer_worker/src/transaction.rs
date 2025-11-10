use borsh;
use bs58;
use ed25519_dalek::{Signer, SigningKey};
use sha2::{Digest, Sha256};

use crate::actions::{get_action_handler, ActionParams};
use crate::rpc_calls::{ContractRegistrationResult, VrfData, LINK_DEVICE_REGISTER_USER_METHOD};
use crate::types::WebAuthnRegistrationCredential;
use crate::types::*;

/// Build a transaction with multiple actions
pub fn build_transaction_with_actions(
    signer_account_id: &str,
    receiver_account_id: &str,
    nonce: u64,
    block_hash_bytes: &[u8],
    private_key: &SigningKey,
    actions: Vec<Action>,
) -> Result<Transaction, String> {
    // Parse account IDs
    let signer_id: AccountId = signer_account_id
        .parse()
        .map_err(|e| format!("Invalid signer account: {}", e))?;
    let receiver_id: AccountId = receiver_account_id
        .parse()
        .map_err(|e| format!("Invalid receiver account: {}", e))?;

    // Parse block hash
    if block_hash_bytes.len() != 32 {
        return Err("Block hash must be 32 bytes".to_string());
    }
    let mut block_hash_array = [0u8; 32];
    block_hash_array.copy_from_slice(block_hash_bytes);
    let block_hash = CryptoHash::from_bytes(block_hash_array);

    // Create PublicKey from ed25519 verifying key
    let public_key_bytes = private_key.verifying_key().to_bytes();
    let public_key = PublicKey::from_ed25519_bytes(&public_key_bytes);

    // Build transaction
    Ok(Transaction {
        signer_id,
        public_key,
        nonce,
        receiver_id,
        block_hash,
        actions,
    })
}

/// Build actions from action parameters
pub fn build_actions_from_params(action_params: Vec<ActionParams>) -> Result<Vec<Action>, String> {
    let mut actions = Vec::new();
    for (i, params) in action_params.iter().enumerate() {
        let handler =
            get_action_handler(params).map_err(|e| format!("Action {} handler error: {}", i, e))?;

        handler
            .validate_params(params)
            .map_err(|e| format!("Action {} validation failed: {}", i, e))?;

        let action = handler
            .build_action(params)
            .map_err(|e| format!("Action {} build failed: {}", i, e))?;

        actions.push(action);
    }
    Ok(actions)
}

/// Low-level transaction signing function
/// Takes an already-built Transaction and SigningKey, signs it, and returns serialized bytes
/// Used internally by higher-level functions like sign_link_device_registration_tx()
pub fn sign_transaction(
    transaction: Transaction,
    private_key: &SigningKey,
) -> Result<Vec<u8>, String> {
    // Get transaction hash for signing
    let (transaction_hash, _size) = transaction.get_hash_and_size();

    // Sign the hash
    let signature_bytes = private_key.sign(&transaction_hash.0);
    let signature = Signature::from_ed25519_bytes(&signature_bytes.to_bytes());

    // Create SignedTransaction
    let signed_transaction = SignedTransaction::new(signature, transaction);

    // Serialize to Borsh
    borsh::to_vec(&signed_transaction)
        .map_err(|e| format!("Signed transaction serialization failed: {}", e))
}

/// Calculate a proper transaction hash from signed transaction bytes using SHA256
pub fn calculate_transaction_hash(signed_tx_bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(signed_tx_bytes);
    let result = hasher.finalize();

    // Convert to hex string for readability and consistency
    format!("{:x}", result)
}

/// Internal: sign device-link registration tx with an unencrypted private key.
/// Used by `handle_derive_near_keypair_and_encrypt` during device linking.
/// Not exported via wasm_bindgen; not part of the public SDK API.
pub(crate) async fn sign_link_device_registration_tx(
    contract_id: &str,
    vrf_data: VrfData,
    deterministic_vrf_public_key: Vec<u8>,
    webauthn_registration: WebAuthnRegistrationCredential,
    signer_account_id: &str,
    private_key: &str, // Already derived private key (not encrypted)
    nonce: u64,
    block_hash_bytes: &[u8],
    authenticator_options: Option<AuthenticatorOptions>, // Authenticator options for registration
) -> Result<ContractRegistrationResult, String> {

    // Parse the private key from NEAR format (ed25519:base58_encoded_64_bytes)
    let private_key_str = if private_key.starts_with("ed25519:") {
        &private_key[8..] // Remove "ed25519:" prefix
    } else {
        return Err("Private key must be in ed25519: format".to_string());
    };

    // Decode the base58-encoded private key
    let private_key_bytes = bs58::decode(private_key_str)
        .into_vec()
        .map_err(|e| format!("Failed to decode private key: {}", e))?;

    if private_key_bytes.len() != 64 {
        return Err(format!(
            "Invalid private key length: expected 64 bytes, got {}",
            private_key_bytes.len()
        ));
    }

    // Extract the 32-byte seed (first 32 bytes)
    let seed_bytes: [u8; 32] = private_key_bytes[0..32]
        .try_into()
        .map_err(|_| "Failed to extract seed from private key".to_string())?;

    // Create SigningKey from seed
    let signing_key = SigningKey::from_bytes(&seed_bytes);

    // Build verify_and_register_user transaction actions
    let action_params = vec![crate::actions::ActionParams::FunctionCall {
        method_name: LINK_DEVICE_REGISTER_USER_METHOD.to_string(),
        args: serde_json::json!({
            "vrf_data": vrf_data,
            "webauthn_registration": webauthn_registration,
            "deterministic_vrf_public_key": deterministic_vrf_public_key,
            "authenticator_options": authenticator_options
        })
        .to_string(),
        gas: crate::config::LINK_DEVICE_REGISTRATION_GAS.to_string(),
        deposit: "0".to_string(),
    }];

    // Build actions
    let actions = build_actions_from_params(action_params)
        .map_err(|e| format!("Failed to build actions: {}", e))?;

    // Build and sign transaction
    let transaction = build_transaction_with_actions(
        signer_account_id,
        contract_id,
        nonce,
        block_hash_bytes,
        &signing_key,
        actions,
    )
    .map_err(|e| format!("Failed to build transaction: {}", e))?;

    let signed_tx_bytes = sign_transaction(transaction, &signing_key)
        .map_err(|e| format!("Failed to sign transaction: {}", e))?;

    // Return a simplified registration result with the signed transaction
    Ok(ContractRegistrationResult {
        success: true,
        verified: true,          // Assume success for now
        registration_info: None, // Not needed for device linking
        logs: vec!["Link Device Registration transaction signed successfully".to_string()],
        signed_transaction_borsh: Some(signed_tx_bytes),
        error: None,
    })
}
