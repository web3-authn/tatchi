// ******************************************************************************
// *                                                                            *
// *                 HANDLER: SIGN TRANSACTION WITH KEYPAIR                   *
// *                                                                            *
// ******************************************************************************
use wasm_bindgen::prelude::*;
use log::info;
use serde_json;
use serde::{Serialize, Deserialize};
use bs58;
use crate::transaction::{
    sign_transaction,
    build_actions_from_params,
    build_transaction_with_actions,
    calculate_transaction_hash,
};
use crate::actions::ActionParams;
use crate::types::wasm_to_json::WasmSignedTransaction;
use crate::handlers::handle_sign_transactions_with_actions::TransactionSignResult;

#[wasm_bindgen]
#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SignTransactionWithKeyPairRequest {
    #[wasm_bindgen(getter_with_clone, js_name = "nearPrivateKey")]
    pub near_private_key: String, // ed25519:... format
    #[wasm_bindgen(getter_with_clone, js_name = "signerAccountId")]
    pub signer_account_id: String,
    #[wasm_bindgen(getter_with_clone, js_name = "receiverId")]
    pub receiver_id: String,
    #[wasm_bindgen(getter_with_clone)]
    pub nonce: String,
    #[wasm_bindgen(getter_with_clone, js_name = "blockHash")]
    pub block_hash: String,
    #[wasm_bindgen(getter_with_clone)]
    pub actions: String, // JSON string of ActionParams[]
}

/// Signs a transaction using a provided private key without requiring WebAuthn authentication.
///
/// **Handles:** `WorkerRequestType::SignTransactionWithKeyPair`
///
/// This handler is used for key replacement operations where the application already has access
/// to a private key and needs to sign transactions directly. It bypasses the normal WebAuthn
/// authentication flow and signs transactions immediately.
///
/// # Arguments
/// * `request` - Contains NEAR private key, transaction details, and action parameters
///
/// # Returns
/// * `TransactionSignResult` - Contains signed transaction, transaction hash, and operation logs
pub async fn handle_sign_transaction_with_keypair(
    request: SignTransactionWithKeyPairRequest
) -> Result<TransactionSignResult, String> {

    let mut logs: Vec<String> = Vec::new();
    info!("RUST: WASM binding - starting transaction signing with provided private key");

    // Parse the private key from NEAR format (ed25519:base58_encoded_64_bytes)
    let private_key_str = if request.near_private_key.starts_with("ed25519:") {
        &request.near_private_key[8..] // Remove "ed25519:" prefix
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
    let signing_key = ed25519_dalek::SigningKey::from_bytes(&seed_bytes);

    logs.push("Private key parsed and signing key created".to_string());

    // Parse and build actions
    let action_params: Vec<ActionParams> = serde_json::from_str(&request.actions)
        .map_err(|e| format!("Failed to parse actions: {}", e))?;

    logs.push(format!("Parsed {} actions", action_params.len()));

    let actions = build_actions_from_params(action_params)
        .map_err(|e| format!("Failed to build actions: {}", e))?;

    // Build and sign transaction
    let transaction = build_transaction_with_actions(
        &request.signer_account_id,
        &request.receiver_id,
        request.nonce.parse().map_err(|e| format!("Invalid nonce: {}", e))?,
        &bs58::decode(&request.block_hash).into_vec().map_err(|e| format!("Invalid block hash: {}", e))?,
        &signing_key,
        actions,
    ).map_err(|e| format!("Failed to build transaction: {}", e))?;

    logs.push("Transaction built successfully".to_string());

    let signed_tx_bytes = sign_transaction(transaction, &signing_key)
        .map_err(|e| format!("Failed to sign transaction: {}", e))?;

    // Calculate transaction hash from signed transaction bytes (before moving the bytes)
    let transaction_hash = calculate_transaction_hash(&signed_tx_bytes);

    // Create SignedTransaction from signed bytes
    let signed_tx = crate::types::SignedTransaction::from_borsh_bytes(&signed_tx_bytes)
        .map_err(|e| format!("Failed to deserialize SignedTransaction: {}", e))?;

    let signed_tx_wasm = WasmSignedTransaction::from(&signed_tx);

    logs.push("Transaction signing completed successfully".to_string());

    Ok(TransactionSignResult::new(
        true,
        Some(vec![transaction_hash]),
        Some(vec![signed_tx_wasm]),
        logs,
        None,
    ))
}
