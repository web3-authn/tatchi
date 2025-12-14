// === WORKER MESSAGES: REQUEST & RESPONSE TYPES ===

use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;
use js_sys::Reflect;

// === PAYLOAD & ENVELOPE HELPERS ===

/// Deserialize a typed Rust payload from a raw `JsValue`.
/// Mirrors the signer worker's `parse_typed_payload`, keeping the request
/// name in the error so JS callers can surface meaningful messages.
pub fn parse_typed_payload<T: DeserializeOwned>(
    payload: Option<JsValue>,
    request_type: WorkerRequestType,
) -> Result<T, JsValue> {
    let payload_js = payload.ok_or_else(|| {
        JsValue::from_str(&format!(
            "{}: Missing payload",
            request_type.name()
        ))
    })?;

    serde_wasm_bindgen::from_value(payload_js).map_err(|e| {
        JsValue::from_str(&format!(
            "Invalid payload for {}: {}",
            request_type.name(),
            e
        ))
    })
}

/// Parsed outer worker request envelope (`{ type, id, payload }`) coming from JS.
/// Supports both plain JS objects and JSON strings.
pub struct VrfWorkerMessage {
    pub request_type: WorkerRequestType,
    pub request_type_raw: String,
    pub id: Option<String>,
    pub payload: Option<JsValue>,
}

pub fn parse_worker_request_envelope(
    message_val: JsValue,
) -> Result<VrfWorkerMessage, JsValue> {
    // Support both Object (Browser) and JSON String (Node.js/Server) inputs.
    let message_obj = if message_val.is_string() {
        let json_str = message_val.as_string().unwrap_or_default();
        js_sys::JSON::parse(&json_str).map_err(|e| {
            JsValue::from_str(&format!(
                "Failed to parse JSON string input: {:?}",
                e
            ))
        })?
    } else {
        message_val
    };

    let msg_type_js = Reflect::get(&message_obj, &JsValue::from_str("type"))
        .map_err(|e| JsValue::from_str(&format!("Failed to read message.type: {:?}", e)))?;
    let msg_type_str = msg_type_js
        .as_string()
        .ok_or_else(|| JsValue::from_str("message.type must be a string"))?;

    let request_type = WorkerRequestType::try_from_str(&msg_type_str).ok_or_else(|| {
        JsValue::from_str(&format!(
            "Invalid WorkerRequestType value: {}",
            msg_type_str
        ))
    })?;

    let id = Reflect::get(&message_obj, &JsValue::from_str("id"))
        .ok()
        .and_then(|v| v.as_string());

    let payload_js = Reflect::get(&message_obj, &JsValue::from_str("payload"))
        .map_err(|e| JsValue::from_str(&format!("Failed to read message.payload: {:?}", e)))?;
    let payload = if payload_js.is_undefined() || payload_js.is_null() {
        None
    } else {
        Some(payload_js)
    };

    Ok(VrfWorkerMessage {
        request_type,
        request_type_raw: msg_type_str,
        id,
        payload,
    })
}

// === WORKER REQUEST TYPE ENUM ===

// These export to TypeScript as numeric enums and we convert directly from numbers
#[wasm_bindgen]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WorkerRequestType {
    Ping,
    GenerateVrfChallenge,
    GenerateVrfKeypairBootstrap,
    UnlockVrfKeypair,
    CheckVrfStatus,
    Logout,
    DeriveVrfKeypairFromPrf,
    Shamir3PassClientEncryptCurrentVrfKeypair,
    Shamir3PassClientDecryptVrfKeypair,
    Shamir3PassGenerateServerKeypair,
    Shamir3PassApplyServerLock,
    Shamir3PassRemoveServerLock,
    Shamir3PassConfigP,
    Shamir3PassConfigServerUrls,
    DeriveWrapKeySeedAndSession,
    DecryptSession,
    RegistrationCredentialConfirmation,
    Device2RegistrationSession,
    DispenseSessionKey,
    GetSessionStatus,
    ClearSession,
}

