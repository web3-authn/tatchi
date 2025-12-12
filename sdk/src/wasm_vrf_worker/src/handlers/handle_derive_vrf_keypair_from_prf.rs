use wasm_bindgen::prelude::*;
use log::{debug, error, warn};
use serde::{Deserialize, Serialize};
use std::cell::RefCell;
use std::rc::Rc;

use crate::config::CHACHA20_KEY_SIZE;
use crate::handlers::handle_shamir3pass_client::{
    perform_shamir3pass_client_encrypt_current_vrf_keypair,
    Shamir3PassEncryptVrfKeypairResult,
};
use crate::manager::VRFKeyManager;
use crate::types::{
    EncryptedVRFKeypair,
    VRFChallengeData,
    VRFInputData,
    VrfWorkerResponse,
};
use crate::utils::base64_url_decode;

#[wasm_bindgen]
#[derive(Serialize, Deserialize, Clone)]
pub struct DeriveVrfKeypairFromPrfRequest {
    #[wasm_bindgen(getter_with_clone, js_name = "prfOutput")]
    #[serde(rename = "prfOutput")]
    pub prf_output: String,
    #[wasm_bindgen(getter_with_clone, js_name = "nearAccountId")]
    #[serde(rename = "nearAccountId")]
    pub near_account_id: String,
    #[wasm_bindgen(getter_with_clone, js_name = "saveInMemory")]
    #[serde(default = "default_true", rename = "saveInMemory")]
    pub save_in_memory: bool,
    #[wasm_bindgen(getter_with_clone, js_name = "vrfInputData")]
    #[serde(default, rename = "vrfInputData")]
    pub vrf_input_data: Option<VRFInputData>,
}

fn default_true() -> bool {
    true
}

#[wasm_bindgen]
#[derive(Serialize, Deserialize, Clone)]
pub struct DeterministicVrfKeypairResponse {
    #[wasm_bindgen(getter_with_clone, js_name = "vrfPublicKey")]
    #[serde(rename = "vrfPublicKey")]
    pub vrf_public_key: String,
    #[wasm_bindgen(getter_with_clone, js_name = "vrfChallengeData")]
    #[serde(rename = "vrfChallengeData")]
    pub vrf_challenge_data: Option<VRFChallengeData>,
    #[wasm_bindgen(getter_with_clone, js_name = "encryptedVrfKeypair")]
    #[serde(rename = "encryptedVrfKeypair")]
    pub encrypted_vrf_keypair: Option<EncryptedVRFKeypair>,
    #[wasm_bindgen(getter_with_clone, js_name = "serverEncryptedVrfKeypair")]
    #[serde(rename = "serverEncryptedVrfKeypair")]
    pub server_encrypted_vrf_keypair: Option<Shamir3PassEncryptVrfKeypairResult>,
    pub success: bool,
}

/// Handle DERIVE_VRF_KEYPAIR_FROM_PRF message
///
/// Derives a VRF keypair deterministically from PRF output, optionally storing it in memory
/// and performing Shamir 3-pass encryption for server storage.
pub async fn handle_derive_vrf_keypair_from_prf(
    manager: Rc<RefCell<VRFKeyManager>>,
    message_id: Option<String>,
    payload: DeriveVrfKeypairFromPrfRequest,
) -> VrfWorkerResponse {
    let prf_output = match base64_url_decode(&payload.prf_output) {
        Ok(bytes) if !bytes.is_empty() => bytes,
        _ => return VrfWorkerResponse::fail(message_id, "Missing or invalid PRF output"),
    };
    if prf_output.len() != CHACHA20_KEY_SIZE {
        return VrfWorkerResponse::fail(message_id, "Invalid PRF output length: expected 32 bytes");
    }
    if payload.near_account_id.is_empty() {
        return VrfWorkerResponse::fail(message_id, "Missing NEAR account ID");
    }

    let (mut derivation_result, vrf_keypair) = {
        let manager_ref = manager.borrow();
        match manager_ref.derive_vrf_keypair_from_prf(
            prf_output,
            payload.near_account_id.clone(),
            payload.vrf_input_data.clone(),
        ) {
            Ok((result, keypair)) => (result, keypair),
            Err(e) => {
                error!("VRF keypair derivation failed: {}", e);
                return VrfWorkerResponse::fail(message_id, e.to_string());
            }
        }
    };

    // If saveInMemory was requested, store the derived keypair in memory
    if payload.save_in_memory {
        let mut manager_mut = manager.borrow_mut();
        manager_mut.store_vrf_keypair_in_memory(vrf_keypair, payload.near_account_id.clone());
    }
    let relay_url = manager.borrow().relay_server_url.clone();
    let apply_server_lock_route = manager.borrow().apply_lock_route.clone();

    match (relay_url, apply_server_lock_route) {
        (Some(relay_url), Some(apply_server_lock_route)) => {
            match perform_shamir3pass_client_encrypt_current_vrf_keypair(
                manager.clone(),
                relay_url,
                apply_server_lock_route,
            )
            .await
            {
                Ok(server_blob) => {
                    derivation_result.server_encrypted_vrf_keypair = Some(server_blob);
                }
                Err(e) => {
                    warn!("VRF keypair server encryption failed: {} (proceeding)", e);
                }
            }
        }
        _ => {
            // Optional feature; do not fail core derivation
            debug!("Shamir server config not present; skipping server_encrypted_vrf_keypair");
        }
    };

    let response_data = DeterministicVrfKeypairResponse {
        vrf_public_key: derivation_result.vrf_public_key,
        vrf_challenge_data: derivation_result.vrf_challenge_data,
        encrypted_vrf_keypair: derivation_result.encrypted_vrf_keypair,
        server_encrypted_vrf_keypair: derivation_result.server_encrypted_vrf_keypair,
        success: derivation_result.success,
    };

    VrfWorkerResponse::success_from(message_id, Some(response_data))
}
