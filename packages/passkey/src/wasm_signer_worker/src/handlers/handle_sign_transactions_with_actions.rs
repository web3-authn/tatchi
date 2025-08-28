// ******************************************************************************
// *                                                                            *
// *                 HANDLER: SIGN TRANSACTIONS WITH ACTIONS                  *
// *                                                                            *
// ******************************************************************************

use wasm_bindgen::prelude::*;
use log::info;
use serde::{Serialize, Deserialize};
use serde_json;
use bs58;
use crate::rpc_calls::{
    VrfData,
    verify_authentication_response_rpc_call,
};
use crate::transaction::{
    sign_transaction,
    build_actions_from_params,
    build_transaction_with_actions,
    calculate_transaction_hash,
};
use crate::actions::ActionParams;
use crate::types::{
    WebAuthnAuthenticationCredential,
    WebAuthnAuthenticationCredentialStruct,
    SignedTransaction,
    VerificationPayload,
    DecryptionPayload,
    progress::{
        ProgressMessageType,
        ProgressStep,
        send_progress_message,
        send_completion_message,
        send_error_message
    },
    handlers::ConfirmationConfig,
    wasm_to_json::WasmSignedTransaction,
};
use crate::handlers::confirm_tx_details::{request_user_confirmation, ConfirmationResult};


#[wasm_bindgen]
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SignTransactionsWithActionsRequest {
    #[wasm_bindgen(getter_with_clone)]
    pub verification: VerificationPayload,
    #[wasm_bindgen(getter_with_clone)]
    pub decryption: DecryptionPayload,
    #[wasm_bindgen(getter_with_clone, js_name = "txSigningRequests")]
    pub tx_signing_requests: Vec<TransactionPayload>,
    /// Unified confirmation configuration for controlling the confirmation flow
    #[wasm_bindgen(getter_with_clone, js_name = "confirmationConfig")]
    pub confirmation_config: Option<ConfirmationConfig>,
}

#[wasm_bindgen]
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TransactionPayload {
    #[wasm_bindgen(getter_with_clone, js_name = "nearAccountId")]
    pub near_account_id: String,
    #[wasm_bindgen(getter_with_clone, js_name = "receiverId")]
    pub receiver_id: String,
    // JSON string of ActionParams[]
    // WASM does not support complex Enums, so it's passed in as a JSON string
    #[wasm_bindgen(getter_with_clone, js_name = "actions")]
    pub actions: String,
    #[wasm_bindgen(getter_with_clone, js_name = "nonce")]
    pub nonce: String,
    #[wasm_bindgen(getter_with_clone, js_name = "blockHash")]
    pub block_hash: String,
}

impl TransactionPayload {
    /// Parse the actions JSON string into a typed Vec<ActionParams>
    pub fn parsed_actions(&self) -> Result<Vec<ActionParams>, serde_json::Error> {
        serde_json::from_str(&self.actions)
    }

