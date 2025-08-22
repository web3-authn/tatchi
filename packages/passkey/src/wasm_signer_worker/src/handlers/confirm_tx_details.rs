// ******************************************************************************
// *                                                                            *
// *                    TRANSACTION CONFIRMATION UTILITIES                     *
// *                                                                            *
// ******************************************************************************

use wasm_bindgen::prelude::*;
use wasm_bindgen::JsValue;
use serde_json;
use sha2::{Sha256, Digest};
use super::handle_sign_transactions_with_actions::{TransactionPayload, SignTransactionsWithActionsRequest};
use super::handle_sign_verify_and_register_user::SignVerifyAndRegisterUserRequest;
use crate::types::handlers::{
    ConfirmationConfig,
    ConfirmationUIMode,
    ConfirmationBehavior
};
use crate::encoders::base64_url_encode;

// External JS function for secure confirmation
#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_name = awaitSecureConfirmation)]
    async fn await_secure_confirmation(
        request_id: &str,
        summary: JsValue,
        digest: &str,
        actions_json: &str
    ) -> JsValue;
}

/// Transaction confirmation result with detailed information
#[derive(Debug, Clone)]
pub struct ConfirmationResult {
    pub confirmed: bool,
    pub request_id: String,
    pub intent_digest: String,
    pub credential: Option<serde_json::Value>, // Serialized WebAuthn credential (JSON)
    pub prf_output: Option<String>, // Base64url-encoded PRF output for decryption
}

/// Validates and normalizes confirmation configuration according to documented rules
///
/// Validation rules:
/// - uiMode: 'skip' | 'embedded' → behavior is ignored, autoProceedDelay is ignored
/// - uiMode: 'modal' → behavior: 'requireClick' | 'autoProceed', autoProceedDelay only used with 'autoProceed'
///
/// Returns a normalized config with proper defaults and logs validation messages
pub fn validate_and_normalize_confirmation_config(
    config: &ConfirmationConfig,
    logs: &mut Vec<String>,
) -> ConfirmationConfig {
    let mut normalized = config.clone();

    match config.ui_mode {
        ConfirmationUIMode::Skip | ConfirmationUIMode::Embedded => {
            // For skip/embedded modes, override behavior to autoProceed with 0 delay
            normalized.behavior = ConfirmationBehavior::AutoProceed;
            normalized.auto_proceed_delay = Some(0);
        },

        ConfirmationUIMode::Modal => {
            // For modal mode, validate behavior and autoProceedDelay
            match config.behavior {
                ConfirmationBehavior::RequireClick => {
                    if config.auto_proceed_delay.is_some() {
                        normalized.auto_proceed_delay = None;
                    }
                },
                ConfirmationBehavior::AutoProceed => {
                    if config.auto_proceed_delay.is_none() {
                        normalized.auto_proceed_delay = Some(2000);
                    }
                }
            }
        }
    }

    normalized
}

/// Generates a unique request ID for confirmation requests using timestamp and random value
pub fn generate_request_id() -> String {
    format!("{}-{}", js_sys::Date::now(), js_sys::Math::random())
}

/// Creates a transaction summary for user confirmation based on all transactions
pub fn create_transaction_summary(
    tx_requests: &[TransactionPayload],
) -> Result<serde_json::Value, String> {

    if tx_requests.is_empty() {
        return Err("No transactions provided for summary".to_string());
    }

    let mut total_deposit = 0u128;
    let mut unique_receivers = std::collections::HashSet::new();

    // Process all transactions to calculate totals
    for tx_request in tx_requests {
        unique_receivers.insert(tx_request.receiver_id.clone());

        // Parse actions to extract deposits
        let actions: Vec<serde_json::Value> = serde_json::from_str(&tx_request.actions)
            .map_err(|e| format!("Failed to parse actions JSON: {}", e))?;

        for action in actions {
            // Extract deposit amount from Transfer actions
            if let Some(action_type) = action.get("action_type").and_then(|t| t.as_str()) {
                if action_type == "Transfer" {
                    if let Some(deposit) = action.get("deposit").and_then(|d| d.as_str()) {
                        if let Ok(amount) = deposit.parse::<u128>() {
                            total_deposit += amount;
                        }
                    }
                }
            }
            // Extract deposit amount from FunctionCall actions
            if let Some(action_type) = action.get("action_type").and_then(|t| t.as_str()) {
                if action_type == "FunctionCall" {
                    if let Some(deposit) = action.get("deposit").and_then(|d| d.as_str()) {
                        if let Ok(amount) = deposit.parse::<u128>() {
                            total_deposit += amount;
                        }
                    }
                }
            }
        }
    }

    // Format the summary
    let summary = serde_json::json!({
        "to": if unique_receivers.len() == 1 {
            unique_receivers.iter().next().unwrap().to_string()
        } else {
            format!("{} recipients", unique_receivers.len())
        },
        "totalAmount": if total_deposit > 0 {
            format!("{} yoctoNEAR", total_deposit)
        } else {
            "0 yoctoNEAR".to_string()
        },
    });

    Ok(summary)
}

