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
use serde_json::Value;
use log::debug;

use super::handle_sign_transactions_with_actions::SignTransactionsWithActionsRequest;
use crate::types::handlers::{
    ConfirmationConfig,
    ConfirmationUIMode,
    ConfirmationBehavior
};
use crate::encoders::base64_url_encode;
use crate::actions::ActionParams;

// External JS function for secure confirmation (V2 typed API)
//
// IMPORTANT: Always pass a JSON STRING (via `JsValue::from_str`) to this bridge,
// not a non‑plain object from `serde_wasm_bindgen::to_value`. The TS guard
// (requestGuards.ts) expects a plain JSON object (post-JSON.parse) and checks
// fields like `schemaVersion === 2`. Non‑plain objects can fail these checks.
//
// Strategy used everywhere in this file:
//   1) Build `request_obj` with `serde_json::json!`
//   2) Serialize with `serde_json::to_string(&request_obj)`
//   3) Wrap with `JsValue::from_str(&request_json_str)`
//   4) Call `await_secure_confirmation_v2(request_js)`
#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_name = awaitSecureConfirmationV2)]
    async fn await_secure_confirmation_v2(request: JsValue) -> JsValue;
}

/// Transaction confirmation result with detailed information
#[derive(Debug, Clone, Deserialize)]
pub struct ConfirmationResult {
    pub confirmed: bool,
    pub request_id: String,
    /// SHA-256 digest of ActionParams[], then base64url encoded.
    /// Used to ensure that what the user sees in the secure iframe is what
    /// is actually signed in the wasm-worker.
    ///
    /// Optional for non-transaction flows (e.g., registration/link-device).
    pub intent_digest: Option<String>,
    pub credential: Option<serde_json::Value>, // Serialized WebAuthn credential (JSON)
    pub prf_output: Option<String>, // Base64url-encoded PRF output for decryption
    pub vrf_challenge: Option<crate::types::VrfChallenge>, // VRF challenge generated in main thread
    pub transaction_context: Option<crate::types::handlers::TransactionContext>, // NEAR data from main thread
    pub error: Option<String>, // Error message if confirmation failed
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
/// - uiMode: 'skip' → behavior is ignored, autoProceedDelay is ignored
/// - uiMode: 'modal' | 'drawer' → behavior: 'requireClick' | 'autoProceed', autoProceedDelay only used with 'autoProceed'
///
/// Returns a normalized config with proper defaults and logs validation messages
pub fn validate_and_normalize_confirmation_config(
    config: &ConfirmationConfig,
) -> ConfirmationConfig {
    let mut normalized = config.clone();

    match config.ui_mode {
        ConfirmationUIMode::Skip => {
            // For skip mode, override behavior to autoProceed with 0 delay
            normalized.behavior = ConfirmationBehavior::AutoProceed;
            normalized.auto_proceed_delay = Some(0);
        },

        ConfirmationUIMode::Modal | ConfirmationUIMode::Drawer => {
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
#[cfg(target_arch = "wasm32")]
pub fn generate_request_id() -> String {
    format!("{}-{}", js_sys::Date::now(), js_sys::Math::random())
}

#[cfg(not(target_arch = "wasm32"))]
pub fn generate_request_id() -> String {
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::time::{SystemTime, UNIX_EPOCH};

    static COUNTER: AtomicU64 = AtomicU64::new(0);
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let n = COUNTER.fetch_add(1, Ordering::Relaxed);
    format!("{}-{}", millis, n)
}


/// Creates a transaction summary from pre-parsed actions to avoid double parsing
pub fn create_transaction_summary_from_parsed(
    receivers_and_actions: &[(String, Vec<ActionParams>)]
) -> Result<serde_json::Value, String> {
    if receivers_and_actions.is_empty() {
        return Err("No transactions provided for summary".to_string());
    }

    let mut total_deposit = 0u128;
    let mut unique_receivers = std::collections::HashSet::new();

    for (receiver_id, actions) in receivers_and_actions {
        unique_receivers.insert(receiver_id.clone());

        for action in actions {
            match action {
                ActionParams::CreateAccount => {}
                ActionParams::DeployContract { .. } => {}
                ActionParams::DeployGlobalContract { .. } => {}
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
                ActionParams::UseGlobalContract { .. } => {}
            }
        }
    }

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

/// Computes SHA-256 digest (base64url) of the JS-level tx_signing_requests payload
/// i.e. an array of objects shaped like: { receiverId: String, actions: Vec<ActionParams> }
/// This matches what we send to the main thread in awaitSecureConfirmation and what the UI renders.
///
/// Note: serde_json::to_string produces a deterministic ordering for struct fields
/// as they are defined in Rust (and for these constructed serde_json::Value objects,
/// as we insert keys in a stable order). The UI should either mirror this order
/// when building its digest input or alphabetize keys consistently before hashing
/// to avoid ordering-related drift.
pub fn compute_intent_digest_from_js_inputs(
    receivers_and_actions: &[(String, Vec<ActionParams>)]
) -> Result<String, String> {

    // Build the exact JSON structure passed to the main thread
    let js_array: Vec<serde_json::Value> = receivers_and_actions.iter()
        .map(|(receiver_id, actions)| {
            serde_json::json!({
                "receiverId": receiver_id,
                "actions": actions
            })
        })
        .collect();

    // alphabetize keys recursively to ensure deterministic JSON so that digest hashes
    // match the ones calcuated in the JS main thread (which also alphabetize JSON keys)
    fn alphabetize_json_value(v: &Value) -> Value {
      match v {
        Value::Object(map) => {
          let mut keys: Vec<&String> = map.keys().collect();
          keys.sort();
          let mut out = serde_json::Map::new();
          for k in keys {
            if let Some(child) = map.get(k) {
              out.insert(k.clone(), alphabetize_json_value(child));
            }
          }
          Value::Object(out)
        }
        Value::Array(arr) => Value::Array(arr.iter().map(alphabetize_json_value).collect()),
        _ => v.clone(),
      }
    }

    let value = Value::Array(js_array);
    let alphabetized_tx_signing_requests = alphabetize_json_value(&value);
    let serialized_digest = serde_json::to_string(&alphabetized_tx_signing_requests)
        .map_err(|e| format!("Failed to serialize js tx_signing_requests: {}", e))?;

    let mut hasher = Sha256::new();
    hasher.update(serialized_digest.as_bytes());
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

    // Pre-parse actions once for summary and UI payloads
    let parsed_receivers_and_actions: Vec<(String, Vec<ActionParams>)> = tx_batch_request
        .tx_signing_requests
        .iter()
        .map(|tx| {
            let actions = tx.parsed_actions().unwrap_or_default();
            (tx.receiver_id.clone(), actions)
        })
        .collect();

    // Check if UI mode is Skip - still collect credentials and PRF output via the bridge (no additional UI shown)
    if let Some(confirmation_config) = &tx_batch_request.confirmation_config {

        let should_skip_ui_confirm = confirmation_config.ui_mode == ConfirmationUIMode::Skip;

        if should_skip_ui_confirm {
            logs.push("Skipping user confirmation (UI mode: skip)".to_string());

            // For skip override, we still need to collect credentials and PRF output
            // but we don't show any UI. The main thread should handle this.
            // For now, we'll still call the JS bridge but with a flag to indicate no UI
            // Compute digest over the same structure we pass to the main thread/UI
            let intent_digest = compute_intent_digest_from_js_inputs(&parsed_receivers_and_actions)
                .map_err(|e| format!("Failed to compute intent digest: {}", e))?;

            let request_id = generate_request_id();
            let near_account_id = &first_request.near_account_id;

            // Validate and normalize confirmation config according to documented rules
            let normalized_config = validate_and_normalize_confirmation_config(confirmation_config);

            let summary = create_transaction_summary_from_parsed(&parsed_receivers_and_actions)
                .map_err(|e| format!("Failed to create transaction summary: {}", e))?;

            let _confirmation_data = serde_json::json!({
                "intentDigest": intent_digest,
                "nearAccountId": near_account_id,
                "rpcCall": tx_batch_request.rpc_call,
                "confirmationConfig": Some(normalized_config.clone()),
                // "registrationDetails": None, // not registration flow
            });

            // Convert actions: str to serde_json::Value first before serializing (to avoid double-encoding strings)
            let tx_signing_requests_json = parsed_receivers_and_actions.iter().map(|(receiver_id, actions)| {
                serde_json::json!({
                    "receiverId": receiver_id,
                    "actions": actions
                })
            }).collect::<Vec<serde_json::Value>>();

            // Build V2 secure confirm request
            let request_obj = serde_json::json!({
                "schemaVersion": 2,
                "requestId": request_id,
                "type": "signTransaction",
                "summary": summary,
                "payload": {
                    "txSigningRequests": tx_signing_requests_json,
                    "intentDigest": intent_digest,
                    "rpcCall": tx_batch_request.rpc_call,
                },
                "confirmationConfig": normalized_config,
            });

            // Serialize to JSON string for robust cross-boundary cloning into TS
            // Using the same strategy as the normal confirmation flow to avoid
            // wasm-bindgen object shape issues in the TS validator.
            let request_json_str = serde_json::to_string(&request_obj)
                .map_err(|e| format!("Failed to serialize V2 confirm request to string: {}", e))?;

            debug!("[Rust] V2 confirm request (tx:skip) JSON length: {}", request_json_str.len());
            let request_js = JsValue::from_str(&request_json_str);

            let confirm_result = await_secure_confirmation_v2(request_js).await;

            let result = parse_confirmation_result(confirm_result)?;

            // Enforce digest parity: the UI/bridge must return the same intentDigest
            if let Some(returned_digest) = &result.intent_digest {
                if returned_digest != &intent_digest {
                    return Err("Intent digest mismatch between UI and WASM".to_string());
                }
            } else {
                return Err("Missing intent digest from confirmation result".to_string());
            }

            // For skip override, we assume the user implicitly confirms
            // but we still need the credentials and PRF output
            if result.credential.is_some() && result.prf_output.is_some() {
                logs.push("Credentials collected successfully".to_string());
                return Ok(ConfirmationResult {
                    confirmed: true, // Always true for "none" mode
                    ..result
                });
            } else {
                if let Some(error) = result.error {
                    return Err(error);
                } else {
                    return Err("Failed to collect credentials".to_string());
                }
            }
        }
    }

    // Normal confirmation flow for other UI modes
    let summary = create_transaction_summary_from_parsed(&parsed_receivers_and_actions)
        .map_err(|e| format!("Failed to create transaction summary: {}", e))?;

    // Compute digest over the same structure we pass to the main thread/UI
    let intent_digest = compute_intent_digest_from_js_inputs(&parsed_receivers_and_actions)
        .map_err(|e| format!("Failed to compute intent digest: {}", e))?;

    let request_id = generate_request_id();

    // Log confirmation request
    debug!("[Rust] Prompting user confirmation in JS main thread with ID: {}", request_id);
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

    let _confirmation_data = serde_json::json!({
        "intentDigest": intent_digest,
        "nearAccountId": near_account_id,
        "rpcCall": tx_batch_request.rpc_call,
        "confirmationConfig": normalized_config,
        // "registrationDetails": None, // not registration flow
    });

    // Convert actions to JSON values the UI expects
    let tx_signing_requests_json = parsed_receivers_and_actions.iter().map(|(receiver_id, actions)| {
        serde_json::json!({
            "receiverId": receiver_id,
            "actions": actions
        })
    }).collect::<Vec<serde_json::Value>>();

    // Build V2 secure confirm request
    let request_obj = serde_json::json!({
        "schemaVersion": 2,
        "requestId": request_id,
        "type": "signTransaction",
        "summary": summary,
        "payload": {
            "txSigningRequests": tx_signing_requests_json,
            "intentDigest": intent_digest,
            "rpcCall": tx_batch_request.rpc_call,
        },
        "confirmationConfig": normalized_config,
    });

    // Serialize to JSON string for robust cross-boundary cloning into TS
    let request_json_str = serde_json::to_string(&request_obj)
        .map_err(|e| format!("Failed to serialize V2 confirm request to string: {}", e))?;
    debug!("[Rust] V2 confirm request (tx) JSON length: {}", request_json_str.len());
    let request_js = JsValue::from_str(&request_json_str);

    // Call JS bridge for user confirmation with enhanced data
    let confirm_result = await_secure_confirmation_v2(request_js).await;

    // Parse confirmation result
    let result = parse_confirmation_result(confirm_result)?;

    // Enforce digest parity: the UI/bridge must return the same intentDigest
    if let Some(returned_digest) = &result.intent_digest {
        if returned_digest != &intent_digest {
            return Err("Intent digest mismatch between UI and WASM".to_string());
        }
    } else {
        return Err("Missing intent digest from confirmation result".to_string());
    }

    Ok(result)
}


/// Requests user confirmation for link-device flow (Device N)
/// This triggers an in-iframe modal to gather a real user click,
/// computes NEAR context + VRF challenge on the main thread,
/// then performs a WebAuthn create() to collect dual PRF outputs and a registration credential.
pub async fn request_registration_credential_confirmation(
    near_account_id: &str,
    device_number: usize,
    contract_id: &str,
    near_rpc_url: &str,
    confirmation_config: Option<ConfirmationConfig>,
) -> Result<ConfirmationResult, String> {
    // Summary shown to the user (object form)
    let summary = serde_json::json!({
        "type": "registration",
        "nearAccountId": near_account_id,
        "deviceNumber": device_number,
        "contractId": contract_id,
    });

    // Deterministic-ish digest for UI/telemetry (not a tx digest)
    let intent_digest = format!("linkdevice:{}:{}", near_account_id, device_number);
    let request_id = generate_request_id();

    // Normalize provided confirmation config or fall back to a safe default (modal + requireClick)
    let normalized_config = match confirmation_config {
        Some(ref cfg) => validate_and_normalize_confirmation_config(cfg),
        None => ConfirmationConfig {
            ui_mode: ConfirmationUIMode::Modal,
            behavior: ConfirmationBehavior::RequireClick,
            auto_proceed_delay: None,
            theme: None,
        },
    };

    // Confirmation data for JS main thread
    let confirmation_data = serde_json::json!({
        "intentDigest": intent_digest,
        "nearAccountId": near_account_id,
        "rpcCall": {
            "contractId": contract_id,
            "nearRpcUrl": near_rpc_url,
            "nearAccountId": near_account_id,
        },
        "confirmationConfig": normalized_config,
        "registrationDetails": {
            "nearAccountId": near_account_id,
            "deviceNumber": device_number,
        },
    });

    // Build V2 secure confirm request (registration/link-device)
    let request_obj = serde_json::json!({
        "schemaVersion": 2,
        "requestId": request_id,
        "type": "linkDevice",
        "summary": summary,
        "payload": {
            "nearAccountId": near_account_id,
            "deviceNumber": device_number,
            // Include intentDigest in payload so main-thread code that only
            // echoes payload.intentDigest can return it for parsing on Rust side
            "intentDigest": intent_digest,
            "rpcCall": {
                "contractId": contract_id,
                "nearRpcUrl": near_rpc_url,
                "nearAccountId": near_account_id,
            }
        },
        "confirmationConfig": confirmation_data.get("confirmationConfig").cloned().unwrap_or(serde_json::json!({})),
        "intentDigest": intent_digest,
    });

    // Serialize to JSON string for robust cross-boundary cloning into TS
    let request_json_str = serde_json::to_string(&request_obj)
        .map_err(|e| format!("Failed to serialize V2 confirm request to string: {}", e))?;
    debug!("[Rust] V2 confirm registration request JSON length: {}", request_json_str.len());
    let request_js = JsValue::from_str(&request_json_str);

    let confirm_result = await_secure_confirmation_v2(request_js).await;

    parse_confirmation_result(confirm_result)
}

/// Creates a summary for registration confirmation
// legacy registration summary function removed with deprecated testnet flow

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
        let empty_requests: Vec<(String, Vec<ActionParams>)> = vec![];
        let result = compute_intent_digest_from_js_inputs(&empty_requests);
        assert!(result.is_ok());
        assert!(!result.unwrap().is_empty());
    }
}
