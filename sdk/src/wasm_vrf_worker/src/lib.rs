use log::debug;
use std::cell::RefCell;
use std::rc::Rc;
use wasm_bindgen::prelude::*;
use wasm_bindgen::JsValue;
use js_sys::{Array, Reflect};
#[cfg(target_arch = "wasm32")]
use wasm_bindgen::JsCast;
#[cfg(target_arch = "wasm32")]
use web_sys::MessagePort;

mod config;
mod errors;
mod handlers;
mod http;
mod manager;
mod rpc_calls;
mod shamir3pass;
mod types;
mod utils;

#[cfg(test)]
mod tests;

// Re-export important types and functions
pub use config::*;
pub use errors::*;
pub use manager::*;
pub use shamir3pass::*;
pub use utils::*;

// Re-export VRF RPC types if needed from JS/tests
pub use rpc_calls::{VrfData, ContractVerificationResult, WebAuthnAuthenticationCredential, WebAuthnAuthenticationResponse};

// Import specific types to avoid ambiguity
pub use types::{VrfWorkerMessage, VrfWorkerResponse, WorkerRequestType};
use types::worker_messages::{parse_typed_payload, parse_worker_request_envelope};

// Import request types from their respective handler files
pub use handlers::handle_derive_vrf_keypair_from_prf::DeriveVrfKeypairFromPrfRequest;
pub use handlers::handle_generate_vrf_challenge::GenerateVrfChallengeRequest;
pub use handlers::handle_generate_vrf_keypair_bootstrap::GenerateVrfKeypairBootstrapRequest;
pub use handlers::handle_shamir3pass_client::{
    Shamir3PassClientDecryptVrfKeypairRequest, Shamir3PassClientEncryptCurrentVrfKeypairRequest,
};
pub use handlers::handle_derive_wrap_key_seed_and_session::DeriveWrapKeySeedAndSessionRequest;
pub use handlers::handle_decrypt_session::DecryptSessionRequest;
pub use handlers::handle_registration_credential_confirmation::RegistrationCredentialConfirmationRequest;
pub use handlers::handle_device2_registration_session::Device2RegistrationSessionRequest;
pub use handlers::handle_shamir3pass_config::{
    Shamir3PassConfigPRequest, Shamir3PassConfigServerUrlsRequest,
};
pub use handlers::handle_shamir3pass_server::{
    Shamir3PassApplyServerLockRequest, Shamir3PassGenerateServerKeypairRequest,
    Shamir3PassRemoveServerLockRequest,
};
pub use handlers::handle_unlock_vrf_keypair::UnlockVrfKeypairRequest;

// SecureConfirm response type reused from types module
use types::WorkerConfirmationResponse;
use wasm_bindgen_futures::JsFuture;
use js_sys::Promise;

// JS bridge exposed from web3authn-vrf.worker.ts:
//   (globalThis as any).awaitSecureConfirmationV2 = awaitSecureConfirmationV2;
#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_name = awaitSecureConfirmationV2)]
    fn await_secure_confirmation_v2(request_json: String) -> Promise;
}

// Set up panic hook for better error messages
#[wasm_bindgen(start)]
pub fn main() {
    // Initialize logger with the configured log level
    wasm_logger::init(wasm_logger::Config::new(config::CURRENT_LOG_LEVEL));
    debug!("VRF WASM Worker starting up...");
    debug!(
        "Logging system initialized with level: {:?}",
        config::CURRENT_LOG_LEVEL
    );
}

/// Helper: call awaitSecureConfirmationV2 from Rust and deserialize the response.
pub async fn vrf_await_secure_confirmation(
    request_json: String,
) -> Result<WorkerConfirmationResponse, String> {
    let promise = await_secure_confirmation_v2(request_json);
    let js_val = JsFuture::from(promise)
        .await
        .map_err(|e| format!("awaitSecureConfirmationV2 rejected: {:?}", e))?;
    serde_wasm_bindgen::from_value(js_val)
        .map_err(|e| format!("Failed to deserialize confirmation response: {}", e))
}

// === GLOBAL STATE ===

thread_local! {
    static VRF_MANAGER: Rc<RefCell<VRFKeyManager>> = Rc::new(RefCell::new(VRFKeyManager::new(None, None, None, None)));
}

#[cfg(target_arch = "wasm32")]
thread_local! {
    // SessionId -> MessagePort for delivering WrapKeySeed directly to signer worker
    static WRAP_KEY_SEED_PORTS: RefCell<std::collections::HashMap<String, MessagePort>> =
        RefCell::new(std::collections::HashMap::new());
}

/// Configure Shamir P at runtime (global manager instance)
#[wasm_bindgen]
pub fn configure_shamir_p(p_b64u: String) -> Result<(), JsValue> {
    VRF_MANAGER.with(|m| {
        let mut mgr = m.borrow_mut();
        mgr.shamir3pass = shamir3pass::Shamir3Pass::new(&p_b64u)
            .map_err(|e| JsValue::from_str(&format!("Failed to create Shamir3Pass: {:?}", e)))?;
        Ok(())
    })
}

