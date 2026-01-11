use crate::await_secure_confirmation::vrf_await_secure_confirmation;
use crate::manager::VRFKeyManager;
use crate::types::{VrfWorkerResponse, WorkerConfirmationResponse};
use js_sys::{Array, Date, Reflect};
use log::debug;
use serde::{Deserialize, Serialize};
use std::cell::RefCell;
use std::rc::Rc;
use wasm_bindgen::prelude::*;
use wasm_bindgen::JsValue;

/// Request payload: kick off confirmTxFlow from VRF WASM (via awaitSecureConfirmationV2).
///
/// `request` must be a SecureConfirmRequest object.
/// This handler will auto-set `payload.signingAuthMode` for signing requests when absent:
/// - `warmSession` if a valid VRF session exists for `requestId` with enough remaining uses
/// - otherwise `webauthn`
#[wasm_bindgen]
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ConfirmAndPrepareSigningSessionRequest {
    // Structured request object; preserve so nested objects survive round-tripping.
    #[wasm_bindgen(skip)]
    #[serde(
        rename = "request",
        default = "js_undefined",
        with = "serde_wasm_bindgen::preserve"
    )]
    pub request: JsValue,
}

fn js_undefined() -> JsValue {
    JsValue::UNDEFINED
}

pub async fn handle_confirm_and_prepare_signing_session(
    manager: Rc<RefCell<VRFKeyManager>>,
    message_id: Option<String>,
    request: ConfirmAndPrepareSigningSessionRequest,
) -> VrfWorkerResponse {
    debug!("[VRF] confirm_and_prepare_signing_session");

    let request_val = request.request;
    if request_val.is_undefined() || request_val.is_null() {
        return VrfWorkerResponse::fail(message_id, "Missing request".to_string());
    }

    if let Err(e) = inject_signing_auth_mode_if_missing(manager, &request_val) {
        return VrfWorkerResponse::fail(message_id, e);
    };

    let decision: WorkerConfirmationResponse =
        match vrf_await_secure_confirmation(request_val).await {
            Ok(v) => v,
            Err(e) => return VrfWorkerResponse::fail(message_id, e),
        };

    VrfWorkerResponse::success_from(message_id, Some(decision))
}

fn uses_needed_for_request(req_type: &str, payload: &JsValue) -> u32 {
    if req_type != "signTransaction" {
        return 1;
    }
    let txs = Reflect::get(payload, &JsValue::from_str("txSigningRequests")).ok();
    let Some(txs) = txs else { return 1 };
    if !Array::is_array(&txs) {
        return 1;
    }
    let len = Array::from(&txs).length() as u32;
    len.max(1)
}

fn warm_session_available(
    manager: &mut VRFKeyManager,
    session_id: &str,
    uses_needed: u32,
    now_ms: f64,
) -> bool {
    let Some(session) = manager.sessions.get(session_id) else {
        return false;
    };

    let expired = session.is_expired(now_ms);
    let can_consume = session.can_consume(uses_needed.max(1));
    if expired {
        manager.sessions.remove(session_id);
        return false;
    }
    can_consume
}

fn inject_signing_auth_mode_if_missing(
    manager: Rc<RefCell<VRFKeyManager>>,
    request: &JsValue,
) -> Result<(), String> {
    let req_type = get_string(request, "type")?;
    if req_type != "signTransaction" && req_type != "signNep413Message" {
        return Ok(());
    }

    let request_id = get_string(request, "requestId")?;
    let payload = get_object(request, "payload")?;

    // Respect caller-provided auth mode if already present.
    if has_signing_auth_mode(&payload) {
        return Ok(());
    }

    let uses_needed = uses_needed_for_request(&req_type, &payload);
    let now_ms = Date::now();
    let should_use_warm_session = {
        let mut mgr = manager.borrow_mut();
        warm_session_available(&mut mgr, &request_id, uses_needed, now_ms)
    };

    let mode = if should_use_warm_session {
        "warmSession"
    } else {
        "webauthn"
    };
    Reflect::set(
        &payload,
        &JsValue::from_str("signingAuthMode"),
        &JsValue::from_str(mode),
    )
    .map_err(|e| format!("Failed to set payload.signingAuthMode: {:?}", e))?;
    Ok(())
}

fn has_signing_auth_mode(payload: &JsValue) -> bool {
    Reflect::get(payload, &JsValue::from_str("signingAuthMode"))
        .ok()
        .and_then(|v| v.as_string())
        .is_some()
}

fn get_string(obj: &JsValue, key: &str) -> Result<String, String> {
    Reflect::get(obj, &JsValue::from_str(key))
        .map_err(|e| format!("Failed to read {}: {:?}", key, e))?
        .as_string()
        .ok_or_else(|| format!("{} must be a string", key))
}

fn get_object(obj: &JsValue, key: &str) -> Result<JsValue, String> {
    let v = Reflect::get(obj, &JsValue::from_str(key))
        .map_err(|e| format!("Failed to read {}: {:?}", key, e))?;
    if v.is_object() {
        Ok(v)
    } else {
        Err(format!("{} must be an object", key))
    }
}
