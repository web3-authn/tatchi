mod actions;
mod config;
mod cose;
mod crypto;
mod encoders;
mod error;
mod handlers;
#[cfg(test)]
mod tests;
mod transaction;
mod types;

use serde_json;
use wasm_bindgen::prelude::*;
use log::debug;
#[cfg(target_arch = "wasm32")]
use wasm_bindgen::JsCast;
#[cfg(target_arch = "wasm32")]
use wasm_bindgen::closure::Closure;
#[cfg(target_arch = "wasm32")]
use web_sys::{MessageEvent, MessagePort};
use std::cell::RefCell;
use std::collections::HashMap;

use crate::types::worker_messages::{
    SignerWorkerMessage, SignerWorkerResponse, WorkerRequestType, WorkerResponseType,
};
use crate::types::*;

pub use handlers::handle_decrypt_private_key_with_prf::{
    handle_decrypt_private_key_with_prf,
    DecryptPrivateKeyRequest,
    DecryptPrivateKeyResult,
};
pub use handlers::handle_derive_near_keypair_and_encrypt::{
    handle_derive_near_keypair_and_encrypt,
    DeriveNearKeypairAndEncryptRequest,
    DeriveNearKeypairAndEncryptResult,
};
pub use handlers::{
    CoseExtractionResult,
    // Extract Cose Public Key
    ExtractCoseRequest,
    KeyActionResult,
    // Recover Account
    RecoverKeypairRequest,
    RecoverKeypairResult,
    // Sign Nep413 Message
    SignNep413Request,
    SignNep413Result,
    // Sign Transaction With Key Pair
    SignTransactionWithKeyPairRequest,
    // Execute Actions
    SignTransactionsWithActionsRequest,
    TransactionPayload,
    // Delegate Actions
    DelegatePayload,
    DelegateSignResult,
    SignDelegateActionRequest,
    // Combined Device2 Registration
    RegisterDevice2WithDerivedKeyRequest,
    RegisterDevice2WithDerivedKeyResult,
};

// Re-export NEAR types for TypeScript usage
pub use types::near::{
    DelegateAction,
    PublicKey,
    Signature,
    SignedDelegate,
    SignedTransaction,
    Transaction,
};
// Re-export progress types for auto-generation
pub use types::progress::{
    ProgressMessageType, ProgressStatus, ProgressStep, WorkerProgressMessage,
};
// Re-export WASM-friendly wrapper types for TypeScript usage
pub use types::wasm_to_json::{
    WasmDelegateAction,
    WasmPublicKey,
    WasmSignature,
    WasmSignedDelegate,
    WasmSignedTransaction,
    WasmTransaction,
};

// === CONSOLE LOGGING ===

#[cfg(target_arch = "wasm32")]
#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_namespace = console)]
    pub fn log(s: &str);
    #[wasm_bindgen(js_namespace = console, js_name = warn)]
    pub fn warn(s: &str);
    #[wasm_bindgen(js_namespace = console, js_name = error)]
    pub fn error(s: &str);
}

#[cfg(not(target_arch = "wasm32"))]
pub fn log(s: &str) {
    println!("{}", s);
}

#[cfg(not(target_arch = "wasm32"))]
pub fn warn(s: &str) {
    println!("Warning: {}", s);
}

#[cfg(not(target_arch = "wasm32"))]
pub fn error(s: &str) {
    println!("Error: {}", s);
}

pub use crate::crypto::WrapKey;

thread_local! {
    static WRAP_KEY_SEED_SESSIONS: RefCell<HashMap<String, WrapKey>> = RefCell::new(HashMap::new());
    static SESSION_PRF_OUTPUTS: RefCell<HashMap<String, String>> = RefCell::new(HashMap::new());
}

#[wasm_bindgen]
pub fn init_worker() {
    console_error_panic_hook::set_once();
    // Initialize WASM logger respecting configured level
    wasm_logger::init(wasm_logger::Config::new(config::CURRENT_LOG_LEVEL));
}

