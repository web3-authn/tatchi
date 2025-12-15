mod actions;
mod config;
mod cose;
mod crypto;
mod encoders;
mod error;
mod handlers;
mod logger;
#[cfg(test)]
mod tests;
mod transaction;
mod types;

use std::cell::RefCell;
use std::collections::HashMap;

use crate::types::worker_messages::{
    parse_typed_payload,
    parse_worker_request_envelope,
    worker_request_type_name,
    worker_response_type_name,
    SignerWorkerMessage,
    SignerWorkerResponse,
    WorkerRequestType,
    WorkerResponseType,
};
use crate::types::*;
use log::debug;
use wasm_bindgen::prelude::*;
#[cfg(target_arch = "wasm32")]
use wasm_bindgen::JsCast;
#[cfg(target_arch = "wasm32")]
use wasm_bindgen::closure::Closure;
#[cfg(target_arch = "wasm32")]
use wasm_bindgen_futures::JsFuture;
#[cfg(target_arch = "wasm32")]
use web_sys::{MessageEvent, MessagePort};

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

pub use crate::crypto::WrapKey;

thread_local! {
    static WRAP_KEY_SEED_SESSIONS: RefCell<HashMap<String, WrapKey>> = RefCell::new(HashMap::new());
    static SESSION_PRF_OUTPUTS: RefCell<HashMap<String, String>> = RefCell::new(HashMap::new());
}

#[cfg(target_arch = "wasm32")]
thread_local! {
    static WRAP_KEY_SEED_WAITERS: RefCell<HashMap<String, Vec<js_sys::Function>>> = RefCell::new(HashMap::new());
    static PRF_SECOND_WAITERS: RefCell<HashMap<String, Vec<js_sys::Function>>> = RefCell::new(HashMap::new());
    static SESSION_MATERIAL_ERRORS: RefCell<HashMap<String, String>> = RefCell::new(HashMap::new());
}

#[cfg(target_arch = "wasm32")]
fn resolve_wrap_key_seed_waiters(session_id: &str, value: &JsValue) {
    WRAP_KEY_SEED_WAITERS.with(|waiters| {
        let mut waiters = waiters.borrow_mut();
        let Some(list) = waiters.remove(session_id) else {
            return;
        };
        for resolve in list {
            let _ = resolve.call1(&JsValue::UNDEFINED, value);
        }
    });
}

#[cfg(target_arch = "wasm32")]
fn resolve_prf_second_waiters(session_id: &str, value: &JsValue) {
    PRF_SECOND_WAITERS.with(|waiters| {
        let mut waiters = waiters.borrow_mut();
        let Some(list) = waiters.remove(session_id) else {
            return;
        };
        for resolve in list {
            let _ = resolve.call1(&JsValue::UNDEFINED, value);
        }
    });
}

