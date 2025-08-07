use crate::manager::VRFKeyManager;
use crate::types::*;
use crate::utils::base64_url_decode;
use log::{debug, info, warn, error};
use js_sys::Date;

/// Handle PING message
pub fn handle_ping(message_id: Option<String>) -> VRFWorkerResponse {
    debug!("Handling PING message");
    VRFWorkerResponse {
        id: message_id,
        success: true,
        data: Some(serde_json::json!({
            "status": "alive",
            "timestamp": Date::now()
        })),
        error: None,
    }
}

/// Handle UNLOCK_VRF_KEYPAIR message
pub fn handle_unlock_vrf_keypair(
    manager: &std::cell::RefCell<VRFKeyManager>,
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
                    return VRFWorkerResponse {
                        id: message_id,
                        success: false,
                        data: None,
                        error: Some(format!("Invalid PRF key base64url: {}", e)),
                    }
                }
            };

            if near_account_id.is_empty() {
                error!("Missing nearAccountId in unlock request");
                VRFWorkerResponse {
                    id: message_id,
                    success: false,
                    data: None,
                    error: Some("Missing nearAccountId".to_string()),
                }
            } else if prf_key.is_empty() {
                error!("Missing or invalid PRF key in unlock request");
                VRFWorkerResponse {
                    id: message_id,
                    success: false,
                    data: None,
                    error: Some("Missing or invalid PRF key".to_string()),
                }
            } else if let Ok(encrypted_vrf_keypair) = encrypted_vrf_keypair_result {
                let mut manager = manager.borrow_mut();
                match manager.unlock_vrf_keypair(near_account_id.to_string(), encrypted_vrf_keypair, prf_key) {
                    Ok(_) => {
                        info!("VRF keypair unlock successful for {}", near_account_id);
                        VRFWorkerResponse {
                            id: message_id,
                            success: true,
                            data: None,
                            error: None,
                        }
                    },
                    Err(e) => {
                        error!("VRF keypair unlock failed for {}: {}", near_account_id, e);
                        VRFWorkerResponse {
                            id: message_id,
                            success: false,
                            data: None,
                            error: Some(e.to_string()),
                        }
                    }
                }
            } else {
                error!("Failed to parse encrypted VRF data");
                VRFWorkerResponse {
                    id: message_id,
                    success: false,
                    data: None,
                    error: Some("Failed to parse encrypted VRF data".to_string()),
                }
            }
        }
        None => {
            error!("Missing unlock data in UNLOCK_VRF_KEYPAIR request");
            VRFWorkerResponse {
                id: message_id,
                success: false,
                data: None,
                error: Some("Missing unlock data".to_string()),
            }
        }
    }
}

/// Handle GENERATE_VRF_CHALLENGE message
pub fn handle_generate_vrf_challenge(
    manager: &std::cell::RefCell<VRFKeyManager>,
    message_id: Option<String>,
    data: Option<serde_json::Value>,
) -> VRFWorkerResponse {
    match data {
        Some(data) => {
            match serde_json::from_value::<VRFInputData>(data) {
                Ok(input_data) => {
                    debug!("Generating VRF challenge for user: {}", input_data.user_id);
                    let manager = manager.borrow();
                    match manager.generate_vrf_challenge(input_data) {
                        Ok(challenge_data) => {
                            info!("VRF challenge generated successfully");
                            VRFWorkerResponse {
                                id: message_id,
                                success: true,
                                data: Some(serde_json::to_value(&challenge_data).unwrap()),
                                error: None,
                            }
                        },
                        Err(e) => {
                            error!("VRF challenge generation failed: {}", e);
                            VRFWorkerResponse {
                                id: message_id,
                                success: false,
                                data: None,
                                error: Some(e),
                            }
                        }
                    }
                }
                Err(e) => {
                    error!("Failed to parse VRF input data: {}", e);
                    VRFWorkerResponse {
                        id: message_id,
                        success: false,
                        data: None,
                        error: Some(format!("Failed to parse VRF input data: {}", e)),
                    }
                }
            }
        }
        None => {
            error!("Missing VRF input data in GENERATE_VRF_CHALLENGE request");
            VRFWorkerResponse {
                id: message_id,
                success: false,
                data: None,
                error: Some("Missing VRF input data".to_string()),
            }
        }
    }
}