/// Computes SHA-256 digest of transaction requests for integrity verification
pub fn compute_intent_digest(tx_requests: &[TransactionPayload]) -> Result<String, String> {
    let serialized = serde_json::to_string(tx_requests)
        .map_err(|e| format!("Failed to serialize transaction requests: {}", e))?;

    let mut hasher = Sha256::new();
    hasher.update(serialized.as_bytes());
    let hash = hasher.finalize();

    Ok(base64_url_encode(&hash))
}

/// Requests user confirmation for transaction signing with comprehensive error handling
pub async fn request_user_confirmation(
    tx_batch_request: &SignTransactionsWithActionsRequest,
    logs: &mut Vec<String>,
) -> Result<ConfirmationResult, String> {
    request_user_confirmation_with_config(tx_batch_request, logs).await
}

/// Requests user confirmation with configurable options
pub async fn request_user_confirmation_with_config(
    tx_batch_request: &SignTransactionsWithActionsRequest,
    logs: &mut Vec<String>,
) -> Result<ConfirmationResult, String> {
    // Validate input
    if tx_batch_request.tx_signing_requests.is_empty() {
        return Err("No transactions provided for confirmation".to_string());
    }

    let first_request = &tx_batch_request.tx_signing_requests[0];

    // Check if UI mode is Skip OR Embedded - for embedded, we override to skip extra UI
    // but still collect credentials and PRF output via the bridge (no additional UI shown)
    if let Some(confirmation_config) = &tx_batch_request.confirmation_config {

        let should_skip_ui_confirm = confirmation_config.ui_mode == ConfirmationUIMode::Skip
            || confirmation_config.ui_mode == ConfirmationUIMode::Embedded;

        if should_skip_ui_confirm {
            logs.push("Skipping user confirmation (UI mode: skip/embedded override)".to_string());

            // For skip/embedded override, we still need to collect credentials and PRF output
            // but we don't show any UI. The main thread should handle this.
            // For now, we'll still call the JS bridge but with a flag to indicate no UI
            let intent_digest = compute_intent_digest(&tx_batch_request.tx_signing_requests)
                .map_err(|e| format!("Failed to compute intent digest: {}", e))?;

            let request_id = generate_request_id();
            let near_account_id = &first_request.near_account_id;

            // Validate and normalize confirmation config according to documented rules
            let normalized_config = validate_and_normalize_confirmation_config(confirmation_config, logs);

            let confirmation_data = serde_json::json!({
                "summary": serde_json::json!({}),
                "intentDigest": intent_digest,
                "nearAccountId": near_account_id,
                "vrfChallenge": tx_batch_request.verification.vrf_challenge,
                "confirmationConfig": Some(normalized_config),
                "skipUI": should_skip_ui_confirm,
            });

            // Send transaction payloads directly to preserve receiverId information
            let confirm_result = await_secure_confirmation(
                &request_id,
                JsValue::from_str(&confirmation_data.to_string()),
                &intent_digest,
                &serde_json::to_string(&tx_batch_request.tx_signing_requests).unwrap_or_default()
            ).await;

            let result = parse_confirmation_result(confirm_result, request_id, intent_digest)?;

            // For skip/embedded override, we assume the user implicitly confirms
            // but we still need the credentials and PRF output
            if result.credential.is_some() && result.prf_output.is_some() {
                logs.push("Credentials collected successfully (no UI override)".to_string());
                return Ok(ConfirmationResult {
                    confirmed: true, // Always true for "none" mode
                    ..result
                });
            } else {
                return Err("Failed to collect credentials in no-UI override".to_string());
            }
        }
    }

    // Normal confirmation flow for other UI modes
    let summary = create_transaction_summary(&tx_batch_request.tx_signing_requests)
        .map_err(|e| format!("Failed to create transaction summary: {}", e))?;

    let intent_digest = compute_intent_digest(&tx_batch_request.tx_signing_requests)
        .map_err(|e| format!("Failed to compute intent digest: {}", e))?;

    let request_id = generate_request_id();

    // Log confirmation request
    web_sys::console::log_1(
        &format!("[Rust] Prompting user confirmation in JS main thread with ID: {}", request_id).into()
    );
    logs.push(format!("Prompting user confirmation in JS main thread for {} transactions", tx_batch_request.tx_signing_requests.len()));

    // Extract account information for credential collection
    // All transactions in the batch are signed by the same near_account_id.
    let near_account_id = &first_request.near_account_id;

    // Create enhanced confirmation data with account info and configuration
    // Validate and normalize confirmation config according to documented rules
    let normalized_config = if let Some(confirmation_config) = &tx_batch_request.confirmation_config {
        Some(validate_and_normalize_confirmation_config(confirmation_config, logs))
    } else {
        None
    };

    let confirmation_data = serde_json::json!({
        "summary": summary,
        "intentDigest": intent_digest,
        "nearAccountId": near_account_id,
        "vrfChallenge": tx_batch_request.verification.vrf_challenge,
        "confirmationConfig": normalized_config,
    });

    // Call JS bridge for user confirmation with enhanced data
    let confirm_result = await_secure_confirmation(
        &request_id,
        JsValue::from_str(&confirmation_data.to_string()),
        &intent_digest,
        &serde_json::to_string(&tx_batch_request.tx_signing_requests).unwrap_or_default()
    ).await;

    // Parse confirmation result
    let result = parse_confirmation_result(confirm_result, request_id, intent_digest)?;

    Ok(result)
}

