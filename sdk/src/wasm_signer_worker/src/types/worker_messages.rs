// === WORKER MESSAGES: REQUEST & RESPONSE TYPES ===
// Enums and message structures for worker communication

use crate::error::ParsePayloadError;
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

// === CLEAN RUST ENUMS WITH NUMERIC CONVERSION ===
// These export to TypeScript as numeric enums and we convert directly from numbers
#[wasm_bindgen]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WorkerRequestType {
    DeriveNearKeypairAndEncrypt,
    RecoverKeypairFromPasskey,
    DecryptPrivateKeyWithPrf,
    SignTransactionsWithActions,
    ExtractCosePublicKey,
    SignTransactionWithKeyPair,
    SignNep413Message,
    // Combined Device2 registration: derive + sign in one step
    RegisterDevice2WithDerivedKey,
    // Delegate action signing (NEP-461)
    SignDelegateAction,
    // Public, deterministic key enrollment helper for threshold mode
    DeriveThresholdEd25519ClientVerifyingShare,
    /// Single-purpose internal signing path for post-registration activation:
    /// Sign AddKey(thresholdPublicKey) for receiverId == nearAccountId without VRF/confirmTxFlow.
    SignAddKeyThresholdPublicKeyNoPrompt,
    /// Lightweight health check to validate wasm message parsing.
    HealthCheck,
}

impl From<u32> for WorkerRequestType {
    fn from(value: u32) -> Self {
        match value {
            0 => WorkerRequestType::DeriveNearKeypairAndEncrypt,
            1 => WorkerRequestType::RecoverKeypairFromPasskey,
            2 => WorkerRequestType::DecryptPrivateKeyWithPrf,
            3 => WorkerRequestType::SignTransactionsWithActions,
            4 => WorkerRequestType::ExtractCosePublicKey,
            5 => WorkerRequestType::SignTransactionWithKeyPair,
            6 => WorkerRequestType::SignNep413Message,
            7 => WorkerRequestType::RegisterDevice2WithDerivedKey,
            8 => WorkerRequestType::SignDelegateAction,
            9 => WorkerRequestType::DeriveThresholdEd25519ClientVerifyingShare,
            10 => WorkerRequestType::SignAddKeyThresholdPublicKeyNoPrompt,
            11 => WorkerRequestType::HealthCheck,
            _ => panic!("Invalid WorkerRequestType value: {}", value),
        }
    }
}
impl WorkerRequestType {
    pub fn name(&self) -> &'static str {
        match self {
            WorkerRequestType::DeriveNearKeypairAndEncrypt => "DERIVE_NEAR_KEYPAIR_AND_ENCRYPT",
            WorkerRequestType::RecoverKeypairFromPasskey => "RECOVER_KEYPAIR_FROM_PASSKEY",
            WorkerRequestType::DecryptPrivateKeyWithPrf => "DECRYPT_PRIVATE_KEY_WITH_PRF",
            WorkerRequestType::SignTransactionsWithActions => "SIGN_TRANSACTIONS_WITH_ACTIONS",
            WorkerRequestType::SignDelegateAction => "SIGN_DELEGATE_ACTION",
            WorkerRequestType::ExtractCosePublicKey => "EXTRACT_COSE_PUBLIC_KEY",
            WorkerRequestType::SignTransactionWithKeyPair => "SIGN_TRANSACTION_WITH_KEYPAIR",
            WorkerRequestType::SignNep413Message => "SIGN_NEP413_MESSAGE",
            WorkerRequestType::RegisterDevice2WithDerivedKey => "REGISTER_DEVICE2_WITH_DERIVED_KEY",
            WorkerRequestType::DeriveThresholdEd25519ClientVerifyingShare => {
                "DERIVE_THRESHOLD_ED25519_CLIENT_VERIFYING_SHARE"
            }
            WorkerRequestType::SignAddKeyThresholdPublicKeyNoPrompt => {
                "SIGN_ADD_KEY_THRESHOLD_PUBLIC_KEY_NO_PROMPT"
            }
            WorkerRequestType::HealthCheck => "HEALTH_CHECK",
        }
    }
}

/// Convert WorkerRequestType enum to readable string for debugging.
/// Used in logs to make numeric enum values human-friendly.
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
        WorkerRequestType::RegisterDevice2WithDerivedKey => "REGISTER_DEVICE2_WITH_DERIVED_KEY",
        WorkerRequestType::DeriveThresholdEd25519ClientVerifyingShare => {
            "DERIVE_THRESHOLD_ED25519_CLIENT_VERIFYING_SHARE"
        }
        WorkerRequestType::SignAddKeyThresholdPublicKeyNoPrompt => {
            "SIGN_ADD_KEY_THRESHOLD_PUBLIC_KEY_NO_PROMPT"
        }
        WorkerRequestType::HealthCheck => "HEALTH_CHECK",
    }
}

