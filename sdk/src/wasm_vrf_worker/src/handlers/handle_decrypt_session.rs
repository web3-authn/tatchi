use crate::await_secure_confirmation::{
    vrf_await_secure_confirmation, DecryptPrivateKeyWithPrfPayload, ExportSummary,
    SecureConfirmRequest,
};
use crate::manager::VRFKeyManager;
use crate::types::{EncryptedVRFKeypair, VrfWorkerResponse, WorkerConfirmationResponse};
use serde::{Deserialize, Serialize};
use serde_wasm_bindgen;
use std::cell::RefCell;
use std::rc::Rc;
use wasm_bindgen::prelude::*;

#[cfg(target_arch = "wasm32")]
use wasm_bindgen::JsValue;

#[cfg(target_arch = "wasm32")]
use crate::utils::{base64_url_decode, base64_url_encode};

#[wasm_bindgen]
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DecryptSessionRequest {
    #[wasm_bindgen(getter_with_clone, js_name = "sessionId")]
    #[serde(rename = "sessionId")]
    pub session_id: String,
    #[wasm_bindgen(getter_with_clone, js_name = "nearAccountId")]
    #[serde(rename = "nearAccountId")]
    pub near_account_id: String,
    #[wasm_bindgen(getter_with_clone, js_name = "wrapKeySalt")]
    #[serde(rename = "wrapKeySalt")]
    pub wrap_key_salt_b64u: String,
    /// Optional: local encrypted VRF keypair for this account/device (IndexedDB).
    #[wasm_bindgen(getter_with_clone, js_name = "encryptedVrfKeypair")]
    #[serde(rename = "encryptedVrfKeypair")]
    pub encrypted_vrf_keypair: Option<EncryptedVRFKeypair>,
    /// Optional: expected VRF public key (base64url) for sanity-checking/fallback derivation.
    #[wasm_bindgen(getter_with_clone, js_name = "expectedVrfPublicKey")]
    #[serde(rename = "expectedVrfPublicKey")]
    pub expected_vrf_public_key: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct DecryptSessionResult {
    #[serde(rename = "sessionId")]
    pub session_id: String,
}

#[cfg(target_arch = "wasm32")]
fn extract_prf_second_bytes_from_credential(credential: &JsValue) -> Result<Vec<u8>, String> {
    let second_b64u = crate::webauthn::extract_prf_second_from_credential(credential)
        .ok_or_else(|| "Missing PRF.second in credential".to_string())?;

    if second_b64u.trim().is_empty() {
        return Err("Missing PRF.second in credential".to_string());
    }

    base64_url_decode(&second_b64u).map_err(|e| format!("Failed to decode PRF.second: {}", e))
}

#[cfg(target_arch = "wasm32")]
fn current_vrf_public_key_b64u(manager: &VRFKeyManager) -> Result<String, String> {
    let kp = manager
        .vrf_keypair
        .as_ref()
        .ok_or_else(|| "No VRF keypair in memory".to_string())?
        .inner();
    let pk_bytes = bincode::serialize(&kp.pk)
        .map_err(|e| format!("Failed to serialize VRF public key: {:?}", e))?;
    Ok(base64_url_encode(&pk_bytes))
}

/// VRF-side entrypoint to kick off a LocalOnly decrypt flow:
///  - Calls awaitSecureConfirmationV2(decryptPrivateKeyWithPrf) via JS bridge
///  - Derives WrapKeySeed via existing MINT_SESSION_KEYS_AND_SEND_TO_SIGNER handler using PRF output + vault wrapKeySalt
pub async fn handle_decrypt_session(
    manager: Rc<RefCell<VRFKeyManager>>,
    message_id: Option<String>,
    request: DecryptSessionRequest,
) -> VrfWorkerResponse {
    let session_id = request.session_id.clone();
    let near_account_id = request.near_account_id.clone();
    let wrap_key_salt_b64u = request.wrap_key_salt_b64u.clone();

    // Build a SecureConfirmRequest object and hand it to awaitSecureConfirmationV2.
    let req = SecureConfirmRequest {
        requestId: &session_id,
        request_type: "decryptPrivateKeyWithPrf",
        summary: ExportSummary {
            operation: "Decrypt Private Key",
            accountId: &near_account_id,
            publicKey: "",
            warning: "Decrypting your private key grants full control of your account.",
        },
        payload: DecryptPrivateKeyWithPrfPayload {
            nearAccountId: &near_account_id,
            publicKey: "",
        },
        intentDigest: None,
        confirmationConfig: JsValue::UNDEFINED,
    };

    let request_js = match serde_wasm_bindgen::to_value(&req) {
        Ok(v) => v,
        Err(e) => return VrfWorkerResponse::fail(message_id, e.to_string()),
    };

    let decision: WorkerConfirmationResponse = match vrf_await_secure_confirmation(request_js).await
    {
        Ok(res) => res,
        Err(e) => return VrfWorkerResponse::fail(message_id, e),
    };

    if !decision.confirmed {
        return VrfWorkerResponse::fail(
            message_id,
            decision
                .error
                .unwrap_or_else(|| "User cancelled export confirmation".to_string()),
        );
    }

    // WrapKeySeed derivation is delegated to the existing MINT_SESSION_KEYS_AND_SEND_TO_SIGNER handler.
    // We synthesize a request and re-use the internal handler directly (no contract gating).
    if decision.credential.is_null() || decision.credential.is_undefined() {
        return VrfWorkerResponse::fail(
            message_id,
            "Missing credential in confirmation response".to_string(),
        );
    }

    // Ensure a VRF keypair is available for WrapKeySeed derivation.
    //
    // Offline export runs without a prior login/session, so the VRF worker may not have any
    // VRF keypair loaded in memory. In that case we recover it from local encrypted storage
    // (when provided), or deterministically derive it from PRF outputs when possible.
    let needs_vrf_keypair = {
        let mgr = manager.borrow();
        !mgr.session_active || mgr.vrf_keypair.is_none()
    };
    if needs_vrf_keypair {
        #[cfg(target_arch = "wasm32")]
        {
            let encrypted_vrf_keypair = request.encrypted_vrf_keypair.clone();
            let expected_vrf_public_key = request
                .expected_vrf_public_key
                .clone()
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty());

            // Offline/local decrypt flows must include PRF.second so VRF can be recovered
            // without any prior in-memory session state.
            let prf_second_bytes =
                match extract_prf_second_bytes_from_credential(&decision.credential) {
                    Ok(bytes) if !bytes.is_empty() => bytes,
                    Ok(_) => {
                        return VrfWorkerResponse::fail(
                            message_id,
                            "Missing PRF.second in credential".to_string(),
                        )
                    }
                    Err(e) => return VrfWorkerResponse::fail(message_id, e),
                };

            // 1) Preferred: unlock the locally stored encrypted VRF keypair (if provided),
            // using PRF.second as the decryption key (spec-aligned).
            if let Some(enc) = encrypted_vrf_keypair.clone() {
                let mut unlocked = false;
                let mut last_err: Option<String> = None;

                {
                    let mut mgr = manager.borrow_mut();
                    match mgr.unlock_vrf_keypair(
                        near_account_id.clone(),
                        enc,
                        prf_second_bytes.clone(),
                    ) {
                        Ok(_) => unlocked = true,
                        Err(e) => last_err = Some(e.to_string()),
                    }
                }

                if unlocked {
                    // Optional sanity check: if an expected VRF public key was provided and
                    // we can compute the current in-memory pk, log a mismatch but proceed.
                    if let Some(expected) = expected_vrf_public_key.as_deref() {
                        if let Ok(actual) = current_vrf_public_key_b64u(&manager.borrow()) {
                            if actual != expected {
                                log::debug!(
                                    "[VRF] decrypt_session: VRF pk mismatch (expected={}, actual={})",
                                    expected,
                                    actual
                                );
                            }
                        }
                    }
                } else {
                    // Continue to deterministic derivation below; keep last_err for diagnostics.
                    log::debug!(
                        "[VRF] decrypt_session: unlock_vrf_keypair failed, falling back to PRF derivation: {:?}",
                        last_err
                    );
                }
            }

            // 2) Fallback: deterministically derive VRF keypair from PRF outputs.
            let still_missing = {
                let mgr = manager.borrow();
                !mgr.session_active || mgr.vrf_keypair.is_none()
            };
            if still_missing {
                let deterministic_vrf_keypair =
                    match manager
                        .borrow()
                        .generate_vrf_keypair_from_seed(&prf_second_bytes, &near_account_id)
                    {
                        Ok(kp) => kp,
                        Err(e) => return VrfWorkerResponse::fail(
                            message_id,
                            format!(
                                "Failed to derive deterministic VRF keypair from PRF.second: {}",
                                e
                            ),
                        ),
                    };

                if let Some(expected) = expected_vrf_public_key.as_deref() {
                    let pk_bytes = match bincode::serialize(&deterministic_vrf_keypair.pk) {
                        Ok(b) => b,
                        Err(e) => {
                            return VrfWorkerResponse::fail(
                                message_id,
                                format!("Failed to serialize derived VRF public key: {}", e),
                            )
                        }
                    };
                    let pk_b64u = base64_url_encode(&pk_bytes);
                    if pk_b64u != expected {
                        return VrfWorkerResponse::fail(
                            message_id,
                            "Failed to recover VRF keypair: derived public key did not match expected".to_string(),
                        );
                    }
                }

                manager.borrow_mut().store_vrf_keypair_in_memory(
                    deterministic_vrf_keypair,
                    near_account_id.clone(),
                );
            }
        }
        #[cfg(not(target_arch = "wasm32"))]
        {
            return VrfWorkerResponse::fail(
                message_id,
                "PRF extraction is only supported in wasm32 builds".to_string(),
            );
        }
    }

    let response = crate::handlers::handle_mint_session_keys_and_send_to_signer(
        manager,
        message_id.clone(),
        crate::handlers::handle_mint_session_keys_and_send_to_signer::MintSessionKeysAndSendToSignerRequest {
            session_id: session_id.clone(),
            // For decrypt flows we must reuse the vault's wrapKeySalt.
            wrap_key_salt_b64u,
            contract_id: None,
            near_rpc_url: None,
            ttl_ms: None,
            remaining_uses: None,
            credential: decision.credential,
        },
    )
    .await;

    if !response.success {
        return response;
    }

    VrfWorkerResponse::success(
        message_id,
        Some(
            serde_wasm_bindgen::to_value(&DecryptSessionResult { session_id })
                .unwrap_or(wasm_bindgen::JsValue::UNDEFINED),
        ),
    )
}
