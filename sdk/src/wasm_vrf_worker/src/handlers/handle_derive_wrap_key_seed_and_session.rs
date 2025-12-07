use hkdf::Hkdf;
use log::debug;
use sha2::Sha256;
use wasm_bindgen::prelude::*;

use crate::errors::HkdfError;
use crate::manager::VRFKeyManager;
use crate::rpc_calls::{
    verify_authentication_response_rpc_call, VrfData, WebAuthnAuthenticationCredential,
    WebAuthnRegistrationCredential,
};
use crate::types::{VRFChallengeData, VrfWorkerResponse};
use crate::utils::{base64_url_decode, generate_wrap_key_salt_b64u};
use serde::{Serialize, Deserialize};
use serde_json::Value as JsonValue;
use std::cell::RefCell;
use std::rc::Rc;

/// Extract PRF.second output from credential's client data extension results.
/// Looks through known WebAuthn shapes and returns Some(decoded_bytes) when present.
#[cfg(target_arch = "wasm32")]
fn extract_prf_second_from_credential(
    credential: &serde_json::Value,
) -> Result<Option<Vec<u8>>, String> {

    fn decode_prf_second(second_b64u: Option<&str>) -> Result<Option<Vec<u8>>, String> {
        let Some(second_b64u) = second_b64u else {
            return Ok(None);
        };
        if second_b64u.is_empty() {
            return Ok(None);
        }
        base64_url_decode(second_b64u)
            .map_err(|e| format!("Failed to decode PRF.second: {}", e))
            .map(|decoded| if decoded.is_empty() { None } else { Some(decoded) })
    }

    // Primary location: clientExtensionResults.prf.results.second
    if let Some(client_ext) = credential.get("clientExtensionResults") {
        if let Some(prf_ext) = client_ext.get("prf") {
            if let Some(results) = prf_ext.get("results") {
                if let Some(second_b64u) = results.get("second") {
                    return decode_prf_second(second_b64u.as_str());
                }
            }
        }
    }

    // Alternate location: response.clientExtensionResults.prf.results.second
    if let Some(response) = credential.get("response") {
        if let Some(client_ext) = response.get("clientExtensionResults") {
            if let Some(prf_ext) = client_ext.get("prf") {
                if let Some(results) = prf_ext.get("results") {
                    if let Some(second_b64u) = results.get("second") {
                        return decode_prf_second(second_b64u.as_str());
                    }
                }
            }
        }
    }

    Ok(None)
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(untagged)]
pub enum WebAuthnCredential {
    Authentication(WebAuthnAuthenticationCredential),
    Registration(WebAuthnRegistrationCredential),
    Raw(JsonValue),
}

#[cfg(target_arch = "wasm32")]
fn credential_to_json_value(credential: &WebAuthnCredential) -> Result<JsonValue, String> {
    match credential {
        WebAuthnCredential::Raw(value) => Ok(value.clone()),
        other => serde_json::to_value(other)
            .map_err(|e| format!("Failed to serialize credential: {}", e)),
    }
}

fn as_authentication_credential(
    credential: &WebAuthnCredential,
) -> Result<Option<WebAuthnAuthenticationCredential>, String> {
    match credential {
        WebAuthnCredential::Authentication(c) => Ok(Some(c.clone())),
        WebAuthnCredential::Registration(_) => Ok(None),
        WebAuthnCredential::Raw(raw) => {
            match serde_json::from_value::<WebAuthnAuthenticationCredential>(raw.clone()) {
                Ok(auth) => Ok(Some(auth)),
                Err(e) => {
                    let looks_auth = raw
                        .get("response")
                        .and_then(|r| r.get("authenticatorData"))
                        .is_some();
                    if looks_auth {
                        return Err(format!(
                            "Failed to deserialize credential for contract verification: {}",
                            e
                        ));
                    }
                    Ok(None)
                }
            }
        }
    }
}

