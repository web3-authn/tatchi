use crate::manager::VRFKeyManager;
use crate::types::{VrfWorkerResponse, WorkerConfirmationResponse};
use crate::vrf_await_secure_confirmation;
use serde::{Deserialize, Serialize};
use serde_wasm_bindgen;
use std::cell::RefCell;
use std::rc::Rc;
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DecryptSessionRequest {
    #[wasm_bindgen(getter_with_clone, js_name = "sessionId")]
    #[serde(rename = "sessionId")]
    pub session_id: String,
    #[wasm_bindgen(getter_with_clone, js_name = "nearAccountId")]
    #[serde(rename = "nearAccountId")]
    pub near_account_id: String,
    #[wasm_bindgen(getter_with_clone, js_name = "wrapKeySalt")]
    #[serde(rename = "wrapKeySalt")]
    pub wrap_key_salt_b64u: String,
}

#[derive(Debug, Serialize)]
pub struct DecryptSessionResult {
    #[serde(rename = "sessionId")]
    pub session_id: String,
}

/// VRF-side entrypoint to kick off a LocalOnly decrypt flow:
///  - Calls awaitSecureConfirmationV2(decryptPrivateKeyWithPrf) via JS bridge
///  - Derives WrapKeySeed via existing MINT_SESSION_KEYS_AND_SEND_TO_SIGNER handler using PRF output + vault wrapKeySalt
pub async fn handle_decrypt_session(
    manager: Rc<RefCell<VRFKeyManager>>,
    message_id: Option<String>,
    request: DecryptSessionRequest,
) -> VrfWorkerResponse {
    let session_id = request.session_id.clone();
    let near_account_id = request.near_account_id.clone();
    let wrap_key_salt_b64u = request.wrap_key_salt_b64u.clone();

    // Build SecureConfirmRequest JSON payload in JS (main thread) rather than Rust.
    // Here we rely on a small JS shim attached to awaitSecureConfirmationV2 that
    // accepts a JSON string and builds the correct request shape.
    #[derive(Serialize)]
    #[allow(non_snake_case)]
    struct DecryptConfirmRequest<'a> {
        sessionId: &'a str,
        nearAccountId: &'a str,
        #[serde(rename = "type")]
        kind: &'static str,
    }

    let req = DecryptConfirmRequest {
        sessionId: &session_id,
        nearAccountId: &near_account_id,
        kind: "decryptPrivateKeyWithPrf",
    };

    let request_js = match serde_wasm_bindgen::to_value(&req) {
        Ok(v) => v,
        Err(e) => return VrfWorkerResponse::fail(message_id, e.to_string()),
    };

    let request_json = match js_sys::JSON::stringify(&request_js) {
        Ok(s) => match s.as_string() {
            Some(str) => str,
            None => {
                return VrfWorkerResponse::fail(
                    message_id,
                    "Failed to stringify decrypt request".to_string(),
                )
            }
        },
        Err(e) => {
            return VrfWorkerResponse::fail(
                message_id,
                format!("Failed to stringify decrypt request: {:?}", e),
            )
        }
    };

    let decision: WorkerConfirmationResponse =
        match vrf_await_secure_confirmation(request_json).await {
            Ok(res) => res,
            Err(e) => return VrfWorkerResponse::fail(message_id, e),
        };

    if !decision.confirmed {
        return VrfWorkerResponse::fail(
            message_id,
            decision
                .error
                .unwrap_or_else(|| "User cancelled export confirmation".to_string()),
        );
    }

    // WrapKeySeed derivation is delegated to the existing MINT_SESSION_KEYS_AND_SEND_TO_SIGNER handler.
    // We synthesize a request and re-use the internal handler directly (no contract gating).
    if decision.credential.is_null() || decision.credential.is_undefined() {
        return VrfWorkerResponse::fail(
            message_id,
            "Missing credential in confirmation response".to_string(),
        );
    }

    let response = crate::handlers::handle_mint_session_keys_and_send_to_signer(
        manager,
        message_id.clone(),
        crate::handlers::handle_mint_session_keys_and_send_to_signer::MintSessionKeysAndSendToSignerRequest {
            session_id: session_id.clone(),
            // For decrypt flows we must reuse the vault's wrapKeySalt.
            wrap_key_salt_b64u,
            contract_id: None,
            near_rpc_url: None,
            ttl_ms: None,
            remaining_uses: None,
            credential: decision.credential,
        },
    )
    .await;

    if !response.success {
        return response;
    }

    VrfWorkerResponse::success(
        message_id,
        Some(
            serde_wasm_bindgen::to_value(&DecryptSessionResult { session_id })
                .unwrap_or(wasm_bindgen::JsValue::UNDEFINED),
        ),
    )
}
