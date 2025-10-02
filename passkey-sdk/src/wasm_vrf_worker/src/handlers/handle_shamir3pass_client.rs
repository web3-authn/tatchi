use crate::http::{post_apply_server_lock, post_remove_server_lock};
use crate::manager::VRFKeyManager;
use crate::shamir3pass::{decode_biguint_b64u, encode_biguint_b64u};
use crate::types::VrfWorkerResponse;
use log::error;
use serde::{Deserialize, Serialize};
use std::cell::RefCell;
use std::rc::Rc;
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
#[derive(Serialize, Deserialize, Clone)]
pub struct Shamir3PassClientEncryptCurrentVrfKeypairRequest {
    // No specific fields needed for this request
}

#[wasm_bindgen]
#[derive(Serialize, Deserialize, Clone)]
pub struct Shamir3PassClientDecryptVrfKeypairRequest {
    #[wasm_bindgen(getter_with_clone, js_name = "nearAccountId")]
    #[serde(rename = "nearAccountId")]
    pub near_account_id: String,
    #[wasm_bindgen(getter_with_clone, js_name = "kek_s_b64u")]
    #[serde(rename = "kek_s_b64u")]
    pub kek_s_b64u: String,
    #[wasm_bindgen(getter_with_clone, js_name = "ciphertextVrfB64u")]
    #[serde(rename = "ciphertextVrfB64u")]
    pub ciphertext_vrf_b64u: String,
    #[wasm_bindgen(getter_with_clone, js_name = "keyId")]
    #[serde(rename = "keyId")]
    pub key_id: String,
}

#[wasm_bindgen]
#[derive(Serialize, Deserialize, Clone)]
pub struct Shamir3PassEncryptVrfKeypairResult {
    #[wasm_bindgen(getter_with_clone, js_name = "ciphertextVrfB64u")]
    #[serde(rename = "ciphertextVrfB64u")]
    pub ciphertext_vrf_b64u: String,
    #[wasm_bindgen(getter_with_clone, js_name = "kek_s_b64u")]
    #[serde(rename = "kek_s_b64u")]
    pub kek_s_b64u: String,
    #[wasm_bindgen(getter_with_clone, js_name = "vrfPublicKey")]
    #[serde(rename = "vrfPublicKey")]
    pub vrf_public_key: String,
    #[wasm_bindgen(getter_with_clone, js_name = "serverKeyId")]
    #[serde(default, rename = "serverKeyId")]
    pub server_key_id: Option<String>,
}

// === Shamir 3-pass client-side handlers ===

// Initial VRF lock is performed in the DERIVE_VRF_KEYPAIR_FROM_PRF handler during registration
// So this handler is somewhat redundant, but may be useful for future use cases
// It encrypts the VRF keypair that's currently in the VRFManager's memory
pub async fn handle_shamir3pass_client_encrypt_current_vrf_keypair(
    manager: Rc<RefCell<VRFKeyManager>>,
    message_id: Option<String>,
    _payload: Shamir3PassClientEncryptCurrentVrfKeypairRequest,
) -> VrfWorkerResponse {
    let relay_url = match manager.borrow().relay_server_url.clone() {
        Some(url) => url,
        None => return VrfWorkerResponse::fail(message_id, "VRFManager.relayServerUrl is empty"),
    };
    let apply_lock_route = match manager.borrow().apply_lock_route.clone() {
        Some(route) => route,
        None => {
            return VrfWorkerResponse::fail(message_id, "VRFManager.applyServerLockRoute is empty")
        }
    };

    let result = match perform_shamir3pass_client_encrypt_current_vrf_keypair(
        manager.clone(),
        relay_url,
        apply_lock_route,
    )
    .await
    {
        Ok(v) => v,
        Err(e) => {
            error!("VRF keypair encryption failed: {}", e);
            return VrfWorkerResponse::fail(message_id, e.to_string());
        }
    };

    // Return ciphertext_vrf (base64url) and KEK_s to save to indexedDB
    let out = Shamir3PassEncryptVrfKeypairResult {
        ciphertext_vrf_b64u: result.ciphertext_vrf_b64u,
        kek_s_b64u: result.kek_s_b64u,
        vrf_public_key: result.vrf_public_key,
        server_key_id: result.server_key_id,
    };

    VrfWorkerResponse::success(message_id, Some(serde_json::to_value(&out).unwrap()))
}