async fn verify_authentication_if_needed(
    message_id: &Option<String>,
    contract_id: &Option<String>,
    rpc_url: &Option<String>,
    vrf_challenge: &Option<VRFChallengeData>,
    credential: &Option<WebAuthnCredential>,
) -> Result<(), VrfWorkerResponse> {
    let (Some(contract_id), Some(rpc_url), Some(vrf_challenge)) =
        (contract_id.as_ref(), rpc_url.as_ref(), vrf_challenge.as_ref())
    else {
        return Ok(());
    };

    let Some(credential) = credential else {
        // Preserve existing behavior: skip verification when credential is absent.
        return Ok(());
    };

    let Some(auth_credential) = as_authentication_credential(credential).map_err(|e| {
        VrfWorkerResponse::fail(
            message_id.clone(),
            format!("Failed to interpret WebAuthn credential: {}", e),
        )
    })? else {
        debug!("[VRF] Skipping contract verification for non-authentication credential");
        return Ok(());
    };

    let vrf_data = match VrfData::try_from(vrf_challenge) {
        Ok(data) => {
            let vrf_pk_b64u = crate::utils::base64_url_encode(&data.public_key);
            debug!(
                "[VRF] VRF data for contract verification - vrfPublicKey length: {} bytes, b64u: {}",
                data.public_key.len(),
                vrf_pk_b64u
            );
            data
        }
        Err(e) => {
            return Err(VrfWorkerResponse::fail(
                message_id.clone(),
                format!(
                    "Failed to convert VRF challenge for contract verification: {:?}",
                    e
                ),
            ))
        }
    };

    match verify_authentication_response_rpc_call(
        contract_id,
        rpc_url,
        vrf_data,
        auth_credential,
    ).await {
        Ok(result) => {
            if !result.success || !result.verified {
                let err_msg = result
                    .error
                    .unwrap_or_else(|| "Contract verification failed".to_string());
                return Err(VrfWorkerResponse::fail(message_id.clone(), err_msg));
            }
        }
        Err(e) => {
            return Err(VrfWorkerResponse::fail(
                message_id.clone(),
                format!("verify_authentication_response RPC failed: {}", e),
            ))
        }
    }

    Ok(())
}

#[wasm_bindgen]
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DeriveWrapKeySeedAndSessionRequest {
    #[wasm_bindgen(getter_with_clone, js_name = "sessionId")]
    #[serde(rename = "sessionId")]
    pub session_id: String,
    #[wasm_bindgen(getter_with_clone, js_name = "prfFirstAuthB64u")]
    #[serde(rename = "prfFirstAuthB64u")]
    pub prf_first_auth_b64u: String,
    #[wasm_bindgen(getter_with_clone, js_name = "wrapKeySalt")]
    #[serde(rename = "wrapKeySalt")]
    pub wrap_key_salt_b64u: String,
    /// Optional contract ID for verify_authentication_response gating.
    #[wasm_bindgen(getter_with_clone, js_name = "contractId")]
    #[serde(rename = "contractId")]
    pub contract_id: Option<String>,
    /// Optional NEAR RPC URL for verify_authentication_response gating.
    #[wasm_bindgen(getter_with_clone, js_name = "nearRpcUrl")]
    #[serde(rename = "nearRpcUrl")]
    pub near_rpc_url: Option<String>,
    /// Optional VRF challenge used to build VrfData for contract verification.
    #[wasm_bindgen(skip)]
    #[serde(rename = "vrfChallenge")]
    pub vrf_challenge: Option<VRFChallengeData>,
    /// Optional WebAuthn credential (registration or authentication) for PRF.second extraction.
    /// PRF extension results are intentionally omitted when forwarding to RPC, so
    /// any PRF outputs present in the JS object are not sent over the network.
    #[wasm_bindgen(skip)]
    #[serde(rename = "credential")]
    pub credential: Option<WebAuthnCredential>,
}

