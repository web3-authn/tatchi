// ******************************************************************************
// *                                                                            *
// *                    TRANSACTION CONFIRMATION UTILITIES                     *
// *                                                                            *
// ******************************************************************************

use wasm_bindgen::prelude::*;
use wasm_bindgen::JsValue;
use serde::{Deserialize, Serialize};
use serde_json;
use serde_wasm_bindgen;
use sha2::{Sha256, Digest};
use super::handle_sign_transactions_with_actions::{TransactionPayload, SignTransactionsWithActionsRequest};
use super::handle_sign_verify_and_register_user::SignVerifyAndRegisterUserRequest;
use crate::types::handlers::{
    ConfirmationConfig,
    ConfirmationUIMode,
    ConfirmationBehavior
};
use crate::encoders::base64_url_encode;
use crate::actions::ActionParams;

// External JS function for secure confirmation
#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_name = awaitSecureConfirmation)]
    async fn await_secure_confirmation(
        request_id: &str,
        digest: &str,
        summary: JsValue,
        confirmation_data: JsValue,
        actions_json: &str
    ) -> JsValue;
}

/// Transaction confirmation result with detailed information
#[derive(Debug, Clone, Deserialize)]
pub struct ConfirmationResult {
    pub confirmed: bool,
    pub request_id: String,
    /// SHA-256 digest of ActionParams[], then base64url encoded.
    /// Used to ensure that what the user sees in the secure iframe is what
    /// is actually signed in the wasm-worker
    pub intent_digest: String,
    pub credential: Option<serde_json::Value>, // Serialized WebAuthn credential (JSON)
    pub prf_output: Option<String>, // Base64url-encoded PRF output for decryption
}

#[derive(Debug, Clone, Serialize)]
pub struct ConfirmationSummaryAction {
    pub to: String,
    #[serde(rename = "totalAmount")]
    pub total_amount: String,
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
        let actions: Vec<ActionParams> = serde_json::from_str(&tx_request.actions)
            .map_err(|e| format!("Failed to parse actions JSON: {}", e))?;

