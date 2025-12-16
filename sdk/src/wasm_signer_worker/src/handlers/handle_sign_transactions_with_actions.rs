// ******************************************************************************
// *                                                                            *
// *                 HANDLER: SIGN TRANSACTIONS WITH ACTIONS                  *
// *                                                                            *
// ******************************************************************************

use crate::transaction::{
    build_actions_from_params, build_transaction_with_actions, calculate_transaction_hash,
    sign_transaction,
};
use crate::types::{
    handlers::{ConfirmationConfig, RpcCallPayload},
    progress::{
        send_completion_message, send_progress_message, ProgressData, ProgressMessageType,
        ProgressStep,
    },
    wasm_to_json::WasmSignedTransaction,
    DecryptionPayload, SignedTransaction,
};
use crate::{actions::ActionParams, WrapKey};
use bs58;
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SignTransactionsWithActionsRequest {
    pub rpc_call: RpcCallPayload,
    pub session_id: String,
    pub created_at: Option<f64>,
    pub decryption: DecryptionPayload,
    pub tx_signing_requests: Vec<TransactionPayload>,
    /// Unified confirmation configuration for controlling the confirmation flow
    pub confirmation_config: Option<ConfirmationConfig>,
    pub intent_digest: Option<String>,
    pub transaction_context: Option<crate::types::handlers::TransactionContext>,
    pub credential: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TransactionPayload {
    pub near_account_id: String,
    pub receiver_id: String,
    pub actions: Vec<ActionParams>,
}

#[wasm_bindgen]
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TransactionSignResult {
    pub success: bool,
    #[wasm_bindgen(getter_with_clone, js_name = "transactionHashes")]
    pub transaction_hashes: Option<Vec<String>>,
    #[wasm_bindgen(getter_with_clone, js_name = "signedTransactions")]
    pub signed_transactions: Option<Vec<WasmSignedTransaction>>,
    #[wasm_bindgen(getter_with_clone)]
    pub logs: Vec<String>,
    #[wasm_bindgen(getter_with_clone)]
    pub error: Option<String>,
}

#[wasm_bindgen]
impl TransactionSignResult {
    #[wasm_bindgen(constructor)]
    pub fn new(
        success: bool,
        transaction_hashes: Option<Vec<String>>,
        signed_transactions: Option<Vec<WasmSignedTransaction>>,
        logs: Vec<String>,
        error: Option<String>,
    ) -> TransactionSignResult {
        TransactionSignResult {
            success,
            transaction_hashes,
            signed_transactions,
            logs,
            error,
        }
    }

    /// Helper function to create a failed TransactionSignResult
    pub fn failed(logs: Vec<String>, error_msg: String) -> TransactionSignResult {
        TransactionSignResult::new(
            false,
            None, // No transaction hashes
            None, // No signed transactions
            logs,
            Some(error_msg),
        )
    }
}

#[wasm_bindgen]
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyActionResult {
    pub success: bool,
    #[wasm_bindgen(getter_with_clone, js_name = "transactionHash")]
    pub transaction_hash: Option<String>,
    #[wasm_bindgen(getter_with_clone, js_name = "signedTransaction")]
    pub signed_transaction: Option<WasmSignedTransaction>,
    #[wasm_bindgen(getter_with_clone)]
    pub logs: Vec<String>,
    #[wasm_bindgen(getter_with_clone)]
    pub error: Option<String>,
}

#[wasm_bindgen]
impl KeyActionResult {
    #[wasm_bindgen(constructor)]
    pub fn new(
        success: bool,
        transaction_hash: Option<String>,
        signed_transaction: Option<WasmSignedTransaction>,
        logs: Vec<String>,
        error: Option<String>,
    ) -> KeyActionResult {
        KeyActionResult {
            success,
            transaction_hash,
            signed_transaction,
            logs,
            error,
        }
    }
}

#[derive(Debug, Clone)]
pub struct Decryption {
    pub wrap_key: WrapKey,
    pub encrypted_private_key_data: String,
    pub encrypted_private_key_chacha20_nonce_b64u: String,
}

impl Decryption {
    pub fn new(
        wrap_key: WrapKey,
        encrypted_private_key_data: String,
        encrypted_private_key_chacha20_nonce_b64u: String,
    ) -> Decryption {
        Decryption {
            wrap_key,
            encrypted_private_key_data,
            encrypted_private_key_chacha20_nonce_b64u,
        }
    }
}

// ******************************************************************************
// *                           MAIN HANDLER                                   *
// ******************************************************************************

/// **Handles:** `WorkerRequestType::SignTransactionsWithActions`
/// This handler processes multiple transactions in a single batch, performing contract verification
/// once and then signing all transactions with the same decrypted private key. It provides detailed
/// progress updates and comprehensive error handling for each transaction in the batch.
///
/// # Arguments
/// * `tx_batch_request` - Contains verification data, decryption parameters, and array of transaction requests
///
/// # Returns
/// * `TransactionSignResult` - Contains success status, transaction hashes, signed transactions, and detailed logs
pub async fn handle_sign_transactions_with_actions(
    tx_batch_request: SignTransactionsWithActionsRequest,
    wrap_key: WrapKey,
) -> Result<TransactionSignResult, String> {
    // Validate input
    if tx_batch_request.tx_signing_requests.is_empty() {
        return Err("No transactions provided".to_string());
    }

    let mut logs: Vec<String> = Vec::new();
    logs.push(format!(
        "Processing {} transactions",
        tx_batch_request.tx_signing_requests.len()
    ));

    // Validate session expiry if created_at is present
    if let Some(created_at) = tx_batch_request.created_at {
        let now = js_sys::Date::now();
        if now - created_at > crate::config::SESSION_MAX_DURATION_MS {
            return Err("Session expired".to_string());
        }
    }

    // Step 1: Validate pre-confirmed context (confirmation already ran in VRF-driven flow)
    for (i, tx) in tx_batch_request.tx_signing_requests.iter().enumerate() {
        logs.push(format!(
            "Transaction {}: {} -> {} ({} actions)",
            i + 1,
            tx.near_account_id,
            tx.receiver_id,
            tx.actions.len()
        ));
    }
    send_progress_message(
        ProgressMessageType::ExecuteActionsProgress,
        ProgressStep::UserConfirmation,
        "Using pre-confirmed signing session from VRF flow...",
        Some(
            &ProgressData::new(1, 4)
                .with_transaction_count(tx_batch_request.tx_signing_requests.len()),
        ),
    );

    let intent_digest = tx_batch_request
        .intent_digest
        .clone()
        .ok_or_else(|| "Missing intent digest from pre-confirmed session".to_string())?;

    let transaction_context = tx_batch_request
        .transaction_context
        .clone()
        .ok_or_else(|| "Missing transaction context from confirmation".to_string())?;

    logs.push(format!(
        "Pre-confirmed session with intent digest {}",
        intent_digest
    ));

    // Step 2: Extract credentials for verification
    logs.push("Extracting credentials for contract verification...".to_string());
    send_progress_message(
        ProgressMessageType::ExecuteActionsProgress,
        ProgressStep::Preparation,
        "Extracting credentials for verification...",
        Some(&ProgressData::new(2, 4)),
    );

    // Step 3: Batch transaction signing (confirmation and verification already completed in VRF/confirmTxFlow)
    logs.push(format!(
        "Signing {} transactions in secure WASM context...",
        tx_batch_request.tx_signing_requests.len()
    ));

    // Send signing progress
    send_progress_message(
        ProgressMessageType::ExecuteActionsProgress,
        ProgressStep::TransactionSigningProgress,
        "Decrypting private key and signing transactions...",
        Some(
            &ProgressData::new(4, 4)
                .with_transaction_count(tx_batch_request.tx_signing_requests.len()),
        ),
    );

    // Process all transactions using the shared verification and decryption
    let tx_count = tx_batch_request.tx_signing_requests.len();

    let decryption = Decryption::new(
        wrap_key,
        tx_batch_request
            .decryption
            .encrypted_private_key_data
            .clone(),
        tx_batch_request
            .decryption
            .encrypted_private_key_chacha20_nonce_b64u
            .clone(),
    );

    let result = sign_near_transactions_with_actions_impl(
        tx_batch_request.tx_signing_requests,
        &decryption,
        &transaction_context,
        logs,
    )
    .await?;

    // Send completion progress message
    send_completion_message(
        ProgressMessageType::ExecuteActionsProgress,
        ProgressStep::TransactionSigningComplete,
        &format!("{} transactions signed successfully", tx_count),
        Some(
            &ProgressData::new(4, 4)
                .with_success(result.success)
                .with_transaction_count(tx_count)
                .with_logs(result.logs.clone()),
        ),
    );

    Ok(result)
}

/// Internal implementation for batch transaction signing after verification is complete.
/// This function handles the actual signing logic for multiple transactions using a shared
/// decrypted private key. It processes each transaction individually, provides detailed logging
/// for each step, and handles errors gracefully while continuing with remaining transactions.
///
/// # Arguments
/// * `tx_requests` - Array of transaction payloads to sign
/// * `decryption` - Shared decryption parameters for private key access
/// * `logs` - Existing log entries to append to
///
/// # Returns
/// * `TransactionSignResult` - Contains batch signing results with individual transaction details
async fn sign_near_transactions_with_actions_impl(
    tx_requests: Vec<TransactionPayload>,
    decryption: &Decryption,
    transaction_context: &crate::types::handlers::TransactionContext,
    mut logs: Vec<String>,
) -> Result<TransactionSignResult, String> {
    if tx_requests.is_empty() {
        let error_msg = "No transactions provided".to_string();
        logs.push(error_msg.clone());
        return Ok(TransactionSignResult::failed(logs, error_msg));
    }

    // Decrypt private key using the shared decryption data (use first transaction's signer account)
    let first_transaction = &tx_requests[0];

    // Validate that all transactions use the same NEAR account ID
    for tx in &tx_requests {
        if first_transaction.near_account_id != tx.near_account_id {
            let error_msg = format!("All transactions must use the same NEAR account ID");
            return Ok(TransactionSignResult::failed(logs, error_msg));
        }
    }

    logs.push(format!("Processing {} transactions", tx_requests.len()));
    // Decrypt using WrapKey-derived KEK
    let kek = decryption.wrap_key.derive_kek()?;

    let decrypted_private_key_str = crate::crypto::decrypt_data_chacha20(
        &decryption.encrypted_private_key_data,
        &decryption.encrypted_private_key_chacha20_nonce_b64u,
        &kek,
    )
    .map_err(|e| format!("Decryption failed: {}", e))?;

    let decoded_pk = bs58::decode(
        decrypted_private_key_str
            .strip_prefix("ed25519:")
            .unwrap_or(&decrypted_private_key_str),
    )
    .into_vec()
    .map_err(|e| format!("Invalid private key base58: {}", e))?;

    if decoded_pk.len() < 32 {
        return Err("Decoded private key too short".to_string());
    }

    let secret_bytes: [u8; 32] = decoded_pk[0..32]
        .try_into()
        .map_err(|_| "Invalid secret key length".to_string())?;

    let signing_key = ed25519_dalek::SigningKey::from_bytes(&secret_bytes);

    logs.push("Private key decrypted successfully".to_string());

    // Prepare nonce sequencing: start from next_nonce and increment per transaction
    let mut current_nonce: u64 = transaction_context
        .next_nonce
        .parse()
        .map_err(|e| format!("Invalid nonce: {}", e))?;

    // Process each transaction
    let mut signed_transactions_wasm = Vec::new();
    let mut transaction_hashes = Vec::new();

    for (index, tx_data) in tx_requests.iter().enumerate() {
        logs.push(format!(
            "Processing transaction {} of {}",
            index + 1,
            tx_requests.len()
        ));

        // Parse and build actions for this transaction
        let action_params: Vec<ActionParams> = {
            let params = tx_data.actions.clone();
            logs.push(format!(
                "Transaction {}: Parsed {} actions",
                index + 1,
                params.len()
            ));
            params
        };

        let actions = match build_actions_from_params(action_params) {
            Ok(actions) => {
                logs.push(format!(
                    "Transaction {}: Actions built successfully",
                    index + 1
                ));
                actions
            }
            Err(e) => {
                let error_msg =
                    format!("Transaction {}: Failed to build actions: {}", index + 1, e);
                logs.push(error_msg.clone());
                return Ok(TransactionSignResult::failed(logs, error_msg));
            }
        };

        // Build and sign transaction
        let transaction = match build_transaction_with_actions(
            &tx_data.near_account_id,
            &tx_data.receiver_id,
            current_nonce,
            &bs58::decode(&transaction_context.tx_block_hash)
                .into_vec()
                .map_err(|e| format!("Invalid block hash: {}", e))?,
            &signing_key,
            actions,
        ) {
            Ok(tx) => {
                logs.push(format!(
                    "Transaction {}: Built successfully (nonce used: {})",
                    index + 1,
                    current_nonce
                ));
                tx
            }
            Err(e) => {
                let error_msg = format!(
                    "Transaction {}: Failed to build transaction: {}",
                    index + 1,
                    e
                );
                logs.push(error_msg.clone());
                return Ok(TransactionSignResult::failed(logs, error_msg));
            }
        };

        let signed_tx_bytes = match sign_transaction(transaction, &signing_key) {
            Ok(bytes) => {
                logs.push(format!("Transaction {}: Signed successfully", index + 1));
                bytes
            }
            Err(e) => {
                let error_msg = format!(
                    "Transaction {}: Failed to sign transaction: {}",
                    index + 1,
                    e
                );
                logs.push(error_msg.clone());
                return Ok(TransactionSignResult::failed(logs, error_msg));
            }
        };

        // Calculate transaction hash from signed transaction bytes (before moving the bytes)
        let transaction_hash = calculate_transaction_hash(&signed_tx_bytes);
        logs.push(format!(
            "Transaction {}: Hash calculated - {}",
            index + 1,
            transaction_hash
        ));

        // Create SignedTransaction from signed bytes
        let signed_tx: SignedTransaction = borsh::from_slice(&signed_tx_bytes).map_err(|e| {
            let error_msg = format!(
                "Transaction {}: Failed to deserialize SignedTransaction: {}",
                index + 1,
                e
            );
            logs.push(error_msg.clone());
            error_msg
        })?;

        let signed_tx_wasm = WasmSignedTransaction::from(&signed_tx);

        signed_transactions_wasm.push(signed_tx_wasm);
        transaction_hashes.push(transaction_hash);

        // Increment nonce for the next transaction in the batch
        current_nonce = current_nonce.saturating_add(1);
    }

    logs.push(format!(
        "All {} transactions signed successfully",
        signed_transactions_wasm.len()
    ));

    Ok(TransactionSignResult::new(
        true,
        Some(transaction_hashes),
        Some(signed_transactions_wasm),
        logs,
        None,
    ))
}
