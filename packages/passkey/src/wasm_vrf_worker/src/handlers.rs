use log::{debug, info, warn, error};
use js_sys::Date;
use std::rc::Rc;
use std::cell::RefCell;
use num_bigint::BigUint;

use crate::manager::VRFKeyManager;
use serde::{Serialize, Deserialize};
use crate::types::*;
use crate::http::{
    post_remove_server_lock,
    post_apply_server_lock
};
use crate::shamir3pass::{
    decode_biguint_b64u,
    encode_biguint_b64u,
};
use crate::utils::base64_url_decode;

// Small helper to DRY decoding BigUint from base64url and returning a consistent error response
fn decode_biguint_or_fail(
    message_id: &Option<String>,
    label: &str,
    input_b64u: &str,
) -> Result<BigUint, VRFWorkerResponse> {
    match decode_biguint_b64u(input_b64u) {
        Ok(v) => Ok(v),
        Err(_) => Err(VRFWorkerResponse::fail(message_id.clone(), format!("invalid {}", label))),
    }
}

/// Handle PING message
pub fn handle_ping(message_id: Option<String>) -> VRFWorkerResponse {
    debug!("Handling PING message");
    VRFWorkerResponse::success(
        message_id,
        Some(serde_json::json!({
            "status": "alive",
            "timestamp": Date::now()
        }))
    )
}

// === Shamir 3-pass server-side helpers (pure modexp in WASM) ===
/// Generate a fresh server keypair (e_s, d_s) for Shamir 3-pass given public p from config
/// Returns base64url-encoded exponents. Server should persist these securely.
pub fn handle_shamir3pass_generate_server_keypair(
    manager: Rc<RefCell<VRFKeyManager>>,
    message_id: Option<String>,
    _data: Option<serde_json::Value>,
) -> VRFWorkerResponse {
    // Use manager-configured Shamir3Pass instance
    let shamir3pass = {
        let mgr = manager.borrow();
        mgr.shamir3pass().clone()
    };

    // Use high-level key generation
    let keys = match shamir3pass.generate_lock_keys() {
        Ok(v) => v,
        Err(e) => {
            return VRFWorkerResponse::fail(message_id, format!("generate_lock_keys failed: {:?}", e));
        }
    };
    let shamir3pass_exponents = serde_json::json!({
        "e_s_b64u": encode_biguint_b64u(&keys.e),
        "d_s_b64u": encode_biguint_b64u(&keys.d),
    });
    VRFWorkerResponse::success(message_id, Some(shamir3pass_exponents))
}

pub fn handle_shamir3pass_apply_server_lock_kek(
    manager: Rc<RefCell<VRFKeyManager>>,
    message_id: Option<String>,
    data: Option<serde_json::Value>,
) -> VRFWorkerResponse {
    // Use manager-configured Shamir3Pass instance
    let shamir3pass = {
        let mgr = manager.borrow();
        mgr.shamir3pass().clone()
    };

    let data = match data {
        Some(d) => d,
        None => return VRFWorkerResponse::fail(message_id, "Missing data"),
    };

    let e_s_b64u = data["e_s_b64u"].as_str().unwrap_or("");
    let kek_c_b64u = data["kek_c_b64u"].as_str().unwrap_or("");
    let e_s = match decode_biguint_or_fail(&message_id, "e_s_b64u", e_s_b64u) {
        Ok(v) => v,
        Err(r) => return r
    };
    let kek_c = match decode_biguint_or_fail(&message_id, "kek_c_b64u", kek_c_b64u) {
        Ok(v) => v,
        Err(r) => return r
    };
    let kek_cs = shamir3pass.add_lock(&kek_c, &e_s);
    let out = serde_json::json!({
        "kek_cs_b64u": encode_biguint_b64u(&kek_cs)
    });
    VRFWorkerResponse::success(message_id, Some(out))
}

