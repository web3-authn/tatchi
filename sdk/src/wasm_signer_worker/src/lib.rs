mod actions;
mod config;
mod cose;
mod crypto;
mod encoders;
mod error;
mod handlers;
mod rpc_calls;
#[cfg(test)]
mod tests;
mod transaction;
mod types;

use serde_json;
use wasm_bindgen::prelude::*;
use log::debug;

use crate::types::worker_messages::{
    SignerWorkerMessage, SignerWorkerResponse, WorkerRequestType, WorkerResponseType,
};
use crate::types::*;

/////////////////////////////
pub use handlers::handle_decrypt_private_key_with_prf::{
    handle_decrypt_private_key_with_prf, DecryptPrivateKeyRequest, DecryptPrivateKeyResult,
};
/// === RE-EXPORTED TYPES ===
/////////////////////////////
pub use handlers::handle_derive_near_keypair_and_encrypt::{
    handle_derive_near_keypair_and_encrypt, DeriveNearKeypairAndEncryptRequest,
    DeriveNearKeypairAndEncryptResult,
};

pub use handlers::{
    CheckCanRegisterUserRequest,
    CoseExtractionResult,
    // Extract Cose Public Key
    ExtractCoseRequest,
    KeyActionResult,
    // Recover Account
    RecoverKeypairRequest,
    RecoverKeypairResult,
    // Registration Check
    RegistrationCheckRequest,
    RegistrationCheckResult,
    RegistrationInfoStruct,
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
pub use types::near::{PublicKey, Signature, SignedTransaction, Transaction};
// Re-export progress types for auto-generation
pub use types::progress::{
    ProgressMessageType, ProgressStatus, ProgressStep, WorkerProgressMessage,
};
// Re-export WASM-friendly wrapper types for TypeScript usage
pub use types::wasm_to_json::{
    WasmPublicKey, WasmSignature, WasmSignedTransaction, WasmTransaction,
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

#[wasm_bindgen]
pub fn init_worker() {
    console_error_panic_hook::set_once();
    // Initialize WASM logger respecting configured level
    wasm_logger::init(wasm_logger::Config::new(config::CURRENT_LOG_LEVEL));
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
    debug!("WASM Worker: Parsed request type: {:?}", request_type);

    // Route message to appropriate handler
    let response_payload = match request_type {
        WorkerRequestType::DeriveNearKeypairAndEncrypt => {
            let request = msg.parse_payload::<DeriveNearKeypairAndEncryptRequest>(request_type)?;
            let result = handlers::handle_derive_near_keypair_and_encrypt(request).await?;
            result.to_json()
        }
        WorkerRequestType::RecoverKeypairFromPasskey => {
            let request = msg.parse_payload::<RecoverKeypairRequest>(request_type)?;
            let result = handlers::handle_recover_keypair_from_passkey(request).await?;
            result.to_json()
        }
        WorkerRequestType::CheckCanRegisterUser => {
            let request = msg.parse_payload::<CheckCanRegisterUserRequest>(request_type)?;
            let result = handlers::handle_check_can_register_user(request).await?;
            result.to_json()
        }
        WorkerRequestType::DecryptPrivateKeyWithPrf => {
            let request = msg.parse_payload::<DecryptPrivateKeyRequest>(request_type)?;
            let result = handlers::handle_decrypt_private_key_with_prf(request).await?;
            result.to_json()
        }
        WorkerRequestType::SignTransactionsWithActions => {
            let request = msg.parse_payload::<SignTransactionsWithActionsRequest>(request_type)?;
            let result = handlers::handle_sign_transactions_with_actions(request).await?;
            result.to_json()
        }
        WorkerRequestType::ExtractCosePublicKey => {
            let request = msg.parse_payload::<ExtractCoseRequest>(request_type)?;
            let result = handlers::handle_extract_cose_public_key(request).await?;
            result.to_json()
        }
        WorkerRequestType::SignTransactionWithKeyPair => {
            let request = msg.parse_payload::<SignTransactionWithKeyPairRequest>(request_type)?;
            let result = handlers::handle_sign_transaction_with_keypair(request).await?;
            result.to_json()
        }
        WorkerRequestType::SignNep413Message => {
            let request = msg.parse_payload::<SignNep413Request>(request_type)?;
            let result = handlers::handle_sign_nep413_message(request).await?;
            result.to_json()
        }
        WorkerRequestType::RegistrationCredentialConfirmation => {
            let request = msg.parse_payload::<handlers::RegistrationCredentialConfirmationRequest>(request_type)?;
            let result = handlers::handle_request_registration_credential_confirmation(request).await?;
            result.to_json()
        }
        WorkerRequestType::ExportNearKeypairUI => {
            let request = msg.parse_payload::<handlers::ExportNearKeypairUiRequest>(request_type)?;
            let result = handlers::handle_export_near_keypair_ui(request).await?;
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
                WorkerRequestType::CheckCanRegisterUser => {
                    WorkerResponseType::CheckCanRegisterUserSuccess
                }
                WorkerRequestType::DecryptPrivateKeyWithPrf => {
                    WorkerResponseType::DecryptPrivateKeyWithPrfSuccess
                }
                WorkerRequestType::SignTransactionsWithActions => {
                    WorkerResponseType::SignTransactionsWithActionsSuccess
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
                WorkerRequestType::RegistrationCredentialConfirmation => {
                    WorkerResponseType::RegistrationCredentialConfirmationSuccess
                }
                WorkerRequestType::ExportNearKeypairUI => {
                    WorkerResponseType::ExportNearKeypairUiSuccess
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
                WorkerRequestType::CheckCanRegisterUser => {
                    WorkerResponseType::CheckCanRegisterUserFailure
                }
                WorkerRequestType::DecryptPrivateKeyWithPrf => {
                    WorkerResponseType::DecryptPrivateKeyWithPrfFailure
                }
                WorkerRequestType::SignTransactionsWithActions => {
                    WorkerResponseType::SignTransactionsWithActionsFailure
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
                WorkerRequestType::RegistrationCredentialConfirmation => {
                    WorkerResponseType::RegistrationCredentialConfirmationFailure
                }
                WorkerRequestType::ExportNearKeypairUI => {
                    WorkerResponseType::ExportNearKeypairUiFailure
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

// === DEBUGGING HELPERS ===
// Convert numeric enum values to readable strings for debugging
// Makes Rust logs much easier to read when dealing with wasm-bindgen numeric enums

/// Convert WorkerRequestType enum to readable string for debugging
pub fn worker_request_type_name(request_type: WorkerRequestType) -> &'static str {
    match request_type {
        WorkerRequestType::DeriveNearKeypairAndEncrypt => "DERIVE_NEAR_KEYPAIR_AND_ENCRYPT",
        WorkerRequestType::RecoverKeypairFromPasskey => "RECOVER_KEYPAIR_FROM_PASSKEY",
        WorkerRequestType::CheckCanRegisterUser => "CHECK_CAN_REGISTER_USER",
        WorkerRequestType::DecryptPrivateKeyWithPrf => "DECRYPT_PRIVATE_KEY_WITH_PRF",
        WorkerRequestType::SignTransactionsWithActions => "SIGN_TRANSACTIONS_WITH_ACTIONS",
        WorkerRequestType::ExtractCosePublicKey => "EXTRACT_COSE_PUBLIC_KEY",
        WorkerRequestType::SignTransactionWithKeyPair => "SIGN_TRANSACTION_WITH_KEYPAIR",
        WorkerRequestType::SignNep413Message => "SIGN_NEP413_MESSAGE",
        WorkerRequestType::RegistrationCredentialConfirmation => {
            "REGISTRATION_CREDENTIAL_CONFIRMATION"
        }
        WorkerRequestType::ExportNearKeypairUI => "EXPORT_NEAR_KEYPAIR_UI",
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
        WorkerResponseType::CheckCanRegisterUserSuccess => "CHECK_CAN_REGISTER_USER_SUCCESS",
        WorkerResponseType::DecryptPrivateKeyWithPrfSuccess => {
            "DECRYPT_PRIVATE_KEY_WITH_PRF_SUCCESS"
        }
        WorkerResponseType::SignTransactionsWithActionsSuccess => {
            "SIGN_TRANSACTIONS_WITH_ACTIONS_SUCCESS"
        }
        WorkerResponseType::ExtractCosePublicKeySuccess => "EXTRACT_COSE_PUBLIC_KEY_SUCCESS",
        WorkerResponseType::SignTransactionWithKeyPairSuccess => {
            "SIGN_TRANSACTION_WITH_KEYPAIR_SUCCESS"
        }
        WorkerResponseType::SignNep413MessageSuccess => "SIGN_NEP413_MESSAGE_SUCCESS",
        WorkerResponseType::RegistrationCredentialConfirmationSuccess => {
            "REGISTRATION_CREDENTIAL_CONFIRMATION_SUCCESS"
        }
        WorkerResponseType::ExportNearKeypairUiSuccess => "EXPORT_NEAR_KEYPAIR_UI_SUCCESS",

        // Failure responses
        WorkerResponseType::DeriveNearKeypairAndEncryptFailure => {
            "DERIVE_NEAR_KEYPAIR_AND_ENCRYPT_FAILURE"
        }
        WorkerResponseType::RecoverKeypairFromPasskeyFailure => {
            "RECOVER_KEYPAIR_FROM_PASSKEY_FAILURE"
        }
        WorkerResponseType::CheckCanRegisterUserFailure => "CHECK_CAN_REGISTER_USER_FAILURE",
        WorkerResponseType::DecryptPrivateKeyWithPrfFailure => {
            "DECRYPT_PRIVATE_KEY_WITH_PRF_FAILURE"
        }
        WorkerResponseType::SignTransactionsWithActionsFailure => {
            "SIGN_TRANSACTIONS_WITH_ACTIONS_FAILURE"
        }
        WorkerResponseType::ExtractCosePublicKeyFailure => "EXTRACT_COSE_PUBLIC_KEY_FAILURE",
        WorkerResponseType::SignTransactionWithKeyPairFailure => {
            "SIGN_TRANSACTION_WITH_KEYPAIR_FAILURE"
        }
        WorkerResponseType::SignNep413MessageFailure => "SIGN_NEP413_MESSAGE_FAILURE",
        WorkerResponseType::RegistrationCredentialConfirmationFailure => {
            "REGISTRATION_CREDENTIAL_CONFIRMATION_FAILURE"
        }
        WorkerResponseType::ExportNearKeypairUiFailure => "EXPORT_NEAR_KEYPAIR_UI_FAILURE",

        // Progress responses - for real-time updates during operations
        WorkerResponseType::RegistrationProgress => "REGISTRATION_PROGRESS",
        WorkerResponseType::RegistrationComplete => "REGISTRATION_COMPLETE",
        WorkerResponseType::ExecuteActionsProgress => "EXECUTE_ACTIONS_PROGRESS",
        WorkerResponseType::ExecuteActionsComplete => "EXECUTE_ACTIONS_COMPLETE",
    }
}