#[wasm_bindgen]
pub fn configure_shamir_server_urls(
    relay_server_url: String,
    apply_lock_route: String,
    remove_lock_route: String,
) -> Result<(), JsValue> {
    VRF_MANAGER.with(|m| {
        let mut mgr = m.borrow_mut();
        mgr.relay_server_url = Some(relay_server_url);
        mgr.apply_lock_route = Some(apply_lock_route);
        mgr.remove_lock_route = Some(remove_lock_route);
        Ok(())
    })
}

/// Attach a MessagePort for a signing session so VRF Rust can send WrapKeySeed directly
/// to the signer worker over the dedicated channel.
#[wasm_bindgen]
pub fn attach_wrap_key_seed_port(session_id: String, port_val: JsValue) {
    #[cfg(target_arch = "wasm32")]
    {
        if let Some(port) = port_val.dyn_into::<MessagePort>().ok() {
            WRAP_KEY_SEED_PORTS.with(|map| {
                map.borrow_mut().insert(session_id, port);
            });
        }
    }

    #[cfg(not(target_arch = "wasm32"))]
    {
        let _ = session_id;
        let _ = port_val;
    }
}

// Helper module for WrapKeySeed and PRF.second delivery from handlers
#[cfg(target_arch = "wasm32")]
pub mod wrap_key_seed_port {
    use super::*;

    pub fn send_wrap_key_seed_to_signer(
        session_id: &str,
        wrap_key_seed_b64u: &str,
        wrap_key_salt_b64u: &str,
        prf_second_b64u: Option<&str>,
    ) {
        WRAP_KEY_SEED_PORTS.with(|map| {
            if let Some(port) = map.borrow().get(session_id) {
                let obj = js_sys::Object::new();
                let _ = js_sys::Reflect::set(
                    &obj,
                    &JsValue::from_str("wrap_key_seed"),
                    &JsValue::from_str(wrap_key_seed_b64u),
                );
                let _ = js_sys::Reflect::set(
                    &obj,
                    &JsValue::from_str("wrapKeySalt"),
                    &JsValue::from_str(wrap_key_salt_b64u),
                );
                if let Some(prf_second) = prf_second_b64u {
                    let _ = js_sys::Reflect::set(
                        &obj,
                        &JsValue::from_str("prfSecond"),
                        &JsValue::from_str(prf_second),
                    );
                }
                let _ = port.post_message(&obj);
            }
        });
    }
}

// === WASM EXPORTS ===