impl WorkerRequestType {
    pub fn try_from_str(value: &str) -> Option<Self> {
        match value {
            "PING" => Some(WorkerRequestType::Ping),
            "GENERATE_VRF_CHALLENGE" => Some(WorkerRequestType::GenerateVrfChallenge),
            "GENERATE_VRF_KEYPAIR_BOOTSTRAP" => Some(WorkerRequestType::GenerateVrfKeypairBootstrap),
            "UNLOCK_VRF_KEYPAIR" => Some(WorkerRequestType::UnlockVrfKeypair),
            "CHECK_VRF_STATUS" => Some(WorkerRequestType::CheckVrfStatus),
            "LOGOUT" => Some(WorkerRequestType::Logout),
            "DERIVE_VRF_KEYPAIR_FROM_PRF" => Some(WorkerRequestType::DeriveVrfKeypairFromPrf),
            "SHAMIR3PASS_CLIENT_ENCRYPT_CURRENT_VRF_KEYPAIR" => {
                Some(WorkerRequestType::Shamir3PassClientEncryptCurrentVrfKeypair)
            }
            "SHAMIR3PASS_CLIENT_DECRYPT_VRF_KEYPAIR" => {
                Some(WorkerRequestType::Shamir3PassClientDecryptVrfKeypair)
            }
            "SHAMIR3PASS_GENERATE_SERVER_KEYPAIR" => {
                Some(WorkerRequestType::Shamir3PassGenerateServerKeypair)
            }
            "SHAMIR3PASS_APPLY_SERVER_LOCK_KEK" => Some(WorkerRequestType::Shamir3PassApplyServerLock),
            "SHAMIR3PASS_REMOVE_SERVER_LOCK_KEK" => Some(WorkerRequestType::Shamir3PassRemoveServerLock),
            "SHAMIR3PASS_CONFIG_P" => Some(WorkerRequestType::Shamir3PassConfigP),
            "SHAMIR3PASS_CONFIG_SERVER_URLS" => Some(WorkerRequestType::Shamir3PassConfigServerUrls),
            "DERIVE_WRAP_KEY_SEED_AND_SESSION" => Some(WorkerRequestType::DeriveWrapKeySeedAndSession),
            "DECRYPT_SESSION" => Some(WorkerRequestType::DecryptSession),
            "REGISTRATION_CREDENTIAL_CONFIRMATION" => {
                Some(WorkerRequestType::RegistrationCredentialConfirmation)
            }
            "DEVICE2_REGISTRATION_SESSION" => Some(WorkerRequestType::Device2RegistrationSession),
            "DISPENSE_SESSION_KEY" => Some(WorkerRequestType::DispenseSessionKey),
            "GET_SESSION_STATUS" => Some(WorkerRequestType::GetSessionStatus),
            "CLEAR_SESSION" => Some(WorkerRequestType::ClearSession),
            _ => None,
        }
    }

    pub fn name(&self) -> &'static str {
        match self {
            WorkerRequestType::Ping => "PING",
            WorkerRequestType::GenerateVrfChallenge => "GENERATE_VRF_CHALLENGE",
            WorkerRequestType::GenerateVrfKeypairBootstrap => "GENERATE_VRF_KEYPAIR_BOOTSTRAP",
            WorkerRequestType::UnlockVrfKeypair => "UNLOCK_VRF_KEYPAIR",
            WorkerRequestType::CheckVrfStatus => "CHECK_VRF_STATUS",
            WorkerRequestType::Logout => "LOGOUT",
            WorkerRequestType::DeriveVrfKeypairFromPrf => "DERIVE_VRF_KEYPAIR_FROM_PRF",
            WorkerRequestType::Shamir3PassClientEncryptCurrentVrfKeypair => {
                "SHAMIR3PASS_CLIENT_ENCRYPT_CURRENT_VRF_KEYPAIR"
            }
            WorkerRequestType::Shamir3PassClientDecryptVrfKeypair => {
                "SHAMIR3PASS_CLIENT_DECRYPT_VRF_KEYPAIR"
            }
            WorkerRequestType::Shamir3PassGenerateServerKeypair => {
                "SHAMIR3PASS_GENERATE_SERVER_KEYPAIR"
            }
            WorkerRequestType::Shamir3PassApplyServerLock => {
                "SHAMIR3PASS_APPLY_SERVER_LOCK_KEK"
            }
            WorkerRequestType::Shamir3PassRemoveServerLock => {
                "SHAMIR3PASS_REMOVE_SERVER_LOCK_KEK"
            }
            WorkerRequestType::Shamir3PassConfigP => {
                "SHAMIR3PASS_CONFIG_P"
            }
            WorkerRequestType::Shamir3PassConfigServerUrls => {
                "SHAMIR3PASS_CONFIG_SERVER_URLS"
            }
            WorkerRequestType::DeriveWrapKeySeedAndSession => {
                "DERIVE_WRAP_KEY_SEED_AND_SESSION"
            }
            WorkerRequestType::DecryptSession => {
                "DECRYPT_SESSION"
            }
            WorkerRequestType::RegistrationCredentialConfirmation => {
                "REGISTRATION_CREDENTIAL_CONFIRMATION"
            }
            WorkerRequestType::Device2RegistrationSession => {
                "DEVICE2_REGISTRATION_SESSION"
            }
            WorkerRequestType::DispenseSessionKey => {
                "DISPENSE_SESSION_KEY"
            }
            WorkerRequestType::GetSessionStatus => {
                "GET_SESSION_STATUS"
            }
            WorkerRequestType::ClearSession => {
                "CLEAR_SESSION"
            }
        }
    }
}

