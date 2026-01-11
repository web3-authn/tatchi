use hkdf::Hkdf;
use log::debug;
use serde::{Deserialize, Serialize};
use serde_wasm_bindgen;
use sha2::Sha256;
use std::cell::RefCell;
use std::rc::Rc;
use wasm_bindgen::prelude::*;
use wasm_bindgen::JsValue;

use crate::await_secure_confirmation::{
    vrf_await_secure_confirmation, Payload, RpcCall, SecureConfirmRequest, Summary,
};
use crate::errors::HkdfError;
use crate::manager::VRFKeyManager;
use crate::types::{VrfWorkerResponse, WorkerConfirmationResponse};
use crate::utils::{base64_url_decode, generate_wrap_key_salt_b64u};

/// Request payload for combined Device2 registration session.
/// This combines registration credential collection + WrapKeySeed derivation in a single flow.
#[wasm_bindgen]
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Device2RegistrationSessionRequest {
    /// Session ID for the signing session (MessagePort identifier)
    #[wasm_bindgen(getter_with_clone, js_name = "sessionId")]
    #[serde(rename = "sessionId")]
    pub session_id: String,

    /// NEAR account ID for the Device2 being registered
    #[wasm_bindgen(getter_with_clone, js_name = "nearAccountId")]
    #[serde(rename = "nearAccountId")]
    pub near_account_id: String,

    /// Device number for the Device2 being registered
    #[wasm_bindgen(js_name = "deviceNumber")]
    #[serde(rename = "deviceNumber")]
    pub device_number: u32,

    /// Web3Authn contract ID
    #[wasm_bindgen(getter_with_clone, js_name = "contractId")]
    #[serde(rename = "contractId")]
    pub contract_id: String,

    /// NEAR RPC URL for transaction context
    #[wasm_bindgen(getter_with_clone, js_name = "nearRpcUrl")]
    #[serde(rename = "nearRpcUrl")]
    pub near_rpc_url: String,

    /// Optional confirmation configuration passed through to confirmTxFlow
    #[wasm_bindgen(skip)]
    #[serde(
        rename = "confirmationConfig",
        default = "js_undefined",
        with = "serde_wasm_bindgen::preserve"
    )]
    pub confirmation_config: JsValue,

    /// Optional wrapKeySalt. If empty/null, VRF will generate a fresh one.
    #[wasm_bindgen(getter_with_clone, js_name = "wrapKeySalt")]
    #[serde(rename = "wrapKeySalt")]
    pub wrap_key_salt_b64u: Option<String>,
}

/// Result for combined Device2 registration session.
/// Contains credential (with PRF.second embedded), VRF challenge, transaction context,
/// and the wrapKeySalt used (for vault storage). WrapKeySeed is delivered via MessagePort.
#[derive(Debug, Serialize)]
pub struct Device2RegistrationSessionResult {
    #[serde(rename = "confirmed")]
    pub confirmed: bool,
    #[serde(rename = "requestId")]
    pub request_id: String,
    #[serde(rename = "intentDigest")]
    pub intent_digest: String,
    #[serde(
        rename = "credential",
        with = "serde_wasm_bindgen::preserve",
        default = "js_undefined"
    )]
    pub credential: JsValue,
    #[serde(
        rename = "vrfChallenge",
        with = "serde_wasm_bindgen::preserve",
        default = "js_undefined"
    )]
    pub vrf_challenge: JsValue,
    #[serde(
        rename = "transactionContext",
        with = "serde_wasm_bindgen::preserve",
        default = "js_undefined"
    )]
    pub transaction_context: JsValue,
    #[serde(rename = "sessionId")]
    pub session_id: String,
    #[serde(rename = "wrapKeySalt")]
    pub wrap_key_salt: String,
    /// Deterministic VRF public key derived from PRF.second (for contract registration)
    #[serde(rename = "deterministicVrfPublicKey")]
    pub deterministic_vrf_public_key: Option<String>,
    /// Encrypted deterministic VRF keypair for IndexedDB storage
    #[serde(rename = "encryptedVrfKeypair")]
    #[serde(with = "serde_wasm_bindgen::preserve", default = "js_undefined")]
    pub encrypted_vrf_keypair: JsValue,
    #[serde(rename = "error")]
    pub error: Option<String>,
}
fn js_undefined() -> JsValue {
    JsValue::UNDEFINED
}