#[wasm_bindgen]
pub async fn handle_message(message: JsValue) -> Result<JsValue, JsValue> {
    // Normalize message to a JS object (accept JSON strings for server-side callers)
    let message_obj = if message.is_string() {
        let json_str = message.as_string().unwrap_or_default();
        js_sys::JSON::parse(&json_str)
            .map_err(|e| JsValue::from_str(&format!("Failed to parse message JSON: {:?}", e)))?
    } else {
        message
    };

    // Guardrail: reject payloads that contain near_sk anywhere in the tree.
    if let Some(key) = find_forbidden_near_secret(&message_obj) {
        return Err(JsValue::from_str(&format!(
            "Forbidden secret field in VRF payload: {}",
            key
        )));
    }

    let VrfWorkerMessage {
        request_type,
        request_type_raw: _,
        id,
        payload,
    } = parse_worker_request_envelope(message_obj)?;

    debug!("Received message: {}", request_type.name());

    let manager_rc = VRF_MANAGER.with(|m| m.clone());

    let response = match request_type {
        // Test VRF worker health
        WorkerRequestType::Ping => handlers::handle_ping(id.clone()),
        // Bootstrap VRF keypair + challenge generation (only for registration)
        WorkerRequestType::GenerateVrfKeypairBootstrap => {
            let request: GenerateVrfKeypairBootstrapRequest =
                parse_typed_payload(payload.clone(), request_type)?;
            handlers::handle_generate_vrf_keypair_bootstrap(
                manager_rc.clone(),
                id.clone(),
                request,
            )
        }
        WorkerRequestType::UnlockVrfKeypair => {
            let request: UnlockVrfKeypairRequest =
                parse_typed_payload(payload.clone(), request_type)?;
            handlers::handle_unlock_vrf_keypair(manager_rc.clone(), id.clone(), request)
        }
        WorkerRequestType::CheckVrfStatus => {
            handlers::handle_check_vrf_status(manager_rc.clone(), id.clone())
        }
        WorkerRequestType::Logout => {
            handlers::handle_logout(manager_rc.clone(), id.clone())
        }
        WorkerRequestType::GenerateVrfChallenge => {
            let request: GenerateVrfChallengeRequest =
                parse_typed_payload(payload.clone(), request_type)?;
            handlers::handle_generate_vrf_challenge(manager_rc.clone(), id.clone(), request)
        }
        WorkerRequestType::DeriveVrfKeypairFromPrf => {
            let request: DeriveVrfKeypairFromPrfRequest =
                parse_typed_payload(payload.clone(), request_type)?;
            handlers::handle_derive_vrf_keypair_from_prf(
                manager_rc.clone(),
                id.clone(),
                request,
            )
            .await
        }
        // Shamir 3‑pass registration
        // Initial VRF encryption is performed in the DERIVE_VRF_KEYPAIR_FROM_PRF handler during registration
        // So this handler is somewhat redundant, but may be useful for future use cases
        WorkerRequestType::Shamir3PassClientEncryptCurrentVrfKeypair => {
            let request: Shamir3PassClientEncryptCurrentVrfKeypairRequest =
                parse_typed_payload(payload.clone(), request_type)?;
            handlers::handle_shamir3pass_client_encrypt_current_vrf_keypair(
                manager_rc.clone(),
                id.clone(),
                request,
            )
            .await
        }
        WorkerRequestType::Shamir3PassClientDecryptVrfKeypair => {
            let request: Shamir3PassClientDecryptVrfKeypairRequest =
                parse_typed_payload(payload.clone(), request_type)?;
            handlers::handle_shamir3pass_client_decrypt_vrf_keypair(
                manager_rc.clone(),
                id.clone(),
                request,
            )
            .await
        }
        // Server-side helpers used by Node relay-server, they lock and unlock the KEK (key encryption key)
        WorkerRequestType::Shamir3PassGenerateServerKeypair => {
            let request: Shamir3PassGenerateServerKeypairRequest =
                parse_typed_payload(payload.clone(), request_type)?;
            handlers::handle_shamir3pass_generate_server_keypair(
                manager_rc.clone(),
                id.clone(),
                request,
            )
        }
        WorkerRequestType::Shamir3PassApplyServerLock => {
            let request: Shamir3PassApplyServerLockRequest =
                parse_typed_payload(payload.clone(), request_type)?;
            handlers::handle_shamir3pass_apply_server_lock_kek(
                manager_rc.clone(),
                id.clone(),
                request,
            )
        }
        WorkerRequestType::Shamir3PassRemoveServerLock => {
            let request: Shamir3PassRemoveServerLockRequest =
                parse_typed_payload(payload.clone(), request_type)?;
            handlers::handle_shamir3pass_remove_server_lock_kek(
                manager_rc.clone(),
                id.clone(),
                request,
            )
        }
        // Configure Shamir p (global) and server URLs
        WorkerRequestType::Shamir3PassConfigP => {
            let request: Shamir3PassConfigPRequest =
                parse_typed_payload(payload.clone(), request_type)?;
            handlers::handle_shamir3pass_config_p(manager_rc.clone(), id.clone(), request)
        }
        WorkerRequestType::Shamir3PassConfigServerUrls => {
            let request: Shamir3PassConfigServerUrlsRequest =
                parse_typed_payload(payload.clone(), request_type)?;
            handlers::handle_shamir3pass_config_server_urls(
                manager_rc.clone(),
                id.clone(),
                request,
            )
        }
        WorkerRequestType::DeriveWrapKeySeedAndSession => {
            let request: DeriveWrapKeySeedAndSessionRequest =
                parse_typed_payload(payload.clone(), request_type)?;
            handlers::handle_derive_wrap_key_seed_and_session(
                manager_rc.clone(),
                id.clone(),
                request,
            )
            .await
        }
        WorkerRequestType::DecryptSession => {
            let request: DecryptSessionRequest =
                parse_typed_payload(payload.clone(), request_type)?;
            handlers::handle_decrypt_session(
                manager_rc.clone(),
                id.clone(),
                request,
            )
            .await
        }
        WorkerRequestType::RegistrationCredentialConfirmation => {
            let request: RegistrationCredentialConfirmationRequest =
                parse_typed_payload(payload.clone(), request_type)?;
            handlers::handle_registration_credential_confirmation(
                manager_rc.clone(),
                id.clone(),
                request,
            )
            .await
        }
        WorkerRequestType::Device2RegistrationSession => {
            let request: Device2RegistrationSessionRequest =
                parse_typed_payload(payload.clone(), request_type)?;
            handlers::handle_device2_registration_session(
                manager_rc.clone(),
                id.clone(),
                request,
            )
            .await
        }
    };

    serde_wasm_bindgen::to_value(&response)
        .map_err(|e| JsValue::from_str(&format!("Failed to serialize response: {}", e)))
}

fn find_forbidden_near_secret(value: &JsValue) -> Option<String> {
    const FORBIDDEN_KEYS: [&str; 1] = ["near_sk"];

    if value.is_null() || value.is_undefined() {
        return None;
    }

    // Check arrays
    if Array::is_array(value) {
        let arr = Array::from(value);
        for elem in arr.iter() {
            if let Some(inner) = find_forbidden_near_secret(&elem) {
                return Some(inner);
            }
        }
        return None;
    }

    // Check plain objects
    if value.is_object() {
        let obj = value.unchecked_ref::<js_sys::Object>();
        let keys = js_sys::Object::keys(obj);
        for key in keys.iter() {
            if let Some(k) = key.as_string() {
                if FORBIDDEN_KEYS.contains(&k.as_str()) {
                    return Some(k);
                }
                if let Ok(child) = Reflect::get(value, &JsValue::from_str(&k)) {
                    if let Some(inner) = find_forbidden_near_secret(&child) {
                        return Some(inner);
                    }
                }
            }
        }
    }

    None
}