impl From<u32> for WorkerRequestType {
    fn from(value: u32) -> Self {
        match value {
            0 => WorkerRequestType::Ping,
            1 => WorkerRequestType::GenerateVrfChallenge,
            2 => WorkerRequestType::GenerateVrfKeypairBootstrap,
            3 => WorkerRequestType::UnlockVrfKeypair,
            4 => WorkerRequestType::CheckVrfStatus,
            5 => WorkerRequestType::Logout,
            6 => WorkerRequestType::DeriveVrfKeypairFromPrf,
            7 => WorkerRequestType::Shamir3PassClientEncryptCurrentVrfKeypair,
            8 => WorkerRequestType::Shamir3PassClientDecryptVrfKeypair,
            9 => WorkerRequestType::Shamir3PassGenerateServerKeypair,
            10 => WorkerRequestType::Shamir3PassApplyServerLock,
            11 => WorkerRequestType::Shamir3PassRemoveServerLock,
            12 => WorkerRequestType::Shamir3PassConfigP,
            13 => WorkerRequestType::Shamir3PassConfigServerUrls,
            14 => WorkerRequestType::DeriveWrapKeySeedAndSession,
            15 => WorkerRequestType::DecryptSession,
            16 => WorkerRequestType::RegistrationCredentialConfirmation,
            17 => WorkerRequestType::Device2RegistrationSession,
            18 => WorkerRequestType::DispenseSessionKey,
            19 => WorkerRequestType::GetSessionStatus,
            20 => WorkerRequestType::ClearSession,
            _ => panic!("Invalid WorkerRequestType value: {}", value),
        }
    }
}

impl From<&str> for WorkerRequestType {
    fn from(value: &str) -> Self {
        WorkerRequestType::try_from_str(value)
            .unwrap_or_else(|| panic!("Invalid WorkerRequestType string: {}", value))
    }
}

/// Worker response types enum - corresponds to TypeScript WorkerResponseType
#[wasm_bindgen]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WorkerResponseType {
    // Success responses - one for each request type
    PingSuccess,
    GenerateVrfChallengeSuccess,
    GenerateVrfKeypairBootstrapSuccess,
    UnlockVrfKeypairSuccess,
    CheckVrfStatusSuccess,
    LogoutSuccess,
    DeriveVrfKeypairFromPrfSuccess,
    Shamir3PassClientEncryptCurrentVrfKeypairSuccess,
    Shamir3PassClientDecryptVrfKeypairSuccess,
    Shamir3PassGenerateServerKeypairSuccess,
    Shamir3PassApplyServerLockSuccess,
    Shamir3PassRemoveServerLockSuccess,
    Shamir3PassConfigPSuccess,
    Shamir3PassConfigServerUrlsSuccess,
    DeriveWrapKeySeedAndSessionSuccess,
    DecryptSessionSuccess,
}