/// Combined Device2 registration session handler.
///
/// Flow:
/// 1. Build SecureConfirmRequest for Device2 registration and call awaitSecureConfirmationV2
/// 2. Extract PRF.first from the returned credential
/// 3. Derive WrapKeySeed using PRF.first + VRF secret key (HKDF)
/// 4. Send WrapKeySeed + wrapKeySalt to signer worker via MessagePort
/// 5. Return credential (with PRF.second still embedded), vrfChallenge, transactionContext, wrapKeySalt
pub async fn handle_device2_registration_session(
    manager: Rc<RefCell<VRFKeyManager>>,
    message_id: Option<String>,
    request: Device2RegistrationSessionRequest,
) -> VrfWorkerResponse {
    let near_account_id = request.near_account_id.clone();
    let device_number = request.device_number;
    let session_id = request.session_id.clone();

    debug!(
        "[VRF] Device2 registration session for account {} device {} session {}",
        near_account_id, device_number, session_id
    );

    // === STEP 1: Build SecureConfirmRequest for Device2 registration ===

    let request_id = message_id
        .clone()
        .unwrap_or_else(|| format!("device2-reg-{}-{}", near_account_id, device_number));
    let intent_digest = format!("device2-register:{}:{}", near_account_id, device_number);

    let confirm_request = SecureConfirmRequest {
        requestId: &request_id,
        request_type: "registerAccount",
        summary: Summary {
            nearAccountId: &near_account_id,
            deviceNumber: device_number,
            contractId: Some(&request.contract_id),
        },
        payload: Payload {
            nearAccountId: &near_account_id,
            deviceNumber: device_number,
            rpcCall: RpcCall {
                contractId: &request.contract_id,
                nearRpcUrl: &request.near_rpc_url,
                nearAccountId: &near_account_id,
            },
        },
        intentDigest: Some(&intent_digest),
        confirmationConfig: request.confirmation_config.clone(),
    };

    let confirm_request_js = serde_wasm_bindgen::to_value(&confirm_request).map_err(|e| {
        VrfWorkerResponse::fail(
            message_id.clone(),
            format!("Failed to serialize request: {}", e),
        )
    });
    let confirm_request_js = match confirm_request_js {
        Ok(v) => v,
        Err(err) => return err,
    };

    // === STEP 2: Run registration confirmation flow ===

    let decision: WorkerConfirmationResponse =
        match vrf_await_secure_confirmation(confirm_request_js).await {
            Ok(res) => res,
            Err(e) => {
                debug!("[VRF] Device2 registration confirmation failed: {}", e);
                return VrfWorkerResponse::fail(message_id, e);
            }
        };

    if !decision.confirmed {
        debug!("[VRF] Device2 registration cancelled by user");
        let result = Device2RegistrationSessionResult {
            confirmed: false,
            request_id: decision.request_id.clone(),
            intent_digest: decision.intent_digest.unwrap_or(intent_digest),
            credential: JsValue::UNDEFINED,
            vrf_challenge: JsValue::UNDEFINED,
            transaction_context: JsValue::UNDEFINED,
            session_id: session_id.clone(),
            wrap_key_salt: String::new(),
            deterministic_vrf_public_key: None,
            encrypted_vrf_keypair: JsValue::UNDEFINED,
            error: decision.error.clone(),
        };
        return VrfWorkerResponse::success_from(message_id, Some(result));
    }

    let credential = decision.credential.clone();
    if credential.is_null() || credential.is_undefined() {
        return VrfWorkerResponse::fail(
            message_id,
            "No credential returned from Device2 registration confirmation".to_string(),
        );
    }

    // === STEP 3: Extract PRF.first and PRF.second ===

    let prf_first_bytes = match crate::webauthn::extract_prf_first_from_credential(&credential) {
        Some(first_b64u) => match base64_url_decode(&first_b64u) {
            Ok(bytes) => bytes,
            Err(e) => {
                let msg = format!("Failed to decode PRF.first: {}", e);
                debug!(
                    "Failed to extract PRF.first from Device2 credential: {}",
                    msg
                );
                return VrfWorkerResponse::fail(
                    message_id,
                    format!("Device2 registration: {}", msg),
                );
            }
        },
        None => {
            let msg = "PRF.first not found in registration credential".to_string();
            debug!(
                "[VRF] Failed to extract PRF.first from Device2 credential: {}",
                msg
            );
            return VrfWorkerResponse::fail(message_id, format!("Device2 registration: {}", msg));
        }
    };

    let prf_second_bytes = match crate::webauthn::extract_prf_second_from_credential(&credential) {
        Some(second_b64u) => {
            if second_b64u.is_empty() {
                let msg = "PRF.second not found in registration credential".to_string();
                debug!(
                    "[VRF] Failed to extract PRF.second from Device2 credential: {}",
                    msg
                );
                return VrfWorkerResponse::fail(
                    message_id,
                    format!("Device2 registration: {}", msg),
                );
            }
            match base64_url_decode(&second_b64u) {
                Ok(bytes) => bytes,
                Err(e) => {
                    let msg = format!("Failed to decode PRF.second: {}", e);
                    debug!(
                        "[VRF] Failed to extract PRF.second from Device2 credential: {}",
                        msg
                    );
                    return VrfWorkerResponse::fail(
                        message_id,
                        format!("Device2 registration: {}", msg),
                    );
                }
            }
        }
        None => {
            let msg = "PRF.second not found in registration credential".to_string();
            debug!(
                "[VRF] Failed to extract PRF.second from Device2 credential: {}",
                msg
            );
            return VrfWorkerResponse::fail(message_id, format!("Device2 registration: {}", msg));
        }
    };

    // === STEP 4: Derive deterministic VRF keypair from PRF.second ===
    // This is the deterministic VRF public key that should be registered with the contract
    let deterministic_vrf_keypair = match manager
        .borrow()
        .generate_vrf_keypair_from_seed(&prf_second_bytes, &near_account_id)
    {
        Ok(kp) => kp,
        Err(e) => {
            return VrfWorkerResponse::fail(
                message_id,
                format!(
                    "Failed to derive deterministic VRF keypair from PRF.second: {}",
                    e
                ),
            );
        }
    };

    // Serialize the deterministic VRF public key for the contract registration
    let deterministic_vrf_public_key_bytes = match bincode::serialize(&deterministic_vrf_keypair.pk)
    {
        Ok(bytes) => bytes,
        Err(e) => {
            return VrfWorkerResponse::fail(
                message_id,
                format!("Failed to serialize deterministic VRF public key: {}", e),
            );
        }
    };
    let deterministic_vrf_public_key_b64u =
        crate::utils::base64_url_encode(&deterministic_vrf_public_key_bytes);

    debug!(
        "[VRF] Derived deterministic VRF public key for Device2 registration: {}...",
        &deterministic_vrf_public_key_b64u[..20.min(deterministic_vrf_public_key_b64u.len())]
    );

    // === STEP 5: Encrypt deterministic VRF keypair for storage BEFORE storing in memory ===
    // Encrypt with PRF.second for local IndexedDB storage
    let (_vrf_pk_b64u, encrypted_vrf_keypair) = match manager
        .borrow()
        .encrypt_vrf_keypair_data(&deterministic_vrf_keypair, &prf_second_bytes)
    {
        Ok(result) => result,
        Err(e) => {
            return VrfWorkerResponse::fail(
                message_id,
                format!("Failed to encrypt deterministic VRF keypair: {}", e),
            );
        }
    };
    debug!("[VRF] Encrypted deterministic VRF keypair for Device2 registration");

    // === STEP 6: Store deterministic VRF keypair in memory ===
    // This ensures the in-memory VRF keypair matches the one registered with the contract
    {
        let mut manager_mut = manager.borrow_mut();
        manager_mut.store_vrf_keypair_in_memory(deterministic_vrf_keypair, near_account_id.clone());
    }
    debug!(
        "[VRF] Stored deterministic VRF keypair in memory for session {}",
        session_id
    );

    // Derive K_pass_auth = HKDF(PRF.first, "vrf-wrap-pass")
    let hk = Hkdf::<Sha256>::new(None, &prf_first_bytes);
    let mut k_pass_auth = vec![0u8; 32];
    if let Err(_e) = hk.expand(crate::config::VRF_WRAP_PASS_INFO, &mut k_pass_auth) {
        return VrfWorkerResponse::fail(message_id, HkdfError::KeyDerivationFailed.to_string());
    }

    // Get VRF secret key bytes from current in-memory keypair
    let vrf_secret = match manager.borrow().get_vrf_secret_key_bytes() {
        Ok(sk) => sk,
        Err(e) => {
            return VrfWorkerResponse::fail(
                message_id,
                format!(
                    "Failed to get VRF secret key for Device2 WrapKeySeed derivation: {}",
                    e
                ),
            )
        }
    };

    // Derive WrapKeySeed = HKDF(K_pass_auth || vrf_sk, "near-wrap-seed")
    let mut seed = Vec::with_capacity(k_pass_auth.len() + vrf_secret.len());
    seed.extend_from_slice(&k_pass_auth);
    seed.extend_from_slice(&vrf_secret);

    let hk2 = Hkdf::<Sha256>::new(None, &seed);
    let mut wrap_key_seed = vec![0u8; 32];
    if let Err(_e) = hk2.expand(crate::config::NEAR_WRAP_SEED_INFO, &mut wrap_key_seed) {
        return VrfWorkerResponse::fail(message_id, HkdfError::KeyDerivationFailed.to_string());
    }

    // Determine wrapKeySalt: use provided or generate fresh
    let wrap_key_salt_b64u = if let Some(salt) = request.wrap_key_salt_b64u {
        if salt.trim().is_empty() {
            match generate_wrap_key_salt_b64u() {
                Ok(s) => s,
                Err(e) => return VrfWorkerResponse::fail(message_id, e),
            }
        } else {
            salt
        }
    } else {
        match generate_wrap_key_salt_b64u() {
            Ok(s) => s,
            Err(e) => return VrfWorkerResponse::fail(message_id, e),
        }
    };

    // === STEP 4: Deliver WrapKeySeed + PRF.second to signer worker via MessagePort ===

    #[cfg(target_arch = "wasm32")]
    {
        let wrap_key_seed_b64u = crate::utils::base64_url_encode(&wrap_key_seed);
        let prf_second_b64u = crate::utils::base64_url_encode(&prf_second_bytes);
        debug!(
            "[VRF] Sending WrapKeySeed + PRF.second to signer for Device2 session {}",
            session_id
        );
        crate::wrap_key_seed_port::send_wrap_key_seed_to_signer(
            &session_id,
            &wrap_key_seed_b64u,
            &wrap_key_salt_b64u,
            Some(&prf_second_b64u),
        );
    }

    // === STEP 5: Return credential + session metadata to JS ===
    // Note: credential still contains PRF.second for signer worker to use for NEAR key derivation

    debug!(
        "[VRF] Device2 registration session complete for session {}",
        session_id
    );

    let result = Device2RegistrationSessionResult {
        confirmed: true,
        request_id: decision.request_id.clone(),
        intent_digest: decision.intent_digest.unwrap_or(intent_digest),
        credential: decision.credential.clone(),
        vrf_challenge: decision.vrf_challenge.clone(),
        transaction_context: decision.transaction_context.clone(),
        session_id: session_id.clone(),
        wrap_key_salt: wrap_key_salt_b64u,
        deterministic_vrf_public_key: Some(deterministic_vrf_public_key_b64u),
        encrypted_vrf_keypair: serde_wasm_bindgen::to_value(&encrypted_vrf_keypair)
            .unwrap_or(JsValue::UNDEFINED),
        error: None,
    };

    VrfWorkerResponse::success_from(message_id, Some(result))
}
