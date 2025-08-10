use wasm_bindgen::prelude::*;
use serde::{Deserialize, Serialize};
use std::rc::Rc;
use std::cell::RefCell;
use log::info;
use crate::types::VrfWorkerResponse;
use crate::manager::VRFKeyManager;

#[wasm_bindgen]
#[derive(Serialize, Deserialize, Clone)]
pub struct Shamir3PassConfigPRequest {
    #[wasm_bindgen(getter_with_clone, js_name = "p_b64u")]
    pub p_b64u: String,
}

#[wasm_bindgen]
#[derive(Serialize, Deserialize, Clone)]
pub struct Shamir3PassConfigServerUrlsRequest {
    #[wasm_bindgen(getter_with_clone, js_name = "relayServerUrl")]
    #[serde(rename = "relayServerUrl")]
    pub relay_server_url: String,
    #[wasm_bindgen(getter_with_clone, js_name = "applyLockRoute")]
    #[serde(rename = "applyLockRoute")]
    pub apply_lock_route: String,
    #[wasm_bindgen(getter_with_clone, js_name = "removeLockRoute")]
    #[serde(rename = "removeLockRoute")]
    pub remove_lock_route: String,
}

// === Shamir 3-pass configuration handlers ===

pub fn handle_shamir3pass_config_p(
    manager: Rc<RefCell<VRFKeyManager>>,
    message_id: Option<String>,
    payload: Shamir3PassConfigPRequest,
) -> VrfWorkerResponse {
    info!("Configuring Shamir P: {:?}", payload.p_b64u);

    if payload.p_b64u.is_empty() {
        return VrfWorkerResponse::fail(message_id, "Missing p_b64u");
    }

    let mut mgr = manager.borrow_mut();
    match crate::shamir3pass::Shamir3Pass::new(&payload.p_b64u) {
        Ok(sp) => {
            mgr.shamir3pass = sp;
            VrfWorkerResponse::success(message_id, Some(serde_json::json!({ "status": "ok", "p_b64u": payload.p_b64u })))
        },
        Err(e) => VrfWorkerResponse::fail(message_id, format!("invalid p_b64u: {:?}", e)),
    }
}

pub fn handle_shamir3pass_config_server_urls(
    manager: Rc<RefCell<VRFKeyManager>>,
    message_id: Option<String>,
    payload: Shamir3PassConfigServerUrlsRequest,
) -> VrfWorkerResponse {
    info!("Configuring Shamir server URLs: relay_url={}, apply_route={}, remove_route={}",
          payload.relay_server_url, payload.apply_lock_route, payload.remove_lock_route);

    if payload.relay_server_url.is_empty() {
        return VrfWorkerResponse::fail(message_id, "Missing relay_server_url");
    }
    if payload.apply_lock_route.is_empty() {
        return VrfWorkerResponse::fail(message_id, "Missing apply_lock_route");
    }
    if payload.remove_lock_route.is_empty() {
        return VrfWorkerResponse::fail(message_id, "Missing remove_lock_route");
    }

    let mut mgr = manager.borrow_mut();
    mgr.relay_server_url = Some(payload.relay_server_url);
    mgr.apply_lock_route = Some(payload.apply_lock_route);
    mgr.remove_lock_route = Some(payload.remove_lock_route);

    VrfWorkerResponse::success(
        message_id,
        Some(serde_json::json!({ "status": "ok" }))
    )
}