/// Handle GENERATE_VRF_KEYPAIR_BOOTSTRAP message
pub fn handle_generate_vrf_keypair_bootstrap(
    manager: &std::cell::RefCell<VRFKeyManager>,
    message_id: Option<String>,
    data: Option<serde_json::Value>,
) -> VRFWorkerResponse {
    match data {
        Some(data) => {
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

            let mut manager = manager.borrow_mut();

            info!("Generating bootstrap VRF keypair - withChallenge: {}", vrf_input_params.is_some());

            match manager.generate_vrf_keypair_bootstrap(vrf_input_params) {
                Ok(bootstrap_data) => {
                    info!("VRF keypair bootstrap completed successfully");
                    // Structure response to match expected format
                    let response_data = serde_json::json!({
                        "vrf_public_key": bootstrap_data.vrf_public_key,
                        "vrf_challenge_data": bootstrap_data.vrf_challenge_data
                    });

                    VRFWorkerResponse {
                        id: message_id,
                        success: true,
                        data: Some(response_data),
                        error: None,
                    }
                },
                Err(e) => {
                    error!("VRF keypair bootstrap failed: {}", e);
                    VRFWorkerResponse {
                        id: message_id,
                        success: false,
                        data: None,
                        error: Some(e.to_string()),
                    }
                }
            }
        }
        None => {
            error!("Missing VRF bootstrap generation data");
            VRFWorkerResponse {
                id: message_id,
                success: false,
                data: None,
                error: Some("Missing VRF bootstrap generation data".to_string()),
            }
        }
    }
}

/// Handle ENCRYPT_VRF_KEYPAIR_WITH_PRF message
pub fn handle_encrypt_vrf_keypair_with_prf(
    manager: &std::cell::RefCell<VRFKeyManager>,
    message_id: Option<String>,
    data: Option<serde_json::Value>,
) -> VRFWorkerResponse {
    match data {
        Some(data) => {
            let expected_public_key = data["expectedPublicKey"].as_str()
                .unwrap_or("")
                .to_string();

            let prf_key_base64 = data["prfKey"].as_str().unwrap_or("");
            let prf_key = match base64_url_decode(prf_key_base64) {
                Ok(bytes) => bytes,
                Err(e) => {
                    error!("Invalid PRF key base64url for encryption: {}", e);
                    return VRFWorkerResponse {
                        id: message_id,
                        success: false,
                        data: None,
                        error: Some(format!("Invalid PRF key base64url: {}", e)),
                    }
                }
            };

            if expected_public_key.is_empty() {
                error!("Missing expected public key for encryption");
                VRFWorkerResponse {
                    id: message_id,
                    success: false,
                    data: None,
                    error: Some("Missing expected public key".to_string()),
                }
            } else if prf_key.is_empty() {
                error!("Missing or invalid PRF key for encryption");
                VRFWorkerResponse {
                    id: message_id,
                    success: false,
                    data: None,
                    error: Some("Missing or invalid PRF key".to_string()),
                }
            } else {
                let mut manager = manager.borrow_mut();

                info!("Encrypting VRF keypair with PRF output");

                match manager.encrypt_vrf_keypair_with_prf(expected_public_key, prf_key) {
                    Ok(encrypted_data) => {
                        info!("VRF keypair encryption completed successfully");
                        // Structure response to match expected format
                        let response_data = serde_json::json!({
                            "vrf_public_key": encrypted_data.vrf_public_key,
                            "encrypted_vrf_keypair": encrypted_data.encrypted_vrf_keypair
                        });

                        VRFWorkerResponse {
                            id: message_id,
                            success: true,
                            data: Some(response_data),
                            error: None,
                        }
                    },
                    Err(e) => {
                        error!("VRF keypair encryption failed: {}", e);
                        VRFWorkerResponse {
                            id: message_id,
                            success: false,
                            data: None,
                            error: Some(e.to_string()),
                        }
                    }
                }
            }
        }
        None => {
            error!("Missing VRF encryption data");
            VRFWorkerResponse {
                id: message_id,
                success: false,
                data: None,
                error: Some("Missing VRF encryption data".to_string()),
            }
        }
    }
}

