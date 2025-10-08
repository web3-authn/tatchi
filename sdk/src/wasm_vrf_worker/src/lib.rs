use log::{debug, info};
use std::cell::RefCell;
use std::rc::Rc;
use wasm_bindgen::prelude::*;
use wasm_bindgen::JsValue;

mod config;
mod errors;
mod handlers;
mod http;
mod manager;
mod shamir3pass;
mod tests;
mod types;
mod utils;

// Re-export important types and functions
pub use config::*;
pub use errors::*;
pub use manager::*;
pub use shamir3pass::*;
pub use utils::*;

// Import specific types to avoid ambiguity
pub use types::{VrfWorkerMessage, VrfWorkerResponse, WorkerRequestType};

// Import request types from their respective handler files
pub use handlers::handle_derive_vrf_keypair_from_prf::DeriveVrfKeypairFromPrfRequest;
pub use handlers::handle_generate_vrf_challenge::GenerateVrfChallengeRequest;
pub use handlers::handle_generate_vrf_keypair_bootstrap::GenerateVrfKeypairBootstrapRequest;
pub use handlers::handle_shamir3pass_client::{
    Shamir3PassClientDecryptVrfKeypairRequest, Shamir3PassClientEncryptCurrentVrfKeypairRequest,
};
pub use handlers::handle_shamir3pass_config::{
    Shamir3PassConfigPRequest, Shamir3PassConfigServerUrlsRequest,
};
pub use handlers::handle_shamir3pass_server::{
    Shamir3PassApplyServerLockRequest, Shamir3PassGenerateServerKeypairRequest,
    Shamir3PassRemoveServerLockRequest,
};
pub use handlers::handle_unlock_vrf_keypair::UnlockVrfKeypairRequest;

// Import JSON functions for message serialization
#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_namespace = JSON)]
    fn stringify(obj: &JsValue) -> JsValue;
    #[wasm_bindgen(js_namespace = JSON)]
    fn parse(text: &str) -> JsValue;
}

// Set up panic hook for better error messages
#[wasm_bindgen(start)]
pub fn main() {
    console_error_panic_hook::set_once();
    // Initialize logger with the configured log level
    wasm_logger::init(wasm_logger::Config::new(config::CURRENT_LOG_LEVEL));
    debug!("VRF WASM Worker starting up...");
    debug!(
        "Logging system initialized with level: {:?}",
        config::CURRENT_LOG_LEVEL
    );
}

// === GLOBAL STATE ===

thread_local! {
    static VRF_MANAGER: Rc<RefCell<VRFKeyManager>> = Rc::new(RefCell::new(VRFKeyManager::new(None, None, None, None)));
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

// === WASM EXPORTS ===

#[wasm_bindgen]
pub async fn handle_message(message: JsValue) -> Result<JsValue, JsValue> {
    // Convert JsValue to JSON string first, then parse
    let message_str = stringify(&message)
        .as_string()
        .ok_or_else(|| JsValue::from_str("Failed to stringify message"))?;

    let message: VrfWorkerMessage = serde_json::from_str(&message_str)
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
    };

    // Convert response to JsValue
    let response_json = serde_json::to_string(&response)
        .map_err(|e| JsValue::from_str(&format!("Failed to serialize response: {}", e)))?;

    Ok(parse(&response_json))
}
