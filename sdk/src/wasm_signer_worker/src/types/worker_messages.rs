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
    // Two-phase export: collect PRF (skip UI), decrypt, then show private key UI
    ExportNearKeypairUI,
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
            7 => WorkerRequestType::ExportNearKeypairUI,
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
            WorkerRequestType::ExtractCosePublicKey => "EXTRACT_COSE_PUBLIC_KEY",
            WorkerRequestType::SignTransactionWithKeyPair => "SIGN_TRANSACTION_WITH_KEYPAIR",
            WorkerRequestType::SignNep413Message => "SIGN_NEP413_MESSAGE",
            WorkerRequestType::ExportNearKeypairUI => "EXPORT_NEAR_KEYPAIR_UI",
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
    DecryptPrivateKeyWithPrfSuccess,
    SignTransactionsWithActionsSuccess,
    ExtractCosePublicKeySuccess,
    SignTransactionWithKeyPairSuccess,
    SignNep413MessageSuccess,
    ExportNearKeypairUiSuccess,

    // Failure responses - one for each request type
    DeriveNearKeypairAndEncryptFailure,
    RecoverKeypairFromPasskeyFailure,
    DecryptPrivateKeyWithPrfFailure,
    SignTransactionsWithActionsFailure,
    ExtractCosePublicKeyFailure,
    SignTransactionWithKeyPairFailure,
    SignNep413MessageFailure,
    ExportNearKeypairUiFailure,

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
            WorkerResponseType::DecryptPrivateKeyWithPrfSuccess => 2,
            WorkerResponseType::SignTransactionsWithActionsSuccess => 3,
            WorkerResponseType::ExtractCosePublicKeySuccess => 4,
            WorkerResponseType::SignTransactionWithKeyPairSuccess => 5,
            WorkerResponseType::SignNep413MessageSuccess => 6,
            WorkerResponseType::ExportNearKeypairUiSuccess => 7,

            // Failure responses
            WorkerResponseType::DeriveNearKeypairAndEncryptFailure => 8,
            WorkerResponseType::RecoverKeypairFromPasskeyFailure => 9,
            WorkerResponseType::DecryptPrivateKeyWithPrfFailure => 10,
            WorkerResponseType::SignTransactionsWithActionsFailure => 11,
            WorkerResponseType::ExtractCosePublicKeyFailure => 12,
            WorkerResponseType::SignTransactionWithKeyPairFailure => 13,
            WorkerResponseType::SignNep413MessageFailure => 14,
            WorkerResponseType::ExportNearKeypairUiFailure => 15,

            // Progress responses - for real-time updates during operations
            WorkerResponseType::RegistrationProgress => 16,
            WorkerResponseType::RegistrationComplete => 17,
            WorkerResponseType::ExecuteActionsProgress => 18,
            WorkerResponseType::ExecuteActionsComplete => 19,
        }
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
            7 => WorkerResponseType::ExportNearKeypairUiSuccess,

            // Failure responses
            8 => WorkerResponseType::DeriveNearKeypairAndEncryptFailure,
            9 => WorkerResponseType::RecoverKeypairFromPasskeyFailure,
            10 => WorkerResponseType::DecryptPrivateKeyWithPrfFailure,
            11 => WorkerResponseType::SignTransactionsWithActionsFailure,
            12 => WorkerResponseType::ExtractCosePublicKeyFailure,
            13 => WorkerResponseType::SignTransactionWithKeyPairFailure,
            14 => WorkerResponseType::SignNep413MessageFailure,
            15 => WorkerResponseType::ExportNearKeypairUiFailure,

            // Progress responses - for real-time updates during operations
            16 => WorkerResponseType::RegistrationProgress,
            17 => WorkerResponseType::RegistrationComplete,
            18 => WorkerResponseType::ExecuteActionsProgress,
            19 => WorkerResponseType::ExecuteActionsComplete,
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
    pub fn parse_payload<T: DeserializeOwned>(
        &self,
        request_type: WorkerRequestType,
    ) -> Result<T, ParsePayloadError> {
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