/// Alias for init_worker to maintain compatibility with bundlers that auto-generate
/// imports based on the module name (e.g., Rolldown)
#[wasm_bindgen(js_name = "init_wasm_signer_worker")]
pub fn init_wasm_signer_worker() {
    init_worker();
}

/// Attach a MessagePort for a signing session and store WrapKeySeed material in Rust.
/// JS shim should transfer the port; all parsing/caching lives here.
#[wasm_bindgen]
pub fn attach_wrap_key_seed_port(session_id: String, port_val: JsValue) {
    #[cfg(target_arch = "wasm32")]
    {
        let Some(port) = port_val.dyn_ref::<MessagePort>() else {
            // Not a MessagePort; nothing to attach.
            return;
        };

        let sid = session_id.clone();
        let on_message = move |event: MessageEvent| {
            let Ok(data) = js_sys::Reflect::get(&event, &JsValue::from_str("data")) else {
                return;
            };

            let wrap_key_seed = js_sys::Reflect::get(&data, &JsValue::from_str("wrap_key_seed"))
                .ok()
                .and_then(|v| v.as_string());
            let wrap_key_salt = js_sys::Reflect::get(&data, &JsValue::from_str("wrapKeySalt"))
                .ok()
                .and_then(|v| v.as_string());
            let prf_second = js_sys::Reflect::get(&data, &JsValue::from_str("prfSecond"))
                .ok()
                .and_then(|v| v.as_string());

            if let (Some(seed), Some(salt)) = (wrap_key_seed, wrap_key_salt) {
                WRAP_KEY_SEED_SESSIONS.with(|map| {
                    map.borrow_mut().insert(
                        sid.clone(),
                        WrapKey {
                            wrap_key_seed: seed,
                            wrap_key_salt: salt,
                        },
                    );
                });

                // Store PRF.second if present (used in Device2 registration flow)
                if let Some(prf_second_b64u) = prf_second {
                    if !prf_second_b64u.is_empty() {
                        SESSION_PRF_OUTPUTS.with(|map| {
                            map.borrow_mut().insert(sid.clone(), prf_second_b64u);
                        });
                    }
                }

                // Notify JS that the WrapKeySeed is now ready for this session
                #[wasm_bindgen]
                extern "C" {
                    #[wasm_bindgen(js_name = notifyWrapKeySeedReady)]
                    fn notify_wrap_key_seed_ready_js(session_id: &str);
                }
                notify_wrap_key_seed_ready_js(&sid);
            }
        };

        let closure = Closure::<dyn FnMut(MessageEvent)>::wrap(Box::new(on_message));
        port.set_onmessage(Some(closure.as_ref().unchecked_ref()));
        port.start();
        // Keep the closure alive for the lifetime of the port
        closure.forget();
    }

    #[cfg(not(target_arch = "wasm32"))]
    {
        let _ = session_id;
        let _ = port_val;
    }
}

// === PROGRESS MESSAGING ===

/// Progress messaging function that sends messages back to main thread
/// Used by handlers to provide real-time updates during long operations
/// Now includes both numeric enum values AND string names for better debugging
pub fn send_progress_message(message_type: u32, step: u32, message: &str, _data: &str) {
    // Create structured logs array (empty for now, can be enhanced later)
    let _logs_json = "[]";

    // Call the TypeScript sendProgressMessage function that was made globally available
    // This replaces the direct postMessage approach
    #[wasm_bindgen]
    extern "C" {
        #[wasm_bindgen(js_name = sendProgressMessage)]
        fn send_progress_message_js(
            message_type: u32,
            message_type_name: &str,
            step: u32,
            step_name: &str,
            message: &str,
            data: &str,
            logs: &str,
        );
    }

    // Convert numeric enums back to their string names for debugging
    let message_type_name = match ProgressMessageType::try_from(message_type) {
        Ok(msg_type) => progress_message_type_name(msg_type),
        Err(_) => "UNKNOWN_MESSAGE_TYPE",
    };

    let step_name = match ProgressStep::try_from(step) {
        Ok(step_enum) => progress_step_name(step_enum),
        Err(_) => "unknown-step",
    };

    // Only try to send message in WASM context
    #[cfg(target_arch = "wasm32")]
    {
        send_progress_message_js(
            message_type,
            message_type_name,
            step,
            step_name,
            message,
            _data,
            _logs_json,
        );
    }

    #[cfg(not(target_arch = "wasm32"))]
    {
        // In non-WASM context (like tests), just log the progress
        println!(
            "Progress: {} ({}) - {} ({}) - {}",
            message_type_name, message_type, step_name, step, message
        );
    }
}