impl From<WorkerResponseType> for u32 {
    fn from(value: WorkerResponseType) -> Self {
        match value {
            WorkerResponseType::PingSuccess => 0,
            WorkerResponseType::GenerateVrfChallengeSuccess => 1,
            WorkerResponseType::GenerateVrfKeypairBootstrapSuccess => 2,
            WorkerResponseType::UnlockVrfKeypairSuccess => 3,
            WorkerResponseType::CheckVrfStatusSuccess => 4,
            WorkerResponseType::LogoutSuccess => 5,
            WorkerResponseType::DeriveVrfKeypairFromPrfSuccess => 6,
            WorkerResponseType::Shamir3PassClientEncryptCurrentVrfKeypairSuccess => 7,
            WorkerResponseType::Shamir3PassClientDecryptVrfKeypairSuccess => 8,
            WorkerResponseType::Shamir3PassGenerateServerKeypairSuccess => 9,
            WorkerResponseType::Shamir3PassApplyServerLockSuccess => 10,
            WorkerResponseType::Shamir3PassRemoveServerLockSuccess => 11,
            WorkerResponseType::Shamir3PassConfigPSuccess => 12,
            WorkerResponseType::Shamir3PassConfigServerUrlsSuccess => 13,
            WorkerResponseType::DeriveWrapKeySeedAndSessionSuccess => 14,
            WorkerResponseType::DecryptSessionSuccess => 15,
        }
    }
}

impl From<u32> for WorkerResponseType {
    fn from(value: u32) -> Self {
        match value {
            0 => WorkerResponseType::PingSuccess,
            1 => WorkerResponseType::GenerateVrfChallengeSuccess,
            2 => WorkerResponseType::GenerateVrfKeypairBootstrapSuccess,
            3 => WorkerResponseType::UnlockVrfKeypairSuccess,
            4 => WorkerResponseType::CheckVrfStatusSuccess,
            5 => WorkerResponseType::LogoutSuccess,
            6 => WorkerResponseType::DeriveVrfKeypairFromPrfSuccess,
            7 => WorkerResponseType::Shamir3PassClientEncryptCurrentVrfKeypairSuccess,
            8 => WorkerResponseType::Shamir3PassClientDecryptVrfKeypairSuccess,
            9 => WorkerResponseType::Shamir3PassGenerateServerKeypairSuccess,
            10 => WorkerResponseType::Shamir3PassApplyServerLockSuccess,
            11 => WorkerResponseType::Shamir3PassRemoveServerLockSuccess,
            12 => WorkerResponseType::Shamir3PassConfigPSuccess,
            13 => WorkerResponseType::Shamir3PassConfigServerUrlsSuccess,
            14 => WorkerResponseType::DeriveWrapKeySeedAndSessionSuccess,
            15 => WorkerResponseType::DecryptSessionSuccess,
            _ => panic!("Invalid WorkerResponseType value: {}", value),
        }
    }
}

/// Main worker response structure
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct VrfWorkerResponse {
    pub id: Option<String>,
    pub success: bool,
    #[serde(with = "serde_wasm_bindgen::preserve")]
    pub data: JsValue,
    pub error: Option<String>,
}

fn serialize_data<T: Serialize>(value: T) -> JsValue {
    serde_wasm_bindgen::to_value(&value)
        .unwrap_or_else(|e| JsValue::from_str(&format!("Failed to serialize data: {}", e)))
}

impl VrfWorkerResponse {
    pub fn new(
        id: Option<String>,
        success: bool,
        data: JsValue,
        error: Option<String>,
    ) -> Self {
        Self {
            id,
            success,
            data,
            error,
        }
    }

    /// Success response with a raw JsValue payload (or undefined if None).
    pub fn success(id: Option<String>, data: Option<JsValue>) -> Self {
        Self::new(id, true, data.unwrap_or(JsValue::UNDEFINED), None)
    }

    /// Success response from any serializable payload.
    pub fn success_from<T: Serialize>(id: Option<String>, data: Option<T>) -> Self {
        let data_js = data.map(serialize_data).unwrap_or(JsValue::UNDEFINED);
        Self::new(id, true, data_js, None)
    }

    pub fn fail(id: Option<String>, message: impl Into<String>) -> Self {
        Self::new(id, false, JsValue::UNDEFINED, Some(message.into()))
    }

    pub fn error(id: Option<String>, error: String) -> Self {
        Self::new(id, false, JsValue::UNDEFINED, Some(error))
    }
}
