use crate::manager::VRFKeyManager;
use crate::types::VrfWorkerResponse;
use log::debug;
use serde::{Deserialize, Serialize};
use std::cell::RefCell;
use std::rc::Rc;
use wasm_bindgen::prelude::*;

#[cfg(target_arch = "wasm32")]
use crate::errors::VrfWorkerError;

/// Request payload for dispensing an existing VRF-owned session key to the signer worker.
///
/// The caller must have already attached a MessagePort for `sessionId` via the
/// JS-only `ATTACH_WRAP_KEY_SEED_PORT` control message.
#[wasm_bindgen]
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DispenseSessionKeyRequest {
    #[wasm_bindgen(getter_with_clone, js_name = "sessionId")]
    #[serde(rename = "sessionId")]
    pub session_id: String,
    /// Optional number of "uses" to consume from the session budget (defaults to 1).
    #[wasm_bindgen(getter_with_clone, js_name = "uses")]
    #[serde(rename = "uses")]
    pub uses: Option<u32>,
}

pub async fn handle_dispense_session_key(
    manager: Rc<RefCell<VRFKeyManager>>,
    message_id: Option<String>,
    request: DispenseSessionKeyRequest,
) -> VrfWorkerResponse {
    debug!(
        "[VRF] dispense_session_key for session {}",
        request.session_id
    );

    // Take the currently attached MessagePort for this session id so we can guarantee
    // one-shot delivery (1 VRF worker → N signer workers over time).
    #[cfg(target_arch = "wasm32")]
    let port = match crate::wrap_key_seed_port::take_port(&request.session_id) {
        Some(p) => p,
        None => {
            return VrfWorkerResponse::fail(
                message_id,
                VrfWorkerError::SessionPortNotAttached(request.session_id).to_string(),
            )
        }
    };

    let now_ms = js_sys::Date::now();
    let uses = request.uses.unwrap_or(1);

    let (_wrap_key_seed_b64u, _wrap_key_salt_b64u, remaining_uses, expires_at_ms) = {
        let mut mgr = manager.borrow_mut();
        let (seed_b64u, salt_b64u) =
            match mgr.dispense_session_key(&request.session_id, uses, now_ms) {
                Ok(v) => v,
                Err(e) => {
                    #[cfg(target_arch = "wasm32")]
                    {
                        // Put the port back so callers can fall back to a full confirmation flow
                        // within the same signing session.
                        crate::wrap_key_seed_port::put_port(&request.session_id, port);
                    }
                    return VrfWorkerResponse::fail(message_id, e.to_string());
                }
            };
        let (remaining_uses, expires_at_ms) = mgr
            .sessions
            .get(&request.session_id)
            .map(|s| (s.remaining_uses, s.expires_at_ms))
            .unwrap_or((None, None));
        (seed_b64u, salt_b64u, remaining_uses, expires_at_ms)
    };

    // Deliver WrapKeySeed + wrapKeySalt to the signer worker via the attached MessagePort.
    #[cfg(target_arch = "wasm32")]
    {
        crate::wrap_key_seed_port::send_wrap_key_seed_on_port(
            &port,
            &_wrap_key_seed_b64u,
            &_wrap_key_salt_b64u,
            None,
        );
        port.close();
    }

    #[derive(Serialize)]
    struct Resp<'a> {
        #[serde(rename = "sessionId")]
        session_id: &'a str,
        #[serde(rename = "remainingUses")]
        remaining_uses: Option<u32>,
        #[serde(rename = "expiresAtMs")]
        expires_at_ms: Option<f64>,
    }

    VrfWorkerResponse::success_from(
        message_id,
        Some(Resp {
            session_id: &request.session_id,
            remaining_uses,
            expires_at_ms,
        }),
    )
}