/// Deserialize a typed Rust payload from a raw `JsValue`.
/// Keeps the worker request name in the error so JS callers can surface
/// meaningful `"Invalid payload for <MESSAGE_TYPE>: ..."` messages.
pub fn parse_typed_payload<T: DeserializeOwned>(
    payload: &JsValue,
    request_type: WorkerRequestType,
) -> Result<T, JsValue> {
    serde_wasm_bindgen::from_value(payload.clone())
        .map_err(|e| ParsePayloadError::new(request_type.name(), e).into())
}

/// Worker response types enum - corresponds to TypeScript WorkerResponseType
#[wasm_bindgen]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u32)]
pub enum WorkerResponseType {
    // Success responses - one for each request type (kept in the same order)
    DeriveNearKeypairAndEncryptSuccess = 0,
    RecoverKeypairFromPasskeySuccess = 1,
    DecryptPrivateKeyWithPrfSuccess = 2,
    SignTransactionsWithActionsSuccess = 3,
    ExtractCosePublicKeySuccess = 4,
    SignTransactionWithKeyPairSuccess = 5,
    SignNep413MessageSuccess = 6,
    RegisterDevice2WithDerivedKeySuccess = 7,
    SignDelegateActionSuccess = 8,

    // Failure responses - one for each request type (same ordering)
    DeriveNearKeypairAndEncryptFailure = 9,
    RecoverKeypairFromPasskeyFailure = 10,
    DecryptPrivateKeyWithPrfFailure = 11,
    SignTransactionsWithActionsFailure = 12,
    ExtractCosePublicKeyFailure = 13,
    SignTransactionWithKeyPairFailure = 14,
    SignNep413MessageFailure = 15,
    RegisterDevice2WithDerivedKeyFailure = 16,
    SignDelegateActionFailure = 17,

    // Progress responses - for real-time updates during operations
    RegistrationProgress = 18,
    RegistrationComplete = 19,
    ExecuteActionsProgress = 20,
    ExecuteActionsComplete = 21,

    // Threshold key enrollment helper
    DeriveThresholdEd25519ClientVerifyingShareSuccess = 22,
    DeriveThresholdEd25519ClientVerifyingShareFailure = 23,

    // Internal post-registration activation helper
    SignAddKeyThresholdPublicKeyNoPromptSuccess = 24,
    SignAddKeyThresholdPublicKeyNoPromptFailure = 25,
    HealthCheckSuccess = 26,
    HealthCheckFailure = 27,
}
impl From<WorkerResponseType> for u32 {
    fn from(value: WorkerResponseType) -> Self {
        value as u32
    }
}
impl From<u32> for WorkerResponseType {
    fn from(value: u32) -> Self {
        match value {
            // Success responses
            0 => WorkerResponseType::DeriveNearKeypairAndEncryptSuccess,
            1 => WorkerResponseType::RecoverKeypairFromPasskeySuccess,
            2 => WorkerResponseType::DecryptPrivateKeyWithPrfSuccess,
            3 => WorkerResponseType::SignTransactionsWithActionsSuccess,
            4 => WorkerResponseType::ExtractCosePublicKeySuccess,
            5 => WorkerResponseType::SignTransactionWithKeyPairSuccess,
            6 => WorkerResponseType::SignNep413MessageSuccess,
            7 => WorkerResponseType::RegisterDevice2WithDerivedKeySuccess,
            8 => WorkerResponseType::SignDelegateActionSuccess,

            // Failure responses
            9 => WorkerResponseType::DeriveNearKeypairAndEncryptFailure,
            10 => WorkerResponseType::RecoverKeypairFromPasskeyFailure,
            11 => WorkerResponseType::DecryptPrivateKeyWithPrfFailure,
            12 => WorkerResponseType::SignTransactionsWithActionsFailure,
            13 => WorkerResponseType::ExtractCosePublicKeyFailure,
            14 => WorkerResponseType::SignTransactionWithKeyPairFailure,
            15 => WorkerResponseType::SignNep413MessageFailure,
            16 => WorkerResponseType::RegisterDevice2WithDerivedKeyFailure,
            17 => WorkerResponseType::SignDelegateActionFailure,

            // Progress responses - for real-time updates during operations
            18 => WorkerResponseType::RegistrationProgress,
            19 => WorkerResponseType::RegistrationComplete,
            20 => WorkerResponseType::ExecuteActionsProgress,
            21 => WorkerResponseType::ExecuteActionsComplete,
            22 => WorkerResponseType::DeriveThresholdEd25519ClientVerifyingShareSuccess,
            23 => WorkerResponseType::DeriveThresholdEd25519ClientVerifyingShareFailure,
            24 => WorkerResponseType::SignAddKeyThresholdPublicKeyNoPromptSuccess,
            25 => WorkerResponseType::SignAddKeyThresholdPublicKeyNoPromptFailure,
            26 => WorkerResponseType::HealthCheckSuccess,
            27 => WorkerResponseType::HealthCheckFailure,
            _ => panic!("Invalid WorkerResponseType value: {}", value),
        }
    }
}