#[wasm_bindgen]
pub fn init_worker() {
    logger::init(config::CURRENT_LOG_LEVEL);
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
        let port_for_close = port.clone();
        let on_message = move |event: MessageEvent| {
            let Ok(data) = js_sys::Reflect::get(&event, &JsValue::from_str("data")) else {
                return;
            };

            // New contract: payload is result-like:
            // - success: { ok: true, wrap_key_seed, wrapKeySalt, prfSecond? }
            // - error:   { ok: false, error }
            let ok = js_sys::Reflect::get(&data, &JsValue::from_str("ok"))
                .ok()
                .and_then(|v| v.as_bool());
            if ok == Some(false) {
                let err = js_sys::Reflect::get(&data, &JsValue::from_str("error"))
                    .ok()
                    .and_then(|v| v.as_string())
                    .unwrap_or_else(|| "VRF failed to provide WrapKeySeed".to_string());

                SESSION_MATERIAL_ERRORS.with(|map| {
                    map.borrow_mut().insert(sid.clone(), err.clone());
                });

                let err_js = JsValue::from_str(&err);
                resolve_wrap_key_seed_waiters(&sid, &err_js);
                resolve_prf_second_waiters(&sid, &err_js);
                port_for_close.close();
                return;
            }

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
                SESSION_MATERIAL_ERRORS.with(|map| {
                    map.borrow_mut().remove(&sid);
                });

                WRAP_KEY_SEED_SESSIONS.with(|map| {
                    map.borrow_mut().insert(
                        sid.clone(),
                        WrapKey {
                            wrap_key_seed: seed,
                            wrap_key_salt: salt,
                        },
                    );
                });
                resolve_wrap_key_seed_waiters(&sid, &JsValue::TRUE);

                // Store PRF.second if present (used in Device2 registration flow)
                if let Some(prf_second_b64u) = prf_second {
                    if !prf_second_b64u.is_empty() {
                        SESSION_PRF_OUTPUTS.with(|map| {
                            map.borrow_mut().insert(sid.clone(), prf_second_b64u);
                        });
                        resolve_prf_second_waiters(&sid, &JsValue::TRUE);
                    }
                }
            }
            // One-shot semantics: VRF sends one message and closes its end; close ours too.
            port_for_close.close();
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
pub fn send_progress_message(message_type: u32, step: u32, message: &str, data: JsValue) {
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
            data: JsValue,
            logs: JsValue,
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
        let logs = JsValue::from(js_sys::Array::new());
        send_progress_message_js(
            message_type,
            message_type_name,
            step,
            step_name,
            message,
            data,
            logs,
        );
    }

    #[cfg(not(target_arch = "wasm32"))]
    {
        let _ = data;
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
pub async fn handle_signer_message(message_val: JsValue) -> Result<JsValue, JsValue> {
    init_worker();

    // Parse the outer `{ type, payload }` envelope from JS into a strongly
    // typed `WorkerRequestType` and raw `payload` value.
    let SignerWorkerMessage {
        request_type,
        request_type_raw: msg_type_num,
        payload: payload_js,
    } = parse_worker_request_envelope(message_val)?;

    debug!(
        "WASM Worker: Received message type: {} ({})",
        worker_request_type_name(request_type),
        msg_type_num
    );

    // Route message to appropriate handler
    let response_payload = match request_type {
        WorkerRequestType::DeriveNearKeypairAndEncrypt => {
            let request: DeriveNearKeypairAndEncryptRequest =
                parse_typed_payload(&payload_js, request_type)?;
            #[cfg(target_arch = "wasm32")]
            let wrap_key = await_wrap_key_shards(&request.session_id, request_type, 2000).await?;
            #[cfg(not(target_arch = "wasm32"))]
            let wrap_key = lookup_wrap_key_shards(&request.session_id, request_type)?;
            #[cfg(target_arch = "wasm32")]
            let prf_second_b64u = await_prf_second(&request.session_id, request_type, 2000).await?;
            #[cfg(not(target_arch = "wasm32"))]
            let prf_second_b64u = lookup_prf_second(&request.session_id, request_type)?;
            let result = handlers::handle_derive_near_keypair_and_encrypt(
                request,
                wrap_key,
                prf_second_b64u,
            )
            .await?;
            serde_wasm_bindgen::to_value(&result)
                .map_err(|e| JsValue::from_str(&format!("Failed to serialize result: {:?}", e)))?
        }
        WorkerRequestType::RecoverKeypairFromPasskey => {
            let request: RecoverKeypairRequest =
                parse_typed_payload(&payload_js, request_type)?;
            #[cfg(target_arch = "wasm32")]
            let wrap_key = await_wrap_key_shards(&request.session_id, request_type, 2000).await?;
            #[cfg(not(target_arch = "wasm32"))]
            let wrap_key = lookup_wrap_key_shards(&request.session_id, request_type)?;
            let result = handlers::handle_recover_keypair_from_passkey(request, wrap_key).await?;
            serde_wasm_bindgen::to_value(&result)
                .map_err(|e| JsValue::from_str(&format!("Failed to serialize result: {:?}", e)))?
        }
        WorkerRequestType::DecryptPrivateKeyWithPrf => {
            let request: DecryptPrivateKeyRequest =
                parse_typed_payload(&payload_js, request_type)?;
            #[cfg(target_arch = "wasm32")]
            let wrap_key = await_wrap_key_shards(&request.session_id, request_type, 2000).await?;
            #[cfg(not(target_arch = "wasm32"))]
            let wrap_key = lookup_wrap_key_shards(&request.session_id, request_type)?;
            let result = handlers::handle_decrypt_private_key_with_prf(
                request,
                wrap_key,
            )
            .await?;
            serde_wasm_bindgen::to_value(&result)
                .map_err(|e| JsValue::from_str(&format!("Failed to serialize result: {:?}", e)))?
        }
        WorkerRequestType::SignTransactionsWithActions => {
            let request: SignTransactionsWithActionsRequest =
                parse_typed_payload(&payload_js, request_type)?;
            #[cfg(target_arch = "wasm32")]
            let wrap_key = await_wrap_key_shards(&request.session_id, request_type, 2000).await?;
            #[cfg(not(target_arch = "wasm32"))]
            let wrap_key = lookup_wrap_key_shards(&request.session_id, request_type)?;
            let result = handlers::handle_sign_transactions_with_actions(
                request,
                wrap_key,
            )
            .await?;
            serde_wasm_bindgen::to_value(&result)
                .map_err(|e| JsValue::from_str(&format!("Failed to serialize result: {:?}", e)))?
        }
        WorkerRequestType::SignDelegateAction => {
            let request: SignDelegateActionRequest =
                parse_typed_payload(&payload_js, request_type)?;
            #[cfg(target_arch = "wasm32")]
            let wrap_key = await_wrap_key_shards(&request.session_id, request_type, 2000).await?;
            #[cfg(not(target_arch = "wasm32"))]
            let wrap_key = lookup_wrap_key_shards(&request.session_id, request_type)?;
            let result = handlers::handle_sign_delegate_action(request, wrap_key).await?;
            serde_wasm_bindgen::to_value(&result)
                .map_err(|e| JsValue::from_str(&format!("Failed to serialize result: {:?}", e)))?
        }
        WorkerRequestType::ExtractCosePublicKey => {
            let request: ExtractCoseRequest =
                parse_typed_payload(&payload_js, request_type)?;
            let result = handlers::handle_extract_cose_public_key(request).await?;
            serde_wasm_bindgen::to_value(&result)
                .map_err(|e| JsValue::from_str(&format!("Failed to serialize result: {:?}", e)))?
        }
        // NOTE: Does not need wrapKeySeed, wrapKeySalt -> MessagePort
        // The only method that does not require VRF Worker to sign
        WorkerRequestType::SignTransactionWithKeyPair => {
            let request: SignTransactionWithKeyPairRequest =
                parse_typed_payload(&payload_js, request_type)?;
            let result = handlers::handle_sign_transaction_with_keypair(request).await?;
            serde_wasm_bindgen::to_value(&result)
                .map_err(|e| JsValue::from_str(&format!("Failed to serialize result: {:?}", e)))?
        }
        WorkerRequestType::SignNep413Message => {
            let request: SignNep413Request =
                parse_typed_payload(&payload_js, request_type)?;
            #[cfg(target_arch = "wasm32")]
            let wrap_key = await_wrap_key_shards(&request.session_id, request_type, 2000).await?;
            #[cfg(not(target_arch = "wasm32"))]
            let wrap_key = lookup_wrap_key_shards(&request.session_id, request_type)?;
            let result = handlers::handle_sign_nep413_message(
                request,
                wrap_key,
            )
            .await?;
            serde_wasm_bindgen::to_value(&result)
                .map_err(|e| JsValue::from_str(&format!("Failed to serialize result: {:?}", e)))?
        }
        WorkerRequestType::RegisterDevice2WithDerivedKey => {
            let request: handlers::RegisterDevice2WithDerivedKeyRequest =
                parse_typed_payload(&payload_js, request_type)?;
            #[cfg(target_arch = "wasm32")]
            let wrap_key = await_wrap_key_shards(&request.session_id, request_type, 2000).await?;
            #[cfg(not(target_arch = "wasm32"))]
            let wrap_key = lookup_wrap_key_shards(&request.session_id, request_type)?;
            #[cfg(target_arch = "wasm32")]
            let prf_second_b64u = await_prf_second(&request.session_id, request_type, 2000).await?;
            #[cfg(not(target_arch = "wasm32"))]
            let prf_second_b64u = lookup_prf_second(&request.session_id, request_type)?;
            let result = handlers::handle_register_device2_with_derived_key(
                request,
                wrap_key,
                prf_second_b64u,
            )
            .await?;
            serde_wasm_bindgen::to_value(&result)
                .map_err(|e| JsValue::from_str(&format!("Failed to serialize result: {:?}", e)))?
        }
    };

    // At this point, response_payload is the successful JsValue result.
    // Errors would have been propagated early via `?` operator and caught by the TypeScript wrapper.

    // Determine the success response type based on the request type
    let response_type = match request_type {
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
        WorkerRequestType::RegisterDevice2WithDerivedKey => {
            WorkerResponseType::RegisterDevice2WithDerivedKeySuccess
        }
    };

    // Debug logging for response type
    debug!(
        "WASM Worker: Determined response type: {} ({})",
        worker_response_type_name(response_type),
        u32::from(response_type)
    );

    // Create the final response
    let response = SignerWorkerResponse {
        response_type: u32::from(response_type),
        payload: response_payload,
    };

    // Return JsValue directly
    serde_wasm_bindgen::to_value(&response)
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

#[cfg(target_arch = "wasm32")]
fn timeout_promise(ms: u32) -> js_sys::Promise {
    js_sys::Promise::new(&mut |resolve, _reject| {
        let global = js_sys::global();
        let set_timeout = js_sys::Reflect::get(&global, &JsValue::from_str("setTimeout"))
            .ok()
            .and_then(|v| v.dyn_into::<js_sys::Function>().ok());
        let Some(set_timeout) = set_timeout else {
            let _ = resolve.call1(&JsValue::UNDEFINED, &JsValue::FALSE);
            return;
        };
        let cb = Closure::<dyn FnOnce()>::once(move || {
            let _ = resolve.call1(&JsValue::UNDEFINED, &JsValue::FALSE);
        });
        let _ = set_timeout.call2(&global, cb.as_ref(), &JsValue::from_f64(ms as f64));
        cb.forget();
    })
}

#[cfg(target_arch = "wasm32")]
fn wrap_key_seed_waiter_promise(session_id: &str) -> js_sys::Promise {
    let sid = session_id.to_string();
    js_sys::Promise::new(&mut |resolve, _reject| {
        WRAP_KEY_SEED_WAITERS.with(|waiters| {
            waiters
                .borrow_mut()
                .entry(sid.clone())
                .or_default()
                .push(resolve);
        });
    })
}

#[cfg(target_arch = "wasm32")]
fn prf_second_waiter_promise(session_id: &str) -> js_sys::Promise {
    let sid = session_id.to_string();
    js_sys::Promise::new(&mut |resolve, _reject| {
        PRF_SECOND_WAITERS.with(|waiters| {
            waiters
                .borrow_mut()
                .entry(sid.clone())
                .or_default()
                .push(resolve);
        });
    })
}

/// Await WrapKeySeed material inside the signer worker.
///
/// This removes the need for any main-thread "seed ready" synchronization:
/// the signer worker can receive a signing request first and then block until
/// the VRF worker delivers WrapKeySeed over the attached MessagePort.
#[cfg(target_arch = "wasm32")]
async fn await_wrap_key_shards(
    session_id: &str,
    request_type: WorkerRequestType,
    timeout_ms: u32,
) -> Result<WrapKey, JsValue> {
    let error = SESSION_MATERIAL_ERRORS.with(|map| map.borrow().get(session_id).cloned());
    if let Some(err) = error {
        return Err(JsValue::from_str(&err));
    }

    if let Ok(mat) = lookup_wrap_key_shards(session_id, request_type) {
        return Ok(mat);
    }

    let seed_promise = wrap_key_seed_waiter_promise(session_id);
    let race_inputs = js_sys::Array::new();
    race_inputs.push(&seed_promise);
    race_inputs.push(&timeout_promise(timeout_ms));
    let raced = js_sys::Promise::race(&race_inputs);
    let result = JsFuture::from(raced).await?;

    // Timeout promise resolves with `false`.
    if result.as_bool() == Some(false) {
        return Err(JsValue::from_str(&format!(
            "Timed out waiting for WrapKeySeed for session {}",
            session_id
        )));
    }
    if let Some(err) = result.as_string() {
        return Err(JsValue::from_str(&err));
    }

    lookup_wrap_key_shards(session_id, request_type).map_err(|_| {
        JsValue::from_str(&format!(
            "WrapKeySeed waiter resolved but WrapKeySeed still missing for session {}",
            session_id
        ))
    })
}

#[cfg(target_arch = "wasm32")]
async fn await_prf_second(
    session_id: &str,
    request_type: WorkerRequestType,
    timeout_ms: u32,
) -> Result<String, JsValue> {
    let error = SESSION_MATERIAL_ERRORS.with(|map| map.borrow().get(session_id).cloned());
    if let Some(err) = error {
        return Err(JsValue::from_str(&err));
    }

    if let Ok(v) = lookup_prf_second(session_id, request_type) {
        return Ok(v);
    }

    let prf_promise = prf_second_waiter_promise(session_id);
    let race_inputs = js_sys::Array::new();
    race_inputs.push(&prf_promise);
    race_inputs.push(&timeout_promise(timeout_ms));
    let raced = js_sys::Promise::race(&race_inputs);
    let result = JsFuture::from(raced).await?;

    if result.as_bool() == Some(false) {
        return Err(JsValue::from_str(&format!(
            "Timed out waiting for PRF.second for session {}",
            session_id
        )));
    }
    if let Some(err) = result.as_string() {
        return Err(JsValue::from_str(&err));
    }

    lookup_prf_second(session_id, request_type).map_err(|_| {
        JsValue::from_str(&format!(
            "PRF.second waiter resolved but PRF.second still missing for session {}",
            session_id
        ))
    })
}