pub async fn handle_derive_wrap_key_seed_and_session(
    manager: Rc<RefCell<VRFKeyManager>>,
    message_id: Option<String>,
    request: DeriveWrapKeySeedAndSessionRequest,
) -> VrfWorkerResponse {
    debug!(
        "[VRF] derive_wrap_key_seed_and_session for session {}",
        request.session_id
    );

    // If contract verification context is provided, perform verify_authentication_response
    // before deriving WrapKeySeed. This ensures that only contract-verified sessions
    // receive WrapKeySeed material.
    if let Err(resp) = verify_authentication_if_needed(
        &message_id,
        &request.contract_id,
        &request.near_rpc_url,
        &request.vrf_challenge,
        &request.credential,
    )
    .await
    {
        return resp;
    }

    // Determine which wrapKeySalt to use:
    // - If caller provided a non-empty wrapKeySalt (e.g., existing vault entry), honor it.
    // - Otherwise, generate a fresh random wrapKeySalt inside the VRF worker.
    let wrap_key_salt_b64u = if request.wrap_key_salt_b64u.trim().is_empty() {
        match generate_wrap_key_salt_b64u() {
            Ok(s) => s,
            Err(e) => return VrfWorkerResponse::fail(message_id, e),
        }
    } else {
        request.wrap_key_salt_b64u.clone()
    };

    // Decode PRF.first_auth
    let prf_first_bytes = match base64_url_decode(&request.prf_first_auth_b64u) {
        Ok(bytes) => bytes,
        Err(e) => return VrfWorkerResponse::fail(message_id, e.to_string()),
    };

    // Derive K_pass_auth = HKDF(PRF.first_auth, "vrf-wrap-pass")
    let hk = Hkdf::<Sha256>::new(None, &prf_first_bytes);
    let mut k_pass_auth = vec![0u8; 32];
    if let Err(_e) = hk.expand(crate::config::VRF_WRAP_PASS_INFO, &mut k_pass_auth) {
        return VrfWorkerResponse::fail(
            message_id,
            HkdfError::KeyDerivationFailed.to_string(),
        );
    }

    // Get VRF secret key bytes from the current in-memory keypair
    let vrf_secret = match manager.borrow().get_vrf_secret_key_bytes() {
        Ok(sk) => sk,
        Err(e) => return VrfWorkerResponse::fail(message_id, e.to_string()),
    };

    // Derive WrapKeySeed = HKDF(K_pass_auth || vrf_sk, "near-wrap-seed")
    let mut seed = Vec::with_capacity(k_pass_auth.len() + vrf_secret.len());
    seed.extend_from_slice(&k_pass_auth);
    seed.extend_from_slice(&vrf_secret);

    let hk2 = Hkdf::<Sha256>::new(None, &seed);
    let mut wrap_key_seed = vec![0u8; 32];
    if let Err(_e) = hk2.expand(crate::config::NEAR_WRAP_SEED_INFO, &mut wrap_key_seed) {
        return VrfWorkerResponse::fail(
            message_id,
            HkdfError::KeyDerivationFailed.to_string(),
        );
    }

    // === STEP: Extract PRF.second from credential if present ===
    // If credential is provided, extract PRF.second for NEAR key derivation in signer worker
    #[cfg(target_arch = "wasm32")]
    let prf_second_b64u = if let Some(ref credential) = request.credential {
        let credential_json = match credential_to_json_value(credential) {
            Ok(v) => v,
            Err(e) => return VrfWorkerResponse::fail(message_id.clone(), e),
        };

        match extract_prf_second_from_credential(&credential_json) {
            Ok(Some(prf_second_bytes)) => {
                debug!(
                    "[VRF] Extracted PRF.second ({} bytes) from credential",
                    prf_second_bytes.len()
                );
                Some(crate::utils::base64_url_encode(&prf_second_bytes))
            }
            Ok(None) => {
                debug!("[VRF] PRF.second not present in credential");
                None
            }
            Err(e) => return VrfWorkerResponse::fail(message_id.clone(), e),
        }
    } else {
        None
    };

    // Deliver WrapKeySeed + wrapKeySalt + PRF.second to the signer worker via the attached MessagePort
    #[cfg(target_arch = "wasm32")]
    {
        let wrap_key_seed_b64u = crate::utils::base64_url_encode(&wrap_key_seed);
        crate::wrap_key_seed_port::send_wrap_key_seed_to_signer(
            &request.session_id,
            &wrap_key_seed_b64u,
            &wrap_key_salt_b64u,
            prf_second_b64u.as_deref(),
        );
    }

    // Only session metadata is returned to the main thread; WrapKeySeed stays in workers.
    VrfWorkerResponse::success(
        message_id,
        Some(serde_json::json!({
            "sessionId": request.session_id,
            // Echo the wrapKeySalt actually used so callers that need it (e.g. new vaults)
            // can persist it without having to generate it in JS.
            "wrapKeySalt": wrap_key_salt_b64u,
        })),
    )
}

#[cfg(all(test, target_arch = "wasm32"))]
mod tests {
    use super::*;

    #[test]
    fn extract_prf_second_primary_path() {
        let prf_second_bytes = b"test-second";
        let second_b64u = crate::utils::base64_url_encode(prf_second_bytes);
        let credential = serde_json::json!({
            "clientExtensionResults": {
                "prf": { "results": { "second": second_b64u } }
            }
        });
        let extracted = extract_prf_second_from_credential(&credential)
            .expect("should decode")
            .expect("should find prf.second");
        assert_eq!(extracted, prf_second_bytes);
    }

    #[test]
    fn extract_prf_second_response_path() {
        let prf_second_bytes = b"alt-second";
        let second_b64u = crate::utils::base64_url_encode(prf_second_bytes);
        let credential = serde_json::json!({
            "response": {
                "clientExtensionResults": {
                    "prf": { "results": { "second": second_b64u } }
                }
            }
        });
        let extracted = extract_prf_second_from_credential(&credential)
            .expect("should decode")
            .expect("should find prf.second");
        assert_eq!(extracted, prf_second_bytes);
    }

    #[test]
    fn extract_prf_second_missing_returns_none() {
        let credential = serde_json::json!({"clientExtensionResults": {}});
        let extracted = extract_prf_second_from_credential(&credential).expect("should succeed");
        assert!(extracted.is_none());
    }

    #[test]
    fn extract_prf_second_invalid_b64_errors() {
        let credential = serde_json::json!({
            "clientExtensionResults": {
                "prf": { "results": { "second": "!!not-base64url!!" } }
            }
        });
        let err = extract_prf_second_from_credential(&credential)
            .expect_err("should fail to decode invalid base64");
        assert!(err.contains("Failed to decode PRF.second"));
    }
}