pub fn handle_shamir3pass_remove_server_lock_kek(
    manager: Rc<RefCell<VRFKeyManager>>,
    message_id: Option<String>,
    data: Option<serde_json::Value>,
) -> VRFWorkerResponse {
    // Use manager-configured Shamir3Pass instance
    let shamir3pass = {
        let mgr = manager.borrow();
        mgr.shamir3pass().clone()
    };

    let data = match data {
        Some(d) => d,
        None => return VRFWorkerResponse::fail(message_id, "Missing data"),
    };

    let d_s_b64u = data["d_s_b64u"].as_str().unwrap_or("");
    let kek_cs_b64u = data["kek_cs_b64u"].as_str().unwrap_or("");
    let d_s = match decode_biguint_or_fail(&message_id, "d_s_b64u", d_s_b64u) {
        Ok(v) => v,
        Err(r) => return r
    };
    let kek_cs = match decode_biguint_or_fail(&message_id, "kek_cs_b64u", kek_cs_b64u) {
        Ok(v) => v,
        Err(r) => return r
    };
    let kek_c = shamir3pass.remove_lock(&kek_cs, &d_s);
    let out = serde_json::json!({
        "kek_c_b64u": encode_biguint_b64u(&kek_c)
    });
    VRFWorkerResponse::success(message_id, Some(out))
}

// === Shamir 3-pass ===

// Initial VRF lock is performed in the DERIVE_VRF_KEYPAIR_FROM_PRF handler during registration
// So this handler is somewhat redundant, but may be useful for future use cases
// It encrypts the VRF keypair that's currently in the VRFManager's memory
pub async fn handle_shamir3pass_client_encrypt_current_vrf_keypair(
    manager: Rc<RefCell<VRFKeyManager>>,
    message_id: Option<String>,
    _data: Option<serde_json::Value>,
) -> VRFWorkerResponse {
    let relay_url = match manager.borrow().relay_server_url.clone() {
        Some(url) => url,
        None => return VRFWorkerResponse::fail(message_id, "VRFManager.relayServerUrl is empty")
    };
    let apply_lock_route = match manager.borrow().apply_lock_route.clone() {
        Some(route) => route,
        None => return VRFWorkerResponse::fail(message_id, "VRFManager.applyServerLockRoute is empty")
    };

    let result = match perform_shamir3pass_client_encrypt_current_vrf_keypair(
        manager.clone(),
        relay_url,
        apply_lock_route
    ).await {
        Ok(v) => v,
        Err(e) => {
            error!("VRF keypair encryption failed: {}", e);
            return VRFWorkerResponse::fail(message_id, e.to_string());
        }
    };

    // Return ciphertext_vrf (base64url) and KEK_s to save to indexedDB
    let out = serde_json::json!({
        "ciphertext_vrf_b64u": result.ciphertext_vrf_b64u,
        "kek_s_b64u": result.kek_s_b64u,
        "vrf_public_key": result.vrf_public_key,
    });
    VRFWorkerResponse::success(message_id, Some(out))
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Shamir3PassEncryptVrfKeypairResult {
    ciphertext_vrf_b64u: String,
    kek_s_b64u: String,
    vrf_public_key: String,
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
        (vrf_keypair_bytes, crate::utils::base64_url_encode(&pub_bytes))
    };

    let vrf_keypair = crate::types::VRFKeypairData {
        keypair_bytes: vrf_keypair_bytes,
        public_key_base64: vrf_pub_b64.clone()
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
        Err(e) => return Err(format!("encrypt_with_random_kek_key failed: {:?}", e))
    };

    // Generate client one-time lock keys (e_c, d_c)
    let client_lock = match shamir3pass.generate_lock_keys() {
        Ok(k) => k,
        Err(e) => return Err(format!("generate_lock_keys failed: {:?}", e))
    };

    // Client locks vrf keypair as kek_c with temp key
    let kek_c = shamir3pass.add_lock(&kek, &client_lock.e);
    let kek_c_b64u = encode_biguint_b64u(&kek_c);

    // POST to server to lock (double locked)
    let url = format!("{}{}", relay_url, apply_lock_route);
    let kek_cs_b64u = match post_apply_server_lock(&url, &kek_c_b64u).await {
        Ok(v) => v,
        Err(e) => return Err(e)
    };
    // Client receives double locked KEK back and base64url decodes it
    let kek_cs = decode_biguint_b64u(&kek_cs_b64u).map_err(|_| "invalid kek_cs_b64u".to_string())?;

    // Client removes onetime client lock to get KEK_s
    let kek_s = shamir3pass.remove_lock(&kek_cs, &client_lock.d);
    let kek_s_b64u = encode_biguint_b64u(&kek_s);

    // Return ciphertext_vrf (base64url) and KEK_s to save to indexedDB
    Ok(Shamir3PassEncryptVrfKeypairResult {
        ciphertext_vrf_b64u: crate::utils::base64_url_encode(&ciphertext_vrf),
        kek_s_b64u: kek_s_b64u,
        vrf_public_key: vrf_pub_b64,
    })
}

