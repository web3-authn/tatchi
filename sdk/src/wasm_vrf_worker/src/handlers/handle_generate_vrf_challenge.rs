use crate::manager::VRFKeyManager;
use crate::types::VRFInputData;
use crate::types::VrfWorkerResponse;
use log::{error, debug};
use serde::{Deserialize, Serialize};
use std::cell::RefCell;
use std::rc::Rc;
use wasm_bindgen::prelude::*;
use serde_wasm_bindgen;

#[wasm_bindgen]
#[derive(Serialize, Deserialize, Clone)]
pub struct GenerateVrfChallengeRequest {
    #[wasm_bindgen(getter_with_clone, js_name = "vrfInputData")]
    #[serde(rename = "vrfInputData")]
    pub vrf_input_data: VRFInputData,
}

/// Handle GENERATE_VRF_CHALLENGE message
pub fn handle_generate_vrf_challenge(
    manager: Rc<RefCell<VRFKeyManager>>,
    message_id: Option<String>,
    payload: GenerateVrfChallengeRequest,
) -> VrfWorkerResponse {
    let manager_ref = manager.borrow();

    match manager_ref.generate_vrf_challenge(payload.vrf_input_data) {
        Ok(challenge_data) => {
            debug!("VRF challenge generated successfully");
            let challenge_js = serde_wasm_bindgen::to_value(&challenge_data)
                .unwrap_or(wasm_bindgen::JsValue::UNDEFINED);
            VrfWorkerResponse::success(message_id, Some(challenge_js))
        }
        Err(e) => {
            error!("VRF challenge generation failed: {}", e);
            VrfWorkerResponse::fail(message_id, e.to_string())
        }
    }
}
