use crate::manager::VRFKeyManager;
use crate::types::EncryptedVRFKeypair;
use crate::types::VrfWorkerResponse;
use log::error;
use serde::{Deserialize, Serialize};
use std::cell::RefCell;
use std::rc::Rc;
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
#[derive(Serialize, Deserialize, Clone)]
pub struct UnlockVrfKeypairRequest {
    #[wasm_bindgen(getter_with_clone, js_name = "nearAccountId")]
    #[serde(rename = "nearAccountId")]
    pub near_account_id: String,
    #[wasm_bindgen(getter_with_clone, js_name = "encryptedVrfKeypair")]
    #[serde(rename = "encryptedVrfKeypair")]
    pub encrypted_vrf_keypair: EncryptedVRFKeypair,
    #[wasm_bindgen(getter_with_clone, js_name = "prfKey")]
    #[serde(rename = "prfKey")]
    pub prf_key: String, // base64url
}

// === Shamir 3-pass unlock handlers ===

/// Handle UNLOCK_VRF_KEYPAIR message
pub fn handle_unlock_vrf_keypair(
    manager: Rc<RefCell<VRFKeyManager>>,
    message_id: Option<String>,
    payload: UnlockVrfKeypairRequest,
) -> VrfWorkerResponse {
    let prf_key = match crate::utils::base64_url_decode(&payload.prf_key) {
        Ok(bytes) if !bytes.is_empty() => bytes,
        Ok(_) => return VrfWorkerResponse::fail(message_id, "Missing PRF key"),
        Err(_) => return VrfWorkerResponse::fail(message_id, "Missing or invalid PRF key"),
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
        Ok(_) => {
            VrfWorkerResponse::success(message_id, None)
        }
        Err(e) => {
            error!("VRF keypair unlock failed: {}", e);
            VrfWorkerResponse::fail(message_id, e.to_string())
        }
    }
}