        for action in actions {
            match action {
                ActionParams::CreateAccount => {}
                ActionParams::DeployContract { .. } => {}
                ActionParams::FunctionCall { deposit, .. } => {
                    total_deposit += deposit.parse::<u128>().unwrap_or(0);
                }
                ActionParams::Transfer { deposit } => {
                    total_deposit += deposit.parse::<u128>().unwrap_or(0);
                }
                ActionParams::Stake { stake, .. } => {
                    total_deposit += stake.parse::<u128>().unwrap_or(0);
                }
                ActionParams::AddKey { .. } => {}
                ActionParams::DeleteKey { .. } => {}
                ActionParams::DeleteAccount { .. } => {}
            }
        }
    }

    // Format the summary
    let summary = ConfirmationSummaryAction {
        to: match unique_receivers.len() {
            1 => unique_receivers.iter().next().unwrap().to_string(),
            _ => format!("{} recipients", unique_receivers.len()),
        },
        total_amount: match total_deposit {
            0 => "0".to_string(),
            _ => format!("{}", total_deposit),
        },
    };

    serde_json::to_value(&summary)
        .map_err(|e| format!("Failed to serialize transaction summary: {}", e))
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
            logs.push("Skipping user confirmation (UI mode: skip/embedded)".to_string());

            // For skip/embedded override, we still need to collect credentials and PRF output
            // but we don't show any UI. The main thread should handle this.
            // For now, we'll still call the JS bridge but with a flag to indicate no UI
            let intent_digest = compute_intent_digest(&tx_batch_request.tx_signing_requests)
                .map_err(|e| format!("Failed to compute intent digest: {}", e))?;

            let request_id = generate_request_id();
            let near_account_id = &first_request.near_account_id;

            // Validate and normalize confirmation config according to documented rules
            let normalized_config = validate_and_normalize_confirmation_config(confirmation_config);

            let summary = create_transaction_summary(&tx_batch_request.tx_signing_requests)
                .map_err(|e| format!("Failed to create transaction summary: {}", e))?;

            let confirmation_data = serde_json::json!({
                "intentDigest": intent_digest,
                "nearAccountId": near_account_id,
                "vrfChallenge": tx_batch_request.verification.vrf_challenge,
                "confirmationConfig": Some(normalized_config),
                "isRegistration": false, // not registration flow
            });

            // Send transaction payloads directly to preserve receiverId information
            let confirm_result = await_secure_confirmation(
                &request_id,
                &intent_digest,
                JsValue::from_str(&summary.to_string()),
                JsValue::from_str(&confirmation_data.to_string()),
                &serde_json::to_string(&tx_batch_request.tx_signing_requests).unwrap_or_default()
            ).await;

            let result = parse_confirmation_result(confirm_result)?;

            // For skip/embedded override, we assume the user implicitly confirms
            // but we still need the credentials and PRF output
            if result.credential.is_some() && result.prf_output.is_some() {
                logs.push("Credentials collected successfully".to_string());
                return Ok(ConfirmationResult {
                    confirmed: true, // Always true for "none" mode
                    ..result
                });
            } else {
                return Err("Failed to collect credentials".to_string());
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
        Some(validate_and_normalize_confirmation_config(confirmation_config))
    } else {
        None
    };

    let confirmation_data = serde_json::json!({
        "intentDigest": intent_digest,
        "nearAccountId": near_account_id,
        "vrfChallenge": tx_batch_request.verification.vrf_challenge,
        "confirmationConfig": normalized_config,
        "isRegistration": false, // not registration flow
    });

    // Call JS bridge for user confirmation with enhanced data
    let confirm_result = await_secure_confirmation(
        &request_id,
        &intent_digest,
        JsValue::from_str(&summary.to_string()),
        JsValue::from_str(&confirmation_data.to_string()),
        &serde_json::to_string(&tx_batch_request.tx_signing_requests).unwrap_or_default()
    ).await;

    // Parse confirmation result
    let result = parse_confirmation_result(confirm_result)?;

    Ok(result)
}

/// Requests user confirmation for registration flow
/// This is different from transaction confirmation as it needs to collect registration credentials
pub async fn request_user_registration_confirmation(
    registration_request: &SignVerifyAndRegisterUserRequest,
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

    // Extract account information for credential collection
    let near_account_id = &registration_request.registration.near_account_id;

    // Create registration confirmation data
    let confirmation_data = serde_json::json!({
        "intentDigest": intent_digest,
        "nearAccountId": near_account_id,
        "vrfChallenge": registration_request.verification.vrf_challenge,
        // No need to show confirmation modal for registration flow,
        // so we use the default config for skip/embedded modes.
        "confirmationConfig": ConfirmationConfig {
            ui_mode: ConfirmationUIMode::Skip,
            behavior: ConfirmationBehavior::AutoProceed,
            auto_proceed_delay: Some(0),
        },
        "isRegistration": true, // Flag to indicate this is registration flow
    });

    // Call JS bridge for user confirmation
    let confirm_result = await_secure_confirmation(
        &request_id,
        &intent_digest,
        JsValue::from_str(&summary.to_string()),
        JsValue::from_str(&confirmation_data.to_string()),
        "" // No actions for registration, actions are signed by either server account
        // or delegated action account, so no need to show TX confirmation modals.
    ).await;

    web_sys::console::log_1(&"[Rust] User passkey confirmation response received".into());

    // Parse confirmation result
    let result = parse_confirmation_result(confirm_result)?;

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
fn parse_confirmation_result(confirm_result: JsValue) -> Result<ConfirmationResult, String> {
    serde_wasm_bindgen::from_value::<ConfirmationResult>(confirm_result)
        .map_err(|e| format!("Failed to parse confirmation result: {}", e))
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