    /// Parse the actions JSON string into serde_json::Value
    /// Returns an empty array on parse failure
    pub fn parsed_actions_value(&self) -> serde_json::Value {
        serde_json::from_str(&self.actions).unwrap_or_else(|_| serde_json::json!([]))
    }
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

#[wasm_bindgen]
#[derive(Debug, Clone, Deserialize)]
pub struct Decryption {
    #[wasm_bindgen(getter_with_clone)]
    pub chacha20_prf_output: String,
    #[wasm_bindgen(getter_with_clone)]
    pub encrypted_private_key_data: String,
    #[wasm_bindgen(getter_with_clone)]
    pub encrypted_private_key_iv: String,
}

#[wasm_bindgen]
impl Decryption {
    #[wasm_bindgen(constructor)]
    pub fn new(
        chacha20_prf_output: String,
        encrypted_private_key_data: String,
        encrypted_private_key_iv: String,
    ) -> Decryption {
        Decryption {
            chacha20_prf_output,
            encrypted_private_key_data,
            encrypted_private_key_iv,
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
    tx_batch_request: SignTransactionsWithActionsRequest
) -> Result<TransactionSignResult, String> {

    // Validate input
    if tx_batch_request.tx_signing_requests.is_empty() {
        return Err("No transactions provided".to_string());
    }

    let mut logs: Vec<String> = Vec::new();
    logs.push(format!("Processing {} transactions", tx_batch_request.tx_signing_requests.len()));

    // Step 1: Request user confirmation and credential collection
    let mut confirmation_result_opt: Option<ConfirmationResult> = None;

    // Log transaction details for validation
    for (i, tx) in tx_batch_request.tx_signing_requests.iter().enumerate() {
        logs.push(format!(
            "Transaction {}: {} -> {} ({} actions)",
            i + 1,
            tx.near_account_id,
            tx.receiver_id,
            tx.actions
        ));
    }
    send_progress_message(
        ProgressMessageType::ExecuteActionsProgress,
        ProgressStep::UserConfirmation,
        "Requesting user confirmation...",
        Some(&serde_json::json!({
            "step": 1,
            "total": 4,
            "transaction_count": tx_batch_request.tx_signing_requests.len()
        }).to_string())
    );

    // Use the confirmation configuration if provided, otherwise use default
    let confirmation_config = tx_batch_request.confirmation_config.as_ref();
    logs.push(format!("Using confirmation config: {:?}", confirmation_config));

    let c = request_user_confirmation(&tx_batch_request, &mut logs).await
        .map_err(|e| format!("Confirmation request failed: {}", e))?;

    if !c.confirmed {
        return Ok(TransactionSignResult::failed(logs, "Transaction rejected by user".to_string()));
    }
    logs.push(format!("User confirmation received with digest: {}", c.intent_digest));

    // Log validation success for embedded mode
    if let Some(confirmation_config) = &tx_batch_request.confirmation_config {
        if confirmation_config.ui_mode == crate::types::handlers::ConfirmationUIMode::Embedded {
            logs.push("[WASM] Embedded mode: Transaction details validation completed successfully".to_string());
        } else {
            logs.push("[WASM] User has confirmed transaction details".to_string());
        }
    }

    confirmation_result_opt = Some(c);

    // Step 2: Extract credentials for verification
    logs.push("Extracting credentials for contract verification...".to_string());
    send_progress_message(
        ProgressMessageType::ExecuteActionsProgress,
        ProgressStep::Preparation,
        "Extracting credentials for verification...",
        Some(&serde_json::json!({"step": 2, "total": 4}).to_string())
    );

    let vrf_challenge = tx_batch_request
        .verification
        .vrf_challenge
        .as_ref()
        .ok_or_else(|| "Missing vrfChallenge in verification".to_string())?;

    // Get credential from confirmation result (mandatory now)
    let credential_json_value = confirmation_result_opt
        .as_ref()
        .and_then(|r| r.credential.clone())
        .ok_or_else(|| "Missing authentication credential from confirmation".to_string())?;

    // If credential is serde_json::Value, convert; else assume structured already
    let credential = if let Ok(c) = serde_json::from_value::<WebAuthnAuthenticationCredentialStruct>(credential_json_value.clone()) {
        c
    } else {
        // Fall back to extracting fields if we received the old structured type
        let c: WebAuthnAuthenticationCredential = serde_json::from_value(credential_json_value)
            .map_err(|e| format!("Invalid authentication credential: {}", e))?;
        WebAuthnAuthenticationCredentialStruct::new(
            c.id,
            c.raw_id,
            c.auth_type,
            c.authenticator_attachment,
            c.response.client_data_json,
            c.response.authenticator_data,
            c.response.signature,
            c.response.user_handle,
        )
    };

    // Step 3: Contract verification using confirmed credentials (if preConfirm) or provided ones
    logs.push(format!("Starting contract verification for {}", tx_batch_request.verification.contract_id));

    // Send verification progress
    send_progress_message(
        ProgressMessageType::ExecuteActionsProgress,
        ProgressStep::ContractVerification,
        "Verifying credentials with contract...",
        Some(&serde_json::json!({"step": 3, "total": 4}).to_string())
    );

    // Convert structured types
    let vrf_data = VrfData::try_from(vrf_challenge)
        .map_err(|e| format!("Failed to convert VRF data: {:?}", e))?;
    let webauthn_auth = WebAuthnAuthenticationCredential::from(&credential);

    // Perform contract verification once for the entire batch
    let verification_result = match verify_authentication_response_rpc_call(
        &tx_batch_request.verification.contract_id,
        &tx_batch_request.verification.near_rpc_url,
        vrf_data,
        webauthn_auth,
    ).await {
        Ok(result) => {
            logs.extend(result.logs.clone());

            // Send verification complete progress
            send_completion_message(
                ProgressMessageType::ExecuteActionsProgress,
                ProgressStep::AuthenticationComplete,
                "Contract verification completed successfully",
                Some(&serde_json::json!({
                    "step": 3,
                    "total": 4,
                    "verified": result.verified,
                    "logs": result.logs
                }).to_string())
            );

            result
        }
        Err(e) => {
            let error_msg = format!("Contract verification failed: {}", e);
            logs.push(error_msg.clone());

            // Send error progress message
            send_error_message(
                ProgressMessageType::ExecuteActionsProgress,
                ProgressStep::Error,
                &error_msg,
                &e.to_string()
            );

            return Ok(TransactionSignResult::failed(logs, error_msg));
        }
    };

    if !verification_result.verified {
        let error_msg = verification_result.error.unwrap_or_else(|| "Contract verification failed".to_string());
        logs.push(error_msg.clone());

        send_error_message(
            ProgressMessageType::ExecuteActionsProgress,
            ProgressStep::Error,
            &error_msg,
            "verification failed"
        );

        return Ok(TransactionSignResult::failed(logs, error_msg));
    }

    logs.push("Contract verification successful".to_string());

    // Step 4: Batch transaction signing (confirmation and verification completed)
    logs.push(format!("Signing {} transactions in secure WASM context...", tx_batch_request.tx_signing_requests.len()));

    // Send signing progress
    send_progress_message(
        ProgressMessageType::ExecuteActionsProgress,
        ProgressStep::TransactionSigningProgress,
        "Decrypting private key and signing transactions...",
        Some(&serde_json::json!({"step": 4, "total": 4, "transaction_count": tx_batch_request.tx_signing_requests.len()}).to_string())
    );

    // Get PRF output from confirmation result (mandatory now)
    let chacha20_prf_output = confirmation_result_opt
        .as_ref()
        .and_then(|r| r.prf_output.clone())
        .ok_or_else(|| "Missing PRF output from confirmation".to_string())?;

    let decryption = Decryption::new(
        chacha20_prf_output,
        tx_batch_request.decryption.encrypted_private_key_data.clone(),
        tx_batch_request.decryption.encrypted_private_key_iv.clone(),
    );

    // Process all transactions using the shared verification and decryption
    let tx_count = tx_batch_request.tx_signing_requests.len();
    let result = sign_near_transactions_with_actions_impl(
        tx_batch_request.tx_signing_requests,
        &decryption,
        logs,
    ).await?;

    // Send completion progress message
    send_completion_message(
        ProgressMessageType::ExecuteActionsProgress,
        ProgressStep::TransactionSigningComplete,
        &format!("{} transactions signed successfully", tx_count),
        Some(&serde_json::json!({
            "step": 4,
            "total": 4,
            "success": result.success,
            "transaction_count": tx_count,
            "logs": result.logs
        }).to_string())
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
    let signing_key = crate::crypto::decrypt_private_key_with_prf(
        &first_transaction.near_account_id,
        &decryption.chacha20_prf_output,
        &decryption.encrypted_private_key_data,
        &decryption.encrypted_private_key_iv,
    ).map_err(|e| format!("Decryption failed: {}", e))?;

    logs.push("Private key decrypted successfully".to_string());

    // Process each transaction
    let mut signed_transactions_wasm = Vec::new();
    let mut transaction_hashes = Vec::new();

    for (index, tx_data) in tx_requests.iter().enumerate() {
        logs.push(format!("Processing transaction {} of {}", index + 1, tx_requests.len()));

        // Parse and build actions for this transaction
        let action_params: Vec<ActionParams> = match tx_data.parsed_actions() {
            Ok(params) => {
                logs.push(format!("Transaction {}: Parsed {} actions", index + 1, params.len()));
                params
            }
            Err(e) => {
                let error_msg = format!("Transaction {}: Failed to parse actions: {}", index + 1, e);
                logs.push(error_msg.clone());
                return Ok(TransactionSignResult::failed(logs, error_msg));
            }
        };

        let actions = match build_actions_from_params(action_params) {
            Ok(actions) => {
                logs.push(format!("Transaction {}: Actions built successfully", index + 1));
                actions
            }
            Err(e) => {
                let error_msg = format!("Transaction {}: Failed to build actions: {}", index + 1, e);
                logs.push(error_msg.clone());
                return Ok(TransactionSignResult::failed(logs, error_msg));
            }
        };

        // Build and sign transaction
        let transaction = match build_transaction_with_actions(
            &tx_data.near_account_id,
            &tx_data.receiver_id,
            tx_data.nonce.parse().map_err(|e| format!("Invalid nonce: {}", e))?,
            &bs58::decode(&tx_data.block_hash).into_vec().map_err(|e| format!("Invalid block hash: {}", e))?,
            &signing_key,
            actions,
        ) {
            Ok(tx) => {
                logs.push(format!("Transaction {}: Built successfully", index + 1));
                tx
            }
            Err(e) => {
                let error_msg = format!("Transaction {}: Failed to build transaction: {}", index + 1, e);
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
                let error_msg = format!("Transaction {}: Failed to sign transaction: {}", index + 1, e);
                logs.push(error_msg.clone());
                return Ok(TransactionSignResult::failed(logs, error_msg));
            }
        };

        // Calculate transaction hash from signed transaction bytes (before moving the bytes)
        let transaction_hash = calculate_transaction_hash(&signed_tx_bytes);
        logs.push(format!("Transaction {}: Hash calculated - {}", index + 1, transaction_hash));

        // Create SignedTransaction from signed bytes
        let signed_tx: SignedTransaction = borsh::from_slice(&signed_tx_bytes)
            .map_err(|e| {
                let error_msg = format!("Transaction {}: Failed to deserialize SignedTransaction: {}", index + 1, e);
                logs.push(error_msg.clone());
                error_msg
            })?;

        let signed_tx_wasm = WasmSignedTransaction::from(&signed_tx);

        signed_transactions_wasm.push(signed_tx_wasm);
        transaction_hashes.push(transaction_hash);
    }

    logs.push(format!("All {} transactions signed successfully", signed_transactions_wasm.len()));
    info!("RUST: Batch signing completed successfully");

    Ok(TransactionSignResult::new(
        true,
        Some(transaction_hashes),
        Some(signed_transactions_wasm),
        logs,
        None,
    ))
}
