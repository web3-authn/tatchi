mod actions;
mod config;
mod cose;
mod crypto;
mod encoders;
mod error;
#[cfg(target_arch = "wasm32")]
mod fetch;
mod handlers;
mod logger;
#[cfg(test)]
mod tests;
mod threshold;
mod transaction;
mod types;
mod wrap_key_handshake;

use crate::types::worker_messages::{
    parse_typed_payload, parse_worker_request_envelope, worker_request_type_name,
    worker_response_type_name, SignerWorkerMessage, SignerWorkerResponse, WorkerRequestType,
    WorkerResponseType,
};
use crate::error::scrub_js_error_value;
use crate::types::*;
use crate::wrap_key_handshake::{get_prf_second_b64u, get_wrap_key_shards};
use log::debug;
use wasm_bindgen::prelude::*;

pub use handlers::handle_decrypt_private_key_with_prf::{
    handle_decrypt_private_key_with_prf, DecryptPrivateKeyRequest, DecryptPrivateKeyResult,
};
pub use handlers::handle_derive_near_keypair_and_encrypt::{
    handle_derive_near_keypair_and_encrypt, DeriveNearKeypairAndEncryptRequest,
    DeriveNearKeypairAndEncryptResult,
};
pub use handlers::{
    CoseExtractionResult,
    // Delegate Actions
    DelegatePayload,
    DelegateSignResult,
    // Threshold Signing
    DeriveThresholdEd25519ClientVerifyingShareRequest,
    // Extract Cose Public Key
    ExtractCoseRequest,
    KeyActionResult,
    // Recover Account
    RecoverKeypairRequest,
    RecoverKeypairResult,
    // Combined Device2 Registration
    RegisterDevice2WithDerivedKeyRequest,
    RegisterDevice2WithDerivedKeyResult,
    SignAddKeyThresholdPublicKeyNoPromptRequest,
    SignDelegateActionRequest,
    // Sign Nep413 Message
    SignNep413Request,
    SignNep413Result,
    // Sign Transaction With Key Pair
    SignTransactionWithKeyPairRequest,
    // Execute Actions
    SignTransactionsWithActionsRequest,
    TransactionPayload,
};

// Re-export NEAR types for TypeScript usage
pub use types::near::{
    DelegateAction, PublicKey, Signature, SignedDelegate, SignedTransaction, Transaction,
};
// Re-export progress types for auto-generation
pub use types::progress::{
    ProgressMessageType, ProgressStatus, ProgressStep, WorkerProgressMessage,
};
// Re-export WASM-friendly wrapper types for TypeScript usage
pub use types::wasm_to_json::{
    WasmDelegateAction, WasmPublicKey, WasmSignature, WasmSignedDelegate, WasmSignedTransaction,
    WasmTransaction,
};

pub use crate::crypto::WrapKey;
pub use wrap_key_handshake::attach_wrap_key_seed_port;

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
    handle_signer_message_inner(message_val).await.map_err(scrub_js_error_value)
}