// === MESSAGE HANDLER FUNCTIONS ===

/// Unified message handler for all signer worker operations
/// This replaces the TypeScript-based message dispatching with a Rust-based approach
/// for better type safety and performance
#[wasm_bindgen]
pub async fn handle_signer_message(message_json: &str) -> Result<String, JsValue> {
    init_worker();

    // Parse the JSON message
    let msg: SignerWorkerMessage = serde_json::from_str(message_json)
        .map_err(|e| JsValue::from_str(&format!("Failed to parse message: {:?}", e)))?;

    // Convert numeric enum to WorkerRequestType using From trait
    let request_type = WorkerRequestType::from(msg.msg_type);

    debug!(
        "WASM Worker: Received message type: {} ({})",
        worker_request_type_name(request_type),
        msg.msg_type
    );

    // Route message to appropriate handler
    let response_payload = match request_type {
        WorkerRequestType::DeriveNearKeypairAndEncrypt => {
            let request = msg.parse_payload::<DeriveNearKeypairAndEncryptRequest>(request_type)?;
            let wrap_key = lookup_wrap_key_shards(&request.session_id, request_type)?;
            let prf_second_b64u = lookup_prf_second(&request.session_id, request_type)?;
            let result = handlers::handle_derive_near_keypair_and_encrypt(
                request,
                wrap_key,
                prf_second_b64u,
            )
            .await?;
            result.to_json()
        }
        WorkerRequestType::RecoverKeypairFromPasskey => {
            let request = msg.parse_payload::<RecoverKeypairRequest>(request_type)?;
            let wrap_key = lookup_wrap_key_shards(&request.session_id, request_type)?;
            let result = handlers::handle_recover_keypair_from_passkey(request, wrap_key).await?;
            result.to_json()
        }
        WorkerRequestType::DecryptPrivateKeyWithPrf => {
            let request = msg.parse_payload::<DecryptPrivateKeyRequest>(request_type)?;
            let wrap_key = lookup_wrap_key_shards(&request.session_id, request_type)?;
            let result = handlers::handle_decrypt_private_key_with_prf(
                request,
                wrap_key,
            )
            .await?;
            result.to_json()
        }
        WorkerRequestType::SignTransactionsWithActions => {
            let request =
                msg.parse_payload::<SignTransactionsWithActionsRequest>(request_type)?;
            let wrap_key = lookup_wrap_key_shards(&request.session_id, request_type)?;
            let result = handlers::handle_sign_transactions_with_actions(
                request,
                wrap_key,
            )
            .await?;
            result.to_json()
        }
        WorkerRequestType::SignDelegateAction => {
            let request = msg.parse_payload::<SignDelegateActionRequest>(request_type)?;
            let wrap_key = lookup_wrap_key_shards(&request.session_id, request_type)?;
            let result = handlers::handle_sign_delegate_action(request, wrap_key).await?;
            result.to_json()
        }
        WorkerRequestType::ExtractCosePublicKey => {
            let request = msg.parse_payload::<ExtractCoseRequest>(request_type)?;
            let result = handlers::handle_extract_cose_public_key(request).await?;
            result.to_json()
        }
        // NOTE: Does not need wrapKeySeed, wrapKeySalt -> MessagePort
        // The only method that does not require VRF Worker to sign
        WorkerRequestType::SignTransactionWithKeyPair => {
            let request = msg.parse_payload::<SignTransactionWithKeyPairRequest>(request_type)?;
            let result = handlers::handle_sign_transaction_with_keypair(request).await?;
            result.to_json()
        }
        WorkerRequestType::SignNep413Message => {
            let request = msg.parse_payload::<SignNep413Request>(request_type)?;
            let wrap_key = lookup_wrap_key_shards(&request.session_id, request_type)?;
            let result = handlers::handle_sign_nep413_message(
                request,
                wrap_key,
            )
            .await?;
            result.to_json()
        }
        WorkerRequestType::ExportNearKeypairUI => {
            let request = msg.parse_payload::<handlers::ExportNearKeypairUiRequest>(request_type)?;
            let result = handlers::handle_export_near_keypair_ui(request).await?;
            result.to_json()
        }
        WorkerRequestType::RegisterDevice2WithDerivedKey => {
            let request = msg.parse_payload::<handlers::RegisterDevice2WithDerivedKeyRequest>(request_type)?;
            let wrap_key = lookup_wrap_key_shards(&request.session_id, request_type)?;
            let prf_second_b64u = lookup_prf_second(&request.session_id, request_type)?;
            let result = handlers::handle_register_device2_with_derived_key(
                request,
                wrap_key,
                prf_second_b64u,
            )
            .await?;
            result.to_json()
        }
    };

    // Handle the result and determine response type
    let (response_type, response_payload) = match response_payload {
        Ok(message) => {
            // Success case - map request type to success response type
            let success_response_type = match request_type {
                WorkerRequestType::DeriveNearKeypairAndEncrypt => {
                    WorkerResponseType::DeriveNearKeypairAndEncryptSuccess
                }
                WorkerRequestType::RecoverKeypairFromPasskey => {
                    WorkerResponseType::RecoverKeypairFromPasskeySuccess
                }
                WorkerRequestType::DecryptPrivateKeyWithPrf => {
                    WorkerResponseType::DecryptPrivateKeyWithPrfSuccess
                }
                WorkerRequestType::SignTransactionsWithActions => {
                    WorkerResponseType::SignTransactionsWithActionsSuccess
                }
                WorkerRequestType::SignDelegateAction => {
                    WorkerResponseType::SignDelegateActionSuccess
                }
                WorkerRequestType::ExtractCosePublicKey => {
                    WorkerResponseType::ExtractCosePublicKeySuccess
                }
                WorkerRequestType::SignTransactionWithKeyPair => {
                    WorkerResponseType::SignTransactionWithKeyPairSuccess
                }
                WorkerRequestType::SignNep413Message => {
                    WorkerResponseType::SignNep413MessageSuccess
                }
                WorkerRequestType::ExportNearKeypairUI => {
                    WorkerResponseType::ExportNearKeypairUiSuccess
                }
                WorkerRequestType::RegisterDevice2WithDerivedKey => {
                    WorkerResponseType::RegisterDevice2WithDerivedKeySuccess
                }
            };
            (success_response_type, message)
        }
        Err(error) => {
            // Failure case - map request type to failure response type
            let failure_response_type = match request_type {
                WorkerRequestType::DeriveNearKeypairAndEncrypt => {
                    WorkerResponseType::DeriveNearKeypairAndEncryptFailure
                }
                WorkerRequestType::RecoverKeypairFromPasskey => {
                    WorkerResponseType::RecoverKeypairFromPasskeyFailure
                }
                WorkerRequestType::DecryptPrivateKeyWithPrf => {
                    WorkerResponseType::DecryptPrivateKeyWithPrfFailure
                }
                WorkerRequestType::SignTransactionsWithActions => {
                    WorkerResponseType::SignTransactionsWithActionsFailure
                }
                WorkerRequestType::SignDelegateAction => {
                    WorkerResponseType::SignDelegateActionFailure
                }
                WorkerRequestType::ExtractCosePublicKey => {
                    WorkerResponseType::ExtractCosePublicKeyFailure
                }
                WorkerRequestType::SignTransactionWithKeyPair => {
                    WorkerResponseType::SignTransactionWithKeyPairFailure
                }
                WorkerRequestType::SignNep413Message => {
                    WorkerResponseType::SignNep413MessageFailure
                }
                WorkerRequestType::ExportNearKeypairUI => {
                    WorkerResponseType::ExportNearKeypairUiFailure
                }
                WorkerRequestType::RegisterDevice2WithDerivedKey => {
                    WorkerResponseType::RegisterDevice2WithDerivedKeyFailure
                }
            };
            let error_payload = serde_json::json!({
                "error": error,
                "context": { "type": msg.msg_type }
            });
            (failure_response_type, error_payload)
        }
    };

    // Debug logging for response type
    debug!(
        "WASM Worker: Determined response type: {} ({}) - {:?}",
        worker_response_type_name(response_type),
        u32::from(response_type),
        response_type
    );

    // Create the final response
    let response = SignerWorkerResponse {
        response_type: u32::from(response_type),
        payload: response_payload,
    };

    // Return JSON string
    serde_json::to_string(&response)
        .map_err(|e| JsValue::from_str(&format!("Failed to serialize response: {:?}", e)))
}

