use crate::manager::VRFKeyManager;
use crate::types::{VrfWorkerResponse, WorkerConfirmationResponse};
use crate::vrf_await_secure_confirmation;
use serde::{Deserialize, Serialize};
use std::cell::RefCell;
use std::rc::Rc;

/// Request payload for VRF-driven registration credential confirmation.
/// Mirrors the parameters used by the TypeScript helper while remaining
/// generic so it can be called from any host that speaks the VRF worker protocol.
#[derive(Debug, Deserialize)]
pub struct RegistrationCredentialConfirmationRequest {
    #[serde(rename = "nearAccountId")]
    pub near_account_id: String,
    #[serde(rename = "deviceNumber")]
    pub device_number: u32,
    #[serde(rename = "contractId")]
    pub contract_id: String,
    #[serde(rename = "nearRpcUrl")]
    pub near_rpc_url: String,
    /// Optional confirmation configuration passed through to confirmTxFlow.
    #[serde(rename = "confirmationConfig")]
    pub confirmation_config: Option<serde_json::Value>,
}

/// Result surface for registration confirmation.
/// This intentionally mirrors the TS-side `RegistrationCredentialConfirmationPayload`
/// shape closely but uses loose typing for credential/contexts to keep Rust generic.
#[derive(Debug, Serialize)]
pub struct RegistrationCredentialConfirmationResult {
    #[serde(rename = "confirmed")]
    pub confirmed: bool,
    #[serde(rename = "requestId")]
    pub request_id: String,
    #[serde(rename = "intentDigest")]
    pub intent_digest: String,
    #[serde(rename = "credential")]
    pub credential: Option<serde_json::Value>,
    #[serde(rename = "vrfChallenge")]
    pub vrf_challenge: Option<serde_json::Value>,
    #[serde(rename = "transactionContext")]
    pub transaction_context: Option<serde_json::Value>,
    #[serde(rename = "error")]
    pub error: Option<String>,
}

/// VRF-side entrypoint to drive registration confirmation via confirmTxFlow.
/// Builds a V2 `SecureConfirmRequest` JSON and calls `awaitSecureConfirmationV2`
/// through the JS bridge. The main thread owns UI, NEAR context, and VRF bootstrap.
pub async fn handle_registration_credential_confirmation(
    _manager: Rc<RefCell<VRFKeyManager>>,
    message_id: Option<String>,
    request: RegistrationCredentialConfirmationRequest,
) -> VrfWorkerResponse {
    let near_account_id = request.near_account_id.clone();
    let device_number = request.device_number;

    // Reuse the worker message id as requestId when available for easier tracing.
    let request_id = message_id
        .clone()
        .unwrap_or_else(|| format!("register-{}-{}", near_account_id, device_number));

    // Align intentDigest with the JS helper for consistency.
    let intent_digest = format!("register:{}:{}", near_account_id, device_number);

    // Build the SecureConfirmRequest JSON envelope expected by awaitSecureConfirmationV2.
    let mut root = serde_json::Map::new();
    root.insert(
        "schemaVersion".to_string(),
        serde_json::Value::Number(2.into()),
    );
    root.insert(
        "requestId".to_string(),
        serde_json::Value::String(request_id.clone()),
    );
    // Use the REGISTER_ACCOUNT variant; link-device flows can layer on top later if needed.
    root.insert(
        "type".to_string(),
        serde_json::Value::String("registerAccount".to_string()),
    );

    // Summary shown in UI.
    let mut summary = serde_json::Map::new();
    summary.insert(
        "nearAccountId".to_string(),
        serde_json::Value::String(near_account_id.clone()),
    );
    summary.insert(
        "deviceNumber".to_string(),
        serde_json::Value::Number(device_number.into()),
    );
    if !request.contract_id.is_empty() {
        summary.insert(
            "contractId".to_string(),
            serde_json::Value::String(request.contract_id.clone()),
        );
    }
    root.insert("summary".to_string(), serde_json::Value::Object(summary));

    // Payload consumed by confirmTxFlow / registration handler.
    let rpc_call = serde_json::json!({
        "contractId": request.contract_id,
        "nearRpcUrl": request.near_rpc_url,
        "nearAccountId": near_account_id,
    });
    let mut payload = serde_json::Map::new();
    payload.insert(
        "nearAccountId".to_string(),
        serde_json::Value::String(near_account_id),
    );
    payload.insert(
        "deviceNumber".to_string(),
        serde_json::Value::Number(device_number.into()),
    );
    payload.insert("rpcCall".to_string(), rpc_call);
    root.insert("payload".to_string(), serde_json::Value::Object(payload));

    // Optional per-call confirmation config passthrough.
    if let Some(cfg) = request.confirmation_config {
        root.insert("confirmationConfig".to_string(), cfg);
    }
    root.insert(
        "intentDigest".to_string(),
        serde_json::Value::String(intent_digest.clone()),
    );

    let request_json = match serde_json::to_string(&serde_json::Value::Object(root)) {
        Ok(s) => s,
        Err(e) => return VrfWorkerResponse::fail(message_id, e.to_string()),
    };

    let decision: WorkerConfirmationResponse =
        match vrf_await_secure_confirmation(request_json).await {
            Ok(res) => res,
            Err(e) => return VrfWorkerResponse::fail(message_id, e),
        };

    let result = RegistrationCredentialConfirmationResult {
        confirmed: decision.confirmed,
        request_id: decision.request_id.clone(),
        intent_digest: decision.intent_digest.unwrap_or(intent_digest),
        credential: decision.credential.clone(),
        vrf_challenge: decision.vrf_challenge.clone(),
        transaction_context: decision.transaction_context.clone(),
        error: decision.error.clone(),
    };

    VrfWorkerResponse::success(
        message_id,
        Some(serde_json::to_value(result).unwrap()),
    )
}