pub async fn handle_shamir3pass_client_decrypt_vrf_keypair(
    manager: Rc<RefCell<VRFKeyManager>>,
    message_id: Option<String>,
    data: Option<serde_json::Value>,
) -> VRFWorkerResponse {

    let data = match data {
        Some(d) => d,
        None => return VRFWorkerResponse::fail(message_id, "Missing data"),
    };

    let relay_url = match manager.borrow().relay_server_url.clone() {
        Some(url) => url,
        None => return VRFWorkerResponse::fail(message_id, "VRFManager.relayServerUrl is empty")
    };
    let remove_route = match manager.borrow().remove_lock_route.clone() {
        Some(route) => route,
        None => return VRFWorkerResponse::fail(message_id, "VRFManager.removeServerLockRoute is empty")
    };

    let near_account_id = data["nearAccountId"].as_str().unwrap_or("");
    let kek_s_b64u = data["kek_s_b64u"].as_str().unwrap_or("");
    let ciphertext_vrf_b64u = data["ciphertext_vrf_b64u"].as_str().unwrap_or("");

    if near_account_id.is_empty()
        || relay_url.is_empty()
        || kek_s_b64u.is_empty()
        || ciphertext_vrf_b64u.is_empty() {
        return VRFWorkerResponse::fail(message_id, "missing required fields");
    };

    let kek_s = match decode_biguint_or_fail(&message_id, "kek_s_b64u", kek_s_b64u) {
        Ok(v) => v,
        Err(r) => return r,
    };
    let ciphertext_vrf = match crate::utils::base64_url_decode(ciphertext_vrf_b64u) {
        Ok(v) => v,
        Err(e) => return VRFWorkerResponse::fail(message_id, format!("invalid ciphertext_vrf_b64u: {}", e)),
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
            return VRFWorkerResponse::fail(message_id, format!("generate_lock_keys failed: {:?}", e))
        }
    };

    // Client locks the server locked KEK_s as kek_cs
    let kek_cs = shamir3pass.add_lock(&kek_s, &client_lock.e);
    let kek_cs_b64u = encode_biguint_b64u(&kek_cs);

    // POST KEK_cs to server /remove-server-lock and receive KEK_c back
    let url = format!("{}{}", relay_url, remove_route);
    let kek_c_b64u = match post_remove_server_lock(&url, &kek_cs_b64u).await {
        Ok(v) => v,
        Err(e) => return VRFWorkerResponse::fail(message_id, e),
    };
    let kek_c = match decode_biguint_or_fail(&message_id, "kek_c_b64u", &kek_c_b64u) {
        Ok(v) => v,
        Err(r) => return r
    };
    // remove the one-time lock to get the real KEK
    let kek = shamir3pass.remove_lock(&kek_c, &client_lock.d);

    // Decrypt VRF with AEAD(KEK)
    let vrf_keypair_bytes = match shamir3pass.decrypt_with_key(&ciphertext_vrf, &kek) {
        Ok(v) => v,
        Err(e) => return VRFWorkerResponse::fail(message_id, format!("decrypt VRF failed: {:?}", e)),
    };

    // Parse VRFKeypairData and load into manager
    let keypair_data: crate::types::VRFKeypairData = match bincode::deserialize(&vrf_keypair_bytes) {
        Ok(v) => v,
        Err(e) => return VRFWorkerResponse::fail(message_id, format!("deserialize VRFKeypairData failed: {}", e)),
    };

    if let Err(e) = manager.borrow_mut().load_plaintext_vrf_keypair(near_account_id.to_string(), keypair_data) {
        return VRFWorkerResponse::fail(message_id, e);
    }

    VRFWorkerResponse::success(message_id, Some(serde_json::json!({ "status": "unlocked" })))
}


