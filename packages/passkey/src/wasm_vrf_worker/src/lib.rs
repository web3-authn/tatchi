use wasm_bindgen::prelude::*;
use wasm_bindgen::JsValue;
use std::cell::RefCell;
use std::rc::Rc;
use log::{info, debug};

mod config;
mod errors;
mod handlers;
mod manager;
mod shamir3pass;
mod tests;
mod http;
mod types;
mod utils;

// Re-export important types and functions
pub use config::*;
pub use errors::*;
pub use handlers::*;
pub use manager::*;
pub use shamir3pass::*;
pub use types::*;
pub use utils::*;

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

    info!("VRF WASM Worker starting up...");
    debug!("Logging system initialized with level: {:?}", config::CURRENT_LOG_LEVEL);
}

// === GLOBAL STATE ===

thread_local! {
    static VRF_MANAGER: Rc<RefCell<VRFKeyManager>> = Rc::new(RefCell::new(VRFKeyManager::new()));
}

// === WASM EXPORTS ===

#[wasm_bindgen]
pub async fn handle_message(message: JsValue) -> Result<JsValue, JsValue> {

    // Convert JsValue to JSON string first, then parse
    let message_str = stringify(&message).as_string()
        .ok_or_else(|| JsValue::from_str("Failed to stringify message"))?;

    let message: VRFWorkerMessage = serde_json::from_str(&message_str)
        .map_err(|e| JsValue::from_str(&format!("Failed to parse message: {}", e)))?;

    debug!("Received message: {}", message.msg_type);

    let manager_rc = VRF_MANAGER.with(|m| m.clone());

    let response = match message.msg_type.as_str() {
        // Test VRF worker health
        "PING" => handle_ping(message.id),
        // Bootstrap VRF keypair + challenge generation (only for registration)
        "GENERATE_VRF_CHALLENGE" => handle_generate_vrf_challenge(manager_rc.clone(), message.id, message.data),
        "GENERATE_VRF_KEYPAIR_BOOTSTRAP" => handle_generate_vrf_keypair_bootstrap(manager_rc.clone(), message.id, message.data),
        "UNLOCK_VRF_KEYPAIR" => handle_unlock_vrf_keypair(manager_rc.clone(), message.id, message.data),
        "ENCRYPT_VRF_KEYPAIR_WITH_PRF" => handle_encrypt_vrf_keypair_with_prf(manager_rc.clone(), message.id, message.data),
        "CHECK_VRF_STATUS" => handle_check_vrf_status(manager_rc.clone(), message.id),
        "LOGOUT" => handle_logout(manager_rc.clone(), message.id),
        "DERIVE_VRF_KEYPAIR_FROM_PRF" => handle_derive_vrf_keypair_from_prf(manager_rc.clone(), message.id, message.data).await,
        // Shamir 3‑pass registration
        // Initial VRF encryption is performed in the DERIVE_VRF_KEYPAIR_FROM_PRF handler during registration
        // So this handler is somewhat redundant, but may be useful for future use cases
        "SHAMIR3PASS_CLIENT_ENCRYPT_CURRENT_VRF_KEYPAIR" => handle_shamir3pass_client_encrypt_current_vrf_keypair(manager_rc.clone(), message.id, message.data).await,
        "SHAMIR3PASS_CLIENT_DECRYPT_VRF_KEYPAIR" => handle_shamir3pass_client_decrypt_vrf_keypair(manager_rc.clone(), message.id, message.data).await,
        // Server-side helpers used by Node relay-server, they lock and unlock the KEK (key encryption key)
        "SHAMIR3PASS_GENERATE_SERVER_KEYPAIR" => handle_shamir3pass_generate_server_keypair(message.id, message.data),
        "SHAMIR3PASS_APPLY_SERVER_LOCK_KEK" => handle_shamir3pass_apply_server_lock_kek(message.id, message.data),
        "SHAMIR3PASS_REMOVE_SERVER_LOCK_KEK" => handle_shamir3pass_remove_server_lock_kek(message.id, message.data),
        _ => handle_unknown_message(message.msg_type, message.id),
    };

    // Convert response to JsValue
    let response_json = serde_json::to_string(&response)
        .map_err(|e| JsValue::from_str(&format!("Failed to serialize response: {}", e)))?;

    Ok(parse(&response_json))
}
