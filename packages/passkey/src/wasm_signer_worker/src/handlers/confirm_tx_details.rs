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

/// Configuration for transaction confirmation requests (legacy - for backward compatibility)
#[derive(Debug, Clone)]
pub struct LegacyConfirmationConfig {
    pub include_amount_aggregation: bool,
    pub include_method_details: bool,
}

impl Default for LegacyConfirmationConfig {
    fn default() -> Self {
        Self {
            include_amount_aggregation: false,
            include_method_details: false,
        }
    }
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

/// Generates a unique request ID for confirmation requests using timestamp and random value
pub fn generate_request_id() -> String {
    format!("{}-{}", js_sys::Date::now(), js_sys::Math::random())
}

/// Creates a transaction summary for user confirmation with configurable details
pub fn create_transaction_summary(
    first_request: &TransactionPayload,
    config: &LegacyConfirmationConfig,
) -> Result<serde_json::Value, String> {
    let mut summary = serde_json::json!({
        "to": first_request.receiver_id,
        "amount": "",
        "method": "",
    });

    // TODO: Add amount aggregation when config.include_amount_aggregation is true
    if config.include_amount_aggregation {
        // Future enhancement: aggregate amounts from all actions
        summary["amount"] = serde_json::Value::String("".to_string());
    }

    // TODO: Add method details when config.include_method_details is true
    if config.include_method_details {
        // Future enhancement: extract method names from actions
        summary["method"] = serde_json::Value::String("".to_string());
    }

    Ok(summary)
}

/// Computes SHA-256 digest of transaction requests for integrity verification
pub fn compute_intent_digest(tx_requests: &[TransactionPayload]) -> Result<String, String> {
    let serialized = serde_json::to_string(tx_requests)
        .map_err(|e| format!("Failed to serialize transaction requests: {}", e))?;

    let mut hasher = Sha256::new();
    hasher.update(serialized.as_bytes());
    let hash = hasher.finalize();

    Ok(crate::encoders::base64_url_encode(&hash))
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
            Some(crate::encoders::base64_url_encode(&bytes))
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

/// Requests user confirmation for transaction signing with comprehensive error handling
pub async fn request_user_confirmation(
    tx_batch_request: &SignTransactionsWithActionsRequest,
    logs: &mut Vec<String>,
) -> Result<ConfirmationResult, String> {
    request_user_confirmation_with_config(tx_batch_request, logs, &LegacyConfirmationConfig::default()).await
}

/// Requests user confirmation with configurable options
pub async fn request_user_confirmation_with_config(
    tx_batch_request: &SignTransactionsWithActionsRequest,
    logs: &mut Vec<String>,
    config: &LegacyConfirmationConfig,
) -> Result<ConfirmationResult, String> {
    // Validate input
    if tx_batch_request.tx_signing_requests.is_empty() {
        return Err("No transactions provided for confirmation".to_string());
    }

    let first_request = &tx_batch_request.tx_signing_requests[0];

    // Create transaction summary and compute integrity digest
    let summary = create_transaction_summary(first_request, config)
        .map_err(|e| format!("Failed to create transaction summary: {}", e))?;

    let intent_digest = compute_intent_digest(&tx_batch_request.tx_signing_requests)
        .map_err(|e| format!("Failed to compute intent digest: {}", e))?;

    let request_id = generate_request_id();

    // Log confirmation request
    web_sys::console::log_1(
        &format!("[Rust] Requesting user confirmation with ID: {}", request_id).into()
    );
    logs.push(format!("Requesting user confirmation for {} transactions", tx_batch_request.tx_signing_requests.len()));

    // Extract account information for credential collection
    let near_account_id = &first_request.near_account_id;

    // Create enhanced confirmation data with account info and configuration
    let confirmation_data = serde_json::json!({
        "summary": summary,
        "intentDigest": intent_digest,
        "nearAccountId": near_account_id,
        "vrfChallenge": tx_batch_request.verification.vrf_challenge,
        "confirmationConfig": tx_batch_request.confirmation_config,
    });

    // Call JS bridge for user confirmation with enhanced data
    let confirm_result = await_secure_confirmation(
        &request_id,
        JsValue::from_str(&confirmation_data.to_string()),
        &intent_digest,
        &first_request.actions
    ).await;

    web_sys::console::log_1(&"[Rust] User confirmation completed".into());

    // Parse confirmation result
    let result = parse_confirmation_result(confirm_result, request_id, intent_digest)?;

    // Log result
    if result.confirmed {
        logs.push("User confirmed transaction signing".to_string());
    } else {
        logs.push("User rejected transaction signing".to_string());
    }

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
        &format!("[Rust] Requesting user registration confirmation with ID: {}", request_id).into()
    );
    logs.push("Requesting user confirmation for registration".to_string());

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

    web_sys::console::log_1(&"[Rust] User registration confirmation completed".into());

    // Parse confirmation result
    let result = parse_confirmation_result(confirm_result, request_id, intent_digest)?;

    // Log result
    if result.confirmed {
        logs.push("User confirmed registration".to_string());
    } else {
        logs.push("User rejected registration".to_string());
    }

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