/// Handle UNLOCK_VRF_KEYPAIR message
pub fn handle_unlock_vrf_keypair(
    manager: Rc<RefCell<VRFKeyManager>>,
    message_id: Option<String>,
    data: Option<serde_json::Value>,
) -> VRFWorkerResponse {
    match data {
        Some(data) => {
            let near_account_id = data["nearAccountId"].as_str().unwrap_or("");

            // Debug: Log the received encrypted VRF data structure
            debug!("Received encryptedVrfKeypair: {}",
                serde_json::to_string_pretty(&data["encryptedVrfKeypair"]).unwrap_or_else(|_| "failed to serialize".to_string()));

            let encrypted_vrf_keypair_result = serde_json::from_value::<EncryptedVRFKeypair>(data["encryptedVrfKeypair"].clone());

            // Debug: Log the parsing result
            match &encrypted_vrf_keypair_result {
                Ok(keypair) => {
                    debug!("Successfully parsed EncryptedVRFKeypair");
                    debug!("  - encrypted_vrf_data_b64u length: {}", keypair.encrypted_vrf_data_b64u.len());
                    debug!("  - chacha20_nonce_b64u length: {}", keypair.chacha20_nonce_b64u.len());
                },
                Err(e) => error!("Failed to parse EncryptedVRFKeypair: {}", e),
            }

            let prf_key_base64 = data["prfKey"].as_str().unwrap_or("");
            let prf_key = match base64_url_decode(prf_key_base64) {
                Ok(bytes) => bytes,
                Err(e) => {
                    error!("Invalid PRF key base64url: {}", e);
                    return VRFWorkerResponse::fail(message_id, format!("Invalid PRF key base64url: {}", e))
                }
            };

            if near_account_id.is_empty() {
                error!("Missing nearAccountId in unlock request");
                VRFWorkerResponse::fail(message_id, "Missing nearAccountId")
            } else if prf_key.is_empty() {
                error!("Missing or invalid PRF key in unlock request");
                VRFWorkerResponse::fail(message_id, "Missing or invalid PRF key")
            } else if let Ok(encrypted_vrf_keypair) = encrypted_vrf_keypair_result {
                let mut manager_mut = manager.borrow_mut();
                match manager_mut.unlock_vrf_keypair(near_account_id.to_string(), encrypted_vrf_keypair, prf_key) {
                    Ok(_) => {
                        info!("VRF keypair unlock successful for {}", near_account_id);
                        VRFWorkerResponse::success(message_id, None)
                    },
                    Err(e) => {
                        error!("VRF keypair unlock failed for {}: {}", near_account_id, e);
                        VRFWorkerResponse::fail(message_id, e.to_string())
                    }
                }
            } else {
                error!("Failed to parse encrypted VRF data");
                VRFWorkerResponse::fail(message_id, "Failed to parse encrypted VRF data")
            }
        }
        None => {
            error!("Missing unlock data in UNLOCK_VRF_KEYPAIR request");
            VRFWorkerResponse::fail(message_id, "Missing unlock data")
        }
    }
}

/// Handle GENERATE_VRF_CHALLENGE message
pub fn handle_generate_vrf_challenge(
    manager: Rc<RefCell<VRFKeyManager>>,
    message_id: Option<String>,
    data: Option<serde_json::Value>,
) -> VRFWorkerResponse {
    match data {
        Some(data) => {
            match serde_json::from_value::<VRFInputData>(data) {
                Ok(input_data) => {
                    debug!("Generating VRF challenge for user: {}", input_data.user_id);
                    let manager_ref = manager.borrow();
                    match manager_ref.generate_vrf_challenge(input_data) {
                        Ok(challenge_data) => {
                            info!("VRF challenge generated successfully");
                            VRFWorkerResponse::success(message_id, Some(serde_json::to_value(&challenge_data).unwrap()))
                        },
                        Err(e) => {
                            error!("VRF challenge generation failed: {}", e);
                            VRFWorkerResponse::fail(message_id, e)
                        }
                    }
                }
                Err(e) => {
                    error!("Failed to parse VRF input data: {}", e);
                    VRFWorkerResponse::fail(message_id, format!("Failed to parse VRF input data: {}", e))
                }
            }
        }
        None => {
            error!("Missing VRF input data in GENERATE_VRF_CHALLENGE request");
            VRFWorkerResponse::fail(message_id, "Missing VRF input data")
        }
    }
}

