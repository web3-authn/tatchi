// === WORKER MESSAGES: REQUEST & RESPONSE TYPES ===
// Enums and message structures for worker communication

use serde::{Serialize, Deserialize};
use serde::de::DeserializeOwned;
use crate::error::ParsePayloadError;
use wasm_bindgen::prelude::*;

// === CLEAN RUST ENUMS WITH NUMERIC CONVERSION ===
// These export to TypeScript as numeric enums and we convert directly from numbers
#[wasm_bindgen]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WorkerRequestType {
    DeriveNearKeypairAndEncrypt,
    RecoverKeypairFromPasskey,
    CheckCanRegisterUser,
    DecryptPrivateKeyWithPrf,
    SignTransactionsWithActions,
    ExtractCosePublicKey,
    SignTransactionWithKeyPair,
    SignNep413Message,
    // DEPRECATED: only used for testnet registration
    SignVerifyAndRegisterUser,
}

impl From<u32> for WorkerRequestType {
    fn from(value: u32) -> Self {
        match value {
            0 => WorkerRequestType::DeriveNearKeypairAndEncrypt,
            1 => WorkerRequestType::RecoverKeypairFromPasskey,
            2 => WorkerRequestType::CheckCanRegisterUser,
            3 => WorkerRequestType::DecryptPrivateKeyWithPrf,
            4 => WorkerRequestType::SignTransactionsWithActions,
            5 => WorkerRequestType::ExtractCosePublicKey,
            6 => WorkerRequestType::SignTransactionWithKeyPair,
            7 => WorkerRequestType::SignNep413Message,
            // DEPRECATED: only used for testnet registration
            8 => WorkerRequestType::SignVerifyAndRegisterUser,
            _ => panic!("Invalid WorkerRequestType value: {}", value),
        }
    }
}
impl WorkerRequestType {
    pub fn name(&self) -> &'static str {
        match self {
            WorkerRequestType::DeriveNearKeypairAndEncrypt => "DERIVE_NEAR_KEYPAIR_AND_ENCRYPT",
            WorkerRequestType::RecoverKeypairFromPasskey => "RECOVER_KEYPAIR_FROM_PASSKEY",
            WorkerRequestType::CheckCanRegisterUser => "CHECK_CAN_REGISTER_USER",
            WorkerRequestType::DecryptPrivateKeyWithPrf => "DECRYPT_PRIVATE_KEY_WITH_PRF",
            WorkerRequestType::SignTransactionsWithActions => "SIGN_TRANSACTIONS_WITH_ACTIONS",
            WorkerRequestType::ExtractCosePublicKey => "EXTRACT_COSE_PUBLIC_KEY",
            WorkerRequestType::SignTransactionWithKeyPair => "SIGN_TRANSACTION_WITH_KEYPAIR",
            WorkerRequestType::SignNep413Message => "SIGN_NEP413_MESSAGE",
            WorkerRequestType::SignVerifyAndRegisterUser => "SIGN_VERIFY_AND_REGISTER_USER",
        }
    }
}

