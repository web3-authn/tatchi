use crate::manager::VRFKeyManager;
use crate::types::EncryptedVRFKeypair;
use crate::types::VrfWorkerResponse;
use log::error;
use serde::{Deserialize, Serialize};
use std::cell::RefCell;
use std::rc::Rc;
use wasm_bindgen::prelude::*;
use wasm_bindgen::JsValue;

#[wasm_bindgen]
#[derive(Serialize, Deserialize, Clone)]
pub struct UnlockVrfKeypairRequest {
    #[wasm_bindgen(getter_with_clone, js_name = "nearAccountId")]
    #[serde(rename = "nearAccountId")]
    pub near_account_id: String,
    #[wasm_bindgen(getter_with_clone, js_name = "encryptedVrfKeypair")]
    #[serde(rename = "encryptedVrfKeypair")]
    pub encrypted_vrf_keypair: EncryptedVRFKeypair,
    #[wasm_bindgen(skip)]
    #[serde(
        rename = "credential",
        default = "js_undefined",
        with = "serde_wasm_bindgen::preserve"
    )]
    pub credential: JsValue,
}

fn js_undefined() -> JsValue {
    JsValue::UNDEFINED
}

// === Shamir 3-pass unlock handlers ===

/// Handle UNLOCK_VRF_KEYPAIR message
pub fn handle_unlock_vrf_keypair(
    manager: Rc<RefCell<VRFKeyManager>>,
    message_id: Option<String>,
    payload: UnlockVrfKeypairRequest,
) -> VrfWorkerResponse {
    if payload.credential.is_null() || payload.credential.is_undefined() {
        return VrfWorkerResponse::fail(message_id, "Missing credential");
    }

    let prf_key_b64u: Option<String> = {
        #[cfg(target_arch = "wasm32")]
        {
            crate::webauthn::extract_prf_second_from_credential(&payload.credential)
        }
        #[cfg(not(target_arch = "wasm32"))]
        {
            None
        }
    };

    let prf_key = match prf_key_b64u.as_deref() {
        Some(b64u) => match crate::utils::base64_url_decode(b64u) {
            Ok(bytes) if !bytes.is_empty() => bytes,
            Ok(_) => {
                return VrfWorkerResponse::fail(message_id, "Missing PRF.second in credential")
            }
            Err(_) => {
                return VrfWorkerResponse::fail(
                    message_id,
                    "Missing or invalid PRF.second in credential",
                )
            }
        },
        None => return VrfWorkerResponse::fail(message_id, "Missing PRF.second in credential"),
    };

    if payload.near_account_id.is_empty() {
        return VrfWorkerResponse::fail(message_id, "Missing nearAccountId");
    }

    let mut manager_mut = manager.borrow_mut();
    match manager_mut.unlock_vrf_keypair(
        payload.near_account_id,
        payload.encrypted_vrf_keypair,
        prf_key,
    ) {
        Ok(_) => VrfWorkerResponse::success(message_id, None),
        Err(e) => {
            error!("VRF keypair unlock failed: {}", e);
            VrfWorkerResponse::fail(message_id, e.to_string())
        }
    }
}