/// Handle GENERATE_VRF_KEYPAIR_BOOTSTRAP message
pub fn handle_generate_vrf_keypair_bootstrap(
    manager: Rc<RefCell<VRFKeyManager>>,
    message_id: Option<String>,
    data: Option<serde_json::Value>,
) -> VRFWorkerResponse {
    if let Some(data) = data {
        // Check if VRF input parameters are provided for challenge generation
        let vrf_input_params = data.get("vrfInputParams")
            .and_then(|params| {
                match serde_json::from_value::<VRFInputData>(params.clone()) {
                    Ok(parsed) => {
                        debug!("Successfully parsed VRFInputData for bootstrap");
                        Some(parsed)
                    },
                    Err(e) => {
                        warn!("Failed to parse VRFInputData for bootstrap: {}", e);
                        None
                    }
                }
            });

        let mut manager_mut = manager.borrow_mut();

        info!("Generating bootstrap VRF keypair - withChallenge: {}", vrf_input_params.is_some());

        return match manager_mut.generate_vrf_keypair_bootstrap(vrf_input_params) {
            Ok(bootstrap_data) => {
                info!("VRF keypair bootstrap completed successfully");
                // Structure response to match expected format
                let response_data = serde_json::json!({
                    "vrf_public_key": bootstrap_data.vrf_public_key,
                    "vrf_challenge_data": bootstrap_data.vrf_challenge_data
                });

                VRFWorkerResponse::success(message_id, Some(response_data))
            },
            Err(e) => {
                error!("VRF keypair bootstrap failed: {}", e);
                VRFWorkerResponse::fail(message_id, e.to_string())
            }
        };
    }
    error!("Missing VRF bootstrap generation data");
    VRFWorkerResponse::fail(message_id, "Missing VRF bootstrap generation data")
}

/// Handle ENCRYPT_VRF_KEYPAIR_WITH_PRF message
pub fn handle_encrypt_vrf_keypair_with_prf(
    manager: Rc<RefCell<VRFKeyManager>>,
    message_id: Option<String>,
    data: Option<serde_json::Value>,
) -> VRFWorkerResponse {
    if let Some(data) = data {
        let expected_public_key = data["expectedPublicKey"].as_str()
            .unwrap_or("")
            .to_string();

        let prf_key_base64 = data["prfKey"].as_str().unwrap_or("");
        let prf_key = match base64_url_decode(prf_key_base64) {
            Ok(bytes) => bytes,
            Err(e) => {
                error!("Invalid PRF key base64url for encryption: {}", e);
                return VRFWorkerResponse::fail(message_id, format!("Invalid PRF key base64url: {}", e))
            }
        };

        if expected_public_key.is_empty() {
            error!("Missing expected public key for encryption");
            return VRFWorkerResponse::fail(message_id, "Missing expected public key")
        } else if prf_key.is_empty() {
            error!("Missing or invalid PRF key for encryption");
            return VRFWorkerResponse::fail(message_id, "Missing or invalid PRF key")
        } else {
            let mut manager_mut = manager.borrow_mut();

            info!("Encrypting VRF keypair with PRF output");

            match manager_mut.encrypt_vrf_keypair_with_prf(expected_public_key, prf_key) {
                Ok(encrypted_data) => {
                    info!("VRF keypair encryption completed successfully");
                    // Structure response to match expected format
                    let response_data = serde_json::json!({
                        "vrf_public_key": encrypted_data.vrf_public_key,
                        "encrypted_vrf_keypair": encrypted_data.encrypted_vrf_keypair
                    });

                    return VRFWorkerResponse::success(message_id, Some(response_data))
                },
                Err(e) => {
                    error!("VRF keypair encryption failed: {}", e);
                    return VRFWorkerResponse::fail(message_id, e.to_string())
                }
            }
        }
    }
    error!("Missing VRF encryption data");
    VRFWorkerResponse::fail(message_id, "Missing VRF encryption data")
}