fn lookup_wrap_key_shards(session_id: &str, _request_type: WorkerRequestType) -> Result<WrapKey, JsValue> {
    let material = WRAP_KEY_SEED_SESSIONS.with(|map| map.borrow().get(session_id).cloned());
    let Some(mat) = material else {
        return Err(JsValue::from_str(&format!(
            "Missing WrapKeySeed for session {}",
            session_id
        )));
    };

    Ok(mat)
}

fn lookup_prf_second(session_id: &str, _request_type: WorkerRequestType) -> Result<String, JsValue> {
    let prf_second = SESSION_PRF_OUTPUTS.with(|map| map.borrow().get(session_id).cloned());
    let Some(prf) = prf_second else {
        return Err(JsValue::from_str(&format!(
            "Missing PRF.second for session {}",
            session_id
        )));
    };

    Ok(prf)
}

// === DEBUGGING HELPERS ===
// Convert numeric enum values to readable strings for debugging
// Makes Rust logs much easier to read when dealing with wasm-bindgen numeric enums

/// Convert WorkerRequestType enum to readable string for debugging
pub fn worker_request_type_name(request_type: WorkerRequestType) -> &'static str {
    match request_type {
        WorkerRequestType::DeriveNearKeypairAndEncrypt => "DERIVE_NEAR_KEYPAIR_AND_ENCRYPT",
        WorkerRequestType::RecoverKeypairFromPasskey => "RECOVER_KEYPAIR_FROM_PASSKEY",
        WorkerRequestType::DecryptPrivateKeyWithPrf => "DECRYPT_PRIVATE_KEY_WITH_PRF",
        WorkerRequestType::SignTransactionsWithActions => "SIGN_TRANSACTIONS_WITH_ACTIONS",
        WorkerRequestType::SignDelegateAction => "SIGN_DELEGATE_ACTION",
        WorkerRequestType::ExtractCosePublicKey => "EXTRACT_COSE_PUBLIC_KEY",
        WorkerRequestType::SignTransactionWithKeyPair => "SIGN_TRANSACTION_WITH_KEYPAIR",
        WorkerRequestType::SignNep413Message => "SIGN_NEP413_MESSAGE",
        WorkerRequestType::ExportNearKeypairUI => "EXPORT_NEAR_KEYPAIR_UI",
        WorkerRequestType::RegisterDevice2WithDerivedKey => "REGISTER_DEVICE2_WITH_DERIVED_KEY",
    }
}

