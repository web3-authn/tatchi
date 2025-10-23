use crate::manager::VRFKeyManager;
use crate::types::VRFInputData;
use crate::types::VrfWorkerResponse;
use log::{error, debug};
use serde::{Deserialize, Serialize};
use std::cell::RefCell;
use std::rc::Rc;
use wasm_bindgen::prelude::*;

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

    return match manager_ref.generate_vrf_challenge(payload.vrf_input_data) {
        Ok(challenge_data) => {
            debug!("VRF challenge generated successfully");
            VrfWorkerResponse::success(
                message_id,
                Some(serde_json::to_value(&challenge_data).unwrap()),
            )
        }
        Err(e) => {
            error!("VRF challenge generation failed: {}", e);
            VrfWorkerResponse::fail(message_id, e.to_string())
        }
    };
}
