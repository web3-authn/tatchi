use wasm_bindgen::prelude::*;
use wasm_bindgen::JsValue;
use std::cell::RefCell;
use std::rc::Rc;

// Import log macros
use log::{info, debug};

mod config;
mod errors;
mod handlers;
mod manager;
mod sra_bindings;
mod tests;
mod types;
mod utils;

// Re-export important types and functions
pub use config::*;
pub use errors::*;
pub use handlers::*;
pub use manager::*;
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
pub fn handle_message(message: JsValue) -> Result<JsValue, JsValue> {
    // Convert JsValue to JSON string first, then parse
    let message_str = stringify(&message)
        .as_string()
        .ok_or_else(|| JsValue::from_str("Failed to stringify message"))?;

    let message: VRFWorkerMessage = serde_json::from_str(&message_str)
        .map_err(|e| JsValue::from_str(&format!("Failed to parse message: {}", e)))?;

    debug!("Received message: {}", message.msg_type);

    let response = VRF_MANAGER.with(|manager| {
        match message.msg_type.as_str() {
            "PING" => handle_ping(message.id),
            "UNLOCK_VRF_KEYPAIR" => handle_unlock_vrf_keypair(manager, message.id, message.data),
            "GENERATE_VRF_CHALLENGE" => handle_generate_vrf_challenge(manager, message.id, message.data),
            "GENERATE_VRF_KEYPAIR_BOOTSTRAP" => handle_generate_vrf_keypair_bootstrap(manager, message.id, message.data),
            "ENCRYPT_VRF_KEYPAIR_WITH_PRF" => handle_encrypt_vrf_keypair_with_prf(manager, message.id, message.data),
            "CHECK_VRF_STATUS" => handle_check_vrf_status(manager, message.id),
            "LOGOUT" => handle_logout(manager, message.id),
            "DERIVE_VRF_KEYPAIR_FROM_PRF" => handle_derive_vrf_keypair_from_prf(manager, message.id, message.data),
            _ => handle_unknown_message(message.msg_type, message.id),
        }
    });

    // Convert response to JsValue
    let response_json = serde_json::to_string(&response)
        .map_err(|e| JsValue::from_str(&format!("Failed to serialize response: {}", e)))?;

    Ok(parse(&response_json))
}
