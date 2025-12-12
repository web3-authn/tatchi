use crate::manager::VRFKeyManager;
use crate::shamir3pass::{decode_biguint_b64u, encode_biguint_b64u};
use crate::types::VrfWorkerResponse;
use serde::{Deserialize, Serialize};
use std::cell::RefCell;
use std::rc::Rc;
use wasm_bindgen::prelude::*;
use serde_wasm_bindgen;

#[wasm_bindgen]
#[derive(Serialize, Deserialize, Clone)]
pub struct Shamir3PassGenerateServerKeypairRequest {
    // No specific fields needed for this request
}

#[wasm_bindgen]
#[derive(Serialize, Deserialize, Clone)]
pub struct Shamir3PassApplyServerLockRequest {
    #[wasm_bindgen(getter_with_clone, js_name = "e_s_b64u")]
    pub e_s_b64u: String,
    #[wasm_bindgen(getter_with_clone, js_name = "kek_c_b64u")]
    pub kek_c_b64u: String,
}

#[wasm_bindgen]
#[derive(Serialize, Deserialize, Clone)]
pub struct Shamir3PassRemoveServerLockRequest {
    #[wasm_bindgen(getter_with_clone, js_name = "d_s_b64u")]
    pub d_s_b64u: String,
    #[wasm_bindgen(getter_with_clone, js_name = "kek_cs_b64u")]
    pub kek_cs_b64u: String,
}

// === Shamir 3-pass server-side handlers ===

/// Generate a fresh server keypair (e_s, d_s) for Shamir 3-pass given public p from config
/// Returns base64url-encoded exponents. Server should persist these securely.
pub fn handle_shamir3pass_generate_server_keypair(
    manager: Rc<RefCell<VRFKeyManager>>,
    message_id: Option<String>,
    _payload: Shamir3PassGenerateServerKeypairRequest,
) -> VrfWorkerResponse {
    // Use manager-configured Shamir3Pass instance
    let shamir3pass = {
        let mgr = manager.borrow();
        mgr.shamir3pass().clone()
    };

    // Use high-level key generation
    let keys = match shamir3pass.generate_lock_keys() {
        Ok(v) => v,
        Err(e) => {
            return VrfWorkerResponse::fail(
                message_id,
                format!("generate_lock_keys failed: {:?}", e),
            );
        }
    };
    #[derive(Serialize)]
    struct Exponents<'a> {
        e_s_b64u: &'a str,
        d_s_b64u: &'a str,
    }
    let exponents = Exponents {
        e_s_b64u: &encode_biguint_b64u(&keys.e),
        d_s_b64u: &encode_biguint_b64u(&keys.d),
    };
    let payload = serde_wasm_bindgen::to_value(&exponents)
        .unwrap_or(wasm_bindgen::JsValue::UNDEFINED);
    VrfWorkerResponse::success(message_id, Some(payload))
}

pub fn handle_shamir3pass_apply_server_lock_kek(
    manager: Rc<RefCell<VRFKeyManager>>,
    message_id: Option<String>,
    payload: Shamir3PassApplyServerLockRequest,
) -> VrfWorkerResponse {
    // Use manager-configured Shamir3Pass instance
    let shamir3pass = {
        let mgr = manager.borrow();
        mgr.shamir3pass().clone()
    };

    let e_s = match decode_biguint_b64u(&payload.e_s_b64u) {
        Ok(v) => v,
        Err(_) => return VrfWorkerResponse::fail(message_id.clone(), "invalid e_s_b64u"),
    };
    let kek_c = match decode_biguint_b64u(&payload.kek_c_b64u) {
        Ok(v) => v,
        Err(_) => return VrfWorkerResponse::fail(message_id.clone(), "invalid kek_c_b64u"),
    };
    let kek_cs = shamir3pass.add_lock(&kek_c, &e_s);
    #[derive(Serialize)]
    struct Resp<'a> {
        kek_cs_b64u: &'a str,
    }
    let resp = Resp {
        kek_cs_b64u: &encode_biguint_b64u(&kek_cs),
    };
    let payload = serde_wasm_bindgen::to_value(&resp)
        .unwrap_or(wasm_bindgen::JsValue::UNDEFINED);
    VrfWorkerResponse::success(message_id, Some(payload))
}

pub fn handle_shamir3pass_remove_server_lock_kek(
    manager: Rc<RefCell<VRFKeyManager>>,
    message_id: Option<String>,
    payload: Shamir3PassRemoveServerLockRequest,
) -> VrfWorkerResponse {
    // Use manager-configured Shamir3Pass instance
    let shamir3pass = {
        let mgr = manager.borrow();
        mgr.shamir3pass().clone()
    };

    let d_s = match decode_biguint_b64u(&payload.d_s_b64u) {
        Ok(v) => v,
        Err(_) => return VrfWorkerResponse::fail(message_id.clone(), "invalid d_s_b64u"),
    };
    let kek_cs = match decode_biguint_b64u(&payload.kek_cs_b64u) {
        Ok(v) => v,
        Err(_) => return VrfWorkerResponse::fail(message_id.clone(), "invalid kek_cs_b64u"),
    };
    let kek_c = shamir3pass.remove_lock(&kek_cs, &d_s);
    #[derive(Serialize)]
    struct Resp<'a> {
        kek_c_b64u: &'a str,
    }
    let resp = Resp {
        kek_c_b64u: &encode_biguint_b64u(&kek_c),
    };
    let payload = serde_wasm_bindgen::to_value(&resp)
        .unwrap_or(wasm_bindgen::JsValue::UNDEFINED);
    VrfWorkerResponse::success(message_id, Some(payload))
}