/// Convert WorkerResponseType enum to readable string for debugging.
/// Used in logs to turn numeric response type values into names.
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
        WorkerResponseType::RegisterDevice2WithDerivedKeyFailure => {
            "REGISTER_DEVICE2_WITH_DERIVED_KEY_FAILURE"
        }

        // Progress responses - for real-time updates during operations
        WorkerResponseType::RegistrationProgress => "REGISTRATION_PROGRESS",
        WorkerResponseType::RegistrationComplete => "REGISTRATION_COMPLETE",
        WorkerResponseType::ExecuteActionsProgress => "EXECUTE_ACTIONS_PROGRESS",
        WorkerResponseType::ExecuteActionsComplete => "EXECUTE_ACTIONS_COMPLETE",
        WorkerResponseType::DeriveThresholdEd25519ClientVerifyingShareSuccess => {
            "DERIVE_THRESHOLD_ED25519_CLIENT_VERIFYING_SHARE_SUCCESS"
        }
        WorkerResponseType::DeriveThresholdEd25519ClientVerifyingShareFailure => {
            "DERIVE_THRESHOLD_ED25519_CLIENT_VERIFYING_SHARE_FAILURE"
        }
        WorkerResponseType::SignAddKeyThresholdPublicKeyNoPromptSuccess => {
            "SIGN_ADD_KEY_THRESHOLD_PUBLIC_KEY_NO_PROMPT_SUCCESS"
        }
        WorkerResponseType::SignAddKeyThresholdPublicKeyNoPromptFailure => {
            "SIGN_ADD_KEY_THRESHOLD_PUBLIC_KEY_NO_PROMPT_FAILURE"
        }
        WorkerResponseType::HealthCheckSuccess => "HEALTH_CHECK_SUCCESS",
        WorkerResponseType::HealthCheckFailure => "HEALTH_CHECK_FAILURE",
    }
}

/// Parsed outer worker request envelope (`{ type, payload }`) coming from JS.
/// This:
/// - Accepts either a plain JS object (browser) or a JSON string (Node / server).
/// - Extracts the numeric `type` and converts it to `WorkerRequestType`.
/// - Returns the raw numeric type alongside the `payload` `JsValue`.
///
/// The key design choice here is to *not* use `serde_wasm_bindgen` on the full
/// envelope. `serde_wasm_bindgen::preserve` encodes `JsValue` fields using an
/// internal "magic string" representation, which broke when callers passed
/// plain JS objects as `payload`. By manually reading `type` and `payload`
/// via `Reflect::get`, we avoid that fragile encoding layer entirely.
pub struct SignerWorkerMessage {
    pub request_type: WorkerRequestType,
    pub request_type_raw: u32,
    pub payload: JsValue,
}

pub fn parse_worker_request_envelope(message_val: JsValue) -> Result<SignerWorkerMessage, JsValue> {
    // Support both Object (Browser) and JSON String (Node.js/Server) inputs.
    let message_obj = if message_val.is_string() {
        let json_str = message_val.as_string().unwrap_or_default();
        js_sys::JSON::parse(&json_str).map_err(|e| {
            JsValue::from_str(&format!("Failed to parse JSON string input: {:?}", e))
        })?
    } else {
        message_val
    };

    // Extract type and payload manually to avoid relying on serde_wasm_bindgen
    // to deserialize JsValue fields via its internal "magic string" representation.
    let msg_type_js = js_sys::Reflect::get(&message_obj, &JsValue::from_str("type"))
        .map_err(|e| JsValue::from_str(&format!("Failed to read message.type: {:?}", e)))?;
    let msg_type_num = msg_type_js
        .as_f64()
        .ok_or_else(|| JsValue::from_str("message.type must be a number"))?
        as u32;
    let request_type = WorkerRequestType::from(msg_type_num);

    let payload_js = js_sys::Reflect::get(&message_obj, &JsValue::from_str("payload"))
        .map_err(|e| JsValue::from_str(&format!("Failed to read message.payload: {:?}", e)))?;

    Ok(SignerWorkerMessage {
        request_type,
        request_type_raw: msg_type_num,
        payload: payload_js,
    })
}

/// Main worker response structure
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct SignerWorkerResponse {
    #[serde(rename = "type")]
    pub response_type: u32,
    #[serde(with = "serde_wasm_bindgen::preserve")]
    pub payload: JsValue,
}
