use hkdf::Hkdf;
use log::debug;
use sha2::Sha256;

use crate::errors::HkdfError;
use crate::manager::VRFKeyManager;
use crate::rpc_calls::{
    verify_authentication_response_rpc_call, VrfData, WebAuthnAuthenticationCredential,
};
use crate::types::{VRFChallengeData, VrfWorkerResponse};
use crate::utils::{base64_url_decode, generate_wrap_key_salt_b64u};
use serde::{Serialize, Deserialize};
use std::cell::RefCell;
use std::rc::Rc;

#[derive(Debug, Serialize, Deserialize)]
pub struct DeriveWrapKeySeedAndSessionRequest {
    #[serde(rename = "sessionId")]
    pub session_id: String,
    #[serde(rename = "prfFirstAuthB64u")]
    pub prf_first_auth_b64u: String,
    #[serde(rename = "wrapKeySalt")]
    pub wrap_key_salt_b64u: String,
    /// Optional contract ID for verify_authentication_response gating.
    #[serde(rename = "contractId")]
    pub contract_id: Option<String>,
    /// Optional NEAR RPC URL for verify_authentication_response gating.
    #[serde(rename = "nearRpcUrl")]
    pub near_rpc_url: Option<String>,
    /// Optional VRF challenge used to build VrfData for contract verification.
    #[serde(rename = "vrfChallenge")]
    pub vrf_challenge: Option<VRFChallengeData>,
    /// Optional WebAuthn authentication credential for contract verification.
    /// PRF extension results are intentionally omitted from this Rust struct, so
    /// any PRF outputs present in the JS object are not forwarded over the network.
    #[serde(rename = "credential")]
    pub credential: Option<WebAuthnAuthenticationCredential>,
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
    if let (Some(contract_id), Some(rpc_url), Some(vrf_challenge), Some(credential)) = (
        request.contract_id.as_ref(),
        request.near_rpc_url.as_ref(),
        request.vrf_challenge.as_ref(),
        request.credential.as_ref(),
    ) {
        let vrf_data = match VrfData::try_from(vrf_challenge) {
            Ok(data) => data,
            Err(e) => {
                return VrfWorkerResponse::fail(
                    message_id,
                    format!("Failed to convert VRF challenge for contract verification: {:?}", e),
                )
            }
        };

        match verify_authentication_response_rpc_call(
            contract_id,
            rpc_url,
            vrf_data,
            credential.clone(),
        )
        .await
        {
            Ok(result) => {
                if !result.success || !result.verified {
                    let err_msg = result
                        .error
                        .unwrap_or_else(|| "Contract verification failed".to_string());
                    return VrfWorkerResponse::fail(message_id, err_msg);
                }
            }
            Err(e) => {
                return VrfWorkerResponse::fail(
                    message_id,
                    format!("verify_authentication_response RPC failed: {}", e),
                );
            }
        }
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

    // Deliver WrapKeySeed + wrapKeySalt to the signer worker via the attached MessagePort
    #[cfg(target_arch = "wasm32")]
    {
        let wrap_key_seed_b64u = crate::utils::base64_url_encode(&wrap_key_seed);
        crate::wrap_key_seed_port::send_wrap_key_seed_to_signer(
            &request.session_id,
            &wrap_key_seed_b64u,
            &wrap_key_salt_b64u,
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