/// Convert WorkerResponseType enum to readable string for debugging
pub fn worker_response_type_name(response_type: WorkerResponseType) -> &'static str {
    match response_type {
        // Success responses
        WorkerResponseType::DeriveNearKeypairAndEncryptSuccess => {
            "DERIVE_NEAR_KEYPAIR_AND_ENCRYPT_SUCCESS"
        }
        WorkerResponseType::RecoverKeypairFromPasskeySuccess => {
            "RECOVER_KEYPAIR_FROM_PASSKEY_SUCCESS"
        }
        WorkerResponseType::DecryptPrivateKeyWithPrfSuccess => {
            "DECRYPT_PRIVATE_KEY_WITH_PRF_SUCCESS"
        }
        WorkerResponseType::SignTransactionsWithActionsSuccess => {
            "SIGN_TRANSACTIONS_WITH_ACTIONS_SUCCESS"
        }
        WorkerResponseType::SignDelegateActionSuccess => "SIGN_DELEGATE_ACTION_SUCCESS",
        WorkerResponseType::ExtractCosePublicKeySuccess => "EXTRACT_COSE_PUBLIC_KEY_SUCCESS",
        WorkerResponseType::SignTransactionWithKeyPairSuccess => {
            "SIGN_TRANSACTION_WITH_KEYPAIR_SUCCESS"
        }
        WorkerResponseType::SignNep413MessageSuccess => "SIGN_NEP413_MESSAGE_SUCCESS",
        WorkerResponseType::ExportNearKeypairUiSuccess => "EXPORT_NEAR_KEYPAIR_UI_SUCCESS",
        WorkerResponseType::RegisterDevice2WithDerivedKeySuccess => {
            "REGISTER_DEVICE2_WITH_DERIVED_KEY_SUCCESS"
        }

        // Failure responses
        WorkerResponseType::DeriveNearKeypairAndEncryptFailure => {
            "DERIVE_NEAR_KEYPAIR_AND_ENCRYPT_FAILURE"
        }
        WorkerResponseType::RecoverKeypairFromPasskeyFailure => {
            "RECOVER_KEYPAIR_FROM_PASSKEY_FAILURE"
        }
        WorkerResponseType::DecryptPrivateKeyWithPrfFailure => {
            "DECRYPT_PRIVATE_KEY_WITH_PRF_FAILURE"
        }
        WorkerResponseType::SignTransactionsWithActionsFailure => {
            "SIGN_TRANSACTIONS_WITH_ACTIONS_FAILURE"
        }
        WorkerResponseType::SignDelegateActionFailure => "SIGN_DELEGATE_ACTION_FAILURE",
        WorkerResponseType::ExtractCosePublicKeyFailure => "EXTRACT_COSE_PUBLIC_KEY_FAILURE",
        WorkerResponseType::SignTransactionWithKeyPairFailure => {
            "SIGN_TRANSACTION_WITH_KEYPAIR_FAILURE"
        }
        WorkerResponseType::SignNep413MessageFailure => "SIGN_NEP413_MESSAGE_FAILURE",
        WorkerResponseType::ExportNearKeypairUiFailure => "EXPORT_NEAR_KEYPAIR_UI_FAILURE",
        WorkerResponseType::RegisterDevice2WithDerivedKeyFailure => {
            "REGISTER_DEVICE2_WITH_DERIVED_KEY_FAILURE"
        }

        // Progress responses - for real-time updates during operations
        WorkerResponseType::RegistrationProgress => "REGISTRATION_PROGRESS",
        WorkerResponseType::RegistrationComplete => "REGISTRATION_COMPLETE",
        WorkerResponseType::ExecuteActionsProgress => "EXECUTE_ACTIONS_PROGRESS",
        WorkerResponseType::ExecuteActionsComplete => "EXECUTE_ACTIONS_COMPLETE",
    }
}
