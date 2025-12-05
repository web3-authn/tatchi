use crate::manager::VRFKeyManager;
use crate::types::{VrfWorkerResponse, WorkerConfirmationResponse};
use crate::vrf_await_secure_confirmation;
use serde::{Deserialize, Serialize};
use std::cell::RefCell;
use std::rc::Rc;
#[derive(Debug, Deserialize)]
pub struct DecryptSessionRequest {
    #[serde(rename = "sessionId")]
    pub session_id: String,
    #[serde(rename = "nearAccountId")]
    pub near_account_id: String,
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
///  - Derives WrapKeySeed via existing DERIVE_WRAP_KEY_SEED_AND_SESSION handler using PRF output + vault wrapKeySalt
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
    let request_json = match serde_json::to_string(&serde_json::json!({
        "sessionId": session_id,
        "nearAccountId": near_account_id,
        "type": "decryptPrivateKeyWithPrf"
    })) {
        Ok(s) => s,
        Err(e) => return VrfWorkerResponse::fail(message_id, e.to_string()),
    };

    let decision: WorkerConfirmationResponse = match vrf_await_secure_confirmation(request_json).await
    {
        Ok(res) => res,
        Err(e) => return VrfWorkerResponse::fail(message_id, e),
    };

    if !decision.confirmed {
        return VrfWorkerResponse::fail(
            message_id,
            decision.error
                .unwrap_or_else(|| "User cancelled export confirmation".to_string()),
        );
    }

    if decision.prf_output.is_none() {
        return VrfWorkerResponse::fail(
            message_id,
            "Missing prfOutput in confirmation response".to_string(),
        );
    }

    // WrapKeySeed derivation is delegated to the existing DERIVE_WRAP_KEY_SEED_AND_SESSION handler.
    // We synthesize a request and re-use the internal handler directly (no contract gating).
    let prf_first_auth_b64u = decision.prf_output.clone().unwrap();

    let response = crate::handlers::handle_derive_wrap_key_seed_and_session(
        manager,
        message_id.clone(),
        crate::handlers::handle_derive_wrap_key_seed_and_session::DeriveWrapKeySeedAndSessionRequest {
            session_id: session_id.clone(),
            prf_first_auth_b64u,
            // For decrypt flows we must reuse the vault's wrapKeySalt.
            wrap_key_salt_b64u,
            contract_id: None,
            near_rpc_url: None,
            vrf_challenge: None,
            credential: None,
        },
    )
    .await;

    if !response.success {
        return response;
    }

    VrfWorkerResponse::success(
        message_id,
        Some(serde_json::to_value(DecryptSessionResult { session_id }).unwrap()),
    )
}
