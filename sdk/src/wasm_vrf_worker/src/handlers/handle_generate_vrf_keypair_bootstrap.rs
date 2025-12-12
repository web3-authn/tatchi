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
    debug!("Generating bootstrap VRF keypair");

    match manager_mut.generate_vrf_keypair_bootstrap(payload.vrf_input_data) {
        Ok(bootstrap_data) => {
            debug!("VRF keypair bootstrap completed successfully");
            // Structure response to match expected format
            #[derive(Serialize)]
            struct BootstrapResponse<'a> {
                vrf_public_key: &'a str,
                #[serde(skip_serializing_if = "Option::is_none")]
                vrf_challenge_data: Option<&'a crate::types::VRFChallengeData>,
            }

            let response = BootstrapResponse {
                vrf_public_key: &bootstrap_data.vrf_public_key,
                vrf_challenge_data: bootstrap_data.vrf_challenge_data.as_ref(),
            };

            let response_js = serde_wasm_bindgen::to_value(&response)
                .unwrap_or(wasm_bindgen::JsValue::UNDEFINED);

            VrfWorkerResponse::success(message_id, Some(response_js))
        }
        Err(e) => {
            error!("VRF keypair bootstrap failed: {}", e);
            VrfWorkerResponse::fail(message_id, e.to_string())
        }
    }
}
