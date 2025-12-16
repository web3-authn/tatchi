use crate::manager::VRFKeyManager;
use crate::types::VrfWorkerResponse;
use log::debug;
use serde::{Deserialize, Serialize};
use std::cell::RefCell;
use std::rc::Rc;
use wasm_bindgen::prelude::*;

/// Request payload for querying the status of a VRF-owned signing session.
#[wasm_bindgen]
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CheckSessionStatusRequest {
    #[wasm_bindgen(getter_with_clone, js_name = "sessionId")]
    #[serde(rename = "sessionId")]
    pub session_id: String,
}

pub fn handle_check_session_status(
    manager: Rc<RefCell<VRFKeyManager>>,
    message_id: Option<String>,
    request: CheckSessionStatusRequest,
) -> VrfWorkerResponse {
    debug!(
        "[VRF] get_session_status for session {}",
        request.session_id
    );

    let now_ms = js_sys::Date::now();

    #[derive(Serialize)]
    struct Resp<'a> {
        #[serde(rename = "sessionId")]
        session_id: &'a str,
        /// `active | exhausted | expired | not_found`
        status: &'static str,
        #[serde(rename = "remainingUses")]
        remaining_uses: Option<u32>,
        #[serde(rename = "expiresAtMs")]
        expires_at_ms: Option<f64>,
        #[serde(rename = "createdAtMs")]
        created_at_ms: Option<f64>,
    }

    let (status, remaining_uses, expires_at_ms, created_at_ms) = {
        let mut mgr = manager.borrow_mut();
        match mgr.sessions.get(&request.session_id) {
            None => ("not_found", None, None, None),
            Some(session) => {
                let remaining_uses = session.remaining_uses;
                let expires_at_ms = session.expires_at_ms;
                let created_at_ms = Some(session.created_at_ms);

                if session.is_expired(now_ms) {
                    mgr.sessions.remove(&request.session_id);
                    ("expired", remaining_uses, expires_at_ms, created_at_ms)
                } else if remaining_uses == Some(0) {
                    ("exhausted", remaining_uses, expires_at_ms, created_at_ms)
                } else {
                    ("active", remaining_uses, expires_at_ms, created_at_ms)
                }
            }
        }
    };

    VrfWorkerResponse::success_from(
        message_id,
        Some(Resp {
            session_id: &request.session_id,
            status,
            remaining_uses,
            expires_at_ms,
            created_at_ms,
        }),
    )
}
