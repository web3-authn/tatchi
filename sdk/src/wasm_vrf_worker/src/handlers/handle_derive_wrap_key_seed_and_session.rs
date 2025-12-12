use hkdf::Hkdf;
use log::debug;
use sha2::Sha256;
use wasm_bindgen::prelude::*;

use crate::errors::HkdfError;
use crate::manager::VRFKeyManager;
use crate::rpc_calls::{
    verify_authentication_response_rpc_call, VrfData, WebAuthnAuthenticationCredential,
};
use crate::types::{VRFChallengeData, VrfWorkerResponse};
use crate::utils::{base64_url_decode, generate_wrap_key_salt_b64u};
use serde::{Serialize, Deserialize};
use serde_wasm_bindgen;
use std::cell::RefCell;
use std::rc::Rc;
use wasm_bindgen::JsValue;
use js_sys::Reflect;

/// Extract PRF.second output from credential's client data extension results.
/// Looks through known WebAuthn shapes and returns Some(decoded_bytes) when present.
#[cfg(target_arch = "wasm32")]
fn extract_prf_second_from_credential(
    credential: &wasm_bindgen::JsValue,
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

    let get_str = |path: &[&str]| -> Option<String> {
        let mut cur = credential.clone();
        for key in path {
            let next = Reflect::get(&cur, &JsValue::from_str(key)).ok()?;
            if next.is_null() || next.is_undefined() {
                return None;
            }
            cur = next;
        }
        cur.as_string()
    };

    if let Some(second_b64u) = get_str(&["clientExtensionResults", "prf", "results", "second"]) {
        return decode_prf_second(Some(&second_b64u));
    }

    if let Some(second_b64u) = get_str(&["response", "clientExtensionResults", "prf", "results", "second"]) {
        return decode_prf_second(Some(&second_b64u));
    }

    Ok(None)
}