/// Handle CHECK_VRF_STATUS message
pub fn handle_check_vrf_status(
    manager: Rc<RefCell<VRFKeyManager>>,
    message_id: Option<String>,
) -> VRFWorkerResponse {
    let manager_ref = manager.borrow();
    let status = manager_ref.get_vrf_status();
    VRFWorkerResponse::success(message_id, Some(status))
}

/// Handle LOGOUT message
pub fn handle_logout(
    manager: Rc<RefCell<VRFKeyManager>>,
    message_id: Option<String>,
) -> VRFWorkerResponse {
    let mut manager_mut = manager.borrow_mut();
    match manager_mut.logout() {
        Ok(_) => {
            info!("Logout completed successfully");
            VRFWorkerResponse::success(message_id, None)
        },
        Err(e) => {
            error!("Logout failed: {}", e);
            VRFWorkerResponse::fail(message_id, e.to_string())
        }
    }
}

/// Handle DERIVE_VRF_KEYPAIR_FROM_PRF message
pub async fn handle_derive_vrf_keypair_from_prf(
    manager: Rc<RefCell<VRFKeyManager>>,
    message_id: Option<String>,
    data: Option<serde_json::Value>,
) -> VRFWorkerResponse {
    match data {
        Some(data) => {
            let prf_output_base64 = data["prfOutput"].as_str().unwrap_or("");
            let prf_output = match base64_url_decode(prf_output_base64) {
                Ok(bytes) => bytes,
                Err(e) => {
                    error!("Invalid PRF output base64url for derivation: {}", e);
                    return VRFWorkerResponse::fail(message_id, format!("Invalid PRF output base64url: {}", e))
                }
            };

            let near_account_id = data["nearAccountId"].as_str()
                .unwrap_or("")
                .to_string();

            // Parse saveInMemory parameter (default to true)
            let save_in_memory = data.get("saveInMemory")
                .and_then(|v| v.as_bool())
                .unwrap_or(true);

            // Parse optional VRF input parameters for challenge generation
            let vrf_input_params = data.get("vrfInputParams")
                .and_then(|params| {
                    match serde_json::from_value::<VRFInputData>(params.clone()) {
                        Ok(parsed) => {
                            debug!("VRF input params provided for derivation");
                            Some(parsed)
                        },
                        Err(e) => {
                            warn!("Failed to parse VRF input params for derivation: {}", e);
                            None
                        }
                    }
                });

            if prf_output.is_empty() {
                error!("Missing or invalid PRF output for derivation");
                VRFWorkerResponse::fail(message_id, "Missing or invalid PRF output")
            } else if near_account_id.is_empty() {
                error!("Missing NEAR account ID for derivation");
                VRFWorkerResponse::fail(message_id, "Missing NEAR account ID")
            } else {
                info!("Deriving VRF keypair from PRF for account: {}", near_account_id);
                let (mut derivation_result, vrf_keypair) = {
                    let manager_ref = manager.borrow();
                    match manager_ref.derive_vrf_keypair_from_prf(
                        prf_output,
                        near_account_id.clone(),
                        vrf_input_params.clone(),
                        save_in_memory,
                    ) {
                        Ok((result, keypair)) => (result, keypair),
                        Err(e) => {
                            error!("VRF keypair derivation failed: {}", e);
                            return VRFWorkerResponse::fail(message_id, e.to_string());
                        }
                    }
                };

                // If saveInMemory was requested, store the derived keypair in memory
                if save_in_memory {
                    let mut manager_mut = manager.borrow_mut();
                    manager_mut.store_vrf_keypair_in_memory(vrf_keypair, near_account_id.clone());
                }

                let relay_url = manager.borrow().relay_server_url.clone();
                let apply_server_lock_route = manager.borrow().apply_lock_route.clone();

                match (relay_url, apply_server_lock_route) {
                    (Some(relay_url), Some(apply_server_lock_route)) => {
                        let server_encrypted_vrf_keypair = match perform_shamir3pass_client_encrypt_current_vrf_keypair(
                            manager.clone(),
                            relay_url,
                            apply_server_lock_route
                        ).await {
                            Ok(v) => v,
                            Err(e) => {
                                error!("VRF keypair encryption failed: {}", e);
                                return VRFWorkerResponse::fail(message_id, e.to_string());
                            }
                        };
                        derivation_result.server_encrypted_vrf_keypair = Some(serde_json::json!({
                            "ciphertext_vrf_b64u": server_encrypted_vrf_keypair.ciphertext_vrf_b64u,
                            "kek_s_b64u": server_encrypted_vrf_keypair.kek_s_b64u,
                            "vrf_public_key": server_encrypted_vrf_keypair.vrf_public_key,
                        }));
                    },
                    _ => {
                        error!("Missing relay_url or apply_server_lock_route");
                        return VRFWorkerResponse::fail(message_id, "Missing relay_url or apply_server_lock_route");
                    }
                };

                info!("VRF keypair derivation completed successfully");
                let response_data = serde_json::json!({
                    "vrf_public_key": derivation_result.vrf_public_key,
                    "vrf_challenge_data": derivation_result.vrf_challenge_data,
                    "encrypted_vrf_keypair": derivation_result.encrypted_vrf_keypair,
                    "server_encrypted_vrf_keypair": derivation_result.server_encrypted_vrf_keypair,
                    "success": derivation_result.success
                });

                VRFWorkerResponse::success(message_id, Some(response_data))
            }
        }
        None => {
            error!("Missing VRF derivation data");
            VRFWorkerResponse::fail(message_id, "Missing VRF derivation data")
        }
    }
}