/// Handle CHECK_VRF_STATUS message
pub fn handle_check_vrf_status(
    manager: &std::cell::RefCell<VRFKeyManager>,
    message_id: Option<String>,
) -> VRFWorkerResponse {
    debug!("Checking VRF status");
    let manager = manager.borrow();
    let status = manager.get_vrf_status();
    VRFWorkerResponse {
        id: message_id,
        success: true,
        data: Some(status),
        error: None,
    }
}

/// Handle LOGOUT message
pub fn handle_logout(
    manager: &std::cell::RefCell<VRFKeyManager>,
    message_id: Option<String>,
) -> VRFWorkerResponse {
    info!("Processing logout request");
    let mut manager = manager.borrow_mut();
    match manager.logout() {
        Ok(_) => {
            info!("Logout completed successfully");
            VRFWorkerResponse {
                id: message_id,
                success: true,
                data: None,
                error: None,
            }
        },
        Err(e) => {
            error!("Logout failed: {}", e);
            VRFWorkerResponse {
                id: message_id,
                success: false,
                data: None,
                error: Some(e),
            }
        }
    }
}

/// Handle DERIVE_VRF_KEYPAIR_FROM_PRF message
pub fn handle_derive_vrf_keypair_from_prf(
    manager: &std::cell::RefCell<VRFKeyManager>,
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
                    return VRFWorkerResponse {
                        id: message_id,
                        success: false,
                        data: None,
                        error: Some(format!("Invalid PRF output base64url: {}", e)),
                    }
                }
            };

            let near_account_id = data["nearAccountId"].as_str()
                .unwrap_or("")
                .to_string();

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
                VRFWorkerResponse {
                    id: message_id,
                    success: false,
                    data: None,
                    error: Some("Missing or invalid PRF output".to_string()),
                }
            } else if near_account_id.is_empty() {
                error!("Missing NEAR account ID for derivation");
                VRFWorkerResponse {
                    id: message_id,
                    success: false,
                    data: None,
                    error: Some("Missing NEAR account ID".to_string()),
                }
            } else {
                info!("Deriving VRF keypair from PRF for account: {}", near_account_id);
                let manager = manager.borrow();
                match manager.derive_vrf_keypair_from_prf(prf_output, near_account_id, vrf_input_params) {
                    Ok(derivation_result) => {
                        info!("VRF keypair derivation completed successfully");
                        let response_data = serde_json::json!({
                            "vrf_public_key": derivation_result.vrf_public_key,
                            "vrf_challenge_data": derivation_result.vrf_challenge_data,
                            "encrypted_vrf_keypair": derivation_result.encrypted_vrf_keypair,
                            "success": derivation_result.success
                        });

                        VRFWorkerResponse {
                            id: message_id,
                            success: true,
                            data: Some(response_data),
                            error: None,
                        }
                    },
                    Err(e) => {
                        error!("VRF keypair derivation failed: {}", e);
                        VRFWorkerResponse {
                            id: message_id,
                            success: false,
                            data: None,
                            error: Some(e.to_string()),
                        }
                    }
                }
            }
        }
        None => {
            error!("Missing VRF derivation data");
            VRFWorkerResponse {
                id: message_id,
                success: false,
                data: None,
                error: Some("Missing VRF derivation data".to_string()),
            }
        }
    }
}

/// Handle unknown message types
pub fn handle_unknown_message(message_type: String, message_id: Option<String>) -> VRFWorkerResponse {
    warn!("Unknown message type received: {}", message_type);
    VRFWorkerResponse {
        id: message_id,
        success: false,
        data: None,
        error: Some(format!("Unknown message type: {}", message_type)),
    }
}