fn as_authentication_credential(
    credential: &JsValue,
) -> Result<Option<WebAuthnAuthenticationCredential>, String> {
    match serde_wasm_bindgen::from_value::<WebAuthnAuthenticationCredential>(credential.clone()) {
        Ok(auth) => Ok(Some(auth)),
        Err(e) => {
            let looks_auth = Reflect::get(credential, &JsValue::from_str("response"))
                .ok()
                .and_then(|r| Reflect::get(&r, &JsValue::from_str("authenticatorData")).ok())
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

async fn verify_authentication_if_needed(
    message_id: &Option<String>,
    contract_id: &Option<String>,
    rpc_url: &Option<String>,
    vrf_challenge: &Option<VRFChallengeData>,
    credential: &JsValue,
) -> Result<(), VrfWorkerResponse> {
    let (Some(contract_id), Some(rpc_url), Some(vrf_challenge)) =
        (contract_id.as_ref(), rpc_url.as_ref(), vrf_challenge.as_ref())
    else {
        return Ok(());
    };

    if credential.is_null() || credential.is_undefined() {
        // Preserve existing behavior: skip verification when credential is absent.
        return Ok(());
    }

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
    #[serde(
        rename = "credential",
        default = "js_undefined",
        with = "serde_wasm_bindgen::preserve"
    )]
    pub credential: JsValue,
}

fn js_undefined() -> JsValue {
    JsValue::UNDEFINED
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
    let prf_second_b64u = if !request.credential.is_null() && !request.credential.is_undefined() {
        match extract_prf_second_from_credential(&request.credential) {
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
    #[derive(Serialize)]
    struct Resp<'a> {
        #[serde(rename = "sessionId")]
        session_id: &'a str,
        #[serde(rename = "wrapKeySalt")]
        wrap_key_salt: &'a str,
    }
    let payload = serde_wasm_bindgen::to_value(&Resp {
        session_id: &request.session_id,
        wrap_key_salt: &wrap_key_salt_b64u,
    })
    .unwrap_or(wasm_bindgen::JsValue::UNDEFINED);

    VrfWorkerResponse::success(message_id, Some(payload))
}

#[cfg(all(test, target_arch = "wasm32"))]
mod tests {
    use super::*;
    use serde::Serialize;

    #[test]
    fn extract_prf_second_primary_path() {
        let prf_second_bytes = b"test-second";
        let second_b64u = crate::utils::base64_url_encode(prf_second_bytes);
        #[derive(Serialize)]
        struct Results<'a> {
            second: &'a str,
        }
        #[derive(Serialize)]
        struct Prf<'a> {
            results: Results<'a>,
        }
        #[derive(Serialize)]
        struct ClientExt<'a> {
            prf: Prf<'a>,
        }
        #[derive(Serialize)]
        struct Cred<'a> {
            #[serde(rename = "clientExtensionResults")]
            client_ext: ClientExt<'a>,
        }

        let credential = serde_wasm_bindgen::to_value(&Cred {
            client_ext: ClientExt {
                prf: Prf {
                    results: Results {
                        second: &second_b64u,
                    },
                },
            },
        })
        .unwrap();
        let extracted = extract_prf_second_from_credential(&credential)
            .expect("should decode")
            .expect("should find prf.second");
        assert_eq!(extracted, prf_second_bytes);
    }

    #[test]
    fn extract_prf_second_response_path() {
        let prf_second_bytes = b"alt-second";
        let second_b64u = crate::utils::base64_url_encode(prf_second_bytes);
        #[derive(Serialize)]
        struct Results<'a> {
            second: &'a str,
        }
        #[derive(Serialize)]
        struct Prf<'a> {
            results: Results<'a>,
        }
        #[derive(Serialize)]
        struct ClientExt<'a> {
            prf: Prf<'a>,
        }
        #[derive(Serialize)]
        struct Resp<'a> {
            #[serde(rename = "clientExtensionResults")]
            client_ext: ClientExt<'a>,
        }
        #[derive(Serialize)]
        struct Cred<'a> {
            response: Resp<'a>,
        }

        let credential = serde_wasm_bindgen::to_value(&Cred {
            response: Resp {
                client_ext: ClientExt {
                    prf: Prf {
                        results: Results {
                            second: &second_b64u,
                        },
                    },
                },
            },
        })
        .unwrap();
        let extracted = extract_prf_second_from_credential(&credential)
            .expect("should decode")
            .expect("should find prf.second");
        assert_eq!(extracted, prf_second_bytes);
    }

    #[test]
    fn extract_prf_second_missing_returns_none() {
        #[derive(Serialize)]
        struct ClientExt {}
        #[derive(Serialize)]
        struct Cred {
            #[serde(rename = "clientExtensionResults")]
            client_ext: ClientExt,
        }
        let credential = serde_wasm_bindgen::to_value(&Cred {
            client_ext: ClientExt {},
        })
        .unwrap();
        let extracted = extract_prf_second_from_credential(&credential).expect("should succeed");
        assert!(extracted.is_none());
    }

    #[test]
    fn extract_prf_second_invalid_b64_errors() {
        #[derive(Serialize)]
        struct Results<'a> {
            second: &'a str,
        }
        #[derive(Serialize)]
        struct Prf<'a> {
            results: Results<'a>,
        }
        #[derive(Serialize)]
        struct ClientExt<'a> {
            prf: Prf<'a>,
        }
        #[derive(Serialize)]
        struct Cred<'a> {
            #[serde(rename = "clientExtensionResults")]
            client_ext: ClientExt<'a>,
        }
        let credential = serde_wasm_bindgen::to_value(&Cred {
            client_ext: ClientExt {
                prf: Prf {
                    results: Results {
                        second: "!!not-base64url!!",
                    },
                },
            },
        })
        .unwrap();
        let err = extract_prf_second_from_credential(&credential)
            .expect_err("should fail to decode invalid base64");
        assert!(err.contains("Failed to decode PRF.second"));
    }
}
