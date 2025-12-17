use crate::manager::VRFKeyManager;
use crate::types::VrfWorkerResponse;
use log::debug;
use serde::{Deserialize, Serialize};
use std::cell::RefCell;
use std::rc::Rc;
use wasm_bindgen::prelude::*;

/// Request payload for clearing a VRF-owned signing session (best-effort cleanup).
#[wasm_bindgen]
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ClearSessionRequest {
    #[wasm_bindgen(getter_with_clone, js_name = "sessionId")]
    #[serde(rename = "sessionId")]
    pub session_id: String,
}

pub fn handle_clear_session(
    manager: Rc<RefCell<VRFKeyManager>>,
    message_id: Option<String>,
    request: ClearSessionRequest,
) -> VrfWorkerResponse {
    debug!("[VRF] clear_session for session {}", request.session_id);

    let (cleared_session, cleared_challenge) = {
        let mut mgr = manager.borrow_mut();
        let cleared_session = mgr.sessions.remove(&request.session_id).is_some();
        let cleared_challenge = mgr.vrf_challenges.remove(&request.session_id).is_some();
        (cleared_session, cleared_challenge)
    };

    // Best-effort: close and drop any attached MessagePort for this session id.
    #[cfg(target_arch = "wasm32")]
    let cleared_port = {
        crate::wrap_key_seed_port::take_port(&request.session_id)
            .map(|p| {
                p.close();
            })
            .is_some()
    };
    #[cfg(not(target_arch = "wasm32"))]
    let cleared_port = false;

    #[derive(Serialize)]
    struct Resp<'a> {
        #[serde(rename = "sessionId")]
        session_id: &'a str,
        #[serde(rename = "clearedSession")]
        cleared_session: bool,
        #[serde(rename = "clearedChallenge")]
        cleared_challenge: bool,
        #[serde(rename = "clearedPort")]
        cleared_port: bool,
    }

    VrfWorkerResponse::success_from(
        message_id,
        Some(Resp {
            session_id: &request.session_id,
            cleared_session,
            cleared_challenge,
            cleared_port,
        }),
    )
}