/// Requests user confirmation for registration flow
/// This is different from transaction confirmation as it needs to collect registration credentials
pub async fn request_user_registration_confirmation(
    registration_request: &SignVerifyAndRegisterUserRequest,
    logs: &mut Vec<String>,
) -> Result<ConfirmationResult, String> {

    // Create registration summary
    let summary = create_registration_summary(registration_request)
        .map_err(|e| format!("Failed to create registration summary: {}", e))?;

    // For registration, we use the account ID as the intent digest since there's no transaction batch
    let intent_digest = format!("registration:{}", registration_request.registration.near_account_id);
    let request_id = generate_request_id();

    // Log confirmation request
    web_sys::console::log_1(
        &format!("[Rust] Prompting user registration confirmation in JS main thread with ID: {}", request_id).into()
    );
    logs.push("Prompting user confirmation in JS main thread for registration".to_string());

    // Extract account information for credential collection
    let near_account_id = &registration_request.registration.near_account_id;

    // Create registration confirmation data
    let confirmation_data = serde_json::json!({
        "summary": summary,
        "intentDigest": intent_digest,
        "nearAccountId": near_account_id,
        "vrfChallenge": registration_request.verification.vrf_challenge,
        "isRegistration": true, // Flag to indicate this is registration flow
    });

    // Call JS bridge for user confirmation
    let confirm_result = await_secure_confirmation(
        &request_id,
        JsValue::from_str(&confirmation_data.to_string()),
        &intent_digest,
        "" // No actions for registration
    ).await;

    web_sys::console::log_1(&"[Rust] User passkey confirmation response received".into());

    // Parse confirmation result
    let result = parse_confirmation_result(confirm_result, request_id, intent_digest)?;

    Ok(result)
}

/// Creates a summary for registration confirmation
fn create_registration_summary(request: &SignVerifyAndRegisterUserRequest) -> Result<serde_json::Value, String> {
    let summary = serde_json::json!({
        "type": "registration",
        "nearAccountId": request.registration.near_account_id,
        "deviceNumber": request.registration.device_number.unwrap_or(1),
        "contractId": request.verification.contract_id,
        "deterministicVrfPublicKey": request.registration.deterministic_vrf_public_key,
    });

    Ok(summary)
}

/// Parses the confirmation result from JavaScript bridge
fn parse_confirmation_result(
    confirm_result: JsValue,
    request_id: String,
    intent_digest: String,
) -> Result<ConfirmationResult, String> {

    let result_data = confirm_result
        .into_serde::<serde_json::Value>()
        .map_err(|e| format!("Failed to parse confirmation result: {}", e))?;

    let confirmed = result_data
        .get("confirmed")
        .and_then(|b| b.as_bool())
        .unwrap_or(false);

    // Extract credential if present (as raw JSON)
    let credential = result_data.get("credential").cloned();

    // Extract PRF output if present: prefer base64url string; if array of numbers, encode
    let prf_output = if let Some(val) = result_data.get("prfOutput") {
        if let Some(s) = val.as_str() {
            Some(s.to_string())
        } else if let Some(array) = val.as_array() {
            let bytes: Vec<u8> = array.iter().filter_map(|v| v.as_u64().map(|n| n as u8)).collect();
            Some(base64_url_encode(&bytes))
        } else {
            None
        }
    } else {
        None
    };

    Ok(ConfirmationResult {
        confirmed,
        request_id,
        intent_digest,
        credential,
        prf_output,
    })
}


#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_generate_request_id_format() {
        let id = generate_request_id();
        assert!(id.contains('-'));
        assert!(id.len() > 10); // Should be timestamp + random number
    }

    #[test]
    fn test_compute_intent_digest_empty() {
        let empty_requests: Vec<TransactionPayload> = vec![];
        let result = compute_intent_digest(&empty_requests);
        assert!(result.is_ok());
        assert!(!result.unwrap().is_empty());
    }
}