async fn handle_signer_message_inner(message_val: JsValue) -> Result<JsValue, JsValue> {
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
            let wrap_key = get_wrap_key_shards(&request.session_id, request_type, 2000).await?;
            let prf_second_b64u =
                get_prf_second_b64u(&request.session_id, request_type, 2000).await?;
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
            let request: RecoverKeypairRequest = parse_typed_payload(&payload_js, request_type)?;
            let wrap_key = get_wrap_key_shards(&request.session_id, request_type, 2000).await?;
            let result = handlers::handle_recover_keypair_from_passkey(request, wrap_key).await?;
            serde_wasm_bindgen::to_value(&result)
                .map_err(|e| JsValue::from_str(&format!("Failed to serialize result: {:?}", e)))?
        }
        WorkerRequestType::DecryptPrivateKeyWithPrf => {
            let request: DecryptPrivateKeyRequest = parse_typed_payload(&payload_js, request_type)?;
            let wrap_key = get_wrap_key_shards(&request.session_id, request_type, 2000).await?;
            let result = handlers::handle_decrypt_private_key_with_prf(request, wrap_key).await?;
            serde_wasm_bindgen::to_value(&result)
                .map_err(|e| JsValue::from_str(&format!("Failed to serialize result: {:?}", e)))?
        }
        WorkerRequestType::SignTransactionsWithActions => {
            let request: SignTransactionsWithActionsRequest =
                parse_typed_payload(&payload_js, request_type)?;
            let wrap_key = get_wrap_key_shards(&request.session_id, request_type, 2000).await?;
            let result = handlers::handle_sign_transactions_with_actions(request, wrap_key).await?;
            serde_wasm_bindgen::to_value(&result)
                .map_err(|e| JsValue::from_str(&format!("Failed to serialize result: {:?}", e)))?
        }
        WorkerRequestType::SignDelegateAction => {
            let request: SignDelegateActionRequest =
                parse_typed_payload(&payload_js, request_type)?;
            let wrap_key = get_wrap_key_shards(&request.session_id, request_type, 2000).await?;
            let result = handlers::handle_sign_delegate_action(request, wrap_key).await?;
            serde_wasm_bindgen::to_value(&result)
                .map_err(|e| JsValue::from_str(&format!("Failed to serialize result: {:?}", e)))?
        }
        WorkerRequestType::ExtractCosePublicKey => {
            let request: ExtractCoseRequest = parse_typed_payload(&payload_js, request_type)?;
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
            let request: SignNep413Request = parse_typed_payload(&payload_js, request_type)?;
            let wrap_key = get_wrap_key_shards(&request.session_id, request_type, 2000).await?;
            let result = handlers::handle_sign_nep413_message(request, wrap_key).await?;
            serde_wasm_bindgen::to_value(&result)
                .map_err(|e| JsValue::from_str(&format!("Failed to serialize result: {:?}", e)))?
        }
        WorkerRequestType::RegisterDevice2WithDerivedKey => {
            let request: handlers::RegisterDevice2WithDerivedKeyRequest =
                parse_typed_payload(&payload_js, request_type)?;
            let wrap_key = get_wrap_key_shards(&request.session_id, request_type, 2000).await?;
            let prf_second_b64u =
                get_prf_second_b64u(&request.session_id, request_type, 2000).await?;
            let result = handlers::handle_register_device2_with_derived_key(
                request,
                wrap_key,
                prf_second_b64u,
            )
            .await?;
            serde_wasm_bindgen::to_value(&result)
                .map_err(|e| JsValue::from_str(&format!("Failed to serialize result: {:?}", e)))?
        }
        WorkerRequestType::DeriveThresholdEd25519ClientVerifyingShare => {
            let request: DeriveThresholdEd25519ClientVerifyingShareRequest =
                parse_typed_payload(&payload_js, request_type)?;
            let wrap_key = get_wrap_key_shards(&request.session_id, request_type, 2000).await?;
            let result =
                handlers::handle_threshold_ed25519_derive_client_verifying_share(request, wrap_key)
                    .await?;
            serde_wasm_bindgen::to_value(&result)
                .map_err(|e| JsValue::from_str(&format!("Failed to serialize result: {:?}", e)))?
        }
        WorkerRequestType::SignAddKeyThresholdPublicKeyNoPrompt => {
            let request: SignAddKeyThresholdPublicKeyNoPromptRequest =
                parse_typed_payload(&payload_js, request_type)?;
            let wrap_key = get_wrap_key_shards(&request.session_id, request_type, 2000).await?;
            let result =
                handlers::handle_sign_add_key_threshold_public_key_no_prompt(request, wrap_key)
                    .await?;
            serde_wasm_bindgen::to_value(&result)
                .map_err(|e| JsValue::from_str(&format!("Failed to serialize result: {:?}", e)))?
        }
        WorkerRequestType::HealthCheck => JsValue::from_bool(true),
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
        WorkerRequestType::SignDelegateAction => WorkerResponseType::SignDelegateActionSuccess,
        WorkerRequestType::ExtractCosePublicKey => WorkerResponseType::ExtractCosePublicKeySuccess,
        WorkerRequestType::SignTransactionWithKeyPair => {
            WorkerResponseType::SignTransactionWithKeyPairSuccess
        }
        WorkerRequestType::SignNep413Message => WorkerResponseType::SignNep413MessageSuccess,
        WorkerRequestType::RegisterDevice2WithDerivedKey => {
            WorkerResponseType::RegisterDevice2WithDerivedKeySuccess
        }
        WorkerRequestType::DeriveThresholdEd25519ClientVerifyingShare => {
            WorkerResponseType::DeriveThresholdEd25519ClientVerifyingShareSuccess
        }
        WorkerRequestType::SignAddKeyThresholdPublicKeyNoPrompt => {
            WorkerResponseType::SignAddKeyThresholdPublicKeyNoPromptSuccess
        }
        WorkerRequestType::HealthCheck => WorkerResponseType::HealthCheckSuccess,
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