/// Handle unknown message types
pub fn handle_unknown_message(message_type: String, message_id: Option<String>) -> VRFWorkerResponse {
    warn!("Unknown message type received: {}", message_type);
    VRFWorkerResponse::fail(message_id, format!("Unknown message type: {}", message_type))
}

pub fn handle_configure_shamir_p(
    manager: Rc<RefCell<VRFKeyManager>>,
    message_id: Option<String>,
    data: Option<serde_json::Value>,
) -> VRFWorkerResponse {
    info!("Configuring Shamir P: {:?}", data);
    let p_b64u = match data.and_then(|d| d.get("p_b64u").and_then(|v| v.as_str()).map(|s| s.to_string())) {
        Some(v) if !v.is_empty() => v,
        _ => return VRFWorkerResponse::fail(message_id, "Missing p_b64u"),
    };

    let mut mgr = manager.borrow_mut();
    match crate::shamir3pass::Shamir3Pass::new(&p_b64u) {
        Ok(sp) => {
            mgr.shamir3pass = sp;
            VRFWorkerResponse::success(message_id, Some(serde_json::json!({ "status": "ok", "p_b64u": p_b64u })))
        },
        Err(e) => VRFWorkerResponse::fail(message_id, format!("invalid p_b64u: {:?}", e)),
    }
}

pub fn handle_configure_shamir_server_urls(
    manager: Rc<RefCell<VRFKeyManager>>,
    message_id: Option<String>,
    data: Option<serde_json::Value>,
) -> VRFWorkerResponse {
    info!("Configuring Shamir server URLs: {:?}", data);
    let data = match data {
        Some(d) => d,
        None => return VRFWorkerResponse::fail(message_id, "Missing data"),
    };

    let relay_server_url = match data.get("relay_server_url").and_then(|v| v.as_str()) {
        Some(s) if !s.is_empty() => s.to_string(),
        _ => return VRFWorkerResponse::fail(message_id, "Missing relay_server_url"),
    };
    let apply_lock_route = match data.get("apply_lock_route").and_then(|v| v.as_str()) {
        Some(s) if !s.is_empty() => s.to_string(),
        _ => return VRFWorkerResponse::fail(message_id, "Missing apply_lock_route"),
    };
    let remove_lock_route = match data.get("remove_lock_route").and_then(|v| v.as_str()) {
        Some(s) if !s.is_empty() => s.to_string(),
        _ => return VRFWorkerResponse::fail(message_id, "Missing remove_lock_route"),
    };

    let mut mgr = manager.borrow_mut();
    mgr.relay_server_url = Some(relay_server_url);
    mgr.apply_lock_route = Some(apply_lock_route);
    mgr.remove_lock_route = Some(remove_lock_route);

    VRFWorkerResponse::success(message_id, Some(serde_json::json!({ "status": "ok" })))
}