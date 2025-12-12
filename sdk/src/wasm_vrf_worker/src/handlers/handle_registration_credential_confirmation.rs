use crate::manager::VRFKeyManager;
use crate::types::{VrfWorkerResponse, WorkerConfirmationResponse};
use crate::vrf_await_secure_confirmation;
use serde::{Deserialize, Serialize};
use std::cell::RefCell;
use std::rc::Rc;
use wasm_bindgen::prelude::*;
use wasm_bindgen::JsValue;
use serde_wasm_bindgen;

/// Request payload for VRF-driven registration credential confirmation.
/// Mirrors the parameters used by the TypeScript helper while remaining
/// generic so it can be called from any host that speaks the VRF worker protocol.
#[wasm_bindgen]
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RegistrationCredentialConfirmationRequest {
    #[wasm_bindgen(getter_with_clone, js_name = "nearAccountId")]
    #[serde(rename = "nearAccountId")]
    pub near_account_id: String,
    #[wasm_bindgen(js_name = "deviceNumber")]
    #[serde(rename = "deviceNumber")]
    pub device_number: u32,
    #[wasm_bindgen(getter_with_clone, js_name = "contractId")]
    #[serde(rename = "contractId")]
    pub contract_id: String,
    #[wasm_bindgen(getter_with_clone, js_name = "nearRpcUrl")]
    #[serde(rename = "nearRpcUrl")]
    pub near_rpc_url: String,
    /// Optional confirmation configuration passed through to confirmTxFlow.
    #[wasm_bindgen(skip)]
    #[serde(
        rename = "confirmationConfig",
        default = "js_undefined",
        with = "serde_wasm_bindgen::preserve"
    )]
    pub confirmation_config: JsValue,
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
    #[serde(rename = "credential", with = "serde_wasm_bindgen::preserve", default = "js_undefined")]
    pub credential: JsValue,
    #[serde(rename = "vrfChallenge", with = "serde_wasm_bindgen::preserve", default = "js_undefined")]
    pub vrf_challenge: JsValue,
    #[serde(rename = "transactionContext", with = "serde_wasm_bindgen::preserve", default = "js_undefined")]
    pub transaction_context: JsValue,
    #[serde(rename = "error")]
    pub error: Option<String>,
}

fn js_undefined() -> JsValue {
    JsValue::UNDEFINED
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
    #[derive(Serialize)]
    #[allow(non_snake_case)]
    struct Summary<'a> {
        nearAccountId: &'a str,
        deviceNumber: u32,
        #[serde(skip_serializing_if = "Option::is_none")]
        contractId: Option<&'a str>,
    }

    #[derive(Serialize)]
    #[allow(non_snake_case)]
    struct RpcCall<'a> {
        contractId: &'a str,
        nearRpcUrl: &'a str,
        nearAccountId: &'a str,
    }

    #[derive(Serialize)]
    #[allow(non_snake_case)]
    struct Payload<'a> {
        nearAccountId: &'a str,
        deviceNumber: u32,
        rpcCall: RpcCall<'a>,
    }

    #[derive(Serialize)]
    #[allow(non_snake_case)]
    struct SecureConfirmRequest<'a> {
        schemaVersion: u32,
        requestId: &'a str,
        #[serde(rename = "type")]
        request_type: &'static str,
        summary: Summary<'a>,
        payload: Payload<'a>,
        intentDigest: &'a str,
        #[serde(skip_serializing_if = "is_undefined", with = "serde_wasm_bindgen::preserve")]
        confirmationConfig: JsValue,
    }

    fn is_undefined(v: &JsValue) -> bool {
        v.is_undefined() || v.is_null()
    }

    let summary = Summary {
        nearAccountId: &near_account_id,
        deviceNumber: device_number,
        contractId: if request.contract_id.is_empty() {
            None
        } else {
            Some(request.contract_id.as_str())
        },
    };
    let payload = Payload {
        nearAccountId: &near_account_id,
        deviceNumber: device_number,
        rpcCall: RpcCall {
            contractId: &request.contract_id,
            nearRpcUrl: &request.near_rpc_url,
            nearAccountId: &near_account_id,
        },
    };

    let confirm_request = SecureConfirmRequest {
        schemaVersion: 2,
        requestId: &request_id,
        request_type: "registerAccount",
        summary,
        payload,
        intentDigest: &intent_digest,
        confirmationConfig: request.confirmation_config.clone(),
    };

    let request_js = match serde_wasm_bindgen::to_value(&confirm_request) {
        Ok(v) => v,
        Err(e) => return VrfWorkerResponse::fail(message_id, format!("Failed to serialize request: {}", e)),
    };

    let request_json = match js_sys::JSON::stringify(&request_js) {
        Ok(s) => match s.as_string() {
            Some(str) => str,
            None => return VrfWorkerResponse::fail(message_id, "Failed to stringify request".to_string()),
        },
        Err(e) => {
            return VrfWorkerResponse::fail(
                message_id,
                format!("Failed to stringify request: {:?}", e),
            )
        }
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

    VrfWorkerResponse::success_from(
        message_id,
        Some(result),
    )
}
