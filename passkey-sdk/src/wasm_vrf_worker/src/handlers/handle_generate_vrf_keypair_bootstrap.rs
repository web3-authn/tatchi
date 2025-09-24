use crate::manager::VRFKeyManager;
use crate::types::VRFInputData;
use crate::types::VrfWorkerResponse;
use log::{error, info};
use serde::{Deserialize, Serialize};
use std::cell::RefCell;
use std::rc::Rc;
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
#[derive(Serialize, Deserialize, Clone)]
pub struct GenerateVrfKeypairBootstrapRequest {
    #[wasm_bindgen(getter_with_clone, js_name = "vrfInputData")]
    #[serde(rename = "vrfInputData")]
    pub vrf_input_data: Option<VRFInputData>,
}

/// Handle GENERATE_VRF_KEYPAIR_BOOTSTRAP message
pub fn handle_generate_vrf_keypair_bootstrap(
    manager: Rc<RefCell<VRFKeyManager>>,
    message_id: Option<String>,
    payload: GenerateVrfKeypairBootstrapRequest,
) -> VrfWorkerResponse {
    let mut manager_mut = manager.borrow_mut();
    info!("Generating bootstrap VRF keypair");

    match manager_mut.generate_vrf_keypair_bootstrap(payload.vrf_input_data) {
        Ok(bootstrap_data) => {
            info!("VRF keypair bootstrap completed successfully");
            // Structure response to match expected format
            let response_data = serde_json::json!({
                "vrf_public_key": bootstrap_data.vrf_public_key,
                "vrf_challenge_data": bootstrap_data.vrf_challenge_data
            });
            VrfWorkerResponse::success(message_id, Some(response_data))
        }
        Err(e) => {
            error!("VRF keypair bootstrap failed: {}", e);
            VrfWorkerResponse::fail(message_id, e.to_string())
        }
    }
}