pub async fn perform_shamir3pass_client_encrypt_current_vrf_keypair(
    manager: Rc<RefCell<VRFKeyManager>>,
    relay_url: String,
    apply_lock_route: String,
) -> Result<Shamir3PassEncryptVrfKeypairResult, String> {
    if relay_url.is_empty() {
        return Err("relay_url required".to_string());
    }
    if apply_lock_route.is_empty() {
        return Err("apply_lock_route required".to_string());
    }

    // Serialize VRFKeypairData currently in memory; error if none
    let (vrf_keypair_bytes, vrf_pub_b64) = {
        let mgr = manager.borrow();
        if !mgr.session_active || mgr.vrf_keypair.is_none() {
            return Err("No VRF keypair in memory".to_string());
        }
        let kp = mgr.vrf_keypair.as_ref().unwrap().inner();
        let vrf_keypair_bytes = match bincode::serialize(kp) {
            Ok(b) => b,
            Err(e) => return Err(format!("Serialize VRF keypair failed: {}", e)),
        };
        let pub_bytes = match bincode::serialize(&kp.pk) {
            Ok(b) => b,
            Err(e) => return Err(format!("Serialize VRF public key failed: {}", e)),
        };
        (
            vrf_keypair_bytes,
            crate::utils::base64_url_encode(&pub_bytes),
        )
    };

    let vrf_keypair = crate::types::VRFKeypairData {
        keypair_bytes: vrf_keypair_bytes,
        public_key_base64: vrf_pub_b64.clone(),
    };
    let vrf_keypair_bytes = match bincode::serialize(&vrf_keypair) {
        Ok(b) => b,
        Err(e) => return Err(format!("Serialize VRFKeypairData failed: {}", e)),
    };

    // Get Shamir3Pass instance from manager
    let shamir3pass = {
        let mgr = manager.borrow();
        mgr.shamir3pass().clone()
    };

    // Generate random KEK (key encryption key, AEAD keys for encrypting the VRF keys)
    let (ciphertext_vrf, kek) = match shamir3pass.encrypt_with_random_kek_key(&vrf_keypair_bytes) {
        Ok(result) => result,
        Err(e) => return Err(format!("encrypt_with_random_kek_key failed: {:?}", e)),
    };

    // Generate client one-time lock keys (e_c, d_c)
    let client_lock = match shamir3pass.generate_lock_keys() {
        Ok(k) => k,
        Err(e) => return Err(format!("generate_lock_keys failed: {:?}", e)),
    };

    // Client locks vrf keypair as kek_c with temp key
    let kek_c = shamir3pass.add_lock(&kek, &client_lock.e);
    let kek_c_b64u = encode_biguint_b64u(&kek_c);

    // POST to server to lock (double locked)
    let relay_url_trimmed = relay_url.trim().trim_end_matches('/');
    let apply_route_trimmed = apply_lock_route.trim();
    let url = if apply_route_trimmed.starts_with("http://") || apply_route_trimmed.starts_with("https://") {
        apply_route_trimmed.to_string()
    } else {
        format!(
            "{}/{}",
            relay_url_trimmed,
            apply_route_trimmed.trim_start_matches('/')
        )
    };
    let apply_resp = match post_apply_server_lock(&url, &kek_c_b64u).await {
        Ok(v) => v,
        Err(e) => return Err(e),
    };
    let server_key_id = apply_resp.key_id.clone();
    let kek_cs_b64u = apply_resp.kek_cs_b64u;
    // Client receives double locked KEK back and base64url decodes it
    let kek_cs =
        decode_biguint_b64u(&kek_cs_b64u).map_err(|_| "invalid kek_cs_b64u".to_string())?;

    // Client removes onetime client lock to get KEK_s
    let kek_s = shamir3pass.remove_lock(&kek_cs, &client_lock.d);
    let kek_s_b64u = encode_biguint_b64u(&kek_s);

    // Return ciphertext_vrf (base64url) and KEK_s to save to indexedDB
    Ok(Shamir3PassEncryptVrfKeypairResult {
        ciphertext_vrf_b64u: crate::utils::base64_url_encode(&ciphertext_vrf),
        kek_s_b64u: kek_s_b64u,
        vrf_public_key: vrf_pub_b64,
        server_key_id,
    })
}

