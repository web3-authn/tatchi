use ed25519_dalek::{SigningKey, Signer};
use sha2::{Sha256, Digest};
use borsh;

use crate::types::*;
use crate::actions::{ActionParams, get_action_handler};
use crate::encoders::base64_url_decode;
use crate::rpc_calls::{
    VrfData,
    ContractRegistrationResult,
    VERIFY_AND_REGISTER_USER_METHOD,
    LINK_DEVICE_REGISTER_USER_METHOD,
};
use crate::types::WebAuthnRegistrationCredential;


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
    let signer_id: AccountId = signer_account_id.parse()
        .map_err(|e| format!("Invalid signer account: {}", e))?;
    let receiver_id: AccountId = receiver_account_id.parse()
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

        let handler = get_action_handler(params)
            .map_err(|e| format!("Action {} handler error: {}", i, e))?;

        handler.validate_params(params)
            .map_err(|e| format!("Action {} validation failed: {}", i, e))?;

        let action = handler.build_action(params)
            .map_err(|e| format!("Action {} build failed: {}", i, e))?;

        actions.push(action);
    }
    Ok(actions)
}

/// Low-level transaction signing function
/// Takes an already-built Transaction and SigningKey, signs it, and returns serialized bytes
/// Used internally by higher-level functions like sign_registration_tx_wasm() and sign_link_device_registration_tx()
pub fn sign_transaction(transaction: Transaction, private_key: &SigningKey) -> Result<Vec<u8>, String> {
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


/// Sign registration transaction with encrypted private key (traditional flow)
/// Decrypts the key first using PRF, then builds and signs the transaction
pub async fn sign_registration_tx_wasm(
    contract_id: &str,
    vrf_data: VrfData,
    deterministic_vrf_public_key: Option<&str>, // Optional deterministic VRF key for dual registration
    webauthn_registration_credential: WebAuthnRegistrationCredential,
    signer_account_id: &str,
    encrypted_private_key_data: &str,
    encrypted_private_key_iv: &str,
    prf_output_base64: &str,
    nonce: u64,
    block_hash_bytes: &[u8],
    device_number: Option<u8>, // Device number for multi-device support (defaults to 1)
    authenticator_options: Option<AuthenticatorOptions>, // Authenticator options for registration
) -> Result<ContractRegistrationResult, String> {
    use log::info;
    use log::debug;

    info!("RUST: Performing dual VRF user registration (state-changing function)");

    // Step 1: Decrypt the private key using PRF with account-specific HKDF
    let private_key = crate::crypto::decrypt_private_key_with_prf(
        signer_account_id,          // 1st parameter: Account ID
        prf_output_base64,          // 2nd parameter: PRF output
        encrypted_private_key_data, // 3rd parameter: Encrypted data
        encrypted_private_key_iv,   // 4th parameter: IV
    ).map_err(|e| format!("Failed to decrypt private key: {:?}", e))?;

    // Step 2: Build dual VRF data for contract arguments
    let deterministic_vrf_key_bytes = if let Some(det_vrf_key) = deterministic_vrf_public_key {
        let det_vrf_key_bytes = base64_url_decode(det_vrf_key)
            .map_err(|e| format!("Failed to decode deterministic VRF key: {}", e))?;
        Some(det_vrf_key_bytes)
    } else {
        debug!("RUST: Single VRF registration - using bootstrap VRF key only");
        None
    };

    // Step 3: Build contract arguments for verify_and_register_user with dual VRF support
    let contract_args = serde_json::json!({
        "vrf_data": vrf_data,
        "webauthn_registration": webauthn_registration_credential,
        "deterministic_vrf_public_key": deterministic_vrf_key_bytes,
        "device_number": device_number, // Include device number for multi-device support
        "authenticator_options": authenticator_options // Include authenticator options
    });

    // Step 4: Create FunctionCall action using existing infrastructure
    let action_params = vec![crate::actions::ActionParams::FunctionCall {
        method_name: VERIFY_AND_REGISTER_USER_METHOD.to_string(),
        args: contract_args.to_string(),
        gas: crate::config::VERIFY_REGISTRATION_GAS.to_string(),
        deposit: "0".to_string(),
    }];

    info!("RUST: Building FunctionCall action for {}", VERIFY_AND_REGISTER_USER_METHOD);

    // Step 5: Build actions using existing infrastructure
    let actions = build_actions_from_params(action_params)
        .map_err(|e| format!("Failed to build actions: {}", e))?;

    // Step 6: Build transaction using existing infrastructure
    let transaction = build_transaction_with_actions(
        signer_account_id,
        contract_id, // receiver_id is the contract
        nonce,
        block_hash_bytes,
        &private_key,
        actions,
    ).map_err(|e| format!("Failed to build transaction: {}", e))?;

    // Step 7: Sign registration transaction using existing infrastructure
    let signed_registration_tx_bytes = sign_transaction(transaction, &private_key)
        .map_err(|e| format!("Failed to sign registration transaction: {}", e))?;

    info!("RUST: Registration transaction signed successfully");

    // Step 8: Generate pre-signed delete transaction for rollback with SAME nonce/block hash
    info!("RUST: Generating pre-signed deleteAccount transaction for rollback");

    let delete_action_params = vec![crate::actions::ActionParams::DeleteAccount {
        beneficiary_id: "testnet".to_string(), // Default beneficiary for rollback
    }];

    let delete_actions = build_actions_from_params(delete_action_params)
        .map_err(|e| format!("Failed to build delete actions: {}", e))?;

    // Use SAME nonce and block hash - makes transactions mutually exclusive
    let delete_transaction = build_transaction_with_actions(
        signer_account_id,
        signer_account_id, // receiver_id same as signer for delete account
        nonce, // SAME nonce as registration
        block_hash_bytes, // SAME block hash as registration
        &private_key, // SAME private key as registration
        delete_actions,
    ).map_err(|e| format!("Failed to build delete transaction: {}", e))?;

    let signed_delete_tx_bytes = sign_transaction(delete_transaction, &private_key)
        .map_err(|e| format!("Failed to sign delete transaction: {}", e))?;

    info!("RUST: Pre-signed deleteAccount transaction created - same nonce ensures mutual exclusivity");
    info!("RUST: Registration transaction: {} bytes, Delete transaction: {} bytes",
                 signed_registration_tx_bytes.len(), signed_delete_tx_bytes.len());

    Ok(ContractRegistrationResult {
        success: true,
        verified: true, // We assume verification will succeed since we built the transaction correctly
        error: None,
        logs: vec![], // No logs yet since we haven't executed the transaction
        registration_info: None, // Will be available after broadcast in main thread
        signed_transaction_borsh: Some(signed_registration_tx_bytes),
        pre_signed_delete_transaction: Some(signed_delete_tx_bytes), // NEW: Add delete transaction
    })
}

/// Sign device linking registration transaction with unencrypted private key
/// Specifically for device linking flow where we have an already-derived private key
/// and need to register the device's authenticator on-chain
pub async fn sign_link_device_registration_tx(
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
    use ed25519_dalek::SigningKey;
    use bs58;

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
        return Err(format!("Invalid private key length: expected 64 bytes, got {}", private_key_bytes.len()));
    }

    // Extract the 32-byte seed (first 32 bytes)
    let seed_bytes: [u8; 32] = private_key_bytes[0..32].try_into()
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
        }).to_string(),
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
    ).map_err(|e| format!("Failed to build transaction: {}", e))?;

    let signed_tx_bytes = sign_transaction(transaction, &signing_key)
        .map_err(|e| format!("Failed to sign transaction: {}", e))?;

    // Return a simplified registration result with the signed transaction
    Ok(ContractRegistrationResult {
        success: true,
        verified: true, // Assume success for now
        registration_info: None, // Not needed for device linking
        logs: vec!["Link Device Registration transaction signed successfully".to_string()],
        signed_transaction_borsh: Some(signed_tx_bytes),
        pre_signed_delete_transaction: None, // Not needed for device linking
        error: None,
    })
}

