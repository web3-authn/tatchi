use log::debug;
use serde_json::Value;
use std::cell::RefCell;
use std::rc::Rc;
use wasm_bindgen::prelude::*;
use wasm_bindgen::JsValue;
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

// Import JSON functions for message serialization
#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_namespace = JSON)]
    fn stringify(obj: &JsValue) -> JsValue;
    #[wasm_bindgen(js_namespace = JSON)]
    fn parse(text: &str) -> JsValue;

    /// JS bridge exposed from web3authn-vrf.worker.ts:
    ///   (globalThis as any).awaitSecureConfirmationV2 = awaitSecureConfirmationV2;
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
    let value: serde_json::Value = serde_wasm_bindgen::from_value(js_val)
        .map_err(|e| format!("Failed to deserialize confirmation response: {}", e))?;
    serde_json::from_value::<WorkerConfirmationResponse>(value)
        .map_err(|e| format!("Invalid WorkerConfirmationResponse shape: {}", e))
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
    // Convert JsValue to JSON string first, then parse
    let message_str = stringify(&message)
        .as_string()
        .ok_or_else(|| JsValue::from_str("Failed to stringify message"))?;

    let raw_value: Value = serde_json::from_str(&message_str)
        .map_err(|e| JsValue::from_str(&format!("Failed to parse message: {}", e)))?;

    if let Some(key) = find_forbidden_near_secret(&raw_value) {
        return Err(JsValue::from_str(&format!(
            "Forbidden secret field in VRF payload: {}",
            key
        )));
    }

    let message: VrfWorkerMessage = serde_json::from_value(raw_value)
        .map_err(|e| JsValue::from_str(&format!("Failed to parse message: {}", e)))?;

    // Identify the message type using WorkerRequestType
    debug!("Received message: {}", message.msg_type);
    let request_type = WorkerRequestType::from(message.msg_type.as_str());

    let manager_rc = VRF_MANAGER.with(|m| m.clone());

    let response = match request_type {
        // Test VRF worker health
        WorkerRequestType::Ping => handlers::handle_ping(message.id),
        // Bootstrap VRF keypair + challenge generation (only for registration)
        WorkerRequestType::GenerateVrfKeypairBootstrap => {
            handlers::handle_generate_vrf_keypair_bootstrap(
                manager_rc.clone(),
                message.id.clone(),
                message.parse_payload(request_type).map_err(JsValue::from)?,
            )
        }
        WorkerRequestType::UnlockVrfKeypair => handlers::handle_unlock_vrf_keypair(
            manager_rc.clone(),
            message.id.clone(),
            message.parse_payload(request_type).map_err(JsValue::from)?,
        ),
        WorkerRequestType::CheckVrfStatus => {
            handlers::handle_check_vrf_status(manager_rc.clone(), message.id.clone())
        }
        WorkerRequestType::Logout => {
            handlers::handle_logout(manager_rc.clone(), message.id.clone())
        }
        WorkerRequestType::GenerateVrfChallenge => handlers::handle_generate_vrf_challenge(
            manager_rc.clone(),
            message.id.clone(),
            message.parse_payload(request_type).map_err(JsValue::from)?,
        ),
        WorkerRequestType::DeriveVrfKeypairFromPrf => {
            handlers::handle_derive_vrf_keypair_from_prf(
                manager_rc.clone(),
                message.id.clone(),
                message.parse_payload(request_type).map_err(JsValue::from)?,
            )
            .await
        }
        // Shamir 3‑pass registration
        // Initial VRF encryption is performed in the DERIVE_VRF_KEYPAIR_FROM_PRF handler during registration
        // So this handler is somewhat redundant, but may be useful for future use cases
        WorkerRequestType::Shamir3PassClientEncryptCurrentVrfKeypair => {
            handlers::handle_shamir3pass_client_encrypt_current_vrf_keypair(
                manager_rc.clone(),
                message.id.clone(),
                message.parse_payload(request_type).map_err(JsValue::from)?,
            )
            .await
        }
        WorkerRequestType::Shamir3PassClientDecryptVrfKeypair => {
            handlers::handle_shamir3pass_client_decrypt_vrf_keypair(
                manager_rc.clone(),
                message.id.clone(),
                message.parse_payload(request_type).map_err(JsValue::from)?,
            )
            .await
        }
        // Server-side helpers used by Node relay-server, they lock and unlock the KEK (key encryption key)
        WorkerRequestType::Shamir3PassGenerateServerKeypair => {
            handlers::handle_shamir3pass_generate_server_keypair(
                manager_rc.clone(),
                message.id.clone(),
                message.parse_payload(request_type).map_err(JsValue::from)?,
            )
        }
        WorkerRequestType::Shamir3PassApplyServerLock => {
            handlers::handle_shamir3pass_apply_server_lock_kek(
                manager_rc.clone(),
                message.id.clone(),
                message.parse_payload(request_type).map_err(JsValue::from)?,
            )
        }
        WorkerRequestType::Shamir3PassRemoveServerLock => {
            handlers::handle_shamir3pass_remove_server_lock_kek(
                manager_rc.clone(),
                message.id.clone(),
                message.parse_payload(request_type).map_err(JsValue::from)?,
            )
        }
        // Configure Shamir p (global) and server URLs
        WorkerRequestType::Shamir3PassConfigP => handlers::handle_shamir3pass_config_p(
            manager_rc.clone(),
            message.id.clone(),
            message.parse_payload(request_type).map_err(JsValue::from)?,
        ),
        WorkerRequestType::Shamir3PassConfigServerUrls => {
            handlers::handle_shamir3pass_config_server_urls(
                manager_rc.clone(),
                message.id.clone(),
                message.parse_payload(request_type).map_err(JsValue::from)?,
            )
        }
        WorkerRequestType::DeriveWrapKeySeedAndSession => {
            handlers::handle_derive_wrap_key_seed_and_session(
                manager_rc.clone(),
                message.id.clone(),
                message
                    .parse_payload::<DeriveWrapKeySeedAndSessionRequest>(request_type)
                    .map_err(JsValue::from)?,
            )
            .await
        }
        WorkerRequestType::DecryptSession => {
            handlers::handle_decrypt_session(
                manager_rc.clone(),
                message.id.clone(),
                message
                    .parse_payload(request_type)
                    .map_err(JsValue::from)?,
            )
            .await
        }
        WorkerRequestType::RegistrationCredentialConfirmation => {
            handlers::handle_registration_credential_confirmation(
                manager_rc.clone(),
                message.id.clone(),
                message
                    .parse_payload(request_type)
                    .map_err(JsValue::from)?,
            )
            .await
        }
        WorkerRequestType::Device2RegistrationSession => {
            handlers::handle_device2_registration_session(
                manager_rc.clone(),
                message.id.clone(),
                message
                    .parse_payload(request_type)
                    .map_err(JsValue::from)?,
            )
            .await
        }
    };

    // Convert response to JsValue
    let response_json = serde_json::to_string(&response)
        .map_err(|e| JsValue::from_str(&format!("Failed to serialize response: {}", e)))?;

    Ok(parse(&response_json))
}

fn find_forbidden_near_secret(value: &Value) -> Option<String> {
    const FORBIDDEN_KEYS: [&str; 1] = ["near_sk"];
    match value {
        Value::Object(map) => {
            for (k, v) in map {
                if FORBIDDEN_KEYS.contains(&k.as_str()) {
                    return Some(k.clone());
                }
                if let Some(inner) = find_forbidden_near_secret(v) {
                    return Some(inner);
                }
            }
            None
        }
        Value::Array(arr) => {
            for v in arr {
                if let Some(inner) = find_forbidden_near_secret(v) {
                    return Some(inner);
                }
            }
            None
        }
        _ => None,
    }
}