/// Worker response types enum - corresponds to TypeScript WorkerResponseType
#[wasm_bindgen]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WorkerResponseType {
    // Success responses - one for each request type
    DeriveNearKeypairAndEncryptSuccess,
    RecoverKeypairFromPasskeySuccess,
    CheckCanRegisterUserSuccess,
    DecryptPrivateKeyWithPrfSuccess,
    SignTransactionsWithActionsSuccess,
    ExtractCosePublicKeySuccess,
    SignTransactionWithKeyPairSuccess,
    SignNep413MessageSuccess,
    SignVerifyAndRegisterUserSuccess,

    // Failure responses - one for each request type
    DeriveNearKeypairAndEncryptFailure,
    RecoverKeypairFromPasskeyFailure,
    CheckCanRegisterUserFailure,
    DecryptPrivateKeyWithPrfFailure,
    SignTransactionsWithActionsFailure,
    ExtractCosePublicKeyFailure,
    SignTransactionWithKeyPairFailure,
    SignNep413MessageFailure,
    SignVerifyAndRegisterUserFailure,

    // Progress responses - for real-time updates during operations
    RegistrationProgress,
    RegistrationComplete,
    ExecuteActionsProgress,
    ExecuteActionsComplete,
}
impl From<WorkerResponseType> for u32 {
    fn from(value: WorkerResponseType) -> Self {
        match value {
            // Success responses
            WorkerResponseType::DeriveNearKeypairAndEncryptSuccess => 0,
            WorkerResponseType::RecoverKeypairFromPasskeySuccess => 1,
            WorkerResponseType::CheckCanRegisterUserSuccess => 2,
            WorkerResponseType::DecryptPrivateKeyWithPrfSuccess => 3,
            WorkerResponseType::SignTransactionsWithActionsSuccess => 4,
            WorkerResponseType::ExtractCosePublicKeySuccess => 5,
            WorkerResponseType::SignTransactionWithKeyPairSuccess => 6,
            WorkerResponseType::SignNep413MessageSuccess => 7,
            WorkerResponseType::SignVerifyAndRegisterUserSuccess => 8,

            // Failure responses
            WorkerResponseType::DeriveNearKeypairAndEncryptFailure => 9,
            WorkerResponseType::RecoverKeypairFromPasskeyFailure => 10,
            WorkerResponseType::CheckCanRegisterUserFailure => 11,
            WorkerResponseType::DecryptPrivateKeyWithPrfFailure => 12,
            WorkerResponseType::SignTransactionsWithActionsFailure => 13,
            WorkerResponseType::ExtractCosePublicKeyFailure => 14,
            WorkerResponseType::SignTransactionWithKeyPairFailure => 15,
            WorkerResponseType::SignNep413MessageFailure => 16,
            WorkerResponseType::SignVerifyAndRegisterUserFailure => 17,

            // Progress responses - for real-time updates during operations
            WorkerResponseType::RegistrationProgress => 18,
            WorkerResponseType::RegistrationComplete => 19,
            WorkerResponseType::ExecuteActionsProgress => 20,
            WorkerResponseType::ExecuteActionsComplete => 21,
        }
    }
}
impl From<u32> for WorkerResponseType {
    fn from(value: u32) -> Self {
        match value {
            // Success responses
            0 => WorkerResponseType::DeriveNearKeypairAndEncryptSuccess,
            1 => WorkerResponseType::RecoverKeypairFromPasskeySuccess,
            2 => WorkerResponseType::CheckCanRegisterUserSuccess,
            3 => WorkerResponseType::DecryptPrivateKeyWithPrfSuccess,
            4 => WorkerResponseType::SignTransactionsWithActionsSuccess,
            5 => WorkerResponseType::ExtractCosePublicKeySuccess,
            6 => WorkerResponseType::SignTransactionWithKeyPairSuccess,
            7 => WorkerResponseType::SignNep413MessageSuccess,
            8 => WorkerResponseType::SignVerifyAndRegisterUserSuccess,

            // Failure responses
            9 => WorkerResponseType::DeriveNearKeypairAndEncryptFailure,
            10 => WorkerResponseType::RecoverKeypairFromPasskeyFailure,
            11 => WorkerResponseType::CheckCanRegisterUserFailure,
            12 => WorkerResponseType::DecryptPrivateKeyWithPrfFailure,
            13 => WorkerResponseType::SignTransactionsWithActionsFailure,
            14 => WorkerResponseType::ExtractCosePublicKeyFailure,
            15 => WorkerResponseType::SignTransactionWithKeyPairFailure,
            16 => WorkerResponseType::SignNep413MessageFailure,
            17 => WorkerResponseType::SignVerifyAndRegisterUserFailure,

            // Progress responses - for real-time updates during operations
            18 => WorkerResponseType::RegistrationProgress,
            19 => WorkerResponseType::RegistrationComplete,
            20 => WorkerResponseType::ExecuteActionsProgress,
            21 => WorkerResponseType::ExecuteActionsComplete,
            _ => panic!("Invalid WorkerResponseType value: {}", value),
        }
    }
}


/// Main worker message structure
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct SignerWorkerMessage {
    #[serde(rename = "type")]
    pub msg_type: u32,
    pub payload: serde_json::Value,
}

impl SignerWorkerMessage {
    pub fn parse_payload<T: DeserializeOwned>(&self, request_type: WorkerRequestType) -> Result<T, ParsePayloadError> {
        serde_json::from_value(self.payload.clone())
            .map_err(|e| ParsePayloadError::new(request_type.name(), e))
    }
}

/// Main worker response structure
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct SignerWorkerResponse {
    #[serde(rename = "type")]
    pub response_type: u32,
    pub payload: serde_json::Value,
}