pub async fn handle_shamir3pass_client_decrypt_vrf_keypair(
    manager: Rc<RefCell<VRFKeyManager>>,
    message_id: Option<String>,
    payload: Shamir3PassClientDecryptVrfKeypairRequest,
) -> VrfWorkerResponse {
    let relay_url = match manager.borrow().relay_server_url.clone() {
        Some(url) => url,
        None => return VrfWorkerResponse::fail(message_id, "VRFManager.relayServerUrl is empty"),
    };
    let remove_route = match manager.borrow().remove_lock_route.clone() {
        Some(route) => route,
        None => {
            return VrfWorkerResponse::fail(message_id, "VRFManager.removeServerLockRoute is empty")
        }
    };

    if payload.near_account_id.is_empty()
        || relay_url.is_empty()
        || payload.kek_s_b64u.is_empty()
        || payload.ciphertext_vrf_b64u.is_empty()
    {
        return VrfWorkerResponse::fail(message_id, "missing required fields");
    };

    let kek_s = match decode_biguint_b64u(&payload.kek_s_b64u) {
        Ok(v) => v,
        Err(_) => return VrfWorkerResponse::fail(message_id.clone(), "invalid kek_s_b64u"),
    };
    let ciphertext_vrf = match crate::utils::base64_url_decode(&payload.ciphertext_vrf_b64u) {
        Ok(v) => v,
        Err(e) => {
            return VrfWorkerResponse::fail(
                message_id,
                format!("invalid ciphertext_vrf_b64u: {}", e),
            )
        }
    };

    // Get Shamir3Pass instance from manager
    let shamir3pass = {
        let mgr = manager.borrow();
        mgr.shamir3pass().clone()
    };

    // Choose fresh one-time client lock keys (e_c', d_c')
    let client_lock = match shamir3pass.generate_lock_keys() {
        Ok(k) => k,
        Err(e) => {
            return VrfWorkerResponse::fail(
                message_id,
                format!("generate_lock_keys failed: {:?}", e),
            )
        }
    };

    // Client locks the server locked KEK_s as kek_cs
    let kek_cs = shamir3pass.add_lock(&kek_s, &client_lock.e);
    let kek_cs_b64u = encode_biguint_b64u(&kek_cs);

    // POST KEK_cs to server /remove-server-lock and receive KEK_c back
    let relay_url_trimmed = relay_url.trim().trim_end_matches('/');
    let remove_route_trimmed = remove_route.trim();
    let url = if remove_route_trimmed.starts_with("http://") || remove_route_trimmed.starts_with("https://") {
        remove_route_trimmed.to_string()
    } else {
        format!(
            "{}/{}",
            relay_url_trimmed,
            remove_route_trimmed.trim_start_matches('/')
        )
    };
    let kek_c_b64u = match post_remove_server_lock(&url, &kek_cs_b64u, payload.key_id.clone()).await {
        Ok(v) => v.kek_c_b64u,
        Err(e) => return VrfWorkerResponse::fail(message_id, e),
    };
    let kek_c = match decode_biguint_b64u(&kek_c_b64u) {
        Ok(v) => v,
        Err(_) => return VrfWorkerResponse::fail(message_id.clone(), "invalid kek_c_b64u"),
    };
    // remove the one-time lock to get the real KEK
    let kek = shamir3pass.remove_lock(&kek_c, &client_lock.d);

    // Decrypt VRF with AEAD(KEK)
    let vrf_keypair_bytes = match shamir3pass.decrypt_with_key(&ciphertext_vrf, &kek) {
        Ok(v) => v,
        Err(e) => {
            return VrfWorkerResponse::fail(message_id, format!("decrypt VRF failed: {:?}", e))
        }
    };

    // Parse VRFKeypairData and load into manager
    let keypair_payload: crate::types::VRFKeypairData =
        match bincode::deserialize(&vrf_keypair_bytes) {
            Ok(v) => v,
            Err(e) => {
                return VrfWorkerResponse::fail(
                    message_id,
                    format!("deserialize VRFKeypairData failed: {}", e),
                )
            }
        };

    if let Err(e) = manager
        .borrow_mut()
        .load_plaintext_vrf_keypair(payload.near_account_id, keypair_payload)
    {
        return VrfWorkerResponse::fail(message_id, e.to_string());
    }

    VrfWorkerResponse::success(
        message_id,
        Some(serde_json::json!({ "status": "unlocked" })),
    )
}
