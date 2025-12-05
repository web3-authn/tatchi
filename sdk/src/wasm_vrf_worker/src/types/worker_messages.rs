// === WORKER MESSAGES: REQUEST & RESPONSE TYPES ===

use crate::errors::{MessageError, VrfWorkerError};
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

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
            _ => panic!("Invalid WorkerRequestType value: {}", value),
        }
    }
}

impl From<&str> for WorkerRequestType {
    fn from(value: &str) -> Self {
        match value {
            "PING" => WorkerRequestType::Ping,
            "GENERATE_VRF_CHALLENGE" => WorkerRequestType::GenerateVrfChallenge,
            "GENERATE_VRF_KEYPAIR_BOOTSTRAP" => WorkerRequestType::GenerateVrfKeypairBootstrap,
            "UNLOCK_VRF_KEYPAIR" => WorkerRequestType::UnlockVrfKeypair,
            "CHECK_VRF_STATUS" => WorkerRequestType::CheckVrfStatus,
            "LOGOUT" => WorkerRequestType::Logout,
            "DERIVE_VRF_KEYPAIR_FROM_PRF" => WorkerRequestType::DeriveVrfKeypairFromPrf,
            "SHAMIR3PASS_CLIENT_ENCRYPT_CURRENT_VRF_KEYPAIR" => {
                WorkerRequestType::Shamir3PassClientEncryptCurrentVrfKeypair
            }
            "SHAMIR3PASS_CLIENT_DECRYPT_VRF_KEYPAIR" => {
                WorkerRequestType::Shamir3PassClientDecryptVrfKeypair
            }
            "SHAMIR3PASS_GENERATE_SERVER_KEYPAIR" => {
                WorkerRequestType::Shamir3PassGenerateServerKeypair
            }
            "SHAMIR3PASS_APPLY_SERVER_LOCK_KEK" => WorkerRequestType::Shamir3PassApplyServerLock,
            "SHAMIR3PASS_REMOVE_SERVER_LOCK_KEK" => WorkerRequestType::Shamir3PassRemoveServerLock,
            "SHAMIR3PASS_CONFIG_P" => WorkerRequestType::Shamir3PassConfigP,
            "SHAMIR3PASS_CONFIG_SERVER_URLS" => WorkerRequestType::Shamir3PassConfigServerUrls,
            "DERIVE_WRAP_KEY_SEED_AND_SESSION" => WorkerRequestType::DeriveWrapKeySeedAndSession,
            "DECRYPT_SESSION" => WorkerRequestType::DecryptSession,
            "REGISTRATION_CREDENTIAL_CONFIRMATION" => {
                WorkerRequestType::RegistrationCredentialConfirmation
            }
            _ => panic!("Invalid WorkerRequestType string: {}", value),
        }
    }
}

impl WorkerRequestType {
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
            WorkerRequestType::Shamir3PassApplyServerLock => "SHAMIR3PASS_APPLY_SERVER_LOCK_KEK",
            WorkerRequestType::Shamir3PassRemoveServerLock => "SHAMIR3PASS_REMOVE_SERVER_LOCK_KEK",
            WorkerRequestType::Shamir3PassConfigP => "SHAMIR3PASS_CONFIG_P",
            WorkerRequestType::Shamir3PassConfigServerUrls => "SHAMIR3PASS_CONFIG_SERVER_URLS",
            WorkerRequestType::DeriveWrapKeySeedAndSession => "DERIVE_WRAP_KEY_SEED_AND_SESSION",
            WorkerRequestType::DecryptSession => "DECRYPT_SESSION",
            WorkerRequestType::RegistrationCredentialConfirmation => {
                "REGISTRATION_CREDENTIAL_CONFIRMATION"
            }
        }
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

/// Main worker message structure
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct VrfWorkerMessage {
    #[serde(rename = "type")]
    pub msg_type: String,
    pub id: Option<String>,
    pub payload: Option<serde_json::Value>,
}

impl VrfWorkerMessage {
    pub fn parse_payload<T: DeserializeOwned>(
        &self,
        request_type: WorkerRequestType,
    ) -> Result<T, VrfWorkerError> {
        let payload = self.payload.as_ref().ok_or_else(|| {
            VrfWorkerError::MissingRequiredData(format!("{}: Missing payload", request_type.name()))
        })?;

        serde_json::from_value(payload.clone()).map_err(|e| {
            VrfWorkerError::MessageParsingError(MessageError::JsonParsingFailed(format!(
                "{}: {}",
                request_type.name(),
                e.to_string()
            )))
        })
    }
}

/// Main worker response structure
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct VrfWorkerResponse {
    pub id: Option<String>,
    pub success: bool,
    pub data: Option<serde_json::Value>,
    pub error: Option<String>,
}

impl VrfWorkerResponse {
    pub fn new(
        id: Option<String>,
        success: bool,
        data: Option<serde_json::Value>,
        error: Option<String>,
    ) -> Self {
        Self {
            id,
            success,
            data,
            error,
        }
    }

    pub fn success(id: Option<String>, data: Option<serde_json::Value>) -> Self {
        Self::new(id, true, data, None)
    }

    pub fn fail(id: Option<String>, message: impl Into<String>) -> Self {
        Self::new(id, false, None, Some(message.into()))
    }

    pub fn error(id: Option<String>, error: String) -> Self {
        Self::new(id, false, None, Some(error))
    }
}
